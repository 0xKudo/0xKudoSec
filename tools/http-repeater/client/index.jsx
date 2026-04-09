import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const STATUS_COLOR = (status) => {
  if (status >= 500) return 'var(--severity-critical)';
  if (status >= 400) return 'var(--severity-high)';
  if (status >= 300) return 'var(--severity-medium)';
  if (status >= 200) return 'var(--severity-low)';
  return 'var(--text-muted)';
};

const HISTORY_KEY = 'http-repeater-history';
const MAX_HISTORY = 20;

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

const styles = {
  container: { padding: 0 },
  header: {
    margin: '-24px -24px 0 -24px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0, fontWeight: 'normal' },
  subtitle: { color: 'var(--text-muted)', fontSize: '11px', margin: 0 },
  layout: { display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', paddingTop: '20px' },
  sidebar: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    minHeight: '500px',
  },
  sidebarTitle: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' },
  historyItem: (active) => ({
    background: active ? 'var(--border)' : 'none',
    border: 'none',
    color: 'var(--text-primary)',
        fontSize: '11px',
    padding: '6px 8px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    width: '100%',
    textAlign: 'left',
    marginBottom: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  historyMethod: (method) => ({
    color: method === 'GET' ? 'var(--severity-low)' :
           method === 'POST' ? 'var(--severity-medium)' :
           method === 'DELETE' ? 'var(--severity-critical)' :
           'var(--severity-info)',
    
    marginRight: '4px',
  }),
  clearBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
        fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    padding: '4px 0',
    marginTop: '8px',
  },
  main: {},
  label: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', display: 'block' },
  requestBar: { display: 'flex', gap: '8px', marginBottom: '12px' },
  select: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '8px 10px',
    outline: 'none',
    minWidth: '100px',
  },
  urlInput: {
    flex: 1,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '6px 10px',
    outline: 'none',
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
  }),
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
    marginBottom: '12px',
  }),
  section: { marginBottom: '14px' },
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginBottom: '12px' },
  responsePanelHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' },
  statusBadge: (status) => ({
    display: 'inline-block',
    background: STATUS_COLOR(status),
    color: '#fff',
    fontSize: '12px',
    
    padding: '2px 10px',
  }),
  durationBadge: {
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
  tabs: (isMobile) => ({ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', margin: isMobile ? '0 -16px' : '0 -24px', paddingLeft: '8px', marginBottom: '20px' }),
  tab: (active) => ({
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent-amber)' : '2px solid transparent',
    color: active ? 'var(--accent-amber)' : 'var(--text-muted)',
        fontSize: '12px',
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    marginBottom: '-1px',
  }),
  responseBox: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    color: 'var(--text-primary)',
    maxHeight: '400px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    lineHeight: '1.6',
  },
  truncatedNote: { color: 'var(--severity-medium)', fontSize: '12px', marginBottom: '6px' },
};

export default function HttpRepeater() {
  const isMobile = useIsMobile();
  const { getAccessTokenSilently } = useAuth0();
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(null);
  const [responseTab, setResponseTab] = useState('body');
  const [history, setHistory] = useState(loadHistory);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(null);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    try {
      const imp = JSON.parse(localStorage.getItem('payload-generator-import') || 'null');
      if (imp?.target === 'http-repeater' && imp?.payload) {
        setBodyText(prev => prev ? prev + '\n' + imp.payload : imp.payload);
        setMethod('POST');
        localStorage.removeItem('payload-generator-import');
      }
    } catch {}
  }, []);

  async function handleSend() {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/tools/http-repeater/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          method,
          url: url.trim(),
          headers: headersText,
          body: bodyText || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Request failed.');
      } else {
        setResponse(data);
        setResponseTab('body');
        // Save to history
        const entry = { method, url: url.trim(), headers: headersText, body: bodyText, ts: Date.now() };
        setHistory(prev => [entry, ...prev.filter(h => !(h.method === entry.method && h.url === entry.url))].slice(0, MAX_HISTORY));
        setActiveHistoryIdx(0);
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  function loadHistoryEntry(idx) {
    const entry = history[idx];
    if (!entry) return;
    setMethod(entry.method);
    setUrl(entry.url);
    setHeadersText(entry.headers || '');
    setBodyText(entry.body || '');
    setActiveHistoryIdx(idx);
    setResponse(null);
    setError(null);
  }

  function clearHistory() {
    setHistory([]);
    setActiveHistoryIdx(null);
  }

  const canSend = !loading && url.trim().length > 0;
  const showBody = !['GET', 'HEAD'].includes(method);

  const headersFormatted = response
    ? Object.entries(response.headers).map(([k, v]) => `${k}: ${v}`).join('\n')
    : '';

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, margin: isMobile ? '-16px -16px 0 -16px' : '-24px -24px 0 -24px' }}>
        <span style={styles.title}>HTTP Repeater</span>
        <p style={styles.subtitle}>Craft and replay HTTP requests. Inspect the full response.</p>
      </div>

      <div style={{ ...styles.layout, gridTemplateColumns: isMobile ? '1fr' : '220px 1fr' }}>
        {/* History sidebar */}
        <div style={isMobile ? { ...styles.sidebar, minHeight: 'unset', marginBottom: '12px' } : styles.sidebar}>
          <div style={styles.sidebarTitle}>History</div>
          {history.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No requests yet.</div>
          )}
          <div style={isMobile ? { display: 'flex', flexWrap: 'wrap', gap: '4px' } : {}}>
            {history.map((entry, idx) => (
              <button
                key={idx}
                style={isMobile
                  ? { ...styles.historyItem(idx === activeHistoryIdx), width: 'auto', maxWidth: '160px' }
                  : styles.historyItem(idx === activeHistoryIdx)}
                onClick={() => loadHistoryEntry(idx)}
                title={entry.url}
              >
                <span style={styles.historyMethod(entry.method)}>{entry.method}</span>
                {entry.url.replace(/^https?:\/\//, '')}
              </button>
            ))}
          </div>
          {history.length > 0 && (
            <button style={styles.clearBtn} onClick={clearHistory}>Clear history</button>
          )}
        </div>

        {/* Main panel */}
        <div style={styles.main}>
          {/* Request bar */}
          <div style={styles.section}>
            {isMobile ? (
              <>
                <input
                  style={{ ...styles.urlInput, width: '100%', marginBottom: '8px', boxSizing: 'border-box' }}
                  placeholder="https://example.com/api/endpoint"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  disabled={loading}
                  onKeyDown={e => e.key === 'Enter' && canSend && handleSend()}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    style={styles.select}
                    value={method}
                    onChange={e => setMethod(e.target.value)}
                    disabled={loading}
                  >
                    {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button style={styles.button(!canSend)} onClick={handleSend} disabled={!canSend}>
                    {loading ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </>
            ) : (
              <div style={styles.requestBar}>
                <select
                  style={styles.select}
                  value={method}
                  onChange={e => setMethod(e.target.value)}
                  disabled={loading}
                >
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <input
                  style={{ ...styles.urlInput, minWidth: 0 }}
                  placeholder="https://example.com/api/endpoint"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  disabled={loading}
                  onKeyDown={e => e.key === 'Enter' && canSend && handleSend()}
                />
                <button style={styles.button(!canSend)} onClick={handleSend} disabled={!canSend}>
                  {loading ? 'Sending...' : 'Send'}
                </button>
              </div>
            )}
          </div>

          {/* Headers */}
          <div style={styles.section}>
            <span style={styles.label}>Request Headers (one per line: Key: Value)</span>
            <textarea
              style={styles.textarea('80px')}
              placeholder={'Content-Type: application/json\nAuthorization: Bearer token123'}
              value={headersText}
              onChange={e => setHeadersText(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Body */}
          {showBody && (
            <div style={styles.section}>
              <span style={styles.label}>Request Body</span>
              <textarea
                style={styles.textarea('100px')}
                placeholder='{"key": "value"}'
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                disabled={loading}
              />
            </div>
          )}

          {error && <p style={styles.error}>{error}</p>}

          {/* Response */}
          {response && (
            <div>
              <div style={styles.responsePanelHeader}>
                <span style={styles.statusBadge(response.status)}>
                  {response.status} {response.statusText}
                </span>
                <span style={styles.durationBadge}>{response.durationMs}ms</span>
                <span style={styles.durationBadge}>{response.byteLength} bytes</span>
              </div>

              <div style={styles.tabs(isMobile)}>
                <button style={styles.tab(responseTab === 'body')} onClick={() => setResponseTab('body')}>Body</button>
                <button style={styles.tab(responseTab === 'headers')} onClick={() => setResponseTab('headers')}>Headers</button>
              </div>

              {response.truncated && (
                <p style={styles.truncatedNote}>Response truncated at 2MB.</p>
              )}

              <div style={styles.responseBox}>
                {responseTab === 'body' ? response.body : headersFormatted}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
