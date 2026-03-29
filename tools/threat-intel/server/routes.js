import { Router } from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();

const VALID_INDICATOR_TYPES = ['ip', 'domain', 'url', 'hash', 'auto'];

const CLAUDE_SYSTEM_PROMPT = `You are a threat intelligence analyst reviewing aggregated data about a potential indicator of compromise (IOC).
Analyze the provided data and respond with a JSON object only — no markdown, no explanation, just the JSON.

The JSON must have these exact fields:
{
  "summary": "2-3 sentence plain-English summary of the threat posture and what was found",
  "threatLevel": "critical" | "high" | "medium" | "low" | "unknown",
  "flags": ["specific concerning findings, empty array if none"],
  "recommendations": ["actionable recommendations based on findings"]
}`;

function detectIndicatorType(indicator) {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const hashRegex = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/;
  const urlRegex = /^https?:\/\//i;
  if (ipRegex.test(indicator)) return 'ip';
  if (hashRegex.test(indicator)) return 'hash';
  if (urlRegex.test(indicator)) return 'url';
  return 'domain';
}

async function fetchAbuseIPDB(indicator, type) {
  const key = process.env.ABUSEIPDB_API_KEY;
  if (!key) return { error: 'API key not configured' };
  if (type !== 'ip') return { skipped: 'AbuseIPDB only supports IP lookups' };
  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(indicator)}&maxAgeInDays=90&verbose`,
      { headers: { 'Key': key, 'Accept': 'application/json' } }
    );
    const data = await res.json();
    if (!res.ok) return { error: data.errors?.[0]?.detail || 'AbuseIPDB request failed' };
    const d = data.data;
    return {
      ipAddress: d.ipAddress,
      abuseConfidenceScore: d.abuseConfidenceScore,
      totalReports: d.totalReports,
      lastReportedAt: d.lastReportedAt,
      countryCode: d.countryCode,
      isp: d.isp,
      usageType: d.usageType,
      domain: d.domain,
      isTor: d.isTor,
      isWhitelisted: d.isWhitelisted,
      recentReports: (d.reports || []).slice(0, 3).map(r => ({
        reportedAt: r.reportedAt,
        comment: r.comment?.slice(0, 120),
        categories: r.categories,
      })),
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchVirusTotal(indicator, type) {
  const key = process.env.VIRUSTOTAL_API_KEY;
  if (!key) return { error: 'API key not configured' };
  try {
    let endpoint;
    if (type === 'ip') endpoint = `https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(indicator)}`;
    else if (type === 'domain') endpoint = `https://www.virustotal.com/api/v3/domains/${encodeURIComponent(indicator)}`;
    else if (type === 'hash') endpoint = `https://www.virustotal.com/api/v3/files/${encodeURIComponent(indicator)}`;
    else if (type === 'url') {
      const urlId = Buffer.from(indicator).toString('base64').replace(/=/g, '');
      endpoint = `https://www.virustotal.com/api/v3/urls/${urlId}`;
    }
    const res = await fetch(endpoint, { headers: { 'x-apikey': key } });
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || 'VirusTotal request failed' };
    const attr = data.data?.attributes;
    return {
      reputation: attr?.reputation,
      lastAnalysisStats: attr?.last_analysis_stats,
      meaningfulName: attr?.meaningful_name,
      typeDescription: attr?.type_description,
      tags: attr?.tags,
      lastModificationDate: attr?.last_modification_date,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchShodan(indicator, type) {
  const key = process.env.SHODAN_API_KEY;
  if (!key) return { error: 'API key not configured' };
  if (type === 'hash' || type === 'url') return { skipped: 'Shodan does not support hash or URL lookups' };
  try {
    if (type === 'ip') {
      const res = await fetch(`https://api.shodan.io/shodan/host/${encodeURIComponent(indicator)}?key=${key}`);
      const data = await res.json();
      if (!res.ok) return { skipped: `Shodan: ${data.error || 'host lookup requires a paid plan'}` };
      return { ip_str: data.ip_str, org: data.org, os: data.os, ports: data.ports, vulns: data.vulns ? Object.keys(data.vulns) : undefined };
    } else {
      const dnsRes = await fetch(`https://api.shodan.io/dns/resolve?hostnames=${encodeURIComponent(indicator)}&key=${key}`);
      const dnsData = await dnsRes.json();
      if (!dnsRes.ok) return { skipped: dnsData.error || 'Shodan DNS resolve failed' };
      const ip = dnsData[indicator];
      if (!ip) return { skipped: 'Shodan could not resolve domain to IP' };
      const hostRes = await fetch(`https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${key}`);
      const hostData = await hostRes.json();
      if (!hostRes.ok) return { ip_str: ip, skipped: `Shodan: ${hostData.error || 'host lookup requires a paid plan'}` };
      return { ip_str: hostData.ip_str, org: hostData.org, os: hostData.os, ports: hostData.ports, vulns: hostData.vulns ? Object.keys(hostData.vulns) : undefined };
    }
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchIPInfo(indicator, type) {
  const token = process.env.IPINFO_TOKEN;
  if (!token) return { error: 'API key not configured' };
  if (type === 'hash' || type === 'url') return { skipped: 'IPInfo does not support hash or URL lookups' };
  try {
    const target = type === 'ip' ? indicator : indicator;
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(target)}?token=${token}`);
    const data = await res.json();
    if (data.error) return { error: data.error.message || 'IPInfo request failed' };
    return { ip: data.ip, hostname: data.hostname, city: data.city, region: data.region, country: data.country, org: data.org, timezone: data.timezone };
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchThreatFox(indicator, type) {
  try {
    let queryType;
    if (type === 'hash') queryType = 'search_hash';
    else if (type === 'ip') queryType = 'search_ioc';
    else if (type === 'domain') queryType = 'search_ioc';
    else if (type === 'url') queryType = 'search_ioc';
    else queryType = 'search_ioc';

    const res = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryType, search_term: indicator }),
    });
    const data = await res.json();
    if (data.query_status === 'no_result') return { skipped: 'No ThreatFox matches found' };
    if (data.query_status !== 'ok') return { error: data.query_status || 'ThreatFox request failed' };
    const iocs = (data.data || []).slice(0, 5);
    return {
      matchCount: data.data?.length || 0,
      iocs: iocs.map(ioc => ({
        id: ioc.id,
        iocType: ioc.ioc_type,
        malwarePrintable: ioc.malware_printable,
        confidence: ioc.confidence_level,
        firstSeen: ioc.first_seen,
        tags: ioc.tags,
        reporterCountry: ioc.reporter_country_name,
      })),
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchURLhaus(indicator, type) {
  if (type === 'hash') return { skipped: 'Use MalwareBazaar for hash lookups' };
  if (type === 'ip') return { skipped: 'URLhaus does not support IP lookups directly' };
  try {
    let payload;
    if (type === 'url') payload = { url: indicator };
    else payload = { host: indicator };

    const res = await fetch('https://urlhaus-api.abuse.ch/v1/' + (type === 'url' ? 'url/' : 'host/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload).toString(),
    });
    const data = await res.json();
    if (data.query_status === 'no_results') return { skipped: 'No URLhaus matches found' };
    return {
      queryStatus: data.query_status,
      urlsCount: data.urls_count,
      blacklists: data.blacklists,
      urls: (data.urls || []).slice(0, 5).map(u => ({
        url: u.url,
        urlStatus: u.url_status,
        threat: u.threat,
        dateAdded: u.date_added,
        tags: u.tags,
      })),
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchMalwareBazaar(indicator, type) {
  if (type !== 'hash') return { skipped: 'MalwareBazaar only supports hash lookups' };
  try {
    const res = await fetch('https://mb-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query: 'get_info', hash: indicator }).toString(),
    });
    const data = await res.json();
    if (data.query_status === 'hash_not_found') return { skipped: 'Hash not found in MalwareBazaar' };
    if (data.query_status !== 'ok') return { error: data.query_status || 'MalwareBazaar request failed' };
    const sample = data.data?.[0];
    if (!sample) return { skipped: 'No data returned' };
    return {
      fileName: sample.file_name,
      fileType: sample.file_type,
      fileSize: sample.file_size,
      malwareFamilies: sample.vendor_intel ? Object.values(sample.vendor_intel).map(v => v.detection).filter(Boolean) : [],
      tags: sample.tags,
      firstSeen: sample.first_seen,
      lastSeen: sample.last_seen,
      signature: sample.signature,
      reporter: sample.reporter,
    };
  } catch (err) {
    return { error: err.message };
  }
}

router.post('/analyze', requireFields(['indicator']), async (req, res) => {
  const { indicator, indicatorType = 'auto' } = req.body;

  if (!indicator.trim()) {
    return res.status(400).json({ error: 'indicator must not be empty' });
  }

  if (!VALID_INDICATOR_TYPES.includes(indicatorType)) {
    return res.status(400).json({ error: `Invalid indicatorType. Must be one of: ${VALID_INDICATOR_TYPES.join(', ')}` });
  }

  const resolvedType = indicatorType === 'auto' ? detectIndicatorType(indicator.trim()) : indicatorType;

  const [abuseipdb, virusTotal, shodan, ipInfo, threatFox, urlhaus, malwareBazaar] = await Promise.all([
    fetchAbuseIPDB(indicator.trim(), resolvedType),
    fetchVirusTotal(indicator.trim(), resolvedType),
    fetchShodan(indicator.trim(), resolvedType),
    fetchIPInfo(indicator.trim(), resolvedType),
    fetchThreatFox(indicator.trim(), resolvedType),
    fetchURLhaus(indicator.trim(), resolvedType),
    fetchMalwareBazaar(indicator.trim(), resolvedType),
  ]);

  const sources = { abuseipdb, virusTotal, shodan, ipInfo, threatFox, urlhaus, malwareBazaar };

  const dataForClaude = JSON.stringify({ indicator: indicator.trim(), indicatorType: resolvedType, sources }, null, 2);
  let analysis = { summary: 'Analysis unavailable.', threatLevel: 'unknown', flags: [], recommendations: [] };

  try {
    const raw = await askClaude(CLAUDE_SYSTEM_PROMPT, `Analyze this threat intelligence data:\n${dataForClaude}`);
    analysis = JSON.parse(raw);
  } catch {
    // Non-fatal
  }

  res.json({
    indicator: indicator.trim(),
    indicatorType: resolvedType,
    sources,
    ...analysis,
  });
});

export default router;
