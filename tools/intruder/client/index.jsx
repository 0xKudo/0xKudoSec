import { useState, useEffect, useRef } from 'react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';
import { Button, Input, Table, AuthGate } from '../../../platform/shell/src/components/ui/index.js';
import DesktopOnly from '../../../platform/shell/src/components/DesktopOnly.jsx';

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const BUILT_IN_LISTS = {
  'Common Passwords': 'password\n123456\nadmin\nletmein\npassword1\nqwerty\nabc123\nwelcome\nmonkey\ndragon',
  'SQL Injection': "' OR '1'='1\n' OR 1=1--\n\" OR \"1\"=\"1\n' OR 'x'='x\n1' ORDER BY 1--\n1 UNION SELECT NULL--\n' AND 1=2 UNION SELECT 1,2,3--\nadmin'--\n' OR SLEEP(5)--\n1; DROP TABLE users--",
  'XSS Payloads': '<script>alert(1)</script>\n"><script>alert(1)</script>\n<img src=x onerror=alert(1)>\n<svg onload=alert(1)>\n\'><img src=x onerror=alert(1)>\n javascript:alert(1)\n<body onload=alert(1)>\n<iframe src="javascript:alert(1)">',
  'Path Traversal': '../etc/passwd\n../../etc/passwd\n../../../etc/passwd\n....//....//etc/passwd\n%2e%2e%2fetc%2fpasswd\n..%2fetc%2fpasswd\n/etc/passwd\n/etc/shadow\n/proc/self/environ',
  'Common Usernames': 'admin\nroot\nuser\ntest\nguest\nadministrator\ninfo\nwebmaster\nsupport\nservice',
};

const STATUS_COLOR = (status) => {
  if (!status) return 'var(--text-muted)';
  if (status >= 500) return 'var(--severity-critical)';
  if (status >= 400) return 'var(--severity-high)';
  if (status >= 300) return 'var(--severity-medium)';
  if (status >= 200) return 'var(--severity-low)';
  return 'var(--text-muted)';
};

const styles = {
  container: { padding: 0 },
  header: {
    margin: '-24px -24px 20px -24px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0, fontWeight: 'normal' },
  subtitle: { color: 'var(--text-muted)', fontSize: '11px', margin: 0 },
  warning: {
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid var(--severity-critical)',
    padding: '10px 14px',
    color: 'var(--severity-critical)',
    fontSize: '12px',
    marginBottom: '20px',
    lineHeight: '1.6',
  },
  layout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  panel: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '16px',
  },
  panelTitle: { color: 'var(--text-primary)', fontSize: '13px',  marginBottom: '14px' },
  label: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', display: 'block' },
  row: { display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'flex-end' },
  select: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '8px 10px',
    outline: 'none',
  },
  input: {
    flex: 1,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: (minH) => ({
    width: '100%',
    minHeight: minH || '80px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    marginBottom: '10px',
  }),
  hint: { color: 'var(--text-muted)', fontSize: '11px', marginBottom: '10px' },
  builtInRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' },
  chip: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
        fontSize: '11px',
    padding: '3px 8px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  button: (disabled) => ({
    background: disabled ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: disabled ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    padding: '8px 20px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
    marginTop: '4px',
  }),
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '8px' },
  results: { marginTop: '24px' },
  summaryBar: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    marginBottom: '16px',
    fontSize: '12px',
  },
  summaryItem: { color: 'var(--text-muted)' },
  summaryVal: { color: 'var(--text-primary)',  },
  flaggedBanner: {
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid var(--severity-critical)',
    padding: '8px 14px',
    color: 'var(--severity-critical)',
    fontSize: '12px',
    marginBottom: '14px',
  },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 10px', borderBottom: '1px solid var(--border)', textAlign: 'left' },
  td: (flagged) => ({
    padding: '6px 10px',
    borderBottom: '1px solid var(--border)',
    color: flagged ? 'var(--severity-high)' : 'var(--text-primary)',
    background: flagged ? 'rgba(217,119,6,0.06)' : 'transparent',
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  statusCell: (status) => ({
    padding: '6px 10px',
    borderBottom: '1px solid var(--border)',
    color: STATUS_COLOR(status),
    
  }),
};

export default function Intruder() {
  const isMobile = useIsMobile();
  const [method, setMethod] = useState('GET');
  const [urlTemplate, setUrlTemplate] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [payloadsText, setPayloadsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);       // streamed per-request results
  const [summary, setSummary] = useState(null); // set on done
  const [expandedRow, setExpandedRow] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const runIdRef = useRef(null);
  const { push } = useWorkspace();

  useEffect(() => {
    try {
      const imp = JSON.parse(localStorage.getItem('payload-generator-import') || 'null');
      if (imp?.target === 'intruder' && imp?.payload) {
        setPayloadsText(prev => prev ? prev + '\n' + imp.payload : imp.payload);
        localStorage.removeItem('payload-generator-import');
      }
    } catch {}
  }, []);

  // Subscribe to local intruder IPC events (desktop app only). Dispatch by runId.
  useEffect(() => {
    if (!isElectron) return;
    window.electron.intruder.onResult((d) => {
      if (d.runId !== runIdRef.current) return;
      setRows(prev => [...prev, d]);
    });
    window.electron.intruder.onDone((d) => {
      if (d.runId !== runIdRef.current) return;
      setSummary(d.summary);
      setLoading(false);
      runIdRef.current = null;
      if (d.summary?.flaggedCount > 0) {
        push('intruder', `Intruder: ${d.summary.flaggedCount} anomalies on ${urlTemplate}`,
          { results: d.results, summary: d.summary }, 'intruder');
      }
    });
    window.electron.intruder.onError((d) => {
      if (d.runId !== runIdRef.current) return;
      setError(d.error);
      setLoading(false);
      runIdRef.current = null;
    });
  }, []);

  function loadBuiltIn(key) {
    setPayloadsText(BUILT_IN_LISTS[key]);
  }

  async function handleAttack() {
    setLoading(true);
    setError(null);
    setRows([]);
    setSummary(null);
    setExpandedRow(null);
    runIdRef.current = null;

    const payloads = payloadsText.split('\n').map(p => p.trim()).filter(Boolean);
    if (payloads.length === 0) {
      setError('No payloads entered.');
      setLoading(false);
      return;
    }

    // Runs locally in the desktop app via IPC; results stream in as each request returns.
    const out = await window.electron.intruder.start({
      method,
      urlTemplate: urlTemplate.trim(),
      headers: headersText,
      body: bodyText || undefined,
      payloads,
    });
    if (out.error) {
      setError(out.error);
      setLoading(false);
      return;
    }
    runIdRef.current = out.runId;
  }

  async function handleStop() {
    if (runIdRef.current) await window.electron.intruder.cancel(runIdRef.current);
  }

  const payloadCount = payloadsText.split('\n').filter(p => p.trim()).length;
  const canAttack = !loading && urlTemplate.trim().length > 0 && payloadCount > 0 && authorized;
  const showBody = !['GET', 'HEAD'].includes(method);

  if (!isElectron) return <DesktopOnly toolName="Intruder" downloadUrl="https://0xkudo.com/download" />;

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, margin: isMobile ? '-16px -16px 20px -16px' : '-24px -24px 20px -24px' }}>
        <span style={styles.title}>Intruder</span>
        <p style={styles.subtitle}>
          Mark injection points with §placeholders§ in your request template, supply payloads, and fire.
        </p>
      </div>

      <div style={styles.warning}>
        ⚠ Only use against systems you own or have explicit written authorization to test.
      </div>

      <div style={{ ...styles.layout, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
        {/* Request template */}
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Request Template</div>

          <div style={{ ...styles.row, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
            <div>
              <span style={styles.label}>Method</span>
              <select className="kudo-input kudo-select" value={method} onChange={e => setMethod(e.target.value)} disabled={loading}>
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, width: isMobile ? '100%' : undefined }}>
              <span style={styles.label}>URL Template</span>
              <Input
                style={{ flex: 1, width: '100%' }}
                placeholder="https://example.com/login?user=§admin§"
                value={urlTemplate}
                onChange={e => setUrlTemplate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
          <div style={styles.hint}>
            Wrap injection points with §markers§: e.g. <code>?id=§1§</code> or <code>user=§admin§&amp;pass=§password§</code>
          </div>

          <span style={styles.label}>Headers (optional)</span>
          <textarea
            style={styles.textarea('70px')}
            placeholder={'Content-Type: application/json\nAuthorization: Bearer §token§'}
            value={headersText}
            onChange={e => setHeadersText(e.target.value)}
            disabled={loading}
          />

          {showBody && (
            <>
              <span style={styles.label}>Body (optional)</span>
              <textarea
                style={styles.textarea('80px')}
                placeholder={'{"username":"§admin§","password":"§password§"}'}
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                disabled={loading}
              />
            </>
          )}
        </div>

        {/* Payloads */}
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Payloads</div>

          <span style={styles.label}>Built-in Lists</span>
          <div style={styles.builtInRow}>
            {Object.keys(BUILT_IN_LISTS).map(key => (
              <button key={key} style={styles.chip} onClick={() => loadBuiltIn(key)} disabled={loading}>
                {key}
              </button>
            ))}
          </div>

          <span style={styles.label}>Payload List (one per line, max 500)</span>
          <textarea
            style={styles.textarea('200px')}
            placeholder={'admin\nroot\ntest\nguest'}
            value={payloadsText}
            onChange={e => setPayloadsText(e.target.value)}
            disabled={loading}
          />
          <div style={styles.hint}>{payloadCount} payload{payloadCount !== 1 ? 's' : ''} loaded</div>

          <div style={{ margin: '4px 0 12px' }}>
            <AuthGate checked={authorized} onChange={setAuthorized} disabled={loading} />
          </div>

          {loading ? (
            <Button variant="danger" onClick={handleStop}>Stop ({rows.length}/{payloadCount})</Button>
          ) : (
            <Button onClick={handleAttack} disabled={!canAttack}>Start Attack</Button>
          )}
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {(rows.length > 0 || loading) && (
        <div style={styles.results}>
          {/* Summary bar (populated once the run completes) */}
          {summary && (
            <div style={styles.summaryBar}>
              <span style={styles.summaryItem}>Total: <span style={styles.summaryVal}>{rows.length}</span></span>
              {Object.entries(summary.statusCounts).sort().map(([s, c]) => (
                <span key={s} style={{ ...styles.summaryItem, color: STATUS_COLOR(parseInt(s)) }}>
                  {s}: <span style={styles.summaryVal}>{c}</span>
                </span>
              ))}
              <span style={styles.summaryItem}>Baseline length: <span style={styles.summaryVal}>{summary.baselineLength}b</span></span>
              <span style={styles.summaryItem}>Flagged: <span style={{ ...styles.summaryVal, color: summary.flaggedCount > 0 ? 'var(--severity-high)' : 'var(--severity-low)' }}>{summary.flaggedCount}</span></span>
            </div>
          )}
          {loading && (
            <div style={{ ...styles.summaryBar }}>
              <span style={styles.summaryItem}>Running… <span style={styles.summaryVal}>{rows.length}/{payloadCount}</span></span>
            </div>
          )}

          {summary && summary.flaggedCount > 0 && (
            <div style={styles.flaggedBanner}>
              {summary.flaggedCount} anomalous response{summary.flaggedCount !== 1 ? 's' : ''} detected. Highlighted below.
            </div>
          )}

          {/* Results table — rows stream in live as each request returns */}
          <Table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Payload</th>
                  <th>Status</th>
                  <th>Length</th>
                  <th>Duration</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const isFlagged = summary ? summary.flagged.includes(r.payload) : false;
                  const isExpanded = expandedRow === idx;
                  return (
                    <>
                      <tr
                        key={idx}
                        className={isFlagged ? 'flagged' : undefined}
                        style={{ cursor: r.body ? 'pointer' : 'default' }}
                        onClick={() => r.body && setExpandedRow(isExpanded ? null : idx)}
                      >
                        <td>{idx + 1}</td>
                        <td title={r.payload}>{r.payload}</td>
                        <td style={{ color: styles.statusCell(r.status).color }}>{r.status || '-'}</td>
                        <td>{r.length}b</td>
                        <td>{r.durationMs}ms</td>
                        <td style={{ color: r.error ? 'var(--severity-critical)' : 'var(--text-muted)' }}>{r.error || '-'}</td>
                      </tr>
                      {isExpanded && r.body && (
                        <tr key={`${idx}-body`}>
                          <td colSpan={6} style={{ padding: '0', borderBottom: '1px solid var(--border)' }}>
                            <pre style={{
                              margin: 0,
                              padding: '10px 14px',
                              background: 'var(--bg-primary)',
                              fontFamily: 'var(--font)',
                              fontSize: '11px',
                              color: 'var(--text-primary)',
                              maxHeight: '200px',
                              overflowY: 'auto',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                            }}>
                              {r.body.slice(0, 5000)}{r.body.length > 5000 ? '\n...(truncated)' : ''}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
