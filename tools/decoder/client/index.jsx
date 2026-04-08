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
  opPanel: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '16px',
  },
  groupLabel: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '12px', marginBottom: '4px', paddingLeft: '4px' },
  opBtn: (active) => ({
    background: active ? 'var(--btn-primary-bg)' : 'var(--bg-surface)',
    border: '1px solid var(--border)',
    color: active ? 'var(--btn-primary-text)' : 'var(--text-muted)',
        fontSize: '11px',
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    whiteSpace: 'nowrap',
  }),
  mainPanel: {},
  label: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', display: 'block' },
  textarea: {
    width: '100%',
    minHeight: '140px',
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
  },
  actionRow: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' },
  button: (disabled) => ({
    background: disabled ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: disabled ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    padding: '8px 20px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  secondaryBtn: {
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    padding: '8px 14px',
        fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginBottom: '10px' },
  outputLabel: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  outputBox: {
    width: '100%',
    minHeight: '140px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  swapHint: { color: 'var(--text-muted)', fontSize: '11px' },
};

function OpChip({ op, group, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{
        background: active || hovered ? 'var(--btn-primary-bg)' : 'var(--bg-surface)',
        border: `1px solid ${active || hovered ? 'var(--btn-primary-bg)' : 'var(--border)'}`,
        color: active || hovered ? 'var(--btn-primary-text)' : 'var(--text-muted)',
                fontSize: '11px',
        padding: '4px 10px',
        cursor: 'pointer',
    fontFamily: 'var(--font)',
        whiteSpace: 'nowrap',
        transition: 'background 0.1s, color 0.1s, border-color 0.1s',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {group.label} {op.label}
    </button>
  );
}

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
      <div style={{ ...styles.header, margin: isMobile ? '0 0 20px 0' : '-24px -24px 20px -24px' }}>
        <span style={styles.title}>Decoder</span>
        <p style={styles.subtitle}>Encode and decode across URL, HTML, Base64, Hex, Binary, ROT13, Unicode, and JWT formats.</p>
      </div>

      {isMobile ? (
        /* Mobile: original chip layout */
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', marginBottom: '16px' }}>
          {OPERATION_GROUPS.map(group => group.ops.map(op => (
            <button
              key={op.value}
              style={{
                background: operation === op.value ? 'var(--border)' : 'none',
                border: '1px solid var(--border)',
                color: operation === op.value ? 'var(--text-primary)' : 'var(--text-muted)',
                                fontSize: '12px',
                padding: '5px 10px',
                cursor: 'pointer',
    fontFamily: 'var(--font)',
              }}
              onClick={() => { setOperation(op.value); setOutput(''); setError(null); }}
            >
              {group.label} {op.label}
            </button>
          )))}
        </div>
      ) : (
        /* Desktop: flat chips across the top */
        <div style={styles.opPanel}>
          {OPERATION_GROUPS.map(group => group.ops.map(op => (
            <OpChip
              key={op.value}
              op={op}
              group={group}
              active={operation === op.value}
              onClick={() => { setOperation(op.value); setOutput(''); setError(null); }}
            />
          )))}
        </div>
      )}

      <div>
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
