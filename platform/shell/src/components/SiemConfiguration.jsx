import { useState, useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile.js';

// ── Custom DateTimePicker ─────────────────────────────────────────────────────
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad2(n) { return String(n).padStart(2, '0'); }

function DateTimePicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());
  const [hour, setHour] = useState(value.getHours());
  const [minute, setMinute] = useState(value.getMinutes());
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function selectDay(day) {
    const d = new Date(viewYear, viewMonth, day, hour, minute, 0, 0);
    onChange(d);
  }

  function applyTime() {
    const d = new Date(value);
    d.setHours(hour, minute, 0, 0);
    onChange(d);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selDay = value.getDate();
  const selMonth = value.getMonth();
  const selYear = value.getFullYear();
  const isSelected = (d) => d && d === selDay && viewMonth === selMonth && viewYear === selYear;

  const displayStr = `${MONTHS[value.getMonth()].slice(0,3)} ${pad2(value.getDate())}, ${value.getFullYear()}  ${pad2(value.getHours())}:${pad2(value.getMinutes())}`;

  const c = {
    wrap: { position: 'relative', display: 'inline-block' },
    trigger: {
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '11px',
      padding: '6px 12px', cursor: 'pointer', letterSpacing: '0.04em',
      display: 'flex', alignItems: 'center', gap: '8px', userSelect: 'none',
    },
    dropdown: {
      position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      width: '260px', padding: '14px',
    },
    nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
    navBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '13px', cursor: 'pointer', padding: '0 6px' },
    monthLabel: { fontSize: '11px', color: 'var(--text-primary)', letterSpacing: '0.06em' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '10px' },
    dow: { fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center', padding: '2px 0', letterSpacing: '0.06em' },
    cell: (d, sel) => ({
      fontSize: '11px', textAlign: 'center', padding: '5px 0', cursor: d ? 'pointer' : 'default',
      color: sel ? 'var(--btn-primary-text)' : d ? 'var(--text-primary)' : 'transparent',
      background: sel ? 'var(--btn-primary-bg)' : 'none', border: 'none', fontFamily: 'var(--font)',
    }),
    timeLine: { display: 'flex', alignItems: 'center', gap: '6px', borderTop: '1px solid var(--border)', paddingTop: '10px' },
    timeLabel: { fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', flex: 1 },
    timeInput: {
      width: '52px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
      color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '11px',
      padding: '4px 8px', textAlign: 'center',
    },
    applyBtn: {
      background: 'var(--btn-primary-bg)', border: 'none', color: 'var(--btn-primary-text)',
      fontFamily: 'var(--font)', fontSize: '10px', padding: '4px 10px',
      cursor: 'pointer', letterSpacing: '0.04em', marginLeft: 'auto',
    },
  };

  return (
    <div style={c.wrap} ref={ref}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: '4px' }}>{label}</div>
      <div style={c.trigger} onClick={() => setOpen(o => !o)}>
        <span>{displayStr}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>▼</span>
      </div>
      {open && (
        <div style={c.dropdown}>
          <div style={c.nav}>
            <button style={c.navBtn} onClick={prevMonth}>‹</button>
            <span style={c.monthLabel}>{MONTHS[viewMonth]} {viewYear}</span>
            <button style={c.navBtn} onClick={nextMonth}>›</button>
          </div>
          <div style={c.grid}>
            {DAYS.map(d => <div key={d} style={c.dow}>{d}</div>)}
            {cells.map((d, i) => (
              <button key={i} style={c.cell(d, isSelected(d))} onClick={() => d && selectDay(d)}>{d || ''}</button>
            ))}
          </div>
          <div style={c.timeLine}>
            <span style={c.timeLabel}>TIME</span>
            <input style={c.timeInput} type="number" min={0} max={23} value={pad2(hour)} onChange={e => setHour(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)))} />
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>:</span>
            <input style={c.timeInput} type="number" min={0} max={59} value={pad2(minute)} onChange={e => setMinute(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))} />
            <button style={c.applyBtn} onClick={() => { applyTime(); setOpen(false); }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  container: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
  header: {
    padding: '12px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  sub: { color: 'var(--text-muted)', fontSize: '11px' },
  tabs: { display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 },
  tab: (active) => ({
    padding: '8px 20px', fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase',
    cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'var(--font)',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--text-primary)' : '2px solid transparent',
    marginBottom: '-1px', whiteSpace: 'nowrap',
  }),
  body: { flex: 1, overflow: 'auto' },
  section: { padding: '24px 28px', maxWidth: '660px' },
  sectionTitle: {
    fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: '14px',
  },
  sectionDesc: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.6 },
  keyBox: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    padding: '12px 16px', fontSize: '12px', color: 'var(--text-primary)',
    fontFamily: 'var(--font)', letterSpacing: '0.04em', marginBottom: '10px',
    wordBreak: 'break-all', whiteSpace: 'pre-wrap',
  },
  keyMuted: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)',
    fontFamily: 'var(--font)', marginBottom: '10px',
  },
  btn: {
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '6px 14px',
    cursor: 'pointer', letterSpacing: '0.04em', marginRight: '8px',
  },
  btnPrimary: {
    background: 'var(--btn-primary-bg)', border: '1px solid var(--border)', color: 'var(--btn-primary-text)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '6px 14px',
    cursor: 'pointer', letterSpacing: '0.04em', marginRight: '8px',
  },
  warning: {
    background: 'rgba(217, 119, 6, 0.12)', border: '1px solid #d97706', color: '#d97706',
    padding: '10px 14px', fontSize: '11px', marginBottom: '12px', lineHeight: 1.6,
  },
  note: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.6 },
  copied: { fontSize: '11px', color: 'var(--severity-low)', marginLeft: '8px' },
  input: {
    width: '80px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '12px', padding: '6px 10px',
  },
  status: (ok) => ({ fontSize: '11px', color: ok ? 'var(--severity-low)' : 'var(--severity-critical)', marginTop: '10px' }),
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '8px 14px', fontSize: '10px', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
    fontWeight: 'normal', background: 'var(--bg-surface)',
  },
  td: { padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px', color: 'var(--text-muted)' },
  shipperTab: (active) => ({
    background: 'none', border: 'none',
    borderBottom: active ? '2px solid var(--text-primary)' : '2px solid transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '6px 16px 8px',
    cursor: 'pointer', letterSpacing: '0.04em', marginBottom: '-1px',
  }),
};

const TABS = ['API Key', 'Connect a Source', 'Log Retention', 'Active Sources', 'Account'];
const SHIPPER_TABS = ['Fluent Bit', 'Winlogbeat 7', 'Manual API'];

const FLUENT_BIT_CONFIG = (apiKey) => `[SERVICE]
    Flush        2
    Daemon       Off
    Log_Level    info

[INPUT]
    Name         winevtlog
    Channels     Security
    Interval_Sec 5
    DB           C:\\Program Files\\fluent-bit\\conf\\cybertools-security.db

[INPUT]
    Name         winevtlog
    Channels     Microsoft-Windows-Sysmon/Operational
    Interval_Sec 5
    DB           C:\\Program Files\\fluent-bit\\conf\\cybertools-sysmon.db

[INPUT]
    Name         winevtlog
    Channels     System
    Interval_Sec 10
    DB           C:\\Program Files\\fluent-bit\\conf\\cybertools-system.db

[INPUT]
    Name         winevtlog
    Channels     Application
    Interval_Sec 10
    DB           C:\\Program Files\\fluent-bit\\conf\\cybertools-application.db

[INPUT]
    Name         winevtlog
    Channels     Microsoft-Windows-PowerShell/Operational
    Interval_Sec 5
    DB           C:\\Program Files\\fluent-bit\\conf\\cybertools-powershell.db

[INPUT]
    Name         winevtlog
    Channels     Microsoft-Windows-WMI-Activity/Operational
    Interval_Sec 10
    DB           C:\\Program Files\\fluent-bit\\conf\\cybertools-wmi.db

[INPUT]
    Name         winevtlog
    Channels     Microsoft-Windows-TaskScheduler/Operational
    Interval_Sec 10
    DB           C:\\Program Files\\fluent-bit\\conf\\cybertools-taskscheduler.db

[INPUT]
    Name         winevtlog
    Channels     Microsoft-Windows-Windows Defender/Operational
    Interval_Sec 10
    DB           C:\\Program Files\\fluent-bit\\conf\\cybertools-defender.db

[INPUT]
    Name         winevtlog
    Channels     Microsoft-Windows-Windows Firewall With Advanced Security/Firewall
    Interval_Sec 10
    DB           C:\\Program Files\\fluent-bit\\conf\\cybertools-firewall.db

[INPUT]
    Name         winevtlog
    Channels     Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational
    Interval_Sec 10
    DB           C:\\Program Files\\fluent-bit\\conf\\cybertools-rdp.db

[OUTPUT]
    Name         http
    Match        *
    Host         tools.laynekudo.com
    Port         443
    URI          /api/ingest/beats
    Format       json
    tls          On
    tls.verify   On
    Header       Authorization Bearer ${apiKey}
    Header       Content-Type application/json`;

export function SiemConfiguration() {
  const isMobile = useIsMobile();
  const { getAccessTokenSilently, user } = useAuth0();
  const [tab, setTab] = useState(0);

  // API Key state
  const [keyMeta, setKeyMeta] = useState(undefined);
  const [newKey, setNewKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shipperTab, setShipperTab] = useState(0);
  const [configCopied, setConfigCopied] = useState(false);

  // Log Retention state
  const [retentionDays, setRetentionDays] = useState('');
  const [retentionLoading, setRetentionLoading] = useState(true);
  const [saved, setSaved] = useState(null);

  // Password state
  const sub = user?.sub ?? '';
  const isEmailUser = sub.startsWith('auth0|');
  const socialProvider = sub.startsWith('google-oauth2|') ? 'Google' : sub.startsWith('github|') ? 'GitHub' : null;
  const [pwStatus, setPwStatus] = useState(null);
  const [pwError, setPwError] = useState('');

  // Active Sources + upload + export
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [exportFrom, setExportFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setSeconds(0,0); return d; });
  const [exportTo, setExportTo] = useState(() => { const d = new Date(); d.setSeconds(0,0); return d; });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  async function loadKey() {
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/ingest-key', { headers: { Authorization: `Bearer ${token}` } });
      const meta = await res.json();
      setKeyMeta(meta);
    } catch {}
    setLoading(false);
  }

  async function loadRetention() {
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/settings', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setRetentionDays(String(data.log_retention_days ?? 90));
    } catch { setRetentionDays('90'); }
    setRetentionLoading(false);
  }

  async function loadSources() {
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/sources', { headers: { Authorization: `Bearer ${token}` } });
      const src = await res.json();
      setSources(Array.isArray(src) ? src : []);
    } catch {}
    setSourcesLoading(false);
  }

  useEffect(() => {
    loadKey();
    loadRetention();
    loadSources();
  }, []);

  async function generateKey() {
    setGenerating(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/ingest-key', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setNewKey(data.api_key);
      setKeyMeta({ exists: true, created_at: data.created_at });
      setCopied(false);
    } catch {}
    setGenerating(false);
  }

  function copyKey() {
    if (newKey) { navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  async function saveRetention() {
    setSaved(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/settings', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_retention_days: parseInt(retentionDays, 10) }),
      });
      setSaved(res.ok ? 'ok' : 'error');
    } catch { setSaved('error'); }
  }

  async function sendPasswordReset() {
    setPwStatus('sending'); setPwError('');
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/change-password', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) { setPwStatus('error'); setPwError(data.error || 'Failed.'); }
      else setPwStatus('ok');
    } catch { setPwStatus('error'); setPwError('Request failed.'); }
  }

  async function uploadLogs() {
    if (!uploadFile) return;
    setUploading(true); setUploadResult(null);
    try {
      const token = await getAccessTokenSilently();
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await fetch('/api/ingest/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
      const data = await res.json();
      if (!res.ok) setUploadResult({ error: data.error || 'Upload failed' });
      else { setUploadResult({ accepted: data.accepted, total: data.total }); setUploadFile(null); loadSources(); }
    } catch (e) { setUploadResult({ error: e.message }); }
    setUploading(false);
  }

  async function downloadLogs() {
    setExporting(true); setExportError(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch(`/api/siem/logs/export?from=${encodeURIComponent(exportFrom.toISOString())}&to=${encodeURIComponent(exportTo.toISOString())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json(); setExportError(d.error || 'Export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'logs.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setExportError(e.message); }
    setExporting(false);
  }

  const apiKey = newKey || 'YOUR_API_KEY_HERE';
  const ingestUrl = 'https://tools.laynekudo.com/api/ingest/beats';
  const fluentBitConfig = FLUENT_BIT_CONFIG(apiKey);
  const winlogbeatConfig = `output.elasticsearch:
  enabled: false

output.http:
  enabled: true
  hosts: ["${ingestUrl}"]
  headers:
    Authorization: "Bearer ${apiKey}"
    Content-Type: "application/json"

winlogbeat.event_logs:
  - name: Security
  - name: Microsoft-Windows-Sysmon/Operational
  - name: System
  - name: Application
  - name: Microsoft-Windows-PowerShell/Operational
  - name: Microsoft-Windows-WMI-Activity/Operational
  - name: Microsoft-Windows-TaskScheduler/Operational
  - name: Microsoft-Windows-Windows Defender/Operational
  - name: Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational`;

  const curlExample = `curl -X POST "${ingestUrl}" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '[{"@timestamp":"2026-01-01T00:00:00.000Z","winlog":{"event_id":4624},"message":"test event","host":{"name":"myhost"}}]'`;

  const configs = [fluentBitConfig, winlogbeatConfig, curlExample];
  const currentConfig = configs[shipperTab];

  function downloadConfig() {
    const filenames = ['cybertools.conf', 'winlogbeat.yml', 'ingest-example.sh'];
    const blob = new Blob([currentConfig], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filenames[shipperTab]; a.click();
    URL.revokeObjectURL(url);
  }

  function copyConfig() {
    navigator.clipboard.writeText(currentConfig);
    setConfigCopied(true);
    setTimeout(() => setConfigCopied(false), 2000);
  }

  return (
    <div style={s.container}>
      <div style={isMobile ? { ...s.header, flexWrap: 'wrap' } : s.header}>
        <span style={s.title}>SIEM &nbsp;<span style={s.sub}>/ Configuration</span></span>
      </div>

      <div style={{ ...s.tabs, overflowX: 'auto' }}>
        {TABS.map((t, i) => (
          <button key={t} style={s.tab(tab === i)} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      <div style={s.body}>

        {/* ── Tab 0: API Key ── */}
        {tab === 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Ingest API Key</div>
            <div style={s.sectionDesc}>
              Your API key authorizes log shippers to send events to this platform. It is only shown once at generation time — store it securely.
            </div>

            {loading ? (
              <div style={s.keyMuted}>Loading...</div>
            ) : newKey ? (
              <>
                <div style={s.warning}>
                  This is the only time this key will be shown. Copy it now — if you leave this page without copying it, you will need to regenerate.
                </div>
                <div style={s.keyBox}>{newKey}</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button style={s.btnPrimary} onClick={copyKey}>Copy Key</button>
                  <button style={s.btn} onClick={generateKey} disabled={generating}>Regenerate</button>
                  {copied && <span style={s.copied}>Copied!</span>}
                </div>
                <div style={s.note}>
                  Use this key as the Bearer token in your log shipper. Go to <strong>Connect a Source</strong> to get pre-filled configs.<br />
                  Regenerating will invalidate the old key — update any configured shippers after.
                </div>
              </>
            ) : keyMeta?.exists ? (
              <>
                <div style={s.keyMuted}>
                  A key was generated on {new Date(keyMeta.created_at).toLocaleString()}.
                </div>
                <button style={s.btn} onClick={generateKey} disabled={generating}>
                  {generating ? 'Generating...' : 'Regenerate Key'}
                </button>
                <div style={s.note}>Regenerating will invalidate the current key — update any configured shippers after.</div>
              </>
            ) : (
              <>
                <div style={s.keyMuted}>No ingest key yet.</div>
                <button style={s.btnPrimary} onClick={generateKey} disabled={generating}>
                  {generating ? 'Generating...' : 'Generate Key'}
                </button>
                <div style={s.note}>Generate a key, then use it in your log shipper or forwarder.</div>
              </>
            )}

          </div>
        )}

        {/* ── Tab 4: Account ── */}
        {tab === 4 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Account</div>
            <div style={s.sectionDesc}>
              Signed in as <strong>{user?.email}</strong>.
            </div>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: '20px', paddingTop: '20px' }}>
              <div style={s.sectionTitle}>Password</div>
              {isEmailUser ? (
                <>
                  <div style={s.sectionDesc}>
                    A password reset link will be sent to <strong>{user.email}</strong>.
                  </div>
                  <button style={s.btn} onClick={sendPasswordReset} disabled={pwStatus === 'sending' || pwStatus === 'ok'}>
                    {pwStatus === 'sending' ? 'Sending...' : 'Send Password Reset Email'}
                  </button>
                  {pwStatus === 'ok' && <div style={s.status(true)}>Email sent. Check your inbox.</div>}
                  {pwStatus === 'error' && <div style={s.status(false)}>{pwError}</div>}
                </>
              ) : (
                <div style={s.sectionDesc}>
                  You signed in with {socialProvider ?? 'a social provider'}. Password management is handled by {socialProvider ?? 'your provider'}.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 2: Log Retention ── */}
        {tab === 2 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Log Retention</div>
            <div style={s.sectionDesc}>
              Logs older than this will be automatically purged each night at 02:00 UTC. Applies to your events only.<br />
              Min 1 day, max 3650 days (10 years).
            </div>
            {retentionLoading ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading...</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    style={s.input}
                    type="number" min="1" max="3650"
                    value={retentionDays}
                    onChange={e => { setRetentionDays(e.target.value); setSaved(null); }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>days</span>
                  <button style={s.btnPrimary} onClick={saveRetention}>Save</button>
                </div>
                {saved === 'ok' && <div style={s.status(true)}>Saved.</div>}
                {saved === 'error' && <div style={s.status(false)}>Failed to save. Check value and try again.</div>}
              </>
            )}

            <div style={{ borderTop: '1px solid var(--border)', marginTop: '28px', paddingTop: '20px' }}>
              <div style={s.sectionTitle}>Download Log Data</div>
              <div style={s.sectionDesc}>Export stored logs for any date range as a JSON file. No event or range limits.</div>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
                <DateTimePicker label="From" value={exportFrom} onChange={d => { setExportFrom(d); setExportError(null); }} />
                <DateTimePicker label="To"   value={exportTo}   onChange={d => { setExportTo(d);   setExportError(null); }} />
                <button style={{ ...s.btnPrimary, marginBottom: 0 }} onClick={downloadLogs} disabled={exporting}>
                  {exporting ? 'Exporting...' : 'Download'}
                </button>
              </div>
              {exportError && (
                <div style={{ marginTop: '10px', padding: '8px 12px', fontSize: '11px', border: '1px solid var(--severity-high)', color: 'var(--severity-high)' }}>
                  Error: {exportError}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── Tab 1: Connect a Source ── */}
        {tab === 1 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Connect a Log Source</div>
            {!keyMeta?.exists && !newKey && (
              <div style={{ ...s.warning, marginBottom: '14px' }}>
                Generate an API key on the <strong>API Key</strong> tab first. The configs below will be pre-filled with your key once generated.
              </div>
            )}

            <div style={{ display: 'flex', gap: 0, marginBottom: '14px', borderBottom: '1px solid var(--border)' }}>
              {SHIPPER_TABS.map((t, i) => (
                <button key={t} style={s.shipperTab(shipperTab === i)} onClick={() => { setShipperTab(i); setConfigCopied(false); }}>{t}</button>
              ))}
            </div>

            {shipperTab === 0 && (
              <div>
                <div style={s.note}>
                  <strong style={{ color: 'var(--text-primary)' }}>Fluent Bit</strong> — lightweight, production-grade log shipper. Recommended for Windows.<br />
                  Download from <strong>fluentbit.io</strong>, then save the config below and run as a Windows service.<br /><br />
                  This config ships 10 Windows event channels: Security, Sysmon, System, Application, PowerShell, WMI, Task Scheduler, Defender, Firewall, and RDP.
                </div>
                <pre style={{ ...s.keyBox, marginTop: '12px', fontSize: '11px', lineHeight: 1.7, overflowX: 'auto' }}>{fluentBitConfig}</pre>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <button style={s.btnPrimary} onClick={downloadConfig}>Download cybertools.conf</button>
                  <button style={s.btn} onClick={copyConfig}>Copy</button>
                  {configCopied && <span style={s.copied}>Copied!</span>}
                </div>
                <div style={s.note}>
                  <strong style={{ color: 'var(--text-primary)' }}>Setup (Windows, run as Administrator):</strong><br />
                  1. Install: <code>winget install Fluent.FluentBit</code><br />
                  2. Save config to <code>C:\Program Files\fluent-bit\conf\cybertools.conf</code><br />
                  3. Register service:<br />
                  <code style={{ display: 'block', marginTop: '6px', marginLeft: '12px' }}>
                    sc.exe create fluent-bit binPath= "C:\Program Files\fluent-bit\bin\fluent-bit.exe -c C:\Program Files\fluent-bit\conf\cybertools.conf" start= auto
                  </code>
                  <code style={{ display: 'block', marginTop: '4px', marginLeft: '12px' }}>Start-Service fluent-bit</code>
                  4. Enable PowerShell Script Block Logging (Event ID 4104) — recommended:<br />
                  <code style={{ display: 'block', marginTop: '6px', marginLeft: '12px' }}>
                    reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging" /v EnableScriptBlockLogging /t REG_DWORD /d 1 /f
                  </code>
                  5. Your machine will appear in Active Sources within 30 seconds.
                </div>
              </div>
            )}

            {shipperTab === 1 && (
              <div>
                <div style={s.note}>
                  <strong style={{ color: 'var(--text-primary)' }}>Winlogbeat 7</strong> — Elastic's Windows event log shipper. Use version 7.x only — v8+ dropped generic HTTP output.<br />
                  Download from <strong>elastic.co/downloads/past-releases</strong>, search for Winlogbeat 7.17.
                </div>
                <pre style={{ ...s.keyBox, marginTop: '12px', fontSize: '11px', lineHeight: 1.7, overflowX: 'auto' }}>{winlogbeatConfig}</pre>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <button style={s.btnPrimary} onClick={downloadConfig}>Download winlogbeat.yml</button>
                  <button style={s.btn} onClick={copyConfig}>Copy</button>
                  {configCopied && <span style={s.copied}>Copied!</span>}
                </div>
                <div style={s.note}>
                  <strong style={{ color: 'var(--text-primary)' }}>Setup (Windows):</strong><br />
                  1. Download and extract Winlogbeat 7.17<br />
                  2. Replace <code>winlogbeat.yml</code> with the config above<br />
                  3. Run as Administrator: <code>.\install-service-winlogbeat.ps1</code><br />
                  4. Start the service: <code>Start-Service winlogbeat</code>
                </div>
              </div>
            )}

            {shipperTab === 2 && (
              <div>
                <div style={s.note}>
                  <strong style={{ color: 'var(--text-primary)' }}>Manual API</strong> — POST JSON events directly. Use for custom integrations, scripts, or any platform.
                </div>
                <pre style={{ ...s.keyBox, marginTop: '12px', fontSize: '11px', lineHeight: 1.7, overflowX: 'auto' }}>{curlExample}</pre>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <button style={s.btn} onClick={copyConfig}>Copy</button>
                  {configCopied && <span style={s.copied}>Copied!</span>}
                </div>
                <div style={s.note}>
                  <strong style={{ color: 'var(--text-primary)' }}>Event format:</strong><br />
                  POST a JSON array to <code>{ingestUrl}</code><br />
                  Required: <code>@timestamp</code> (ISO 8601), <code>winlog.event_id</code> (integer), <code>message</code> (string)<br />
                  Optional: <code>host.name</code>, <code>winlog.event_data.*</code>, <code>network.*</code>, <code>process.*</code>, <code>log.level</code><br />
                  Max payload: 10 MB per request.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 3: Active Sources ── */}
        {tab === 3 && (

          <div style={{ padding: '0 0 8px 0' }}>
            <div style={{ ...s.sectionTitle, padding: '20px 28px 0' }}>Active Sources</div>
            <div style={{ padding: '0 28px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>
              Machines actively shipping logs to this platform.
            </div>
            {isMobile ? (
              <div>
                {sources.length === 0 && (
                  <div style={{ padding: '20px 28px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    No sources yet — start the shipper to begin ingesting logs.
                  </div>
                )}
                {sources.map(src => (
                  <div key={src.id} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 28px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Host</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '6px' }}>{src.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Type</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>{src.type} · {Number(src.event_count).toLocaleString()} events</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Last Seen</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{src.last_seen ? new Date(src.last_seen).toLocaleString() : '—'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Host', 'Type', 'Last Seen', 'Total Events'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sources.length === 0 && (
                    <tr><td colSpan={4} style={{ ...s.td, padding: '20px 14px' }}>
                      No sources yet — start the shipper to begin ingesting logs.
                    </td></tr>
                  )}
                  {sources.map(src => (
                    <tr key={src.id}>
                      <td style={{ ...s.td, color: 'var(--text-primary)' }}>{src.name}</td>
                      <td style={s.td}>{src.type}</td>
                      <td style={s.td}>{src.last_seen ? new Date(src.last_seen).toLocaleString() : '—'}</td>
                      <td style={s.td}>{Number(src.event_count).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', marginTop: '8px' }}>
              <div style={{ ...s.sectionTitle, marginBottom: '10px' }}>Upload Log File</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.6 }}>
                Upload a JSON log export — JSON array or newline-delimited JSON. Max 50 MB / 100,000 events.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <label style={{
                  display: 'inline-block', border: '1px solid var(--border)', padding: '6px 14px',
                  fontSize: '11px', color: uploadFile ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer', fontFamily: 'var(--font)', letterSpacing: '0.04em', background: 'var(--bg-surface)',
                }}>
                  {uploadFile ? uploadFile.name : 'Choose file…'}
                  <input type="file" accept=".json,.ndjson,.jsonl" style={{ display: 'none' }}
                    onChange={e => { setUploadFile(e.target.files[0] || null); setUploadResult(null); e.target.value = ''; }} />
                </label>
                {uploadFile && <button style={s.btnPrimary} onClick={uploadLogs} disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</button>}
                {uploadFile && !uploading && <button style={s.btn} onClick={() => { setUploadFile(null); setUploadResult(null); }}>Clear</button>}
              </div>
              {uploadResult && (
                <div style={{ marginBottom: '12px', padding: '8px 12px', fontSize: '11px', border: `1px solid ${uploadResult.error ? 'var(--severity-high)' : 'var(--severity-low)'}`, color: uploadResult.error ? 'var(--severity-high)' : 'var(--severity-low)' }}>
                  {uploadResult.error ? `Error: ${uploadResult.error}` : `${uploadResult.accepted.toLocaleString()} of ${uploadResult.total.toLocaleString()} events imported.`}
                </div>
              )}
              <button style={s.btn} onClick={loadSources} disabled={sourcesLoading}>
                {sourcesLoading ? 'Loading...' : 'Refresh Sources'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
