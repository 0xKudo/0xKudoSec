// Pure, testable logic for the Vulnerability Scanner. No Electron dependency.
// LOCAL tool: the SSRF/loopback/RFC-1918 block is dropped (scanning 127.0.0.1 / LAN hosts is a
// legitimate local pentest). The authorized:true checkbox is the safety control, not an origin block.
// No LLM — computeRisk() replaces the old AI analysis with a rule-based summary.

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

const XSS_PROBES = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  "'><img src=x onerror=alert(1)>",
  '<svg onload=alert(1)>',
];
const SQLI_PROBES = ["'", "' OR '1'='1", "' OR 1=1--", '1; SELECT SLEEP(3)--'];

function validateScanConfig({ url, activeMode, authorized } = {}) {
  if (!url || typeof url !== 'string') return { ok: false, error: 'url is required' };
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { ok: false, error: 'Only http and https are allowed' };
  }
  if (activeMode && !authorized) {
    return { ok: false, error: 'Active mode requires explicit authorization confirmation' };
  }
  return { ok: true, url: url.trim() };
}

// --- Passive checks (headers arg supports .get(name), like a fetch Response's headers) ---

function checkSecurityHeaders(headers) {
  const checks = [
    { header: 'strict-transport-security', name: 'Strict-Transport-Security (HSTS)', severity: 'medium' },
    { header: 'content-security-policy', name: 'Content-Security-Policy', severity: 'medium' },
    { header: 'x-frame-options', name: 'X-Frame-Options', severity: 'low' },
    { header: 'x-content-type-options', name: 'X-Content-Type-Options', severity: 'low' },
    { header: 'referrer-policy', name: 'Referrer-Policy', severity: 'info' },
    { header: 'permissions-policy', name: 'Permissions-Policy', severity: 'info' },
  ];
  const findings = [];
  for (const c of checks) {
    if (!headers.get(c.header)) {
      findings.push({ type: 'missing-header', severity: c.severity,
        title: `Missing ${c.name}`, detail: `The ${c.name} header is not set.` });
    }
  }
  return findings;
}

function checkCookies(headers) {
  const findings = [];
  const setCookie = headers.get('set-cookie');
  if (!setCookie) return findings;
  for (const cookie of setCookie.split(',').map(c => c.trim())) {
    const lower = cookie.toLowerCase();
    const name = cookie.split('=')[0].trim();
    if (!lower.includes('httponly')) findings.push({ type: 'cookie-missing-httponly', severity: 'medium',
      title: `Cookie missing HttpOnly: ${name}`, detail: 'Cookie is accessible via JavaScript. Risk of theft via XSS.' });
    if (!lower.includes('secure')) findings.push({ type: 'cookie-missing-secure', severity: 'low',
      title: `Cookie missing Secure flag: ${name}`, detail: 'Cookie may be transmitted over HTTP.' });
    if (!lower.includes('samesite')) findings.push({ type: 'cookie-missing-samesite', severity: 'low',
      title: `Cookie missing SameSite: ${name}`, detail: 'Cookie may be sent in cross-site requests. CSRF risk.' });
  }
  return findings;
}

function checkFormsAndInputs(html, baseUrl) {
  const findings = [];
  for (const match of [...html.matchAll(/<form[^>]*>/gi)]) {
    const formTag = match[0];
    const method = (formTag.match(/method=["']?(\w+)/i) || [])[1] || 'GET';
    const action = (formTag.match(/action=["']?([^"'\s>]+)/i) || [])[1] || baseUrl;
    if (method.toUpperCase() === 'GET') findings.push({ type: 'form-get-method', severity: 'info',
      title: 'Form uses GET method', detail: `Form action "${action}" submits via GET. Parameters visible in URL and history.` });
    if (!formTag.toLowerCase().includes('csrf') && !formTag.toLowerCase().includes('token')) {
      findings.push({ type: 'form-no-csrf-token', severity: 'medium',
        title: 'Form may lack CSRF token', detail: 'No visible CSRF token attribute detected on a form.' });
    }
  }
  if (html.match(/<input[^>]*type=["']?password/i) && !html.match(/autocomplete=["']?off/i)) {
    findings.push({ type: 'password-autocomplete', severity: 'info',
      title: 'Password field without autocomplete=off', detail: 'Browser may cache password field values.' });
  }
  return findings;
}

function checkInfoLeakage(html, headers) {
  const findings = [];
  const server = headers.get('server');
  if (server) findings.push({ type: 'server-header', severity: 'info',
    title: `Server header discloses software: ${server}`, detail: 'Exposing server version aids fingerprinting.' });
  const poweredBy = headers.get('x-powered-by');
  if (poweredBy) findings.push({ type: 'x-powered-by', severity: 'info',
    title: `X-Powered-By header: ${poweredBy}`, detail: 'Technology stack disclosure.' });
  for (const c of [...html.matchAll(/<!--([\s\S]*?)-->/g)]) {
    const text = c[1].trim();
    if (text.length > 5 && /password|secret|key|token|todo|fixme|hack|debug|admin/i.test(text)) {
      findings.push({ type: 'sensitive-comment', severity: 'low',
        title: 'Potentially sensitive HTML comment', detail: `Comment contains: ${text.slice(0, 100)}` });
    }
  }
  return findings;
}

// Rule-based replacement for the old AI analysis.
function computeRisk(findings) {
  const order = ['critical', 'high', 'medium', 'low', 'info'];
  const has = (s) => findings.some(f => f.severity === s);
  const riskLevel = has('critical') ? 'critical' : has('high') ? 'high' : findings.length ? 'medium' : 'info';
  const topPriorities = findings
    .filter(f => ['critical', 'high', 'medium'].includes(f.severity))
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
    .slice(0, 3).map(f => f.title);
  const summary = `Found ${findings.length} issue${findings.length !== 1 ? 's' : ''}.`;
  return { riskLevel, summary, topPriorities };
}

module.exports = {
  ALLOWED_PROTOCOLS, XSS_PROBES, SQLI_PROBES,
  validateScanConfig, checkSecurityHeaders, checkCookies, checkFormsAndInputs, checkInfoLeakage, computeRisk,
};
