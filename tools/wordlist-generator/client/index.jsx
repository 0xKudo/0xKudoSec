import { useState } from 'react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';

const CHARSET_OPTIONS = [
  { value: 'lowercase', label: 'Lowercase (a-z)' },
  { value: 'uppercase', label: 'Uppercase (A-Z)' },
  { value: 'digits',    label: 'Digits (0-9)' },
  { value: 'symbols',   label: 'Symbols (!@#$...)' },
  { value: 'custom',    label: 'Custom chars' },
];

const RULE_OPTIONS = [
  { value: 'base',    label: 'Base word variants (lower / UPPER / Capital)' },
  { value: 'leet',    label: 'Leet substitutions (a→4, e→3, i→1...)' },
  { value: 'digits',  label: 'Append / prepend digits (0–99)' },
  { value: 'years',   label: 'Append years' },
  { value: 'symbols', label: 'Append symbols' },
];

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
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0 },
  subtitle: { color: 'var(--text-muted)', fontSize: '11px', margin: 0 },
  tabs: { display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', margin: '0 -24px', paddingLeft: '8px', marginBottom: '20px' },
  tab: (active) => ({
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--text-primary)' : '2px solid transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '8px 16px',
    cursor: 'pointer',
    marginBottom: '-1px',
  }),
  section: { marginBottom: '16px' },
  label: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'block' },
  checkRow: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' },
  checkItem: { display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer' },
  input: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
    width: '80px',
  },
  inputWide: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
    width: '200px',
  },
  textarea: {
    width: '100%',
    minHeight: '80px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  row: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' },
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
  secondaryBtn: {
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    padding: '6px 14px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '8px' },
  results: { marginTop: '24px' },
  resultHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  resultMeta: { color: 'var(--text-muted)', fontSize: '12px' },
  actionRow: { display: 'flex', gap: '8px' },
  wordlistBox: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    color: 'var(--text-primary)',
    maxHeight: '300px',
    overflowY: 'auto',
    whiteSpace: 'pre',
    lineHeight: '1.6',
  },
  truncatedNote: {
    color: 'var(--severity-medium)',
    fontSize: '12px',
    marginTop: '8px',
  },
};

export default function WordlistGenerator() {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('charset');

  // Charset tab state
  const [charsets, setCharsets] = useState(['lowercase', 'digits']);
  const [customChars, setCustomChars] = useState('');
  const [minLength, setMinLength] = useState('4');
  const [maxLength, setMaxLength] = useState('4');

  // Pattern tab state
  const [baseWordsText, setBaseWordsText] = useState('');
  const [rules, setRules] = useState(['base', 'digits']);
  const [yearStart, setYearStart] = useState('2020');
  const [yearEnd, setYearEnd] = useState('2024');
  const [symbols, setSymbols] = useState('!@#$');

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { push } = useWorkspace();

  function toggleCharset(val) {
    setCharsets(prev => prev.includes(val) ? prev.filter(c => c !== val) : [...prev, val]);
  }

  function toggleRule(val) {
    setRules(prev => prev.includes(val) ? prev.filter(r => r !== val) : [...prev, val]);
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let endpoint, body;

      if (activeTab === 'charset') {
        endpoint = '/api/tools/wordlist-generator/charset/preview';
        body = { charsets, customChars, minLength: parseInt(minLength), maxLength: parseInt(maxLength) };
      } else {
        const baseWords = baseWordsText.split('\n').map(w => w.trim()).filter(Boolean);
        endpoint = '/api/tools/wordlist-generator/pattern';
        body = { baseWords, rules, yearStart, yearEnd, symbols };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed.');
      } else {
        setResult({ ...data, mode: activeTab });
        if (activeTab === 'pattern') {
          push('wordlist-generator', `Wordlist — ${data.count} entries`, { wordlist: data.wordlist }, 'wordlist-generator');
        }
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  async function handleCharsetDownload() {
    const body = { charsets, customChars, minLength: parseInt(minLength), maxLength: parseInt(maxLength) };
    const res = await fetch('/api/tools/wordlist-generator/charset/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Download failed.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wordlist.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownload() {
    if (!result) return;
    const blob = new Blob([result.wordlist.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wordlist.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyAll() {
    if (!result) return;
    const list = result.wordlist || result.preview;
    navigator.clipboard.writeText(list.join('\n'));
  }

  const canGenerate = !loading && (
    activeTab === 'charset' ? charsets.length > 0 : baseWordsText.trim().length > 0 && rules.length > 0
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Wordlist / Password Generator</span>
        <p style={styles.subtitle}>
          Generate wordlists from character sets or base words with mutation rules. Max 10,000 entries.
        </p>
      </div>

      <div style={styles.tabs}>
        <button style={styles.tab(activeTab === 'charset')} onClick={() => { setActiveTab('charset'); setResult(null); setError(null); }}>
          Character Set
        </button>
        <button style={styles.tab(activeTab === 'pattern')} onClick={() => { setActiveTab('pattern'); setResult(null); setError(null); }}>
          Pattern / Rules
        </button>
      </div>

      {activeTab === 'charset' && (
        <>
          <div style={styles.section}>
            <span style={styles.label}>Character Sets</span>
            <div style={styles.checkRow}>
              {CHARSET_OPTIONS.map(opt => (
                <label key={opt.value} style={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={charsets.includes(opt.value)}
                    onChange={() => toggleCharset(opt.value)}
                    disabled={loading}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {charsets.includes('custom') && (
              <input
                style={styles.inputWide}
                placeholder="e.g. abc123!@"
                value={customChars}
                onChange={e => setCustomChars(e.target.value)}
                disabled={loading}
              />
            )}
          </div>

          <div style={{ ...styles.row, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center' }}>
            <div>
              <span style={styles.label}>Min Length</span>
              <input style={styles.input} type="number" min="1" max="16" value={minLength} onChange={e => setMinLength(e.target.value)} disabled={loading} />
            </div>
            <div>
              <span style={styles.label}>Max Length</span>
              <input style={styles.input} type="number" min="1" max="16" value={maxLength} onChange={e => setMaxLength(e.target.value)} disabled={loading} />
            </div>
            <button style={{ ...styles.button(!canGenerate), marginTop: isMobile ? '4px' : '18px' }} onClick={handleGenerate} disabled={!canGenerate}>
              {loading ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </>
      )}

      {activeTab === 'pattern' && (
        <>
          <div style={styles.section}>
            <span style={styles.label}>Base Words (one per line, max 20)</span>
            <textarea
              style={styles.textarea}
              placeholder={'password\nadmin\ncompany name\nuser\'s name'}
              value={baseWordsText}
              onChange={e => setBaseWordsText(e.target.value)}
              disabled={loading}
            />
          </div>

          <div style={styles.section}>
            <span style={styles.label}>Mutation Rules</span>
            <div style={styles.checkRow}>
              {RULE_OPTIONS.map(opt => (
                <label key={opt.value} style={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={rules.includes(opt.value)}
                    onChange={() => toggleRule(opt.value)}
                    disabled={loading}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {rules.includes('years') && (
            <div style={styles.row}>
              <div>
                <span style={styles.label}>Year Start</span>
                <input style={styles.input} type="number" value={yearStart} onChange={e => setYearStart(e.target.value)} disabled={loading} />
              </div>
              <div>
                <span style={styles.label}>Year End</span>
                <input style={styles.input} type="number" value={yearEnd} onChange={e => setYearEnd(e.target.value)} disabled={loading} />
              </div>
            </div>
          )}

          {rules.includes('symbols') && (
            <div style={styles.row}>
              <div>
                <span style={styles.label}>Symbols to use</span>
                <input style={styles.inputWide} placeholder="!@#$" value={symbols} onChange={e => setSymbols(e.target.value)} disabled={loading} />
              </div>
            </div>
          )}

          <div style={styles.row}>
            <button style={styles.button(!canGenerate)} onClick={handleGenerate} disabled={!canGenerate}>
              {loading ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {result && result.mode === 'charset' && (
        <div style={styles.results}>
          <div style={{ ...styles.resultHeader, flexWrap: 'wrap', gap: '8px' }}>
            <span style={styles.resultMeta}>
              ~{result.estimated.toLocaleString()} entries
              {result.capped
                ? ' (capped at 1,000,000 in production)'
                : result.isLocal
                  ? ' (no limit — local mode)'
                  : ` (~${Math.max(1, Math.ceil(result.estimated / 100000))} MB estimated)`}
            </span>
            <button style={styles.secondaryBtn} onClick={handleCharsetDownload}>
              Download Full List (.txt)
            </button>
          </div>
          {result.estimated > 100000 && (
            <p style={styles.truncatedNote}>
              {result.isLocal
                ? 'Local mode — no entry limit. Very large wordlists may take several minutes to generate.'
                : 'Large wordlist — download may take a moment to generate.'}
            </p>
          )}
          <p style={styles.truncatedNote}>Preview — first {result.preview.length} entries</p>
          <div style={styles.wordlistBox}>
            {result.preview.join('\n')}
          </div>
        </div>
      )}

      {result && result.mode === 'pattern' && (
        <div style={styles.results}>
          <div style={{ ...styles.resultHeader, flexWrap: 'wrap', gap: '8px' }}>
            <span style={styles.resultMeta}>{result.count.toLocaleString()} entries generated</span>
            <div style={styles.actionRow}>
              <button style={styles.secondaryBtn} onClick={handleCopyAll}>Copy All</button>
              <button style={styles.secondaryBtn} onClick={handleDownload}>Download .txt</button>
            </div>
          </div>
          {result.truncated && (
            <p style={styles.truncatedNote}>Truncated to 10,000 entries.</p>
          )}
          <div style={styles.wordlistBox}>
            {result.wordlist.slice(0, 500).join('\n')}
            {result.wordlist.length > 500 && `\n... and ${result.wordlist.length - 500} more (download to see all)`}
          </div>
        </div>
      )}
    </div>
  );
}
