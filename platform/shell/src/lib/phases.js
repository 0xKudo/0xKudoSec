/**
 * SOC phase taxonomy, shared by the sidebar and the dashboard (Phase D).
 * Order here is the canonical display order.
 */
export const PHASES = [
  {
    id: 'detect',
    label: 'Detect',
    routes: ['/alert-triage', '/threat-intel', '/log-anomaly-explainer', '/network-threat-analyzer', '/phishing-analyzer'],
  },
  {
    id: 'investigate',
    label: 'Investigate',
    routes: ['/osint-recon', '/cve-exploit-mapper', '/payload-obfuscation-explainer', '/decoder', '/subdomain-enumerator', '/network-scanner'],
  },
  {
    id: 'report',
    label: 'Report',
    routes: ['/incident-report'],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    routes: ['/security-policy-translator'],
  },
  {
    id: 'simulate',
    label: 'Simulate / Test',
    routes: ['/reverse-shell-generator', '/intruder', '/scanner', '/wordlist-generator', '/http-repeater', '/payload-generator'],
    comingSoon: ['Proxy'],
  },
];

/** route -> phase id (e.g. '/decoder' -> 'investigate'). */
export const ROUTE_TO_PHASE = PHASES.reduce((acc, p) => {
  p.routes.forEach(r => { acc[r] = p.id; });
  return acc;
}, {});

/** phase id -> short label (e.g. 'investigate' -> 'Investigate'). */
export const PHASE_LABEL = PHASES.reduce((acc, p) => {
  acc[p.id] = p.label;
  return acc;
}, {});
