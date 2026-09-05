// HTTP Repeater — local execution in the desktop app.
// Ported from tools/http-repeater/server/routes.js. Runs the outbound request from
// the user's machine (not the VPS). No Claude. SSRF/loopback block intentionally dropped.

const core = require('./http-repeater-core.js');

const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2MB response cap
const REQUEST_TIMEOUT_MS = 15000;

function register(ipcMain, { isValidSender } = {}) {
  ipcMain.handle('http-repeater:send', async (event, req) => {
    if (isValidSender && !isValidSender(event)) return { error: 'Unauthorized' };

    const v = core.validateRequest(req || {});
    if (!v.ok) return { error: v.error };

    const { method, url, headers } = v;
    const fetchOptions = {
      method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'manual', // show redirects raw, don't auto-follow
    };
    const body = req?.body;
    if (!['GET', 'HEAD'].includes(method) && body) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const startMs = Date.now();
    let fetchRes;
    try {
      fetchRes = await fetch(url, fetchOptions);
    } catch (err) {
      return { error: `Request failed: ${err.message}` };
    }
    const durationMs = Date.now() - startMs;

    // Read response body with a size cap
    const chunks = [];
    let totalBytes = 0;
    let truncated = false;
    try {
      const reader = fetchRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > MAX_RESPONSE_SIZE) { truncated = true; break; }
        chunks.push(value);
      }
    } catch { /* body read error — return what we have */ }

    const bodyBytes = Buffer.concat(chunks.map(c => Buffer.from(c)));
    const contentType = fetchRes.headers.get('content-type') || '';
    const isText = /text|json|xml|javascript/.test(contentType);
    const bodyStr = isText ? bodyBytes.toString('utf8') : `[Binary data, ${bodyBytes.length} bytes]`;

    const responseHeaders = {};
    fetchRes.headers.forEach((value, key) => { responseHeaders[key] = value; });

    return {
      status: fetchRes.status,
      statusText: fetchRes.statusText,
      headers: responseHeaders,
      body: bodyStr,
      durationMs,
      truncated,
      byteLength: bodyBytes.length,
    };
  });
}

module.exports = register;
module.exports.register = register;
