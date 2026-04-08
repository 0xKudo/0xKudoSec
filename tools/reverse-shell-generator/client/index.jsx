import { useState } from 'react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';

const SHELL_TYPE_LABELS = {
  'bash':             'Bash (/dev/tcp)',
  'bash-196':         'Bash (fd 196)',
  'bash-readline':    'Bash (readline)',
  'sh':               'sh',
  'python':           'Python 2',
  'python3':          'Python 3',
  'php':              'PHP (fsockopen)',
  'php-exec':         'PHP (proc_open)',
  'perl':             'Perl',
  'ruby':             'Ruby',
  'netcat':           'Netcat (mkfifo)',
  'netcat-e':         'Netcat (-e)',
  'ncat':             'Ncat',
  'socat':            'Socat',
  'powershell':       'PowerShell',
  'powershell-b64':   'PowerShell (Base64)',
  'golang':           'Go',
  'java':             'Java',
  'awk':              'AWK',
  'nodejs':           'Node.js',
};

const SHELL_GROUPS = [
  { label: 'Unix Shells',     types: ['bash', 'bash-196', 'bash-readline', 'sh'] },
  { label: 'Python',          types: ['python', 'python3'] },
  { label: 'PHP',             types: ['php', 'php-exec'] },
  { label: 'Scripting',       types: ['perl', 'ruby', 'awk', 'nodejs'] },
  { label: 'Netcat / Socat',  types: ['netcat', 'netcat-e', 'ncat', 'socat'] },
  { label: 'Windows',         types: ['powershell', 'powershell-b64'] },
  { label: 'Compiled',        types: ['golang', 'java'] },
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
  warning: {
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid var(--severity-critical)',
    padding: '10px 14px',
    marginBottom: '20px',
    color: 'var(--severity-critical)',
    fontSize: '12px',
  },
  formRow: { display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'flex-end', flexWrap: 'wrap' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' },
  input: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
    width: '200px',
  },
  select: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
    minWidth: '200px',
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
    alignSelf: 'flex-end',
  }),
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '8px' },
  results: { marginTop: '24px' },
  sectionLabel: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' },
  payloadCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '14px',
    marginBottom: '10px',
  },
  payloadHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  payloadIndex: { color: 'var(--text-muted)', fontSize: '11px' },
  copyBtn: (copied) => ({
    background: copied ? 'rgba(22,163,74,0.12)' : 'var(--bg-primary)',
    color: copied ? 'var(--severity-low)' : 'var(--text-muted)',
    border: `1px solid ${copied ? 'var(--severity-low)' : 'var(--border)'}`,
    padding: '3px 10px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  }),
  payloadCode: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    color: 'var(--text-primary)',
    wordBreak: 'break-all',
    whiteSpace: 'pre-wrap',
    margin: 0,
  },
  listenerCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '14px',
    marginBottom: '10px',
  },
  listenerTitle: { color: 'var(--text-primary)', fontSize: '13px',  marginBottom: '10px' },
  listenerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  listenerCode: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    color: 'var(--text-primary)',
    flex: 1,
    marginRight: '8px',
    wordBreak: 'break-all',
  },
  msfBlock: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    color: 'var(--text-primary)',
    lineHeight: '1.8',
    whiteSpace: 'pre',
  },
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button style={styles.copyBtn(copied)} onClick={handleCopy}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function ReverseShellGenerator() {
  const isMobile = useIsMobile();
  const [lhost, setLhost] = useState('');
  const [lport, setLport] = useState('4444');
  const [shellType, setShellType] = useState('bash');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { push } = useWorkspace();

  async function handleGenerate() {
    if (!lhost.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/tools/reverse-shell-generator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lhost: lhost.trim(), lport, shellType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed.');
      } else {
        setResult(data);
        push('reverse-shell-generator', `${SHELL_TYPE_LABELS[shellType]} — ${lhost}:${lport}`, data, 'reverse-shell-generator');
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  const canGenerate = lhost.trim() && lport && shellType && !loading;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Reverse Shell Generator</span>
        <p style={styles.subtitle}>
          Generate ready-to-use reverse shell one-liners. Start your listener first, then run the payload on the target.
        </p>
      </div>

      <div style={styles.warning}>
        AUTHORIZED USE ONLY — Only use against systems you own or have explicit written permission to test. Unauthorized access is illegal.
      </div>

      <div style={{ ...styles.formRow, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-end' }}>
        <div style={styles.fieldGroup}>
          <span style={styles.label}>Attacker IP (LHOST)</span>
          <input
            style={styles.input}
            placeholder="10.10.14.1"
            value={lhost}
            onChange={e => setLhost(e.target.value)}
            disabled={loading}
          />
        </div>

        <div style={styles.fieldGroup}>
          <span style={styles.label}>Port (LPORT)</span>
          <input
            style={{ ...styles.input, width: isMobile ? '100%' : '100px' }}
            placeholder="4444"
            value={lport}
            onChange={e => setLport(e.target.value)}
            disabled={loading}
          />
        </div>

        <div style={styles.fieldGroup}>
          <span style={styles.label}>Shell Type</span>
          <select style={isMobile ? { ...styles.select, width: '100%' } : styles.select} value={shellType} onChange={e => setShellType(e.target.value)} disabled={loading}>
            {SHELL_GROUPS.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.types.map(t => (
                  <option key={t} value={t}>{SHELL_TYPE_LABELS[t]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <button style={styles.button(!canGenerate)} onClick={handleGenerate} disabled={!canGenerate}>
          Generate
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          <div style={styles.sectionLabel}>Payloads ({result.payloads.length})</div>
          {result.payloads.map((payload, i) => (
            <div key={i} style={styles.payloadCard}>
              <div style={styles.payloadHeader}>
                <span style={styles.payloadIndex}>Variant {i + 1}</span>
                <CopyButton text={payload} />
              </div>
              <pre style={styles.payloadCode}>{payload}</pre>
            </div>
          ))}

          <div style={{ marginTop: '20px' }}>
            <div style={styles.sectionLabel}>Listener Setup</div>

            <div style={styles.listenerCard}>
              <div style={styles.listenerTitle}>Netcat (simplest)</div>
              <div style={styles.listenerRow}>
                <code style={styles.listenerCode}>{result.listenerCommand}</code>
                <CopyButton text={result.listenerCommand} />
              </div>
            </div>

            <div style={styles.listenerCard}>
              <div style={styles.listenerTitle}>Metasploit multi/handler</div>
              <pre style={styles.msfBlock}>{result.msfListener.join('\n')}</pre>
              <div style={{ marginTop: '8px' }}>
                <CopyButton text={result.msfListener.join('\n')} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
