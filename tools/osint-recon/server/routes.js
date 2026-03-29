import { Router } from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();

const VALID_TARGET_TYPES = ['domain', 'ip', 'email', 'auto'];

const CLAUDE_SYSTEM_PROMPT = `You are a cybersecurity analyst reviewing OSINT data about a target.
Analyze the provided data and respond with a JSON object only — no markdown, no explanation, just the JSON.

The JSON must have these exact fields:
{
  "summary": "2-3 sentence plain-English summary of what was found and overall risk posture",
  "riskLevel": "critical" | "high" | "medium" | "low" | "unknown",
  "flags": ["any specific concerning findings, empty array if none"],
  "recommendations": ["actionable recommendations based on findings"]
}`;

function detectTargetType(target) {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (ipRegex.test(target)) return 'ip';
  if (emailRegex.test(target)) return 'email';
  return 'domain';
}

async function fetchShodan(target, type) {
  const key = process.env.SHODAN_API_KEY;
  if (!key) return { error: 'API key not configured' };
  try {
    const endpoint = type === 'ip'
      ? `https://api.shodan.io/shodan/host/${encodeURIComponent(target)}?key=${key}`
      : `https://api.shodan.io/dns/resolve?hostnames=${encodeURIComponent(target)}&key=${key}`;
    const res = await fetch(endpoint);
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'Shodan request failed' };
    return data;
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchVirusTotal(target, type) {
  const key = process.env.VIRUSTOTAL_API_KEY;
  if (!key) return { error: 'API key not configured' };
  try {
    const resourceType = type === 'ip' ? 'ip_addresses' : type === 'email' ? 'domains' : 'domains';
    const lookupTarget = type === 'email' ? target.split('@')[1] : target;
    const res = await fetch(`https://www.virustotal.com/api/v3/${resourceType}/${encodeURIComponent(lookupTarget)}`, {
      headers: { 'x-apikey': key },
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || 'VirusTotal request failed' };
    return {
      reputation: data.data?.attributes?.reputation,
      lastAnalysisStats: data.data?.attributes?.last_analysis_stats,
      categories: data.data?.attributes?.categories,
      totalVotes: data.data?.attributes?.total_votes,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchIPInfo(target, type) {
  const token = process.env.IPINFO_TOKEN;
  if (!token) return { error: 'API key not configured' };
  try {
    const lookupTarget = type === 'ip' ? target : target;
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(lookupTarget)}?token=${token}`);
    const data = await res.json();
    if (data.error) return { error: data.error.message || 'IPInfo request failed' };
    return {
      ip: data.ip,
      hostname: data.hostname,
      city: data.city,
      region: data.region,
      country: data.country,
      org: data.org,
      timezone: data.timezone,
      anycast: data.anycast,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchHunter(target, type) {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return { error: 'API key not configured' };
  try {
    const domain = type === 'email' ? target.split('@')[1] : target;
    if (type === 'ip') return { skipped: 'Hunter.io does not support IP lookups' };
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${key}`);
    const data = await res.json();
    if (data.errors) return { error: data.errors[0]?.details || 'Hunter request failed' };
    return {
      domain: data.data?.domain,
      disposable: data.data?.disposable,
      webmail: data.data?.webmail,
      emailCount: data.data?.emails?.length || 0,
      emails: (data.data?.emails || []).slice(0, 5).map(e => ({
        value: e.value,
        type: e.type,
        confidence: e.confidence,
      })),
      organization: data.data?.organization,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchWhois(target, type) {
  if (type === 'ip') return { skipped: 'WHOIS lookup not applicable for IPs — use IPInfo instead' };
  const domain = type === 'email' ? target.split('@')[1] : target;
  try {
    const res = await fetch(`https://www.whoisjsonapi.com/v1/${encodeURIComponent(domain)}`);
    const data = await res.json();
    if (!res.ok) return { error: 'WHOIS request failed' };
    return {
      domainName: data.domain_name,
      registrar: data.registrar?.name,
      createdDate: data.creation_date,
      expiresDate: data.expiration_date,
      updatedDate: data.updated_date,
      nameServers: data.name_servers,
      status: data.status,
      registrantOrg: data.registrant?.organization,
      registrantCountry: data.registrant?.country,
    };
  } catch (err) {
    return { error: err.message };
  }
}

router.post('/analyze', requireFields(['target']), async (req, res) => {
  const { target, targetType = 'auto' } = req.body;

  if (!VALID_TARGET_TYPES.includes(targetType)) {
    return res.status(400).json({ error: `Invalid targetType. Must be one of: ${VALID_TARGET_TYPES.join(', ')}` });
  }

  const resolvedType = targetType === 'auto' ? detectTargetType(target.trim()) : targetType;

  // Run all OSINT lookups in parallel
  const [shodan, virusTotal, ipInfo, hunter, whois] = await Promise.all([
    fetchShodan(target.trim(), resolvedType),
    fetchVirusTotal(target.trim(), resolvedType),
    fetchIPInfo(target.trim(), resolvedType),
    fetchHunter(target.trim(), resolvedType),
    fetchWhois(target.trim(), resolvedType),
  ]);

  const sources = { shodan, virusTotal, ipInfo, hunter, whois };

  // Ask Claude to synthesize findings
  const dataForClaude = JSON.stringify({ target, targetType: resolvedType, sources }, null, 2);
  let analysis = { summary: 'Analysis unavailable.', riskLevel: 'unknown', flags: [], recommendations: [] };

  try {
    const raw = await askClaude(CLAUDE_SYSTEM_PROMPT, `Analyze this OSINT data:\n${dataForClaude}`);
    analysis = JSON.parse(raw);
  } catch {
    // Non-fatal — return raw source data even if Claude synthesis fails
  }

  res.json({
    target: target.trim(),
    targetType: resolvedType,
    sources,
    ...analysis,
  });
});

export default router;
