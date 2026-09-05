// Pure, testable validators for the HTTP Repeater. No Electron dependency.
//
// NOTE: unlike the old VPS route, this LOCAL tool does NOT block loopback/RFC-1918
// targets. Local pentest use needs to reach private/localhost hosts, and execution
// happens on the user's own machine (not the shared VPS), so the SSRF guard that was
// correct server-side (HANDOFF Finding 33) is intentionally dropped here.

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const MAX_BODY_BYTES = 50 * 1024; // matches the old 50kb request cap
const HOP_BY_HOP = ['host', 'connection', 'transfer-encoding'];

function parseHeaders(rawHeaders) {
  const headers = {};
  if (!rawHeaders || typeof rawHeaders !== 'string') return headers;
  for (const line of rawHeaders.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (HOP_BY_HOP.includes(key.toLowerCase())) continue;
    headers[key] = value;
  }
  return headers;
}

function validateRequest({ method, url, headers, body } = {}) {
  if (!method || typeof method !== 'string') return { ok: false, error: 'method is required' };
  const upper = method.toUpperCase();
  if (!ALLOWED_METHODS.includes(upper)) {
    return { ok: false, error: `method must be one of: ${ALLOWED_METHODS.join(', ')}` };
  }
  if (!url || typeof url !== 'string') return { ok: false, error: 'url is required' };

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { ok: false, error: 'Only http and https are allowed' };
  }

  if (body != null && typeof body === 'string' && Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, error: 'Request body too large (max 50kb)' };
  }

  return { ok: true, method: upper, url, headers: parseHeaders(headers) };
}

module.exports = { ALLOWED_METHODS, MAX_BODY_BYTES, parseHeaders, validateRequest };
