import { useState, useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile';

// ── Update this URL with each Electron release ────────────────────────────────
const DESKTOP_DOWNLOAD_URL = 'https://github.com/0xKudoX/0xKudoSec-releases/releases/download/v1.2.8/0xKudo-Security-Toolkit-Setup-1.2.8.exe';

// Donut chart — same algorithm as SiemDashboard.jsx DonutChart
function DonutChart({ size = 80 }) {
  const cx = size / 2, cy = size / 2;
  const R = size * 0.41;
  const r = size * 0.25;
  const data = [
    { count: 9,  color: '#ef4444' },
    { count: 18, color: '#d97706' },
    { count: 22, color: '#ca8a04' },
    { count: 51, color: '#16a34a' },
  ];
  const total = data.reduce((s, d) => s + d.count, 0);
  let angle = -Math.PI / 2;
  const paths = data.map(({ color, count }) => {
    const sweep = (count / total) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(angle + sweep), y2 = cy + R * Math.sin(angle + sweep);
    const ix1 = cx + r * Math.cos(angle), iy1 = cy + r * Math.sin(angle);
    const ix2 = cx + r * Math.cos(angle + sweep), iy2 = cy + r * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1} Z`;
    angle += sweep;
    return <path key={color} d={d} fill={color} opacity={0.85} stroke="var(--bg-surface)" strokeWidth="1.5" />;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {paths}
      <circle cx={cx} cy={cy} r={r - 1} fill="var(--bg-surface)" />
    </svg>
  );
}

// Shared data
const SIEM_CAPABILITIES = [
  { name: 'Log Ingestion',      desc: 'Fluent Bit pipeline, per-user API keys, Windows Event Log and Sysmon. Source cards show status, events per hour, and uptime.' },
  { name: 'Detection Rules',    desc: 'Pattern-based rules with severity tiers. Alerts auto-deduplicate and aggregate. No alert storms. Critical, high, medium, low, and info levels.' },
  { name: 'Alert Queue',        desc: 'Filterable queue with severity badges, status pills, and case linking. Triage from a single view.' },
  { name: 'Case Management',    desc: 'Link alerts to cases. Timeline builder, evidence attachment, playbook checklists, and status tracking.' },
  { name: 'Live Dashboard',     desc: 'KPI cards, event volume chart, severity donut, top sources. WebSocket live updates with 30-second polling fallback.' },
  { name: 'Log Search',         desc: 'Search across all ingested events. Filter by time range, source, severity, and category. Full field extraction on any event.' },
];

const SIEM_DEEP = [
  {
    num: '01',
    title: 'Real-time ingestion via Fluent Bit',
    body: 'Windows Event Logs and Sysmon data are shipped continuously and normalized on arrival. Events are tagged to your account so your data stays scoped and private. The live dashboard and alert queue update in real time via WebSocket as events come in.',
  },
  {
    num: '02',
    title: 'Detection rules with automatic deduplication',
    body: 'Rules match on any combination of event ID, username, host, source IP, destination IP, process name, message content, category, or severity. When a rule fires repeatedly, alerts are automatically deduplicated and aggregated with a count rather than flooding the queue.',
  },
  {
    num: '03',
    title: 'Case management from alert to resolution',
    body: 'Alerts link directly to cases. Each case has a timeline of linked alerts, an evidence panel for attaching artifacts, a playbook checklist to track response steps, and a status that moves from open to resolved.',
  },
];

// Tools with a route can be used without login
const PHASES = [
  {
    key: 'detect',
    label: 'Detect',
    color: 'var(--severity-critical)',
    tools: ['Alert Triage Assistant', 'Threat Intelligence Aggregator', 'Log Anomaly Explainer', 'Network Threat Analyzer', 'Phishing Email Analyzer'],
  },
  {
    key: 'investigate',
    label: 'Investigate',
    color: 'var(--severity-high)',
    tools: [
      'OSINT Recon Dashboard', 'CVE Exploit Mapper', 'Payload Obfuscation Explainer',
      { name: 'Decoder', route: '/decoder' },
      'Subdomain Enumerator', 'Network Scanner',
    ],
  },
  {
    key: 'report',
    label: 'Report',
    color: 'var(--severity-low)',
    tools: ['Incident Report Generator'],
  },
  {
    key: 'compliance',
    label: 'Compliance',
    color: 'var(--severity-info)',
    tools: ['Security Policy Translator'],
  },
  {
    key: 'simulate',
    label: 'Simulate / Test',
    color: '#a855f7',
    tools: [
      { name: 'Reverse Shell Generator', route: '/reverse-shell-generator' },
      'Intruder', 'Vulnerability Scanner',
      { name: 'Wordlist / Password Generator', route: '/wordlist-generator' },
      'HTTP Repeater',
      { name: 'Payload Generator', route: '/payload-generator' },
    ],
  },
];

const s = {
  // layout
  page: { background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '13px', lineHeight: '1.6', minHeight: '100vh' },

  // hero
  hero: { textAlign: 'center', padding: '88px 48px 72px', borderBottom: '1px solid var(--border)', position: 'relative', overflow: 'hidden' },
  heroGrid: { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '48px 48px', opacity: 0.35, pointerEvents: 'none' },
  heroTag: { display: 'inline-block', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-amber)', border: '1px solid var(--accent-amber)', padding: '4px 12px', marginBottom: '28px', position: 'relative' },
  heroHeadline: { fontSize: '46px', fontWeight: 600, lineHeight: 1.15, color: 'var(--text-primary)', marginBottom: '22px', letterSpacing: '-0.02em', position: 'relative' },
  heroHeadlineAccent: { color: 'var(--accent-amber)' },
  heroSub: { fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.75, maxWidth: '500px', margin: '0 auto 36px', position: 'relative' },
  heroCtas: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '18px', position: 'relative' },
  heroNote: { fontSize: '11px', color: 'var(--text-muted)', position: 'relative' },

  // hero mobile
  heroMobile: { textAlign: 'center', padding: '48px 24px 40px', borderBottom: '1px solid var(--border)', position: 'relative', overflow: 'hidden' },
  heroHeadlineMobile: { fontSize: '28px', fontWeight: 600, lineHeight: 1.2, color: 'var(--text-primary)', marginBottom: '16px', letterSpacing: '-0.01em', position: 'relative' },
  heroSubMobile: { fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '28px', position: 'relative' },
  heroCtasMobile: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '16px', position: 'relative' },

  // buttons
  btnPrimary: { background: '#e8e6e3', color: '#111110', border: '1px solid #e8e6e3', fontFamily: 'var(--font)', fontSize: '12px', fontWeight: 600, padding: '11px 28px', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' },
  btnPrimaryFull: { background: '#e8e6e3', color: '#111110', border: '1px solid #e8e6e3', fontFamily: 'var(--font)', fontSize: '12px', fontWeight: 600, padding: '11px 28px', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', width: '100%' },
  btnSecondary: { background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: '12px', padding: '11px 28px', cursor: 'pointer', letterSpacing: '0.04em' },
  btnSecondaryFull: { background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: '12px', padding: '11px 28px', cursor: 'pointer', letterSpacing: '0.04em', width: '100%' },

  // stat bar
  statBar: { display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' },
  statBarMobile: { display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' },
  statItem: { flex: 1, padding: '16px 24px', borderRight: '1px solid var(--border)' },
  statItemMobile: { padding: '14px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' },
  statNum: { fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' },
  statNumAmber: { fontSize: '20px', fontWeight: 600, color: 'var(--accent-amber)' },
  statLabel: { fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.04em', marginTop: '2px' },

  // editorial layout (desktop)
  editorial: { display: 'grid', gridTemplateColumns: '200px 1fr', borderTop: '1px solid var(--border)' },
  editorialLabelCol: { padding: '56px 48px', borderRight: '1px solid var(--border)', background: 'var(--bg-surface)' },
  editorialTag: { fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-amber)', marginBottom: '8px' },
  editorialTitle: { fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 },
  editorialContent: { padding: '56px 60px' },
  editorialIntro: { fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.75, maxWidth: '600px', marginBottom: '40px' },

  // editorial layout (mobile — no sidebar, flat sections)
  editorialMobile: { borderTop: '1px solid var(--border)' },
  editorialMobileHeader: { padding: '24px 24px 0', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' },
  editorialMobileContent: { padding: '16px 24px 32px' },
  editorialMobileIntro: { fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '24px' },

  // capability list
  capList: { border: '1px solid var(--border)' },
  capRow: { display: 'grid', gridTemplateColumns: '160px 1fr', borderBottom: '1px solid var(--border)' },
  capRowMobile: { padding: '14px 0', borderBottom: '1px solid var(--border)' },
  capName: { padding: '16px 18px', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', borderRight: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center' },
  capNameMobile: { fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' },
  capDesc: { padding: '16px 22px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, display: 'flex', alignItems: 'center' },
  capDescMobile: { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 },

  // deep dive cards
  deepGrid: { border: '1px solid var(--border)' },
  deepCard: { padding: '24px 28px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '36px 1fr', columnGap: '20px', rowGap: '10px' },
  deepCardMobile: { padding: '20px 0', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' },
  deepNum: { fontSize: '11px', color: 'var(--accent-amber)', letterSpacing: '0.08em', paddingTop: '2px', gridRow: 1 },
  deepTitle: { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', gridRow: 1 },
  deepBody: { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.75, gridColumn: 2, gridRow: 2 },
  deepBodyMobile: { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 },

  // phase list
  phaseEntry: { marginBottom: '28px' },
  phaseHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' },
  phaseDot: (color) => ({ width: '9px', height: '9px', borderRadius: '50%', background: color, flexShrink: 0 }),
  phaseName: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-primary)' },
  phaseCount: { fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' },
  toolTags: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  toolTag: { fontSize: '11px', padding: '5px 12px', border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg-surface)', letterSpacing: '0.02em' },

  // SIEM preview (inside editorial, desktop only — hidden on mobile)
  previewWrap: { border: '1px solid var(--border)', background: 'var(--bg-sidebar)', marginBottom: '32px', overflow: 'hidden', fontSize: '11px' },
  previewTopbar: { background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' },
  previewDot: (c) => ({ width: '7px', height: '7px', borderRadius: '50%', background: c, flexShrink: 0 }),
  previewTopbarTitle: { fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', flex: 1 },
  previewTimeBtnRow: { display: 'flex', gap: '4px' },
  previewTimeBtn: { fontSize: '9px', padding: '2px 7px', border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'none', fontFamily: 'var(--font)', cursor: 'default' },
  previewTimeBtnActive: { fontSize: '9px', padding: '2px 7px', border: '1px solid var(--border)', color: 'var(--btn-primary-text)', background: 'var(--btn-primary-bg)', fontFamily: 'var(--font)', cursor: 'default' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border-subtle)', borderBottom: '1px solid var(--border)' },
  kpiCard: { background: 'var(--bg-surface)', padding: '10px 14px' },
  kpiLabel: { fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' },
  kpiVal: (color) => ({ fontSize: '22px', fontWeight: 600, color: color || 'var(--text-primary)', lineHeight: 1 }),
  kpiSub: { fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' },
  midRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border-subtle)' },
  chartPanel: { background: 'var(--bg-surface)', padding: '10px 14px', display: 'flex', flexDirection: 'column' },
  chartTitle: { fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' },
  resolvedChip: { fontSize: '8px', padding: '1px 6px', border: '1px solid var(--border)', color: 'var(--text-muted)', letterSpacing: '0.04em' },
  viewAll: { marginLeft: 'auto', fontSize: '8px', color: 'var(--text-subtle)', border: '1px solid var(--border)', padding: '1px 7px' },
  alertRow: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '9px', color: 'var(--text-muted)', padding: '3px 0', overflow: 'hidden' },
  alertMsg: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  alertTime: { color: 'var(--text-subtle)', whiteSpace: 'nowrap', flexShrink: 0 },
  sevBadge: (color) => ({ fontSize: '8px', padding: '1px 5px', border: `1px solid ${color}`, color, letterSpacing: '0.04em', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }),
  rightSplit: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border-subtle)' },
  rightPanel: { background: 'var(--bg-surface)', padding: '10px 14px', display: 'flex', flexDirection: 'column' },
  donutWrap: { display: 'flex', alignItems: 'center', gap: '12px', flex: 1, paddingTop: '4px' },
  donutLegend: { display: 'flex', flexDirection: 'column', gap: '5px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9px', color: 'var(--text-muted)' },
  legendDot: (c) => ({ width: '6px', height: '6px', borderRadius: '50%', background: c, flexShrink: 0 }),
  srcTable: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden', paddingTop: '2px' },
  srcRow: { display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', alignItems: 'center' },
  srcHead: { display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '3px', borderBottom: '1px solid var(--border-subtle)' },
  tabStrip: { background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' },
  tabRow: { display: 'flex', borderBottom: '1px solid var(--border-subtle)', paddingLeft: '6px' },
  tabBtn: (active) => ({ background: 'none', border: 'none', borderBottom: active ? '2px solid var(--text-primary)' : '2px solid transparent', color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '9px', padding: '7px 10px', cursor: 'default', letterSpacing: '0.04em', textTransform: 'uppercase' }),
  tabContent: { padding: '10px 20px' },
  eventIdTable: { borderCollapse: 'collapse', maxWidth: '480px', width: '100%', fontSize: '9px', fontFamily: 'var(--font)' },
  th: { textAlign: 'left', padding: '4px 0', fontSize: '8px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'normal', borderBottom: '1px solid var(--border)' },
  thRight: { textAlign: 'right', padding: '4px 0', fontSize: '8px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'normal', borderBottom: '1px solid var(--border)' },
  tdLink: { padding: '5px 0', color: 'var(--severity-info)' },
  tdCount: { padding: '5px 0', color: 'var(--text-muted)', textAlign: 'right' },
  searchBar: { padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '8px' },
  searchSelect: { fontSize: '9px', padding: '4px 8px', border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg-primary)', fontFamily: 'var(--font)' },
  searchInput: { flex: 1, fontSize: '9px', padding: '4px 8px', border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg-primary)', fontFamily: 'var(--font)' },
  sectionBar: { padding: '6px 14px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', justifyContent: 'space-between' },
  eventTable: { borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', fontSize: '9px' },
  eTh: { textAlign: 'left', padding: '6px 10px', fontSize: '8px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', whiteSpace: 'nowrap', fontWeight: 'normal' },
  eTd: { padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 0 },
  eTdSev: (color) => ({ fontSize: '8px', padding: '1px 5px', border: `1px solid ${color}`, color, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }),

  // nav
  nav: { background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'stretch', flexShrink: 0, height: '44px', zIndex: 100 },
  navBrand: { display: 'flex', alignItems: 'center', padding: '0 20px', fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)', letterSpacing: '0.04em', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', flexShrink: 0 },
  navTab: (active) => ({ display: 'flex', alignItems: 'center', padding: '0 24px', fontSize: '12px', letterSpacing: '0.06em', textTransform: 'uppercase', color: active ? 'var(--accent-amber)' : 'var(--text-muted)', cursor: 'pointer', borderRight: '1px solid var(--border)', borderBottom: active ? '2px solid var(--accent-amber)' : '2px solid transparent', background: active ? 'var(--bg-primary)' : 'transparent', userSelect: 'none' }),
  navRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px', padding: '0 16px' },
  navBtn: { background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 10px', cursor: 'pointer' },
  // nav mobile
  navMobile: { background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'stretch', flexShrink: 0, height: '44px', zIndex: 100 },
  navMobileRight: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px', flexShrink: 0 },

  // free strip
  freeStrip: { borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '20px 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '32px' },
  freeStripMobile: { borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center' },
  freeText: { fontSize: '12px', color: 'var(--text-muted)' },

  // footer
  footer: { borderTop: '1px solid var(--border)', padding: '22px 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-sidebar)' },
  footerMobile: { borderTop: '1px solid var(--border)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-sidebar)' },
  footerBrand: { fontSize: '12px', color: 'var(--text-muted)' },
  footerLinks: { display: 'flex', gap: '24px' },
  footerLink: { fontSize: '11px', color: 'var(--text-subtle)', textDecoration: 'none' },
};

function LandingNav({ onLogin, onScrollToTools, isMobile }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('cybertools_theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cybertools_theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  if (isMobile) {
    return (
      <nav style={s.navMobile}>
        <div style={{ ...s.navBrand, borderRight: 'none', fontSize: '10px', padding: '0 14px', letterSpacing: '0.02em' }}>[ 0xKudoSec ]</div>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ ...s.navTab(true), padding: '0 12px' }}>SIEM</div>
          <div style={{ ...s.navTab(false), padding: '0 12px' }} onClick={onScrollToTools}>Tools</div>
        </div>
        <div style={s.navMobileRight}>
          <button style={{ ...s.navBtn, padding: '4px 8px', fontSize: '10px' }} onClick={onLogin}>login</button>
          <button style={{ ...s.navBtn, padding: '4px 8px' }} onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
        </div>
      </nav>
    );
  }

  return (
    <nav style={s.nav}>
      <div style={s.navBrand}>[ 0xKudoSec ]</div>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={s.navTab(true)}>SIEM</div>
        <div
          style={{ ...s.navTab(false), cursor: 'pointer' }}
          onClick={onScrollToTools}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >Tools</div>
      </div>
      <div style={s.navRight}>
        <button style={s.navBtn} onClick={onLogin}>[ login ]</button>
        <button style={s.navBtn} onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
      </div>
    </nav>
  );
}

function SiemPreview() {
  return (
    <div style={s.previewWrap}>
      {/* Topbar */}
      <div style={s.previewTopbar}>
        <div style={s.previewDot('#ef4444')} />
        <div style={s.previewDot('#ca8a04')} />
        <div style={s.previewDot('#16a34a')} />
        <span style={s.previewTopbarTitle}>SIEM / Dashboard</span>
        <div style={s.previewTimeBtnRow}>
          {['1h','6h','24h','48h','7d'].map(t => (
            <button key={t} style={t === '24h' ? s.previewTimeBtnActive : s.previewTimeBtn}>{t}</button>
          ))}
        </div>
      </div>
      {/* KPI row */}
      <div style={s.kpiRow}>
        <div style={s.kpiCard}><div style={s.kpiLabel}>Active Alerts</div><div style={s.kpiVal('#ef4444')}>3</div><div style={s.kpiSub}>unacknowledged</div></div>
        <div style={s.kpiCard}><div style={s.kpiLabel}>Critical</div><div style={s.kpiVal('#ef4444')}>3</div><div style={s.kpiSub}>severity critical</div></div>
        <div style={s.kpiCard}><div style={s.kpiLabel}>High</div><div style={s.kpiVal('#d97706')}>7</div><div style={s.kpiSub}>severity high</div></div>
        <div style={s.kpiCard}><div style={s.kpiLabel}>Total Events</div><div style={s.kpiVal()}>172,800</div><div style={s.kpiSub}>last 24h</div></div>
      </div>
      {/* Mid row */}
      <div style={s.midRow}>
        <div style={s.chartPanel}>
          <div style={s.chartTitle}>
            Active Alerts
            <span style={s.resolvedChip}>resolved 2</span>
            <span style={s.viewAll}>View All</span>
          </div>
          {[
            { sev: 'critical', color: '#ef4444', msg: 'Lateral movement detected — WORKSTATION-04', time: '10:32 PM' },
            { sev: 'high',     color: '#d97706', msg: 'Brute force — 47 failed logins on admin',   time: '10:28 PM' },
            { sev: 'critical', color: '#ef4444', msg: 'Suspicious scheduled task via svchost',      time: '10:21 PM' },
          ].map((a, i) => (
            <div key={i} style={s.alertRow}>
              <span style={s.sevBadge(a.color)}>{a.sev}</span>
              <span style={s.alertMsg}>{a.msg}</span>
              <span style={s.alertTime}>{a.time}</span>
            </div>
          ))}
        </div>
        <div style={s.rightSplit}>
          <div style={s.rightPanel}>
            <div style={s.chartTitle}>By Severity</div>
            <div style={s.donutWrap}>
              <DonutChart size={72} />
              <div style={s.donutLegend}>
                {[['#ef4444','critical 9%'],['#d97706','high 18%'],['#ca8a04','medium 22%'],['#16a34a','low 51%']].map(([c,l]) => (
                  <div key={c} style={s.legendItem}><div style={s.legendDot(c)} />{l}</div>
                ))}
              </div>
            </div>
          </div>
          <div style={s.rightPanel}>
            <div style={s.chartTitle}>Top Sources</div>
            <div style={s.srcTable}>
              <div style={s.srcHead}><span>Source</span><span>%</span></div>
              {[['MSI','100%']].map(([src, pct]) => (
                <div key={src} style={s.srcRow}><span>{src}</span><span>{pct}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Tabbed insights */}
      <div style={s.tabStrip}>
        <div style={s.tabRow}>
          {['Top Event IDs','Failed Logins','Top Usernames','Alert Trend','Rule Hits'].map((t, i) => (
            <button key={t} style={s.tabBtn(i === 0)}>{t}</button>
          ))}
        </div>
        <div style={s.tabContent}>
          <table style={s.eventIdTable}>
            <thead><tr><th style={s.th}>Event ID</th><th style={s.thRight}>Count</th></tr></thead>
            <tbody>
              {[['1','62,030'],['8','61,552'],['5','31,391'],['3','14,814'],['11','1,676'],['13','1,246']].map(([id, count]) => (
                <tr key={id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={s.tdLink}>{id}</td>
                  <td style={s.tdCount}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Search bar */}
      <div style={s.searchBar}>
        <select style={s.searchSelect}><option>All Sources</option></select>
        <input style={s.searchInput} readOnly placeholder="search message, event_id, username, host, ip, process... or field:value (e.g. username:SYSTEM, event_id:4625)" />
      </div>
      {/* Recent events */}
      <div style={s.sectionBar}><span>Recent Events</span><span style={{ color: 'var(--text-subtle)' }}>200 shown</span></div>
      <div style={{ overflow: 'hidden' }}>
        <table style={s.eventTable}>
          <thead>
            <tr>
              {[['Time',80],['Severity',72],['Event ID',60],['Category',88],['Host',80],['Src IP',90],['Dest IP',90],['User',80],['Message',null]].map(([col, w]) => (
                <th key={col} style={{ ...s.eTh, ...(w ? { width: w } : {}) }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { time: '9:46:39 PM', sev: 'info', sevColor: '#60a5fa', eid: '1',  cat: 'process', host: 'MSI', src: '—', dst: '—', user: 'admin', msg: 'Process Create: RuleName: UtcTime: 2026-04-03...' },
              { time: '9:46:39 PM', sev: 'info', sevColor: '#60a5fa', eid: '8',  cat: '—',       host: 'MSI', src: '—', dst: '—', user: 'admin', msg: 'CreateRemoteThread detected: SourceImage: C:\\Windows\\System32...' },
              { time: '9:46:38 PM', sev: 'info', sevColor: '#60a5fa', eid: '1',  cat: 'process', host: 'MSI', src: '—', dst: '—', user: 'admin', msg: 'Process Create: RuleName: UtcTime: 2026-04-03...' },
            ].map((r, i) => (
              <tr key={i}>
                <td style={s.eTd}>{r.time}</td>
                <td style={s.eTd}><span style={s.eTdSev(r.sevColor)}>{r.sev}</span></td>
                <td style={s.eTd}>{r.eid}</td>
                <td style={s.eTd}>{r.cat}</td>
                <td style={s.eTd}>{r.host}</td>
                <td style={s.eTd}>{r.src}</td>
                <td style={s.eTd}>{r.dst}</td>
                <td style={s.eTd}>{r.user}</td>
                <td style={s.eTd}>{r.msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DesktopLanding({ onLogin }) {
  const toolsRef = useRef(null);
  const scrollToTools = () => toolsRef.current?.scrollIntoView({ behavior: 'smooth' });
  return (
    <div style={s.page}>
      <LandingNav onLogin={onLogin} onScrollToTools={scrollToTools} isMobile={false} />
      {/* Hero */}
      <section style={s.hero}>
        <div style={s.heroGrid} />
        <div style={s.heroTag}>// Open Security Operations Platform</div>
        <h1 style={s.heroHeadline}>
          Security operations,{' '}
          <span style={s.heroHeadlineAccent}>unified.</span>
        </h1>
        <p style={s.heroSub}>
          Real-time SIEM and 19 security tools covering detection, investigation, reporting, compliance, and simulation. Built for SOC analysts, pen testers, and security engineers.
        </p>
        <div style={s.heroCtas}>
          <button
            style={s.btnPrimary}
            onClick={onLogin}
            onMouseEnter={e => { e.currentTarget.style.background = '#111110'; e.currentTarget.style.color = '#e8e6e3'; e.currentTarget.style.borderColor = '#e8e6e3'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#e8e6e3'; e.currentTarget.style.color = '#111110'; e.currentTarget.style.borderColor = '#e8e6e3'; }}
          >Create Free Account</button>
          <button
            style={s.btnSecondary}
            onClick={scrollToTools}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--text-muted)'; e.currentTarget.style.color = 'var(--bg-primary)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >Browse Tools</button>
          <a
            href={DESKTOP_DOWNLOAD_URL}
            style={{ ...s.btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-amber)'; e.currentTarget.style.color = 'var(--bg-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--accent-amber)'; }}
          >↓ Download for Windows</a>
        </div>
        <p style={s.heroNote}>
          <span style={{ color: 'var(--severity-low)' }}>✓</span>
          {' '}No credit card required
        </p>
      </section>

      {/* Stat bar */}
      <div style={s.statBar}>
        {[
          ['SIEM', 'Real-Time Ingestion', true],
          ['19',   'Security Tools',      false],
          ['4',    'SOC Phases',          false],
          ['Windows', 'Event Log + Sysmon', false],
          ['Auth0', 'Secure Login',       false],
        ].map(([num, label, amber], i, arr) => (
          <div key={label} style={{ ...s.statItem, ...(i === arr.length - 1 ? { borderRight: 'none' } : {}) }}>
            <div style={amber ? s.statNumAmber : s.statNum}>{num}</div>
            <div style={s.statLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* SIEM capabilities */}
      <div style={s.editorial}>
        <div style={s.editorialLabelCol}>
          <div style={s.editorialTag}>// SIEM</div>
          <div style={s.editorialTitle}>SIEM &amp; Log Management</div>
        </div>
        <div style={s.editorialContent}>
          <p style={s.editorialIntro}>
            Ingest Windows Event Logs and Sysmon data via Fluent Bit. Detection rules fire on event patterns and create alerts automatically, deduplicated, severity-tagged, and ready to triage.
          </p>
          <SiemPreview />
          <div style={s.capList}>
            {SIEM_CAPABILITIES.map((c, i) => (
              <div key={c.name} style={{ ...s.capRow, ...(i === SIEM_CAPABILITIES.length - 1 ? { borderBottom: 'none' } : {}) }}>
                <div style={s.capName}>{c.name}</div>
                <div style={s.capDesc}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={s.editorial}>
        <div style={s.editorialLabelCol}>
          <div style={s.editorialTag}>// SIEM</div>
          <div style={s.editorialTitle}>How it works</div>
        </div>
        <div style={s.editorialContent}>
          <p style={s.editorialIntro}>Three capabilities that set it apart from a basic log viewer.</p>
          <div style={s.deepGrid}>
            {SIEM_DEEP.map((d, i) => (
              <div key={d.num} style={{ ...s.deepCard, ...(i === SIEM_DEEP.length - 1 ? { borderBottom: 'none' } : {}) }}>
                <div style={s.deepNum}>{d.num}</div>
                <div style={s.deepTitle}>{d.title}</div>
                <div style={s.deepBody}>{d.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Security Tools */}
      <div ref={toolsRef} style={{ ...s.editorial, borderTop: '1px solid var(--border)' }}>
        <div style={s.editorialLabelCol}>
          <div style={s.editorialTag}>// Tools</div>
          <div style={s.editorialTitle}>Security Tools</div>
        </div>
        <div style={s.editorialContent}>
          <p style={s.editorialIntro}>
            19 isolated tool modules across four SOC phases. From alert triage and threat intelligence to red team simulation and payload generation.
          </p>
          {PHASES.map(phase => (
            <div key={phase.key} style={s.phaseEntry}>
              <div style={s.phaseHeader}>
                <div style={s.phaseDot(phase.color)} />
                <span style={s.phaseName}>{phase.label}</span>
                <span style={s.phaseCount}>{phase.tools.length} tools</span>
              </div>
              <div style={s.toolTags}>
                {phase.tools.map(t => {
                  const name = typeof t === 'string' ? t : t.name;
                  const route = typeof t === 'object' ? t.route : null;
                  return route ? (
                    <a key={name} href={route} style={{ ...s.toolTag, color: 'var(--text-primary)', textDecoration: 'none', borderColor: 'var(--text-muted)' }}>
                      {name} ↗
                    </a>
                  ) : (
                    <span key={name} style={s.toolTag}>{name}</span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Free strip */}
      <div style={s.freeStrip}>
        <span style={s.freeText}>No credit card required.</span>
        <button style={s.btnPrimary} onClick={onLogin}>Create Account</button>
      </div>

      {/* Footer */}
      <footer style={s.footer}>
        <span style={s.footerBrand}>[ 0xKudoSec ]</span>
        <div style={s.footerLinks}>
          {[['Tools', e => { e.preventDefault(); scrollToTools(); }], ['SIEM', null], ['Sign In', e => { e.preventDefault(); onLogin(); }], ['Privacy', e => { e.preventDefault(); window.location.href = '/privacy'; }]].map(([label, handler]) => (
            <a
              key={label}
              href="#"
              style={s.footerLink}
              onClick={handler || undefined}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-subtle)'; }}
            >{label}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}

function MobileLanding({ onLogin }) {
  const toolsRef = useRef(null);
  const scrollToTools = () => toolsRef.current?.scrollIntoView({ behavior: 'smooth' });
  return (
    <div style={s.page}>
      <LandingNav onLogin={onLogin} onScrollToTools={scrollToTools} isMobile={true} />
      {/* Hero */}
      <section style={s.heroMobile}>
        <div style={s.heroGrid} />
        <div style={{ ...s.heroTag, marginBottom: '20px' }}>// Open Security Operations Platform</div>
        <h1 style={s.heroHeadlineMobile}>
          Security operations,{' '}
          <span style={s.heroHeadlineAccent}>unified.</span>
        </h1>
        <p style={s.heroSubMobile}>
          Real-time SIEM and 19 security tools covering detection, investigation, reporting, compliance, and simulation.
        </p>
        <div style={s.heroCtasMobile}>
          <button style={s.btnPrimaryFull} onClick={onLogin}>Create Free Account</button>
          <button style={s.btnSecondaryFull} onClick={scrollToTools}>Browse Tools</button>
        </div>
        <p style={{ ...s.heroNote, position: 'relative' }}>
          <span style={{ color: 'var(--severity-low)' }}>✓</span>
          {' '}No credit card required
        </p>
      </section>

      {/* Stat bar — 2x2 grid on mobile */}
      <div style={s.statBarMobile}>
        {[
          ['SIEM', 'Real-Time Ingestion', true],
          ['19',   'Security Tools',      false],
          ['4',    'SOC Phases',          false],
          ['Auth0', 'Secure Login',       false],
        ].map(([num, label, amber]) => (
          <div key={label} style={s.statItemMobile}>
            <div style={amber ? s.statNumAmber : s.statNum}>{num}</div>
            <div style={s.statLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* SIEM capabilities — no dashboard preview on mobile, flat list */}
      <div style={s.editorialMobile}>
        <div style={s.editorialMobileHeader}>
          <span style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-amber)' }}>// SIEM</span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Log Management &amp; Alerting</span>
        </div>
        <div style={s.editorialMobileContent}>
          <p style={s.editorialMobileIntro}>
            Ingest Windows Event Logs and Sysmon data. Detection rules create deduplicated, severity-tagged alerts ready to triage.
          </p>
          {SIEM_CAPABILITIES.map((c, i) => (
            <div key={c.name} style={{ ...s.capRowMobile, ...(i === SIEM_CAPABILITIES.length - 1 ? { borderBottom: 'none' } : {}) }}>
              <div style={s.capNameMobile}>{c.name}</div>
              <div style={s.capDescMobile}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works — mobile */}
      <div style={{ ...s.editorialMobile }}>
        <div style={s.editorialMobileHeader}>
          <span style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-amber)' }}>// SIEM</span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>How it works</span>
        </div>
        <div style={s.editorialMobileContent}>
          <p style={s.editorialMobileIntro}>Three capabilities that set it apart from a basic log viewer.</p>
          {SIEM_DEEP.map((d, i) => (
            <div key={d.num} style={{ ...s.deepCardMobile, ...(i === SIEM_DEEP.length - 1 ? { borderBottom: 'none' } : {}) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--accent-amber)', letterSpacing: '0.08em' }}>{d.num}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{d.title}</span>
              </div>
              <div style={s.deepBodyMobile}>{d.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Tools — mobile */}
      <div ref={toolsRef} style={s.editorialMobile}>
        <div style={s.editorialMobileHeader}>
          <span style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-amber)' }}>// Tools</span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Security Tools</span>
        </div>
        <div style={s.editorialMobileContent}>
          <p style={s.editorialMobileIntro}>
            19 tool modules across four SOC phases. Alert triage, threat intelligence, red team simulation, and more.
          </p>
          {PHASES.map(phase => (
            <div key={phase.key} style={s.phaseEntry}>
              <div style={s.phaseHeader}>
                <div style={s.phaseDot(phase.color)} />
                <span style={s.phaseName}>{phase.label}</span>
                <span style={s.phaseCount}>{phase.tools.length} tools</span>
              </div>
              <div style={s.toolTags}>
                {phase.tools.map(t => {
                  const name = typeof t === 'string' ? t : t.name;
                  const route = typeof t === 'object' ? t.route : null;
                  return route ? (
                    <a key={name} href={route} style={{ ...s.toolTag, color: 'var(--text-primary)', textDecoration: 'none', borderColor: 'var(--text-muted)' }}>
                      {name} ↗
                    </a>
                  ) : (
                    <span key={name} style={s.toolTag}>{name}</span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Free strip */}
      <div style={s.freeStripMobile}>
        <span style={s.freeText}>No credit card required.</span>
        <button style={s.btnPrimaryFull} onClick={onLogin}>Create Account</button>
      </div>

      {/* Footer */}
      <footer style={s.footerMobile}>
        <span style={s.footerBrand}>[ 0xKudoSec ]</span>
        <div style={s.footerLinks}>
          {[['Tools', e => { e.preventDefault(); scrollToTools(); }], ['SIEM', null], ['Sign In', e => { e.preventDefault(); onLogin(); }], ['Privacy', e => { e.preventDefault(); window.location.href = '/privacy'; }]].map(([label, handler]) => (
            <a
              key={label}
              href="#"
              style={s.footerLink}
              onClick={handler || undefined}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-subtle)'; }}
            >{label}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}

export function LandingPage() {
  const { loginWithRedirect } = useAuth0();
  const isMobile = useIsMobile();
  const onLogin = () => loginWithRedirect();

  useEffect(() => {
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, []);

  return isMobile
    ? <MobileLanding onLogin={onLogin} />
    : <DesktopLanding onLogin={onLogin} />;
}
