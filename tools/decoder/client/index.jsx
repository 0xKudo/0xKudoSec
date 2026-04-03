import { useState } from 'react';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';

const OPERATION_GROUPS = [
  {
    label: 'URL',
    ops: [
      { value: 'url-decode', label: 'Decode' },
      { value: 'url-encode', label: 'Encode' },
      { value: 'url-encode-full', label: 'Encode (all chars)' },
    ],
  },
  {
    label: 'HTML',
    ops: [
      { value: 'html-decode', label: 'Decode' },
      { value: 'html-encode', label: 'Encode' },
    ],
  },
  {
    label: 'Base64',
    ops: [
      { value: 'base64-decode', label: 'Decode' },
      { value: 'base64-encode', label: 'Encode' },
      { value: 'base64url-decode', label: 'Decode (URL-safe)' },
      { value: 'base64url-encode', label: 'Encode (URL-safe)' },
    ],
  },
  {
    label: 'Hex',
    ops: [
      { value: 'hex-decode', label: 'Decode' },
      { value: 'hex-encode', label: 'Encode' },
    ],
  },
  {
    label: 'Binary',
    ops: [
      { value: 'binary-decode', label: 'Decode' },
      { value: 'binary-encode', label: 'Encode' },
    ],
  },
  {
    label: 'ROT13',
    ops: [
      { value: 'rot13', label: 'ROT13' },
    ],
  },
  {
    label: 'Unicode',
    ops: [
      { value: 'unicode-decode', label: 'Decode (\\uXXXX)' },
      { value: 'unicode-encode', label: 'Encode to \\uXXXX' },
    ],
  },
  {
    label: 'JWT',
    ops: [
      { value: 'jwt-decode', label: 'Inspect (no verify)' },
    ],
  },
];

const styles = {
  container: { maxWidth: '960px' },
  header: { marginBottom: '20px' },
  title: { color: 'var(--text-primary)', fontSize: '18px', marginBottom: '6px' },
  subtitle: { color: 'var(--text-muted)', fontSize: '13px' },
  layout: { display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px' },
  opPanel: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '12px',
  },
  groupLabel: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '12px', marginBottom: '4px', paddingLeft: '4px' },
  opBtn: (active) => ({
    display: 'block',
    width: '100%',
    background: active ? 'var(--border)' : 'none',
    border: 'none',
    borderRadius: '3px',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '5px 8px',
    cursor: 'pointer',
    textAlign: 'left',
    marginBottom: '1px',
  }),
  mainPanel: {},
  label: { color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', display: 'block' },
  textarea: {
    width: '100%',
    minHeight: '140px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '10px 12px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    marginBottom: '10px',
  },
  actionRow: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' },
  button: (disabled) => ({
    background: disabled ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: disabled ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '8px 20px',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  secondaryBtn: {
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '8px 14px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginBottom: '10px' },
  outputLabel: { color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  outputBox: {
    width: '100%',
    minHeight: '140px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '10px 12px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  swapHint: { color: 'var(--text-muted)', fontSize: '11px' },
};

export default function Decoder() {
  const isMobile = useIsMobile();
  const [operation, setOperation] = useState('base64-decode');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleTransform() {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setOutput('');

    try {
      const res = await fetch('/api/tools/decoder/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, operation }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Transform failed.');
      } else {
        setOutput(data.output);
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  function handleSwap() {
    if (!output) return;
    setInput(output);
    setOutput('');
    setError(null);
  }

  function handleCopy() {
    if (output) navigator.clipboard.writeText(output);
  }

  const canTransform = !loading && input.trim().length > 0;

  // Find current op label for display
  const currentGroup = OPERATION_GROUPS.find(g => g.ops.some(o => o.value === operation));
  const currentOp = currentGroup?.ops.find(o => o.value === operation);
  const opLabel = currentGroup ? `${currentGroup.label} — ${currentOp?.label}` : operation;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Decoder</h1>
        <p style={styles.subtitle}>Encode and decode across URL, HTML, Base64, Hex, Binary, ROT13, Unicode, and JWT formats.</p>
      </div>

      <div style={{ ...styles.layout, gridTemplateColumns: isMobile ? '1fr' : '200px 1fr' }}>
        {/* Operation selector */}
        <div style={styles.opPanel}>
          {isMobile ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {OPERATION_GROUPS.map(group => group.ops.map(op => (
                <button
                  key={op.value}
                  style={{
                    ...styles.opBtn(operation === op.value),
                    width: 'auto',
                    display: 'inline-block',
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    padding: '5px 10px',
                  }}
                  onClick={() => { setOperation(op.value); setOutput(''); setError(null); }}
                >
                  {group.label} {op.label}
                </button>
              )))}
            </div>
          ) : (
            OPERATION_GROUPS.map(group => (
              <div key={group.label}>
                <div style={styles.groupLabel}>{group.label}</div>
                {group.ops.map(op => (
                  <button
                    key={op.value}
                    style={styles.opBtn(operation === op.value)}
                    onClick={() => { setOperation(op.value); setOutput(''); setError(null); }}
                  >
                    {op.label}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Main panel */}
        <div style={styles.mainPanel}>
          <span style={styles.label}>Input — {opLabel}</span>
          <textarea
            style={styles.textarea}
            placeholder="Paste input here..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />

          <div style={styles.actionRow}>
            <button style={styles.button(!canTransform)} onClick={handleTransform} disabled={!canTransform}>
              {loading ? 'Processing...' : 'Transform'}
            </button>
            <button style={styles.secondaryBtn} onClick={() => { setInput(''); setOutput(''); setError(null); }}>
              Clear
            </button>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          {(output || error === null) && output && (
            <>
              <div style={styles.outputLabel}>
                <span>Output</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={styles.secondaryBtn} onClick={handleSwap} title="Use output as next input">
                    ↕ Use as input
                  </button>
                  <button style={styles.secondaryBtn} onClick={handleCopy}>
                    Copy
                  </button>
                </div>
              </div>
              <div style={styles.outputBox}>{output}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
