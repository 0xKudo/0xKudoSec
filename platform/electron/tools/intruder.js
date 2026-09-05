// Intruder — local execution in the desktop app. Ported from tools/intruder/server/routes.js.
// Streams per-request results by runId; computes the anomaly summary at completion.
// No Claude. SSRF/loopback block intentionally dropped (see intruder-core.js).

const core = require('./intruder-core.js');

const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_SIZE = 512 * 1024; // 512kb per response
const active = new Map(); // runId -> { cancelled, controllers:Set }

async function fireRequest(method, urlT, headersT, bodyT, payload, run) {
  const url = core.injectPayload(urlT, payload);
  const headers = core.parseHeaders(core.injectPayload(headersT || '', payload));
  const bodyRaw = bodyT ? core.injectPayload(bodyT, payload) : undefined;

  const controller = new AbortController();
  run.controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const opts = { method, headers, signal: controller.signal, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(method) && bodyRaw) opts.body = bodyRaw;

  const start = Date.now();
  try {
    const res = await fetch(url, opts);
    const durationMs = Date.now() - start;
    const chunks = [];
    let total = 0, truncated = false;
    try {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_RESPONSE_SIZE) { truncated = true; break; }
        chunks.push(value);
      }
    } catch { /* ignore body read errors */ }
    const bodyBytes = Buffer.concat(chunks.map(c => Buffer.from(c)));
    const ct = res.headers.get('content-type') || '';
    const isText = /text|json|xml|javascript/.test(ct);
    return { payload, status: res.status, length: bodyBytes.length, durationMs, truncated,
             body: isText ? bodyBytes.toString('utf8') : null, error: null };
  } catch (err) {
    return { payload, status: null, length: 0, durationMs: Date.now() - start, truncated: false,
             body: null, error: err.name === 'AbortError' ? 'Aborted/timeout' : (err.message || 'Request failed') };
  } finally {
    clearTimeout(timer);
    run.controllers.delete(controller);
  }
}

function register(ipcMain, { getMainWindow, isValidSender } = {}) {
  function emit(channel, payload) {
    const win = getMainWindow && getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  ipcMain.handle('intruder:start', async (event, config) => {
    if (isValidSender && !isValidSender(event)) return { error: 'Unauthorized' };

    const v = core.validateAttackConfig(config || {});
    if (!v.ok) return { error: v.error };

    const { method, payloads } = v;
    const { urlTemplate, headers: headersT, body: bodyT } = config;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const run = { cancelled: false, controllers: new Set() };
    active.set(runId, run);

    // Fire in the background; return the runId immediately so the UI can stream.
    (async () => {
      const results = [];
      let index = 0;
      for (let i = 0; i < payloads.length; i += core.MAX_CONCURRENCY) {
        if (run.cancelled) break;
        const batch = payloads.slice(i, i + core.MAX_CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(p => fireRequest(method, urlTemplate, headersT, bodyT, p, run))
        );
        for (const r of batchResults) {
          results.push(r);
          emit('intruder:result', { runId, index: index++, ...r });
        }
      }
      active.delete(runId);
      if (run.cancelled) {
        emit('intruder:done', { runId, cancelled: true, total: results.length,
                                results, summary: core.computeSummary(results) });
      } else {
        emit('intruder:done', { runId, cancelled: false, total: results.length,
                                results, summary: core.computeSummary(results) });
      }
    })().catch(err => {
      active.delete(runId);
      emit('intruder:error', { runId, error: err.message || 'Attack failed' });
    });

    return { runId };
  });

  ipcMain.handle('intruder:cancel', async (event, runId) => {
    if (isValidSender && !isValidSender(event)) return { ok: false };
    const run = active.get(runId);
    if (!run) return { ok: false };
    run.cancelled = true;
    for (const c of run.controllers) { try { c.abort(); } catch {} }
    return { ok: true };
  });
}

module.exports = register;
module.exports.register = register;
