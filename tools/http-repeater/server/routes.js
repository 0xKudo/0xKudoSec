import { Router } from 'express';
import express from 'express';

const router = Router();

const BLOCKED_HOSTS = ['169.254.169.254', '::1', '0.0.0.0'];
const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2MB response cap

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
  // Block internal RFC-1918 ranges via hostname check (best-effort for named hosts)
  const ip4 = parsed.hostname;
  if (
    ip4 === 'localhost' ||
    ip4.startsWith('127.') ||
    ip4.startsWith('10.') ||
    ip4.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip4)
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

// POST /send — proxy the request to the target URL
router.post('/send', express.json({ limit: '50kb' }), async (req, res) => {
  const { method, url, headers: rawHeaders, body } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  if (!method || typeof method !== 'string') {
    return res.status(400).json({ error: 'method is required' });
  }

  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const upperMethod = method.toUpperCase();
  if (!validMethods.includes(upperMethod)) {
    return res.status(400).json({ error: `method must be one of: ${validMethods.join(', ')}` });
  }

  const urlError = validateTarget(url);
  if (urlError) {
    return res.status(400).json({ error: urlError });
  }

  const parsedHeaders = parseHeaders(rawHeaders);
  // Remove hop-by-hop headers
  delete parsedHeaders['host'];
  delete parsedHeaders['connection'];
  delete parsedHeaders['transfer-encoding'];

  const fetchOptions = {
    method: upperMethod,
    headers: parsedHeaders,
    signal: AbortSignal.timeout(15000),
    redirect: 'manual', // don't auto-follow redirects — show them raw
  };

  if (!['GET', 'HEAD'].includes(upperMethod) && body) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const startMs = Date.now();
  let fetchRes;
  try {
    fetchRes = await fetch(url, fetchOptions);
  } catch (err) {
    return res.status(502).json({ error: `Request failed: ${err.message}` });
  }
  const durationMs = Date.now() - startMs;

  // Read response body with size cap
  const chunks = [];
  let totalBytes = 0;
  let truncated = false;
  try {
    const reader = fetchRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > MAX_RESPONSE_SIZE) {
        truncated = true;
        break;
      }
      chunks.push(value);
    }
  } catch {
    // body read error — continue with what we have
  }

  const bodyBytes = Buffer.concat(chunks.map(c => Buffer.from(c)));
  const contentType = fetchRes.headers.get('content-type') || '';
  const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('javascript');
  const bodyStr = isText ? bodyBytes.toString('utf8') : `[Binary data — ${bodyBytes.length} bytes]`;

  // Collect response headers
  const responseHeaders = {};
  fetchRes.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  res.json({
    status: fetchRes.status,
    statusText: fetchRes.statusText,
    headers: responseHeaders,
    body: bodyStr,
    durationMs,
    truncated,
    byteLength: bodyBytes.length,
  });
});

export default router;
