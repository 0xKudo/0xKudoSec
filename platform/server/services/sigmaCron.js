/**
 * sigmaCron.js — SigmaHQ community rule catalog sync (Sigma Rule Library, Phase 1)
 *
 * Keeps a GLOBAL sigma_rules catalog current by downloading the SigmaHQ source
 * archive ON A SCHEDULE (never in the ingest or correlation path — see the spec,
 * section 4). One tarball, ~10-20 MB, converted through the existing sigmaToRule
 * so the catalog reports its clean-import rate honestly. A meaningful fraction of
 * community rules reject; that is expected and recorded, not an error.
 *
 * Global data, no RLS (like vuln_kb): runs as the table owner on the ops path.
 *
 * Spec: docs/specs/2026-09-05-sigma-rule-library.md
 */

import https from 'https';
import zlib from 'zlib';
import { createHash } from 'crypto';
import tarStream from 'tar-stream';
import yaml from 'js-yaml';
import nodeCron from 'node-cron';
import db from './db.js';
import { sigmaToRule, SigmaUnsupportedError } from './correlation/sigma.js';

// The ref to sync. Default 'latest' = the newest tagged SigmaHQ release (stable,
// reproducible, vetted). Set SIGMA_REF to a branch ('master'), a tag, or a SHA to
// pin explicitly. The actual resolved ref is recorded per sync in sigma_sync_state.
export const SIGMA_REF = process.env.SIGMA_REF || 'latest';

const RELEASES_LATEST_URL = 'https://api.github.com/repos/SigmaHQ/sigma/releases/latest';
const TAGS_URL = 'https://api.github.com/repos/SigmaHQ/sigma/tags?per_page=1';

// GitHub's generic archive endpoint resolves a branch, tag, or SHA without the
// caller needing to know which — no refs/heads vs refs/tags path juggling.
function archiveUrl(ref) {
  return `https://github.com/SigmaHQ/sigma/archive/${encodeURIComponent(ref)}.tar.gz`;
}
function commitApiUrl(ref) {
  return `https://api.github.com/repos/SigmaHQ/sigma/commits/${encodeURIComponent(ref)}`;
}

// SigmaHQ top-level folder → our UI category. Anything else is ignored.
export const CATEGORY_BY_FOLDER = {
  'rules': 'generic',
  'rules-threat-hunting': 'threat_hunting',
  'rules-emerging-threats': 'emerging_threats',
  'rules-compliance': 'compliance',
  'rules-placeholder': 'placeholder',
};

// The five valid category keys (for validating enablement input).
export const SIGMA_CATEGORIES = [...new Set(Object.values(CATEGORY_BY_FOLDER))];

// ── Pure helpers (no network, no DB — the testable core) ──────────────────────

// A tar entry path looks like "sigma-master/rules/windows/foo.yml": the archive's
// top directory, then the category folder, then the rule path.
// Return { category, relPath } for a rule-folder .yml entry, or null otherwise.
export function classifyEntry(entryPath) {
  if (!/\.ya?ml$/i.test(entryPath)) return null;
  const parts = entryPath.split('/').filter(Boolean);
  if (parts.length < 3) return null;          // need <archive>/<folder>/<file>
  const [, folder] = parts;                   // parts[0] is the archive dir
  const category = CATEGORY_BY_FOLDER[folder];
  if (!category) return null;
  const relPath = parts.slice(1).join('/');   // path within the repo
  return { category, relPath };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stable catalog identity: the Sigma UUID when present, else a hash of the path.
export function ruleIdentity(sigmaId, relPath) {
  if (sigmaId && UUID_RE.test(String(sigmaId))) return String(sigmaId).toLowerCase();
  return 'path:' + createHash('sha1').update(relPath).digest('hex');
}

// Bucket a reject reason to a short key for the summary breakdown.
export function rejectBucket(msg) {
  const m = String(msg).toLowerCase();
  if (m.includes('invalid yaml')) return 'invalid_yaml';
  if (m.includes('not mapped') || m.includes('not a mapped field')) return 'unmapped_field';
  if (m.includes('"or"')) return 'condition_or';
  if (m.includes('"not"')) return 'condition_not';
  if (m.includes('1 of') || m.includes('all of')) return 'condition_of';
  if (m.includes('modifier')) return 'modifier';
  if (m.includes('keyword')) return 'keywords';
  if (m.includes('wildcard')) return 'wildcard';
  if (m.includes('multi-document')) return 'multi_document';
  if (m.includes('aggregation') || m.includes('count()')) return 'aggregation';
  return 'other';
}

// Coarse prefilter signature (Phase 3): the event_id / event_category / source
// values a rule's top-level selection PINS via eq/in. Only exact operators are
// used, so a signature never produces a false negative in the ingest prefilter.
// A rule that pins none of these dimensions gets empty arrays (always a candidate).
export function extractSignature(doc) {
  // Per-dimension pin sets, walked over the where-tree (or the flat selection,
  // normalized to an AND). A dimension is only pinnable when the tree GUARANTEES
  // a value for it, so the ingest prefilter never produces a false negative:
  //   * all → union of the children's pins (any child that pins is enough)
  //   * any → intersection of pins across branches (must be pinned in EVERY
  //           branch), with the pinned values unioned
  //   * not → contributes nothing (its absence cannot narrow the batch)
  //   * leaf → its own eq/in pin
  const DIMS = { event_id: 'event_id', event_category: 'event_category', source: 'source' };

  function leafPins(node) {
    const pins = { event_id: null, event_category: null, source: null };
    if (!node || node.op == null || (node.op !== 'eq' && node.op !== 'in')) return pins;
    if (!DIMS[node.field]) return pins;
    const vals = node.op === 'in' ? (Array.isArray(node.value) ? node.value : []) : [node.value];
    pins[node.field] = new Set(vals);
    return pins;
  }

  // Merge two pin maps under a combiner: 'union' (all) or 'intersect' (any).
  function combine(a, b, mode) {
    const out = {};
    for (const dim of Object.keys(DIMS)) {
      const av = a[dim];
      const bv = b[dim];
      if (mode === 'union') {
        if (!av && !bv) { out[dim] = null; continue; }
        out[dim] = new Set([...(av || []), ...(bv || [])]);
      } else { // intersect: a dimension survives only if BOTH branches pin it
        if (av && bv) out[dim] = new Set([...av, ...bv]);
        else out[dim] = null;
      }
    }
    return out;
  }

  function walk(node) {
    if (!node) return { event_id: null, event_category: null, source: null };
    if (Array.isArray(node.all)) {
      return node.all.map(walk).reduce((acc, p) => combine(acc, p, 'union'),
        { event_id: null, event_category: null, source: null });
    }
    if (Array.isArray(node.any)) {
      const parts = node.any.map(walk);
      return parts.reduce((acc, p) => combine(acc, p, 'intersect'));
    }
    if (node.not !== undefined) return { event_id: null, event_category: null, source: null };
    if (node.keyword !== undefined) return { event_id: null, event_category: null, source: null };
    return leafPins(node);
  }

  const root = (doc && doc.where) ? doc.where : { all: (doc && Array.isArray(doc.selection)) ? doc.selection : [] };
  const pins = walk(root);
  const eventIds = new Set();
  for (const v of pins.event_id || []) { const n = Number(v); if (Number.isInteger(n)) eventIds.add(n); }
  return {
    sig_event_ids: [...eventIds],
    sig_categories: [...(pins.event_category || [])].map(String),
    sig_sources: [...(pins.source || [])].map(String),
  };
}

// Convert one raw YAML entry into a catalog row. Never throws.
export function entryToRow({ category, relPath }, content, sourceSha) {
  let doc = null;
  try { doc = yaml.load(content); } catch { doc = null; }
  const sigmaId = doc && typeof doc === 'object' ? doc.id : null;
  const title = doc && typeof doc === 'object' && doc.title ? String(doc.title).slice(0, 500) : null;
  const identity = ruleIdentity(sigmaId, relPath);

  const emptySig = { sig_event_ids: [], sig_categories: [], sig_sources: [] };
  const base = {
    sigma_id: sigmaId && UUID_RE.test(String(sigmaId)) ? String(sigmaId).toLowerCase() : null,
    identity,
    title,
    category,
    path: relPath,
    source_sha: sourceSha,
  };

  try {
    const { rule, fidelity } = sigmaToRule(content);
    return {
      ...base,
      rule,
      severity: rule.severity || 'medium',
      attack_techniques: Array.isArray(rule.attack_techniques) ? rule.attack_techniques : [],
      convert_status: 'converted',
      reject_reason: null,
      fidelity: fidelity || 'exact',
      ...extractSignature(rule),
    };
  } catch (e) {
    const reason = e instanceof SigmaUnsupportedError ? e.message : `conversion error: ${e.message}`;
    return {
      ...base,
      rule: null,
      severity: null,
      attack_techniques: [],
      convert_status: 'rejected',
      reject_reason: reason.slice(0, 1000),
      fidelity: null, // rejected rules carry no fidelity
      ...emptySig, // rejected rules never run, so no signature
    };
  }
}

// Turn all classified entries into catalog rows, de-duped by identity (last wins).
export function buildCatalogRows(entries, sourceSha) {
  const byIdentity = new Map();
  for (const { classification, content } of entries) {
    const row = entryToRow(classification, content, sourceSha);
    byIdentity.set(row.identity, row); // duplicate identity → keep the last seen
  }
  return [...byIdentity.values()];
}

// Roll rows up into a sync summary (counts + breakdowns).
export function summarize(rows) {
  const category_counts = {};
  const reject_reasons = {};
  const fidelity = { exact: 0, approximate: 0 };
  let converted = 0;
  let rejected = 0;
  for (const r of rows) {
    category_counts[r.category] = (category_counts[r.category] || 0) + 1;
    if (r.convert_status === 'converted') {
      converted++;
      if (r.fidelity === 'approximate') fidelity.approximate++;
      else fidelity.exact++;
    } else {
      rejected++;
      const b = rejectBucket(r.reject_reason || '');
      reject_reasons[b] = (reject_reasons[b] || 0) + 1;
    }
  }
  return { total: rows.length, converted, rejected, category_counts, reject_reasons, fidelity };
}

// ── Network (redirect-following) ──────────────────────────────────────────────

function httpGet(url, { json = false, redirectCount = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) { reject(new Error(`Too many redirects for ${url}`)); return; }
    const req = https.get(url, {
      headers: {
        'User-Agent': '0xKudoSec-SigmaSync/1.0',
        'Accept': json ? 'application/vnd.github+json' : 'application/octet-stream',
      },
      timeout: 60000,
    }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        res.resume();
        if (!loc) { reject(new Error(`Redirect with no Location from ${url}`)); return; }
        httpGet(loc, { json, redirectCount: redirectCount + 1 }).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode} from ${url}`)); return; }
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

async function fetchJson(url) {
  const res = await httpGet(url, { json: true });
  const chunks = [];
  for await (const c of res) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Resolve SIGMA_REF to a concrete ref. 'latest' → the newest tagged release
// (releases/latest, then the most recent tag), falling back to 'master'. An
// explicit SIGMA_REF (branch/tag/SHA) is used verbatim. Never throws.
export async function resolveRef() {
  if (SIGMA_REF !== 'latest') return SIGMA_REF;
  try {
    const rel = await fetchJson(RELEASES_LATEST_URL);
    if (rel && rel.tag_name) return String(rel.tag_name);
  } catch (e) {
    console.warn('[sigmaCron] releases/latest lookup failed, trying tags:', e.message);
  }
  try {
    const tags = await fetchJson(TAGS_URL);
    if (Array.isArray(tags) && tags[0] && tags[0].name) return String(tags[0].name);
  } catch (e) {
    console.warn('[sigmaCron] tags lookup failed, falling back to master:', e.message);
  }
  return 'master';
}

// Resolve the commit SHA the ref currently points at (one cheap API request).
async function fetchSourceSha(ref) {
  try {
    const data = await fetchJson(commitApiUrl(ref));
    return data && data.sha ? String(data.sha) : null;
  } catch (e) {
    console.warn('[sigmaCron] could not resolve commit SHA:', e.message);
    return null;
  }
}

// Download + gunzip + untar the archive, returning classified rule entries.
// Streams through memory; nothing is written to disk.
export async function fetchSigmaEntries(ref) {
  const res = await httpGet(archiveUrl(ref));
  const gunzip = zlib.createGunzip();
  const extract = tarStream.extract();
  const entries = [];

  const done = new Promise((resolve, reject) => {
    extract.on('entry', (header, stream, next) => {
      const classification = header.type === 'file' ? classifyEntry(header.name) : null;
      if (!classification) { stream.resume(); stream.on('end', next); return; }
      const chunks = [];
      stream.on('data', d => chunks.push(d));
      stream.on('end', () => {
        entries.push({ classification, content: Buffer.concat(chunks).toString('utf8') });
        next();
      });
      stream.on('error', reject);
    });
    extract.on('finish', resolve);
    extract.on('error', reject);
  });

  res.on('error', e => extract.destroy(e));
  gunzip.on('error', e => extract.destroy(e));
  res.pipe(gunzip).pipe(extract);
  await done;
  return entries;
}

// ── DB (global catalog, no RLS — runs as the table owner) ──────────────────────

async function upsertRows(pool, rows) {
  if (!rows.length) return 0;
  const batchSize = 200;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const params = [];
    batch.forEach((r, idx) => {
      const b = idx * 15;
      values.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6}::jsonb,$${b+7},$${b+8}::text[],$${b+9},$${b+10},$${b+11},$${b+12}::integer[],$${b+13}::text[],$${b+14}::text[],$${b+15},false,NOW())`);
      params.push(
        r.sigma_id, r.identity, r.title, r.category, r.path,
        r.rule ? JSON.stringify(r.rule) : null,
        r.severity, r.attack_techniques,
        r.convert_status, r.reject_reason, r.source_sha,
        r.sig_event_ids || [], r.sig_categories || [], r.sig_sources || [],
        r.fidelity ?? null,
      );
    });
    await pool.query(`
      INSERT INTO sigma_rules
        (sigma_id, identity, title, category, path, rule, severity, attack_techniques,
         convert_status, reject_reason, source_sha, sig_event_ids, sig_categories, sig_sources,
         fidelity, retired, updated_at)
      VALUES ${values.join(',')}
      ON CONFLICT (identity) DO UPDATE SET
        sigma_id = EXCLUDED.sigma_id,
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        path = EXCLUDED.path,
        rule = EXCLUDED.rule,
        severity = EXCLUDED.severity,
        attack_techniques = EXCLUDED.attack_techniques,
        convert_status = EXCLUDED.convert_status,
        reject_reason = EXCLUDED.reject_reason,
        source_sha = EXCLUDED.source_sha,
        sig_event_ids = EXCLUDED.sig_event_ids,
        sig_categories = EXCLUDED.sig_categories,
        sig_sources = EXCLUDED.sig_sources,
        fidelity = EXCLUDED.fidelity,
        retired = false,
        updated_at = NOW()
    `, params);
    total += batch.length;
  }
  return total;
}

// Rows whose source_sha wasn't refreshed this run are absent from the new sync.
// Soft-delete them (retired) so a fired alert or override still resolves its name.
async function retireStale(pool, sourceSha) {
  if (!sourceSha) return 0;
  const { rowCount } = await pool.query(
    `UPDATE sigma_rules SET retired = true, updated_at = NOW()
     WHERE retired = false AND (source_sha IS DISTINCT FROM $1)`, [sourceSha]
  );
  return rowCount || 0;
}

// ── Full sync ─────────────────────────────────────────────────────────────────

let syncInProgress = false;

export function isSigmaSyncRunning() {
  return syncInProgress;
}

export async function syncSigmaCatalog(deps = db, {
  fetchSha = fetchSourceSha,
  fetchEntries = fetchSigmaEntries,
  resolveRefFn = resolveRef,
} = {}) {
  if (syncInProgress) throw new Error('A Sigma catalog sync is already running.');
  syncInProgress = true;
  const pool = deps.getPool();
  const startedAt = Date.now();
  const ref = await resolveRefFn();               // resolves 'latest' → newest tag
  const { rows: stateRows } = await pool.query(
    `INSERT INTO sigma_sync_state (ref, started_at) VALUES ($1, NOW()) RETURNING id`, [ref]
  );
  const stateId = stateRows[0].id;

  try {
    const sourceSha = await fetchSha(ref);
    const entries = await fetchEntries(ref);
    const rows = buildCatalogRows(entries, sourceSha);
    await upsertRows(pool, rows);
    const retired = await retireStale(pool, sourceSha);
    const summary = summarize(rows);

    await pool.query(
      `UPDATE sigma_sync_state SET
         finished_at = NOW(), source_sha = $2, total = $3, converted = $4,
         rejected = $5, retired = $6, category_counts = $7::jsonb,
         reject_reasons = $8::jsonb, duration_ms = $9
       WHERE id = $1`,
      [stateId, sourceSha, summary.total, summary.converted, summary.rejected, retired,
       JSON.stringify(summary.category_counts), JSON.stringify(summary.reject_reasons),
       Date.now() - startedAt]
    );

    console.log('[sigmaCron] Sync complete:', { ref, ...summary, retired, sourceSha });
    return { ref, ...summary, retired, source_sha: sourceSha };
  } catch (e) {
    await pool.query(
      `UPDATE sigma_sync_state SET finished_at = NOW(), error = $2, duration_ms = $3 WHERE id = $1`,
      [stateId, String(e.message).slice(0, 1000), Date.now() - startedAt]
    ).catch(() => {});
    console.error('[sigmaCron] Sync failed:', e.message);
    throw e;
  } finally {
    syncInProgress = false;
  }
}

// Latest sync summary for the status endpoint.
export async function getSigmaSyncStatus(deps = db) {
  const pool = deps.getPool();
  const [{ rows: state }, { rows: counts }] = await Promise.all([
    pool.query(`SELECT * FROM sigma_sync_state ORDER BY started_at DESC LIMIT 1`),
    pool.query(`
      SELECT category,
             count(*) FILTER (WHERE convert_status = 'converted' AND NOT retired) AS converted,
             count(*) FILTER (WHERE convert_status = 'rejected'  AND NOT retired) AS rejected,
             count(*) FILTER (WHERE fidelity = 'exact'       AND NOT retired) AS exact,
             count(*) FILTER (WHERE fidelity = 'approximate' AND NOT retired) AS approximate
      FROM sigma_rules GROUP BY category`),
  ]);
  return { last_sync: state[0] || null, catalog: counts };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export function scheduleSigmaCron() {
  // Daily at 04:15, after kbCron (03:30). A full sync is ~1-2 minutes.
  nodeCron.schedule('15 4 * * *', async () => {
    console.log('[sigmaCron] Starting scheduled Sigma catalog sync, ref:', SIGMA_REF);
    try { await syncSigmaCatalog(); }
    catch (e) { console.error('[sigmaCron] scheduled sync error:', e.message); }
  });
  console.log('[sigmaCron] Scheduled: daily 04:15, ref', SIGMA_REF);
}
