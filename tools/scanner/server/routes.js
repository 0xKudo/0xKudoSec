import { Router } from 'express';
import express from 'express';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const REQUEST_TIMEOUT_MS = 10000;

// Active probe payloads
const XSS_PROBES = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  "'><img src=x onerror=alert(1)>",
  '<svg onload=alert(1)>',
];

const SQLI_PROBES = [
  "'",
  "' OR '1'='1",
  "' OR 1=1--",
  "1; SELECT SLEEP(3)--",
];

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
  const h = parsed.hostname;
  if (
    h === 'localhost' ||
    h === '169.254.169.254' ||
    h.startsWith('127.') ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) {
    return 'Requests to internal/loopback addresses are not allowed';
  }
  return null;
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SecurityScanner/1.0)' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow',
  });
  const text = await res.text();
  return { res, text, status: res.status };
}

// --- Passive checks ---

function checkSecurityHeaders(headers) {
  const findings = [];
  const checks = [
    { header: 'strict-transport-security', name: 'Strict-Transport-Security (HSTS)', severity: 'medium' },
    { header: 'content-security-policy', name: 'Content-Security-Policy', severity: 'medium' },
    { header: 'x-frame-options', name: 'X-Frame-Options', severity: 'low' },
    { header: 'x-content-type-options', name: 'X-Content-Type-Options', severity: 'low' },
    { header: 'referrer-policy', name: 'Referrer-Policy', severity: 'info' },
    { header: 'permissions-policy', name: 'Permissions-Policy', severity: 'info' },
  ];
  for (const check of checks) {
    if (!headers.get(check.header)) {
      findings.push({
        type: 'missing-header',
        severity: check.severity,
        title: `Missing ${check.name}`,
        detail: `The ${check.name} header is not set.`,
      });
    }
  }
  return findings;
}

function checkCookies(headers) {
  const findings = [];
  const setCookie = headers.get('set-cookie');
  if (!setCookie) return findings;
  const cookies = setCookie.split(',').map(c => c.trim());
  for (const cookie of cookies) {
    const lower = cookie.toLowerCase();
    const name = cookie.split('=')[0].trim();
    if (!lower.includes('httponly')) {
      findings.push({
        type: 'cookie-missing-httponly',
        severity: 'medium',
        title: `Cookie missing HttpOnly: ${name}`,
        detail: 'Cookie is accessible via JavaScript — risk of theft via XSS.',
      });
    }
    if (!lower.includes('secure')) {
      findings.push({
        type: 'cookie-missing-secure',
        severity: 'low',
        title: `Cookie missing Secure flag: ${name}`,
        detail: 'Cookie may be transmitted over HTTP.',
      });
    }
    if (!lower.includes('samesite')) {
      findings.push({
        type: 'cookie-missing-samesite',
        severity: 'low',
        title: `Cookie missing SameSite: ${name}`,
        detail: 'Cookie may be sent in cross-site requests — CSRF risk.',
      });
    }
  }
  return findings;
}

function checkFormsAndInputs(html, baseUrl) {
  const findings = [];
  const formMatches = [...html.matchAll(/<form[^>]*>/gi)];
  for (const match of formMatches) {
    const formTag = match[0];
    const method = (formTag.match(/method=["']?(\w+)/i) || [])[1] || 'GET';
    const action = (formTag.match(/action=["']?([^"'\s>]+)/i) || [])[1] || baseUrl;
    if (method.toUpperCase() === 'GET') {
      findings.push({
        type: 'form-get-method',
        severity: 'info',
        title: 'Form uses GET method',
        detail: `Form action "${action}" submits via GET — parameters visible in URL and browser history.`,
      });
    }
    if (!formTag.toLowerCase().includes('csrf') && !formTag.toLowerCase().includes('token')) {
      findings.push({
        type: 'form-no-csrf-token',
        severity: 'medium',
        title: 'Form may lack CSRF token',
        detail: `Form action "${action}" — no visible CSRF token attribute detected.`,
      });
    }
  }

  // Check for password fields not in a form with autocomplete=off
  if (html.match(/<input[^>]*type=["']?password/i) && !html.match(/autocomplete=["']?off/i)) {
    findings.push({
      type: 'password-autocomplete',
      severity: 'info',
      title: 'Password field without autocomplete=off',
      detail: 'Browser may cache password field values.',
    });
  }

  return findings;
}

function checkInfoLeakage(html, headers) {
  const findings = [];

  // Server header
  const server = headers.get('server');
  if (server) {
    findings.push({
      type: 'server-header',
      severity: 'info',
      title: `Server header discloses software: ${server}`,
      detail: 'Exposing server version aids fingerprinting.',
    });
  }

  // X-Powered-By
  const poweredBy = headers.get('x-powered-by');
  if (poweredBy) {
    findings.push({
      type: 'x-powered-by',
      severity: 'info',
      title: `X-Powered-By header: ${poweredBy}`,
      detail: 'Technology stack disclosure.',
    });
  }

  // HTML comments with sensitive-looking content
  const comments = [...html.matchAll(/<!--([\s\S]*?)-->/g)];
  for (const c of comments) {
    const text = c[1].trim();
    if (text.length > 5 && /password|secret|key|token|todo|fixme|hack|debug|admin/i.test(text)) {
      findings.push({
        type: 'sensitive-comment',
        severity: 'low',
        title: 'Potentially sensitive HTML comment',
        detail: `Comment contains: ${text.slice(0, 100)}`,
      });
    }
  }

  return findings;
}

// --- Active checks ---

async function probeInputs(html, baseUrl, probeType) {
  const findings = [];
  const probes = probeType === 'xss' ? XSS_PROBES : SQLI_PROBES;

  // Extract all GET links with query params
  const linkMatches = [...html.matchAll(/href=["']([^"']+\?[^"']+)/gi)];
  const targets = new Set();
  for (const m of linkMatches) {
    try {
      const abs = new URL(m[1], baseUrl).toString();
      if (abs.startsWith(baseUrl.replace(/\/$/, ''))) targets.add(abs);
    } catch { /* skip */ }
  }

  // Also probe the base URL if it has query params
  if (baseUrl.includes('?')) targets.add(baseUrl);

  if (targets.size === 0) return findings;

  for (const target of [...targets].slice(0, 5)) {
    const url = new URL(target);
    for (const [param] of url.searchParams) {
      for (const probe of probes) {
        const testUrl = new URL(target);
        testUrl.searchParams.set(param, probe);
        try {
          const { text, status } = await fetchPage(testUrl.toString());
          const reflected = probeType === 'xss' && text.includes(probe);
          const errorIndicator = probeType === 'sqli' &&
            /sql|syntax|mysql|postgresql|sqlite|ora-|you have an error/i.test(text);

          if (reflected || errorIndicator) {
            findings.push({
              type: probeType === 'xss' ? 'reflected-xss' : 'sqli-error',
              severity: 'high',
              title: probeType === 'xss'
                ? `Reflected XSS in parameter: ${param}`
                : `SQL error response for parameter: ${param}`,
              detail: `URL: ${testUrl.toString().slice(0, 200)} — Status: ${status}`,
              url: testUrl.toString(),
            });
          }
        } catch { /* skip timeout/network errors */ }
      }
    }
  }

  return findings;
}

// POST /scan
router.post('/scan', express.json({ limit: '20kb' }), async (req, res) => {
  const { url, activeMode, authorized } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  const urlError = validateTarget(url.trim());
  if (urlError) return res.status(400).json({ error: urlError });

  if (activeMode && !authorized) {
    return res.status(400).json({ error: 'Active mode requires explicit authorization confirmation' });
  }

  let pageRes, pageText;
  try {
    const result = await fetchPage(url.trim());
    pageRes = result.res;
    pageText = result.text;
  } catch (err) {
    return res.status(502).json({ error: `Failed to fetch target: ${err.message}` });
  }

  const findings = [
    ...checkSecurityHeaders(pageRes.headers),
    ...checkCookies(pageRes.headers),
    ...checkFormsAndInputs(pageText, url.trim()),
    ...checkInfoLeakage(pageText, pageRes.headers),
  ];

  if (activeMode && authorized) {
    const xssFindings = await probeInputs(pageText, url.trim(), 'xss');
    const sqliFindings = await probeInputs(pageText, url.trim(), 'sqli');
    findings.push(...xssFindings, ...sqliFindings);
  }

  // Claude analysis
  let analysis = null;
  try {
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;

    const prompt = `You are a security analyst reviewing web vulnerability scan results for "${url}".

Mode: ${activeMode ? 'Active (passive + XSS/SQLi probes)' : 'Passive only'}
Total findings: ${findings.length}
Severity breakdown: ${JSON.stringify(severityCounts)}

Findings:
${findings.map(f => `[${f.severity.toUpperCase()}] ${f.title}: ${f.detail}`).join('\n')}

Respond with JSON only:
{
  "riskLevel": "critical|high|medium|low|info",
  "summary": "2-3 sentence overview",
  "topPriorities": ["most important action items"],
  "notes": "any additional context"
}`;

    analysis = await askClaude(prompt);
    if (typeof analysis === 'string') analysis = JSON.parse(analysis);
  } catch {
    const hasCritical = findings.some(f => f.severity === 'critical');
    const hasHigh = findings.some(f => f.severity === 'high');
    analysis = {
      riskLevel: hasCritical ? 'critical' : hasHigh ? 'high' : findings.length > 0 ? 'medium' : 'info',
      summary: `Found ${findings.length} issue(s) on ${url}.`,
      topPriorities: findings.filter(f => ['critical', 'high', 'medium'].includes(f.severity)).slice(0, 3).map(f => f.title),
      notes: '',
    };
  }

  res.json({
    url: url.trim(),
    mode: activeMode ? 'active' : 'passive',
    findings,
    analysis,
  });
});

export default router;
