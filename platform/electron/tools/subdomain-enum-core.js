// Pure, testable helpers for the Subdomain Enumerator. No Electron dependency.
// SecurityTrails is intentionally omitted (enterprise-only pricing; already dropped from the UI).
// No Claude — the tool returns the discovered subdomain list with resolved IPs.

const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

const DEFAULT_WORDLIST = [
  'www', 'mail', 'ftp', 'smtp', 'pop', 'imap', 'ns1', 'ns2', 'ns3',
  'vpn', 'remote', 'webmail', 'admin', 'portal', 'api', 'dev', 'staging',
  'test', 'beta', 'app', 'mobile', 'docs', 'blog', 'shop', 'store',
  'cdn', 'static', 'assets', 'media', 'img', 'images', 'video',
  'git', 'gitlab', 'github', 'jenkins', 'ci', 'jira', 'confluence',
  'monitor', 'status', 'health', 'metrics', 'grafana', 'kibana',
  'db', 'database', 'mysql', 'redis', 'mongo', 'postgres',
  'auth', 'login', 'sso', 'oauth', 'id', 'accounts',
  'support', 'help', 'forum', 'community', 'wiki',
  'intranet', 'internal', 'corp', 'office',
  'backup', 'old', 'legacy', 'archive',
  'mx', 'mx1', 'mx2', 'smtp1', 'smtp2',
  'proxy', 'gateway', 'firewall', 'router',
  'v1', 'v2', 'v3', 'api1', 'api2',
  'sandbox', 'qa', 'uat', 'demo',
  'web', 'web1', 'web2', 'www1', 'www2',
];

function validateDomain(domain) {
  if (!domain || typeof domain !== 'string') return false;
  return DOMAIN_REGEX.test(domain.trim());
}

function belongsTo(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

// crt.sh returns an array of { name_value } (names may be newline-joined, may carry *. wildcards).
function parseCrtShJson(data, domain) {
  const out = new Set();
  for (const entry of Array.isArray(data) ? data : []) {
    for (const name of String(entry.name_value || '').split('\n')) {
      const clean = name.trim().replace(/^\*\./, '').toLowerCase();
      if (clean && belongsTo(clean, domain)) out.add(clean);
    }
  }
  return [...out];
}

// HackerTarget hostsearch returns "host,ip" CSV lines.
function parseHackerTargetText(text, domain) {
  const out = new Set();
  if (!text || /error|API count exceeded/i.test(text)) return [];
  for (const line of String(text).trim().split('\n')) {
    const host = (line.split(',')[0] || '').trim().toLowerCase();
    if (host && belongsTo(host, domain)) out.add(host);
  }
  return [...out];
}

module.exports = { DEFAULT_WORDLIST, validateDomain, parseCrtShJson, parseHackerTargetText };
