import { Router } from 'express';
import express from 'express';
import dns from 'dns/promises';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();

// Common subdomain prefixes for brute-force mode
const BRUTE_WORDLIST = [
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

const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

async function queryCrtSh(domain) {
  try {
    const res = await fetch(`https://crt.sh/?q=%.${domain}&output=json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { error: `crt.sh returned ${res.status}` };
    const data = await res.json();
    const subdomains = new Set();
    for (const entry of data) {
      const names = (entry.name_value || '').split('\n');
      for (const name of names) {
        const clean = name.trim().replace(/^\*\./, '');
        if (clean.endsWith(`.${domain}`) || clean === domain) {
          subdomains.add(clean.toLowerCase());
        }
      }
    }
    return { subdomains: [...subdomains], count: subdomains.size };
  } catch (err) {
    return { error: err.message || 'crt.sh lookup failed' };
  }
}

async function queryHackerTarget(domain) {
  try {
    const res = await fetch(`https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { error: `HackerTarget returned ${res.status}` };
    const text = await res.text();
    if (text.includes('error') || text.includes('API count exceeded')) {
      return { error: text.trim() };
    }
    const subdomains = [];
    for (const line of text.trim().split('\n')) {
      const [host] = line.split(',');
      if (host && (host.endsWith(`.${domain}`) || host === domain)) {
        subdomains.push(host.trim().toLowerCase());
      }
    }
    return { subdomains, count: subdomains.length };
  } catch (err) {
    return { error: err.message || 'HackerTarget lookup failed' };
  }
}

async function querySecurityTrails(domain, apiKey) {
  if (!apiKey) return { skipped: 'No SECURITYTRAILS_API_KEY configured' };
  try {
    const res = await fetch(`https://api.securitytrails.com/v1/domain/${encodeURIComponent(domain)}/subdomains`, {
      headers: { 'APIKEY': apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { error: `SecurityTrails returned ${res.status}` };
    const data = await res.json();
    const subdomains = (data.subdomains || []).map(s => `${s}.${domain}`);
    return { subdomains, count: subdomains.length };
  } catch (err) {
    return { error: err.message || 'SecurityTrails lookup failed' };
  }
}

async function bruteForce(domain, wordlist) {
  const list = (wordlist && wordlist.length > 0) ? wordlist : BRUTE_WORDLIST;
  const resolved = [];
  const CONCURRENCY = 20;

  async function resolveSub(sub) {
    try {
      const hostname = `${sub}.${domain}`;
      const addrs = await dns.resolve4(hostname);
      if (addrs.length > 0) resolved.push({ hostname, ips: addrs });
    } catch {
      // not found — skip
    }
  }

  // Process in batches to avoid overwhelming DNS
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(resolveSub));
  }

  return { subdomains: resolved, count: resolved.length };
}

// POST /enumerate
router.post('/enumerate', express.json({ limit: '20kb' }), async (req, res) => {
  const { domain, sources, bruteWordlist } = req.body || {};

  if (!domain || typeof domain !== 'string' || !DOMAIN_REGEX.test(domain.trim())) {
    return res.status(400).json({ error: 'domain must be a valid domain name (e.g. example.com)' });
  }

  const target = domain.trim().toLowerCase();
  const enabledSources = Array.isArray(sources) ? sources : ['crtsh', 'hackertarget'];

  const [crtshResult, hackerTargetResult, securityTrailsResult, bruteResult] = await Promise.all([
    enabledSources.includes('crtsh') ? queryCrtSh(target) : Promise.resolve({ skipped: 'Not selected' }),
    enabledSources.includes('hackertarget') ? queryHackerTarget(target) : Promise.resolve({ skipped: 'Not selected' }),
    enabledSources.includes('securitytrails') ? querySecurityTrails(target, process.env.SECURITYTRAILS_API_KEY) : Promise.resolve({ skipped: 'Not selected' }),
    enabledSources.includes('brute') ? bruteForce(target, bruteWordlist || []) : Promise.resolve({ skipped: 'Not selected' }),
  ]);

  // Collect all unique subdomains
  const allSubs = new Set();
  if (crtshResult.subdomains) crtshResult.subdomains.forEach(s => allSubs.add(s));
  if (hackerTargetResult.subdomains) hackerTargetResult.subdomains.forEach(s => allSubs.add(s));
  if (securityTrailsResult.subdomains) securityTrailsResult.subdomains.forEach(s => allSubs.add(s));
  if (bruteResult.subdomains) bruteResult.subdomains.forEach(r => allSubs.add(r.hostname));

  const totalUnique = allSubs.size;

  // Claude synthesis
  let analysis = null;
  try {
    const prompt = `You are a security analyst reviewing subdomain enumeration results for "${target}".

Sources used: ${enabledSources.join(', ')}

Results:
- crt.sh (Certificate Transparency): ${crtshResult.error ? `Error: ${crtshResult.error}` : crtshResult.skipped ? 'Skipped' : `${crtshResult.count} subdomains found`}
- HackerTarget: ${hackerTargetResult.error ? `Error: ${hackerTargetResult.error}` : hackerTargetResult.skipped ? 'Skipped' : `${hackerTargetResult.count} subdomains found`}
- SecurityTrails: ${securityTrailsResult.error ? `Error: ${securityTrailsResult.error}` : securityTrailsResult.skipped ? 'Skipped' : `${securityTrailsResult.count} subdomains found`}
- Brute-force DNS: ${bruteResult.error ? `Error: ${bruteResult.error}` : bruteResult.skipped ? 'Skipped' : `${bruteResult.count} subdomains resolved`}

Discovered subdomains (up to 200 shown): ${[...allSubs].slice(0, 200).join(', ') || 'None'}

Respond with JSON only:
{
  "summary": "2-3 sentence overview of what was found",
  "riskLevel": "high|medium|low|info",
  "flags": ["notable finding or potential risk item"],
  "interestingSubdomains": ["subdomain — reason it stands out"],
  "recommendations": ["action to take"]
}`;

    analysis = await askClaude(prompt);
    if (typeof analysis === 'string') analysis = JSON.parse(analysis);
  } catch {
    analysis = {
      summary: `Found ${totalUnique} unique subdomains for ${target}.`,
      riskLevel: 'info',
      flags: [],
      interestingSubdomains: [],
      recommendations: ['Review discovered subdomains for exposed services.'],
    };
  }

  res.json({
    domain: target,
    sources: {
      crtsh: crtshResult,
      hackertarget: hackerTargetResult,
      securitytrails: securityTrailsResult,
      brute: bruteResult,
    },
    allSubdomains: [...allSubs].sort(),
    totalUnique,
    analysis,
  });
});

export default router;
