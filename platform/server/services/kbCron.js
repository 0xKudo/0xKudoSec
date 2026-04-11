/**
 * kbCron.js — Vulnerability Knowledge Base sync
 *
 * Pulls CVEs and attack patterns from public feeds into vuln_kb (PostgreSQL).
 * Scheduled daily at 03:30, after noiseCron at 02:30.
 *
 * Sources:
 *   NVD  — https://services.nvd.nist.gov/rest/json/cves/2.0 (daily, 90-day window)
 *   CISA — https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json (daily, full catalog)
 *   MITRE ATT&CK — https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json (weekly)
 */

import https from 'https';
import db from './db.js';
import nodeCron from 'node-cron';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': '0xKudo-SecurityToolkit/1.0 (kb-sync)' },
      timeout: 30000,
    }, res => {
      if (res.statusCode === 429) {
        reject(new Error(`Rate limited by ${url}`));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error(`JSON parse error from ${url}: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

async function upsertBatch(pool, rows) {
  if (!rows.length) return 0;
  // Upsert in batches of 100
  const batchSize = 100;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const params = [];
    batch.forEach((r, idx) => {
      const base = idx * 10;
      values.push(`($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},NOW(),NOW())`);
      params.push(
        r.id, r.source, r.title, r.description, r.severity,
        r.cvss_score ?? null,
        JSON.stringify(r.affected_products ?? []),
        JSON.stringify(r.attack_patterns ?? []),
        r.published_at ?? null,
      );
    });
    await pool.query(`
      INSERT INTO vuln_kb
        (id, source, title, description, severity, cvss_score, affected_products, attack_patterns, published_at, ingested_at, updated_at)
      VALUES ${values.join(',')}
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        severity = EXCLUDED.severity,
        cvss_score = EXCLUDED.cvss_score,
        affected_products = EXCLUDED.affected_products,
        attack_patterns = EXCLUDED.attack_patterns,
        published_at = EXCLUDED.published_at,
        updated_at = NOW()
    `, params);
    total += batch.length;
  }
  return total;
}

// ── NVD sync ─────────────────────────────────────────────────────────────────

// Map NVD severity strings to our internal values
function nvdSeverity(metrics) {
  const v31 = metrics?.cvssMetricV31?.[0]?.cvssData;
  const v30 = metrics?.cvssMetricV30?.[0]?.cvssData;
  const v2  = metrics?.cvssMetricV2?.[0]?.cvssData;
  const base = v31 || v30 || v2;
  if (!base) return { severity: 'none', cvss_score: null };
  const sev = (base.baseSeverity || '').toLowerCase();
  return {
    severity: ['critical','high','medium','low'].includes(sev) ? sev : 'none',
    cvss_score: base.baseScore ?? null,
  };
}

// Extract process/product names as attack_patterns for KB matching
function nvdAttackPatterns(cve) {
  const patterns = [];
  const desc = (cve.descriptions?.find(d => d.lang === 'en')?.value || '').toLowerCase();
  // Common process names worth flagging
  const watched = ['powershell','cmd.exe','wscript','cscript','mshta','regsvr32','rundll32','certutil','bitsadmin','wmic'];
  for (const p of watched) {
    if (desc.includes(p)) patterns.push(p);
  }
  return patterns;
}

export async function syncNvd() {
  const pool = db.getPool();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const until = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // NVD paginates at 2000 results per page
  let startIndex = 0;
  const pageSize = 2000;
  let totalResults = Infinity;
  let upserted = 0;

  while (startIndex < totalResults) {
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${encodeURIComponent(since)}&pubEndDate=${encodeURIComponent(until)}&startIndex=${startIndex}&resultsPerPage=${pageSize}`;
    const data = await fetchJson(url);
    totalResults = data.totalResults ?? 0;

    const rows = (data.vulnerabilities || []).map(({ cve }) => {
      const desc = cve.descriptions?.find(d => d.lang === 'en')?.value || '';
      const { severity, cvss_score } = nvdSeverity(cve.metrics);
      const products = (cve.configurations || [])
        .flatMap(c => c.nodes || [])
        .flatMap(n => n.cpeMatch || [])
        .map(m => m.criteria?.split(':')[4])
        .filter(Boolean)
        .slice(0, 20);
      return {
        id: cve.id,
        source: 'nvd',
        title: cve.id,
        description: desc.slice(0, 1000),
        severity,
        cvss_score,
        affected_products: [...new Set(products)],
        attack_patterns: nvdAttackPatterns(cve),
        published_at: cve.published || null,
      };
    });

    upserted += await upsertBatch(pool, rows);
    startIndex += pageSize;

    // NVD rate limit: 5 req/30s without API key — wait between pages
    if (startIndex < totalResults) await new Promise(r => setTimeout(r, 6500));
  }

  // Purge NVD entries older than 90 days
  await pool.query(`
    DELETE FROM vuln_kb
    WHERE source = 'nvd' AND published_at < NOW() - INTERVAL '90 days'
  `);

  return upserted;
}

// ── CISA KEV sync ─────────────────────────────────────────────────────────────

export async function syncCisa() {
  const pool = db.getPool();
  const data = await fetchJson('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');

  const rows = (data.vulnerabilities || []).map(v => ({
    id: `cisa-${v.cveID}`,
    source: 'cisa',
    title: `${v.cveID}: ${v.vulnerabilityName}`,
    description: (v.shortDescription || '').slice(0, 1000),
    severity: 'high', // CISA KEV = actively exploited, always treat as high+
    cvss_score: null,
    affected_products: [v.vendorProject, v.product].filter(Boolean),
    attack_patterns: [],
    published_at: v.dateAdded ? new Date(v.dateAdded).toISOString() : null,
  }));

  return await upsertBatch(pool, rows);
}

// ── MITRE ATT&CK sync ────────────────────────────────────────────────────────

export async function syncMitre() {
  const pool = db.getPool();
  const data = await fetchJson('https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json');

  // Only include attack-pattern objects (techniques), skip courses of action, etc.
  const techniques = (data.objects || []).filter(o =>
    o.type === 'attack-pattern' && !o.revoked && !o.x_mitre_deprecated
  );

  const rows = techniques.map(t => {
    const extId = t.external_references?.find(r => r.source_name === 'mitre-attack')?.external_id || t.id;
    const desc = (t.description || '').replace(/\(Citation:[^)]+\)/g, '').trim().slice(0, 1000);
    const platforms = t.x_mitre_platforms || [];

    // Extract process names and event categories from technique name/description
    const patterns = [];
    const nameDesc = (t.name + ' ' + desc).toLowerCase();
    const watched = ['powershell','cmd.exe','wscript','cscript','mshta','regsvr32','rundll32','certutil','bitsadmin','wmic','schtasks','at.exe','net.exe','sc.exe'];
    for (const p of watched) {
      if (nameDesc.includes(p.replace('.exe', ''))) patterns.push(p);
    }

    return {
      id: `mitre-${extId}`,
      source: 'mitre',
      title: `${extId}: ${t.name}`,
      description: desc,
      severity: 'medium',
      cvss_score: null,
      affected_products: platforms,
      attack_patterns: patterns,
      published_at: t.created || null,
    };
  });

  return await upsertBatch(pool, rows);
}

// ── Full sync ─────────────────────────────────────────────────────────────────

export async function syncKnowledgeBase({ sources = ['nvd', 'cisa', 'mitre'] } = {}) {
  const results = {};
  const errors = {};

  if (sources.includes('nvd')) {
    try { results.nvd = await syncNvd(); }
    catch (e) { errors.nvd = e.message; console.error('[kbCron] NVD sync error:', e.message); }
  }

  if (sources.includes('cisa')) {
    try { results.cisa = await syncCisa(); }
    catch (e) { errors.cisa = e.message; console.error('[kbCron] CISA sync error:', e.message); }
  }

  if (sources.includes('mitre')) {
    try { results.mitre = await syncMitre(); }
    catch (e) { errors.mitre = e.message; console.error('[kbCron] MITRE sync error:', e.message); }
  }

  console.log('[kbCron] Sync complete:', results, errors);
  return { results, errors };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export function scheduleKbCron() {
  // Daily at 03:30 — NVD + CISA every day, MITRE only on Tuesdays
  nodeCron.schedule('30 3 * * *', async () => {
    const dayOfWeek = new Date().getDay(); // 0=Sun, 2=Tue
    const sources = dayOfWeek === 2
      ? ['nvd', 'cisa', 'mitre']
      : ['nvd', 'cisa'];
    console.log('[kbCron] Starting scheduled KB sync, sources:', sources);
    await syncKnowledgeBase({ sources });
  });
  console.log('[kbCron] Scheduled: daily 03:30, MITRE weekly on Tuesdays');
}
