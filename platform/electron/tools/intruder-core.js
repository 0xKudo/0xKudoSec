// Pure, testable helpers for the Intruder. No Electron dependency.
// LOCAL tool: the SSRF/loopback/RFC-1918 block is intentionally dropped (local pentest
// use must reach private/localhost targets; execution is on the user's own machine).

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const MAX_PAYLOADS = 500;
const MAX_CONCURRENCY = 5;
const HOP_BY_HOP = ['host', 'connection', 'transfer-encoding'];

function parsePlaceholders(template) {
  if (!template || typeof template !== 'string') return [];
  return template.match(/§[^§]*§/g) || [];
}

function injectPayload(template, payload) {
  return String(template).replace(/§[^§]*§/g, payload);
}

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

function validateAttackConfig({ method, urlTemplate, headers, body, payloads } = {}) {
  if (!method || typeof method !== 'string') return { ok: false, error: 'method is required' };
  const upper = method.toUpperCase();
  if (!ALLOWED_METHODS.includes(upper)) {
    return { ok: false, error: `method must be one of: ${ALLOWED_METHODS.join(', ')}` };
  }
  if (!urlTemplate || typeof urlTemplate !== 'string') return { ok: false, error: 'urlTemplate is required' };

  // Must mark at least one injection point somewhere in the request.
  const markers = [
    ...parsePlaceholders(urlTemplate),
    ...parsePlaceholders(headers),
    ...parsePlaceholders(body),
  ];
  if (markers.length === 0) return { ok: false, error: 'Add at least one §placeholder§ injection point' };

  if (!Array.isArray(payloads)) return { ok: false, error: 'payloads must be an array' };
  const clean = payloads.map(p => String(p).trim()).filter(Boolean);
  if (clean.length === 0) return { ok: false, error: 'payloads must be a non-empty array' };
  if (clean.length > MAX_PAYLOADS) return { ok: false, error: `Maximum ${MAX_PAYLOADS} payloads per attack` };

  // Validate the URL with a dummy payload substituted.
  let parsed;
  try {
    parsed = new URL(injectPayload(urlTemplate, 'test'));
  } catch {
    return { ok: false, error: 'Invalid URL template' };
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { ok: false, error: 'Only http and https are allowed' };
  }

  return { ok: true, method: upper, payloads: clean };
}

// Baseline = most common status; flag error, off-baseline status, or >20% length deviation.
function computeSummary(results) {
  const successful = results.filter(r => r.status !== null && r.status !== undefined);
  const statusCounts = {};
  for (const r of successful) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

  const lengths = successful.map(r => r.length).sort((a, b) => a - b);
  const baselineLength = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;
  const baselineStatus = successful.length
    ? parseInt(Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0][0], 10)
    : null;

  const flagged = results.filter(r => {
    if (r.error) return true;
    if (r.status !== baselineStatus) return true;
    if (baselineLength > 0 && Math.abs(r.length - baselineLength) / baselineLength > 0.2) return true;
    return false;
  }).map(r => r.payload);

  return { statusCounts, baselineStatus, baselineLength, flaggedCount: flagged.length, flagged };
}

module.exports = {
  ALLOWED_METHODS, MAX_PAYLOADS, MAX_CONCURRENCY,
  parsePlaceholders, injectPayload, parseHeaders, validateAttackConfig, computeSummary,
};
