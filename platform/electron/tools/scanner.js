// Vulnerability Scanner — local execution in the desktop app. Ported from tools/scanner/server/routes.js.
// Streams findings by runId; computes a rule-based risk summary at completion (no Claude).
// Keeps the authorized:true gate for active probes. SSRF/loopback block dropped (see scanner-core.js).

const core = require('./scanner-core.js');

const REQUEST_TIMEOUT_MS = 10000;
const active = new Map(); // runId -> { cancelled }

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SecurityScanner/1.0)' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow',
  });
  const text = await res.text();
  return { res, text };
}

// Active input probing (needs fetch, so it lives here rather than in the pure core).
async function probeInputs(html, baseUrl, probeType, run, emitFinding) {
  const probes = probeType === 'xss' ? core.XSS_PROBES : core.SQLI_PROBES;
  const targets = new Set();
  for (const m of [...html.matchAll(/href=["']([^"']+\?[^"']+)/gi)]) {
    try {
      const abs = new URL(m[1], baseUrl).toString();
      if (abs.startsWith(baseUrl.replace(/\/$/, ''))) targets.add(abs);
    } catch { /* skip */ }
  }
  if (baseUrl.includes('?')) targets.add(baseUrl);
  if (targets.size === 0) return;

  for (const target of [...targets].slice(0, 5)) {
    if (run.cancelled) return;
    const url = new URL(target);
    for (const [param] of url.searchParams) {
      for (const probe of probes) {
        if (run.cancelled) return;
        const testUrl = new URL(target);
        testUrl.searchParams.set(param, probe);
        try {
          const { text } = await fetchPage(testUrl.toString());
          const reflected = probeType === 'xss' && text.includes(probe);
          const sqlError = probeType === 'sqli' &&
            /sql|syntax|mysql|postgresql|sqlite|ora-|you have an error/i.test(text);
          if (reflected || sqlError) {
            emitFinding({
              type: probeType === 'xss' ? 'reflected-xss' : 'sqli-error',
              severity: 'high',
              title: probeType === 'xss'
                ? `Reflected XSS in parameter: ${param}`
                : `SQL error response for parameter: ${param}`,
              detail: `URL: ${testUrl.toString().slice(0, 200)}`,
              url: testUrl.toString(),
            });
          }
        } catch { /* skip timeout/network errors */ }
      }
    }
  }
}

function register(ipcMain, { getMainWindow, isValidSender } = {}) {
  function emit(channel, payload) {
    const win = getMainWindow && getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  ipcMain.handle('vuln-scanner:start', async (event, config) => {
    if (isValidSender && !isValidSender(event)) return { error: 'Unauthorized' };

    const v = core.validateScanConfig(config || {});
    if (!v.ok) return { error: v.error };

    const url = v.url;
    const activeMode = !!(config && config.activeMode);
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const run = { cancelled: false };
    active.set(runId, run);

    (async () => {
      const findings = [];
      const emitFinding = (f) => { findings.push(f); emit('vuln-scanner:finding', { runId, ...f }); };

      let page;
      try {
        page = await fetchPage(url);
      } catch (err) {
        active.delete(runId);
        emit('vuln-scanner:error', { runId, error: `Failed to fetch target: ${err.message}` });
        return;
      }

      for (const f of core.checkSecurityHeaders(page.res.headers)) emitFinding(f);
      for (const f of core.checkCookies(page.res.headers)) emitFinding(f);
      for (const f of core.checkFormsAndInputs(page.text, url)) emitFinding(f);
      for (const f of core.checkInfoLeakage(page.text, page.res.headers)) emitFinding(f);

      if (activeMode && !run.cancelled) {
        await probeInputs(page.text, url, 'xss', run, emitFinding);
        await probeInputs(page.text, url, 'sqli', run, emitFinding);
      }

      active.delete(runId);
      emit('vuln-scanner:done', {
        runId, url, mode: activeMode ? 'active' : 'passive',
        cancelled: run.cancelled, findings, risk: core.computeRisk(findings),
      });
    })().catch(err => {
      active.delete(runId);
      emit('vuln-scanner:error', { runId, error: err.message || 'Scan failed' });
    });

    return { runId };
  });

  ipcMain.handle('vuln-scanner:cancel', async (event, runId) => {
    if (isValidSender && !isValidSender(event)) return { ok: false };
    const run = active.get(runId);
    if (!run) return { ok: false };
    run.cancelled = true;
    return { ok: true };
  });
}

module.exports = register;
module.exports.register = register;
