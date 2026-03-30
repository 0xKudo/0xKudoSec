import { Router } from 'express';
import express from 'express';

const router = Router();

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const BLOCKED_HOSTS = ['169.254.169.254'];
const MAX_PAYLOADS = 500;
const MAX_CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_SIZE = 512 * 1024; // 512kb per response

function validateTarget(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return 'Invalid URL';
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return 'Only http and https are allowed';
  }
  if (BLOCKED_HOSTS.includes(parsed.hostname)) {
    return 'Target host is not allowed';
  }
  const h = parsed.hostname;
  if (
    h === 'localhost' ||
    h.startsWith('127.') ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) {
    return 'Requests to internal/loopback addresses are not allowed';
  }
  return null;
}

function parseHeaders(rawHeaders) {
  const headers = {};
  if (!rawHeaders || typeof rawHeaders !== 'string') return headers;
  for (const line of rawHeaders.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) headers[key] = value;
  }
  return headers;
}

// Replace all §marker§ occurrences in a string with the payload
function injectPayload(template, payload) {
  return template.replace(/§[^§]*§/g, payload);
}

async function fireRequest(method, urlTemplate, headersTemplate, bodyTemplate, payload) {
  const url = injectPayload(urlTemplate, payload);
  const headersRaw = injectPayload(headersTemplate || '', payload);
  const bodyRaw = bodyTemplate ? injectPayload(bodyTemplate, payload) : undefined;

  const urlError = validateTarget(url);
  if (urlError) {
    return { payload, error: urlError, status: null, length: 0, durationMs: 0 };
  }

  const headers = parseHeaders(headersRaw);
  delete headers['host'];
  delete headers['connection'];
  delete headers['transfer-encoding'];

  const fetchOptions = {
    method: method.toUpperCase(),
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'manual',
  };
  if (!['GET', 'HEAD'].includes(method.toUpperCase()) && bodyRaw) {
    fetchOptions.body = bodyRaw;
  }

  const start = Date.now();
  try {
    const res = await fetch(url, fetchOptions);
    const durationMs = Date.now() - start;

    // Read body up to size cap
    const chunks = [];
    let totalBytes = 0;
    let truncated = false;
    try {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > MAX_RESPONSE_SIZE) { truncated = true; break; }
        chunks.push(value);
      }
    } catch { /* ignore body read errors */ }

    const bodyBytes = Buffer.concat(chunks.map(c => Buffer.from(c)));
    const contentType = res.headers.get('content-type') || '';
    const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('javascript');
    const bodyStr = isText ? bodyBytes.toString('utf8') : null;

    return {
      payload,
      status: res.status,
      length: bodyBytes.length,
      durationMs,
      truncated,
      body: bodyStr,
      error: null,
    };
  } catch (err) {
    return {
      payload,
      status: null,
      length: 0,
      durationMs: Date.now() - start,
      truncated: false,
      body: null,
      error: err.message || 'Request failed',
    };
  }
}

// POST /attack — run payloads against the template
router.post('/attack', express.json({ limit: '50kb' }), async (req, res) => {
  const { method, urlTemplate, headers: headersTemplate, body: bodyTemplate, payloads } = req.body || {};

  if (!urlTemplate || typeof urlTemplate !== 'string') {
    return res.status(400).json({ error: 'urlTemplate is required' });
  }
  if (!method || typeof method !== 'string') {
    return res.status(400).json({ error: 'method is required' });
  }
  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  if (!validMethods.includes(method.toUpperCase())) {
    return res.status(400).json({ error: `method must be one of: ${validMethods.join(', ')}` });
  }
  if (!Array.isArray(payloads) || payloads.length === 0) {
    return res.status(400).json({ error: 'payloads must be a non-empty array' });
  }
  if (payloads.length > MAX_PAYLOADS) {
    return res.status(400).json({ error: `Maximum ${MAX_PAYLOADS} payloads per attack` });
  }

  // Validate base URL (with a dummy payload substituted)
  const testUrl = injectPayload(urlTemplate, 'test');
  const urlError = validateTarget(testUrl);
  if (urlError) {
    return res.status(400).json({ error: urlError });
  }

  const results = [];

  // Run with concurrency limit
  for (let i = 0; i < payloads.length; i += MAX_CONCURRENCY) {
    const batch = payloads.slice(i, i + MAX_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(p => fireRequest(method, urlTemplate, headersTemplate, bodyTemplate, String(p)))
    );
    results.push(...batchResults);
  }

  // Summary stats
  const successful = results.filter(r => r.status !== null);
  const statusCounts = {};
  for (const r of successful) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }
  const lengths = successful.map(r => r.length);
  const baselineLength = lengths.length > 0
    ? lengths.sort((a, b) => a - b)[Math.floor(lengths.length / 2)] // median
    : 0;

  // Flag anomalies: status != baseline status, or length deviates >20% from median
  const baselineStatus = successful.length > 0
    ? parseInt(Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0][0])
    : null;

  const flagged = results.filter(r => {
    if (r.error) return true;
    if (r.status !== baselineStatus) return true;
    if (baselineLength > 0 && Math.abs(r.length - baselineLength) / baselineLength > 0.2) return true;
    return false;
  });

  res.json({
    total: results.length,
    results,
    summary: {
      statusCounts,
      baselineStatus,
      baselineLength,
      flaggedCount: flagged.length,
      flagged: flagged.map(r => r.payload),
    },
  });
});

export default router;
