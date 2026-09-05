// Subdomain Enumerator — local execution in the desktop app. Ported from
// tools/subdomain-enumerator/server/routes.js. crt.sh + HackerTarget + local DNS brute-force,
// streamed by runId. No Claude, no SecurityTrails. Sources run locally for a consistent origin.

const dns = require('dns/promises');
const core = require('./subdomain-enum-core.js');

const FETCH_TIMEOUT_MS = 10000;
const BRUTE_CONCURRENCY = 20;
const active = new Map(); // runId -> { cancelled }

async function queryCrtSh(domain) {
  try {
    const res = await fetch(`https://crt.sh/?q=%.${domain}&output=json`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return { error: `crt.sh returned ${res.status}` };
    const subs = core.parseCrtShJson(await res.json(), domain);
    return { subdomains: subs, count: subs.length };
  } catch (err) {
    return { error: err.message || 'crt.sh lookup failed' };
  }
}

async function queryHackerTarget(domain) {
  try {
    const res = await fetch(`https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return { error: `HackerTarget returned ${res.status}` };
    const text = await res.text();
    if (/error|API count exceeded/i.test(text)) return { error: text.trim().slice(0, 200) };
    const subs = core.parseHackerTargetText(text, domain);
    return { subdomains: subs, count: subs.length };
  } catch (err) {
    return { error: err.message || 'HackerTarget lookup failed' };
  }
}

async function bruteForce(domain, wordlist, run, onResolved) {
  const list = (wordlist && wordlist.length) ? wordlist : core.DEFAULT_WORDLIST;
  const resolved = [];
  for (let i = 0; i < list.length; i += BRUTE_CONCURRENCY) {
    if (run.cancelled) break;
    const batch = list.slice(i, i + BRUTE_CONCURRENCY);
    await Promise.all(batch.map(async (sub) => {
      const hostname = `${sub}.${domain}`;
      try {
        const addrs = await dns.resolve4(hostname);
        if (addrs.length) { resolved.push({ hostname, ips: addrs }); onResolved(hostname, addrs[0]); }
      } catch { /* not found */ }
    }));
  }
  return { subdomains: resolved, count: resolved.length };
}

function register(ipcMain, { getMainWindow, isValidSender } = {}) {
  function emit(channel, payload) {
    const win = getMainWindow && getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  ipcMain.handle('subdomain-enum:start', async (event, config) => {
    if (isValidSender && !isValidSender(event)) return { error: 'Unauthorized' };

    const domain = (config && config.domain || '').trim().toLowerCase();
    if (!core.validateDomain(domain)) {
      return { error: 'domain must be a valid domain name (e.g. example.com)' };
    }
    const enabled = Array.isArray(config.sources) ? config.sources : ['crtsh', 'hackertarget'];
    const bruteWordlist = Array.isArray(config.bruteWordlist) ? config.bruteWordlist : [];

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const run = { cancelled: false };
    active.set(runId, run);

    (async () => {
      const seen = new Set();
      const addFound = (sub, source, ip) => {
        if (seen.has(sub)) return;
        seen.add(sub);
        emit('subdomain-enum:found', { runId, subdomain: sub, source, ip: ip || null });
      };

      const [crtsh, hackertarget, brute] = await Promise.all([
        enabled.includes('crtsh')
          ? queryCrtSh(domain).then(r => { (r.subdomains || []).forEach(s => addFound(s, 'crtsh')); return r; })
          : Promise.resolve({ skipped: 'Not selected' }),
        enabled.includes('hackertarget')
          ? queryHackerTarget(domain).then(r => { (r.subdomains || []).forEach(s => addFound(s, 'hackertarget')); return r; })
          : Promise.resolve({ skipped: 'Not selected' }),
        enabled.includes('brute')
          ? bruteForce(domain, bruteWordlist, run, (host, ip) => addFound(host, 'brute', ip))
          : Promise.resolve({ skipped: 'Not selected' }),
      ]);

      active.delete(runId);
      const allSubdomains = [...seen].sort();
      emit('subdomain-enum:done', {
        runId, domain, cancelled: run.cancelled,
        sources: { crtsh, hackertarget, brute },
        allSubdomains, totalUnique: allSubdomains.length,
      });
    })().catch(err => {
      active.delete(runId);
      emit('subdomain-enum:error', { runId, error: err.message || 'Enumeration failed' });
    });

    return { runId };
  });

  ipcMain.handle('subdomain-enum:cancel', async (event, runId) => {
    if (isValidSender && !isValidSender(event)) return { ok: false };
    const run = active.get(runId);
    if (!run) return { ok: false };
    run.cancelled = true;
    return { ok: true };
  });
}

module.exports = register;
module.exports.register = register;
