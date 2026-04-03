import { useState, useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile.js';

// ── Custom DateTimePicker ─────────────────────────────────────────────────────
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad2(n) { return String(n).padStart(2, '0'); }

// value: Date object; onChange: (Date) => void; label: string
function DateTimePicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());
  const [hour, setHour] = useState(value.getHours());
  const [minute, setMinute] = useState(value.getMinutes());
  const ref = useRef(null);

  // Close on outside click
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

  // Calendar grid
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
    navBtn: {
      background: 'none', border: 'none', color: 'var(--text-muted)',
      fontFamily: 'var(--font)', fontSize: '13px', cursor: 'pointer', padding: '0 6px',
    },
    monthLabel: { fontSize: '11px', color: 'var(--text-primary)', letterSpacing: '0.06em' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '10px' },
    dow: { fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center', padding: '2px 0', letterSpacing: '0.06em' },
    cell: (d, sel) => ({
      fontSize: '11px', textAlign: 'center', padding: '5px 0', cursor: d ? 'pointer' : 'default',
      color: sel ? 'var(--btn-primary-text)' : d ? 'var(--text-primary)' : 'transparent',
      background: sel ? 'var(--btn-primary-bg)' : 'none',
      border: 'none', fontFamily: 'var(--font)',
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
          {/* Month navigation */}
          <div style={c.nav}>
            <button style={c.navBtn} onClick={prevMonth}>‹</button>
            <span style={c.monthLabel}>{MONTHS[viewMonth]} {viewYear}</span>
            <button style={c.navBtn} onClick={nextMonth}>›</button>
          </div>
          {/* Day-of-week headers */}
          <div style={c.grid}>
            {DAYS.map(d => <div key={d} style={c.dow}>{d}</div>)}
            {cells.map((d, i) => (
              <button key={i} style={c.cell(d, isSelected(d))} onClick={() => d && selectDay(d)}>{d || ''}</button>
            ))}
          </div>
          {/* Time */}
          <div style={c.timeLine}>
            <span style={c.timeLabel}>TIME</span>
            <input
              style={c.timeInput} type="number" min={0} max={23}
              value={pad2(hour)}
              onChange={e => setHour(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)))}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>:</span>
            <input
              style={c.timeInput} type="number" min={0} max={59}
              value={pad2(minute)}
              onChange={e => setMinute(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
            />
            <button style={c.applyBtn} onClick={() => { applyTime(); setOpen(false); }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { padding: 0 },
  pageHeader: {
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pageTitle: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  pageSub: { color: 'var(--text-muted)', fontSize: '11px' },
  section: {
    borderBottom: '1px solid var(--border)',
    padding: '20px',
    background: 'var(--bg-primary)',
  },
  sectionTitle: {
    fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase',
    letterSpacing: '0.06em', marginBottom: '14px',
  },
  keyBox: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    padding: '12px 16px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    letterSpacing: '0.04em',
    marginBottom: '10px',
    wordBreak: 'break-all',
    whiteSpace: 'pre-wrap',
  },
  keyMuted: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    padding: '12px 16px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font)',
    marginBottom: '10px',
  },
  btn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    padding: '6px 14px',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    marginRight: '8px',
  },
  btnPrimary: {
    background: 'var(--btn-primary-bg)',
    border: '1px solid var(--border)',
    color: 'var(--btn-primary-text)',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    padding: '6px 14px',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    marginRight: '8px',
  },
  warning: {
    background: 'rgba(217, 119, 6, 0.12)',
    border: '1px solid #d97706',
    color: '#d97706',
    padding: '10px 14px',
    fontSize: '11px',
    marginBottom: '12px',
    lineHeight: 1.6,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '8px 14px', fontSize: '10px',
    letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border)', fontWeight: 'normal',
    background: 'var(--bg-surface)',
  },
  td: { padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px', color: 'var(--text-muted)' },
  note: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.6 },
  copied: { fontSize: '11px', color: 'var(--severity-low)', marginLeft: '8px' },
};

const SHIPPER_TABS = ['Fluent Bit', 'Winlogbeat 7', 'Manual API'];

export function LogSources() {
  const isMobile = useIsMobile();
  const { getAccessTokenSilently } = useAuth0();
  const [keyMeta, setKeyMeta] = useState(undefined);
  const [newKey, setNewKey] = useState(null);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shipperTab, setShipperTab] = useState(0);
  const [configCopied, setConfigCopied] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null); // { accepted, total } or { error }
  const fileInputRef = useState(null);

  // Export state — default to last 7 days
  const [exportFrom, setExportFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setSeconds(0,0); return d; });
  const [exportTo, setExportTo] = useState(() => { const d = new Date(); d.setSeconds(0,0); return d; });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const headers = { Authorization: `Bearer ${token}` };
      const [keyRes, srcRes] = await Promise.all([
        fetch('/api/siem/ingest-key', { headers }),
        fetch('/api/siem/sources', { headers }),
      ]);
      const meta = await keyRes.json();
      const src = await srcRes.json();
      setKeyMeta(meta); // { exists, created_at } or null
      setSources(Array.isArray(src) ? src : []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Clear the one-time key on unmount (navigating away)
    return () => setNewKey(null);
  }, []);

  async function generateKey() {
    setGenerating(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/ingest-key', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      // data.api_key is the one-time reveal — store locally only
      setNewKey(data.api_key);
      setKeyMeta({ exists: true, created_at: data.created_at });
      setCopied(false);
    } catch {}
    setGenerating(false);
  }

  function copyKey() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function downloadLogs() {
    setExporting(true);
    setExportError(null);
    try {
      const token = await getAccessTokenSilently();
      const from = exportFrom.toISOString();
      const to   = exportTo.toISOString();
      const res = await fetch(`/api/siem/logs/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        setExportError(data.error || 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'logs.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExporting(false);
    }
  }

  async function uploadLogs() {
    if (!uploadFile) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const token = await getAccessTokenSilently();
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await fetch('/api/ingest/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) setUploadResult({ error: data.error || 'Upload failed' });
      else { setUploadResult({ accepted: data.accepted, total: data.total }); setUploadFile(null); load(); }
    } catch (e) {
      setUploadResult({ error: e.message });
    } finally {
      setUploading(false);
    }
  }

  const isLoading = loading;

  return (
    <div style={s.container}>
      <div style={s.pageHeader}>
        <span style={s.pageTitle}>SIEM &nbsp;<span style={s.pageSub}>/ Log Sources</span></span>
      </div>

      {/* Ingest Key */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Ingest API Key</div>

        {isLoading ? (
          <div style={s.keyMuted}>Loading...</div>
        ) : newKey ? (
          // One-time reveal state — key just generated/regenerated
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
              Use this key as the Bearer token in your log shipper's Authorization header when posting to <code>POST /api/ingest/beats</code>.<br />
              Regenerating will invalidate the old key — update any configured log sources after.
            </div>
          </>
        ) : keyMeta?.exists ? (
          // Key exists but is not retrievable
          <>
            <div style={s.keyMuted}>
              A key was generated on {new Date(keyMeta.created_at).toLocaleString()}. Regenerate a new key.
            </div>
            <button style={s.btn} onClick={generateKey} disabled={generating}>
              {generating ? 'Generating...' : 'Regenerate Key'}
            </button>
            <div style={s.note}>
              Regenerating will invalidate the current key — update any configured log sources after.
            </div>
          </>
        ) : (
          // No key yet
          <>
            <div style={s.keyMuted}>No ingest key yet.</div>
            <button style={s.btnPrimary} onClick={generateKey} disabled={generating}>
              {generating ? 'Generating...' : 'Generate Key'}
            </button>
            <div style={s.note}>
              Generate a key, then use it as the Bearer token in your log shipper or forwarder.
            </div>
          </>
        )}
      </div>

      {/* Shipper Setup — shown whenever a key exists */}
      {(keyMeta?.exists || newKey) && (() => {
        const apiKey = newKey || 'YOUR_API_KEY_HERE';
        const ingestUrl = 'https://tools.laynekudo.com/api/ingest/beats';

        const fluentBitConfig = `[SERVICE]
    Flush        10
    Daemon       Off
    Log_Level    info

[INPUT]
    Name         winevtlog
    Channels     Security
    Interval_Sec 5
    DB           C:\\fluent-bit\\cybertools.db

[INPUT]
    Name         winevtlog
    Channels     Microsoft-Windows-Sysmon/Operational
    Interval_Sec 5
    DB           C:\\fluent-bit\\cybertools-sysmon.db

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
  - name: Microsoft-Windows-Sysmon/Operational`;

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
          const a = document.createElement('a');
          a.href = url;
          a.download = filenames[shipperTab];
          a.click();
          URL.revokeObjectURL(url);
        }

        function copyConfig() {
          navigator.clipboard.writeText(currentConfig);
          setConfigCopied(true);
          setTimeout(() => setConfigCopied(false), 2000);
        }

        return (
          <div style={s.section}>
            <div style={s.sectionTitle}>Connect a Log Source</div>
            {!newKey && (
              <div style={{ ...s.warning, marginBottom: '14px' }}>
                Generate a new API key above to pre-fill your API key into these configs.
              </div>
            )}

            {/* Tab selector */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '14px', borderBottom: '1px solid var(--border)' }}>
              {SHIPPER_TABS.map((tab, i) => (
                <button key={tab} onClick={() => { setShipperTab(i); setConfigCopied(false); }} style={{
                  background: 'none', border: 'none', borderBottom: shipperTab === i ? '2px solid var(--text-primary)' : '2px solid transparent',
                  color: shipperTab === i ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontFamily: 'var(--font)', fontSize: '11px', padding: '6px 16px 8px',
                  cursor: 'pointer', letterSpacing: '0.04em', marginBottom: '-1px',
                }}>{tab}</button>
              ))}
            </div>

            {/* Fluent Bit */}
            {shipperTab === 0 && (
              <div>
                <div style={s.note}>
                  <strong style={{ color: 'var(--text-primary)' }}>Fluent Bit</strong> — lightweight, production-grade log shipper. Recommended for Windows.<br />
                  Download from <strong>fluentbit.io</strong>, then save the config below and run as a service.
                </div>
                <pre style={{ ...s.keyBox, marginTop: '12px', fontSize: '11px', lineHeight: 1.7, overflowX: 'auto' }}>{fluentBitConfig}</pre>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <button style={s.btnPrimary} onClick={downloadConfig}>Download cybertools.conf</button>
                  <button style={s.btn} onClick={copyConfig}>Copy</button>
                  {configCopied && <span style={s.copied}>Copied!</span>}
                </div>
                <div style={s.note}>
                  <strong style={{ color: 'var(--text-primary)' }}>Setup (Windows):</strong><br />
                  1. Install Fluent Bit — <code>winget install Fluent.FluentBit</code> or download from fluentbit.io<br />
                  2. Save config to <code>C:\Program Files\fluent-bit\conf\cybertools.conf</code><br />
                  3. Register as a service (run as Administrator):<br />
                  <code style={{ display: 'block', marginTop: '6px', marginLeft: '12px' }}>
                    sc.exe create fluent-bit binPath= "C:\Program Files\fluent-bit\bin\fluent-bit.exe -c C:\Program Files\fluent-bit\conf\cybertools.conf" start= auto
                  </code>
                  <code style={{ display: 'block', marginTop: '4px', marginLeft: '12px' }}>Start-Service fluent-bit</code>
                  4. Your machine will appear in Active Sources within 30 seconds.
                </div>
              </div>
            )}

            {/* Winlogbeat 7 */}
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
                  4. Start the service: <code>Start-Service winlogbeat</code><br />
                  Your machine will appear in Active Sources within one minute.
                </div>
              </div>
            )}

            {/* Manual API */}
            {shipperTab === 2 && (
              <div>
                <div style={s.note}>
                  <strong style={{ color: 'var(--text-primary)' }}>Manual API</strong> — POST JSON events directly. Use for custom integrations, scripts, or any platform.<br />
                  Send a JSON array of event objects to the ingest endpoint with your API key as a Bearer token.
                </div>
                <pre style={{ ...s.keyBox, marginTop: '12px', fontSize: '11px', lineHeight: 1.7, overflowX: 'auto' }}>{curlExample}</pre>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <button style={s.btn} onClick={copyConfig}>Copy</button>
                  {configCopied && <span style={s.copied}>Copied!</span>}
                </div>
                <div style={s.note}>
                  <strong style={{ color: 'var(--text-primary)' }}>Event format:</strong><br />
                  POST a JSON array to <code>{ingestUrl}</code><br />
                  Required fields: <code>@timestamp</code> (ISO 8601), <code>winlog.event_id</code> (integer), <code>message</code> (string)<br />
                  Optional: <code>host.name</code>, <code>winlog.event_data.*</code>, <code>network.*</code>, <code>process.*</code>, <code>log.level</code><br />
                  Max payload: 10 MB per request. Events are accepted as an array or a single object.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Log File Upload */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Upload Log File</div>
        <div style={s.note} >
          Upload a Winlogbeat JSON export — either a JSON array (<code>[{'{'}...{'}'}]</code>) or newline-delimited JSON (one event per line). Max 50 MB / 100,000 events.
        </div>
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <label style={{
            display: 'inline-block', border: '1px solid var(--border)', padding: '6px 14px',
            fontSize: '11px', color: uploadFile ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: 'pointer', fontFamily: 'var(--font)', letterSpacing: '0.04em',
            background: 'var(--bg-surface)',
          }}>
            {uploadFile ? uploadFile.name : 'Choose file…'}
            <input
              type="file"
              accept=".json,.ndjson,.jsonl"
              style={{ display: 'none' }}
              onChange={e => { setUploadFile(e.target.files[0] || null); setUploadResult(null); e.target.value = ''; }}
            />
          </label>
          {uploadFile && (
            <button style={s.btnPrimary} onClick={uploadLogs} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          )}
          {uploadFile && !uploading && (
            <button style={s.btn} onClick={() => { setUploadFile(null); setUploadResult(null); }}>Clear</button>
          )}
        </div>
        {uploadResult && (
          <div style={{
            marginTop: '10px', padding: '8px 12px', fontSize: '11px',
            border: `1px solid ${uploadResult.error ? 'var(--severity-high)' : 'var(--severity-low)'}`,
            color: uploadResult.error ? 'var(--severity-high)' : 'var(--severity-low)',
          }}>
            {uploadResult.error
              ? `Error: ${uploadResult.error}`
              : `${uploadResult.accepted.toLocaleString()} of ${uploadResult.total.toLocaleString()} events imported.`}
          </div>
        )}
      </div>

      {/* Download Logs */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Download Log Data</div>
        <div style={s.note}>Export stored logs for any date range as a JSON file. No event or range limits.</div>
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
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

      {/* Active Sources */}
      <div style={{ padding: '0 0 8px 0' }}>
        <div style={{ ...s.sectionTitle, padding: '8px 20px 0' }}>Active Sources</div>
        {isMobile ? (
          <div>
            {sources.length === 0 && (
              <div style={{ padding: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                No sources yet — start the shipper to begin ingesting logs.
              </div>
            )}
            {sources.map(src => (
              <div key={src.id} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 20px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>{src.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {src.type} · {Number(src.event_count).toLocaleString()} events
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Last seen: {src.last_seen ? new Date(src.last_seen).toLocaleString() : '—'}
                </div>
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
                <tr><td colSpan={4} style={{ ...s.td, color: 'var(--text-muted)' }}>
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
      </div>
    </div>
  );
}
