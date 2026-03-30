import { useState, useEffect } from 'react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';

const FRAMEWORK_HINTS = [
  { value: 'auto',      label: 'Auto-detect' },
  { value: 'nist',      label: 'NIST SP 800-53' },
  { value: 'iso27001',  label: 'ISO 27001' },
  { value: 'cis',       label: 'CIS Controls' },
  { value: 'soc2',      label: 'SOC 2' },
  { value: 'hipaa',     label: 'HIPAA' },
  { value: 'pci-dss',   label: 'PCI-DSS' },
  { value: 'gdpr',      label: 'GDPR' },
  { value: 'cmmc',      label: 'CMMC' },
  { value: 'internal',  label: 'Internal Policy' },
  { value: 'other',     label: 'Other' },
];

const REQ_COLORS = {
  Mandatory:    'var(--severity-high)',
  Recommended:  'var(--severity-medium)',
  Optional:     'var(--severity-low)',
};

const styles = {
  container: { maxWidth: '900px' },
  header: { marginBottom: '24px' },
  title: { color: 'var(--text-primary)', fontSize: '18px', marginBottom: '6px' },
  subtitle: { color: 'var(--text-muted)', fontSize: '13px' },
  controlRow: { display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' },
  select: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '8px 12px',
    outline: 'none',
  },
  button: (loading) => ({
    background: loading ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '8px 20px',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: loading ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }),
  textarea: {
    width: '100%',
    minHeight: '220px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '12px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    marginBottom: '12px',
  },
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '12px' },
  results: { marginTop: '24px' },
  summaryCard: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '20px',
    marginBottom: '16px',
  },
  frameworkBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontSize: '12px',
    marginBottom: '12px',
  },
  summaryText: { color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.7', marginBottom: '16px' },
  label: { color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' },
  sectionBlock: { marginBottom: '20px' },
  controlCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '14px',
    marginBottom: '10px',
  },
  controlHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' },
  controlTitle: { color: 'var(--text-primary)', fontSize: '13px', fontWeight: 'bold' },
  controlId: { color: 'var(--text-muted)', fontSize: '11px', marginBottom: '6px' },
  controlPlain: { color: 'var(--text-primary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '8px' },
  reqBadge: (req) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    border: `1px solid ${REQ_COLORS[req] || 'var(--border)'}`,
    color: REQ_COLORS[req] || 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  }),
  chip: {
    display: 'inline-block',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '2px 8px',
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginRight: '4px',
    marginBottom: '4px',
  },
  actionItem: { padding: '4px 0', color: 'var(--text-primary)', fontSize: '12px', borderBottom: '1px solid var(--border)' },
  gapItem: { padding: '5px 0', color: 'var(--severity-high)', fontSize: '13px', borderBottom: '1px solid var(--border)' },
  recItem: { padding: '5px 0', color: 'var(--text-primary)', fontSize: '13px', borderBottom: '1px solid var(--border)' },
};

export default function SecurityPolicyTranslator() {
  const [policyText, setPolicyText] = useState('');
  const [frameworkHint, setFrameworkHint] = useState('auto');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { push } = useWorkspace();

  useEffect(() => {
    try {
      const restore = JSON.parse(localStorage.getItem('workspace-restore-security-policy-translator') || 'null');
      if (restore) { setResult(restore); localStorage.removeItem('workspace-restore-security-policy-translator'); }
    } catch {}
  }, []);

  async function handleTranslate() {
    if (!policyText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/tools/security-policy-translator/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policyText, frameworkHint }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Translation failed.');
      } else {
        setResult(data);
        push('security-policy-translator', `Policy — ${data.framework}`, data, 'security-policy-translator');
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Security Policy Translator</h1>
        <p style={styles.subtitle}>
          Paste policy text from NIST, ISO 27001, CIS, SOC 2, HIPAA, PCI-DSS, GDPR, or internal docs. Claude translates into plain English and extracts required controls.
        </p>
      </div>

      <textarea
        style={styles.textarea}
        placeholder={`Paste security policy text here...\n\nExamples:\n  NIST SP 800-53 AC-2: The organization manages information system accounts...\n  ISO 27001 A.9.1.1: An access control policy shall be established...\n  HIPAA §164.312(a)(1): Implement technical policies and procedures...`}
        value={policyText}
        onChange={e => setPolicyText(e.target.value)}
        disabled={loading}
      />

      <div style={styles.controlRow}>
        <select style={styles.select} value={frameworkHint} onChange={e => setFrameworkHint(e.target.value)} disabled={loading}>
          {FRAMEWORK_HINTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <button style={styles.button(loading)} onClick={handleTranslate} disabled={loading || !policyText.trim()}>
          {loading ? 'Translating...' : 'Translate'}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          <div style={styles.summaryCard}>
            <div style={styles.frameworkBadge}>{result.framework}</div>
            <div style={styles.summaryText}>{result.plainEnglishSummary}</div>

            {result.controls?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Controls ({result.controls.length})</div>
                {result.controls.map((ctrl, i) => (
                  <div key={i} style={styles.controlCard}>
                    <div style={styles.controlHeader}>
                      <div>
                        {ctrl.id && <div style={styles.controlId}>{ctrl.id}</div>}
                        <div style={styles.controlTitle}>{ctrl.title}</div>
                      </div>
                      <span style={styles.reqBadge(ctrl.requirement)}>{ctrl.requirement}</span>
                    </div>
                    <div style={styles.controlPlain}>{ctrl.plainEnglish}</div>
                    {ctrl.ownerTeams?.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        {ctrl.ownerTeams.map((t, j) => <span key={j} style={styles.chip}>{t}</span>)}
                      </div>
                    )}
                    {ctrl.actionItems?.length > 0 && (
                      <>
                        <div style={{ ...styles.label, marginTop: '4px' }}>Action Items</div>
                        {ctrl.actionItems.map((a, j) => (
                          <div key={j} style={styles.actionItem}>• {a}</div>
                        ))}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.complianceGaps?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Common Compliance Gaps</div>
                {result.complianceGaps.map((g, i) => (
                  <div key={i} style={styles.gapItem}>⚠ {g}</div>
                ))}
              </div>
            )}

            {result.recommendations?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Recommendations</div>
                {result.recommendations.map((r, i) => (
                  <div key={i} style={styles.recItem}>{i + 1}. {r}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
