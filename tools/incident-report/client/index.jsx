import { useState } from 'react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';

const SEVERITY_COLORS = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

const styles = {
  container: { maxWidth: '800px' },
  header: { marginBottom: '24px' },
  title: { color: 'var(--text-primary)', fontSize: '18px', marginBottom: '6px' },
  subtitle: { color: 'var(--text-muted)', fontSize: '13px' },
  importBanner: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '12px',
    marginBottom: '12px',
  },
  importBannerLabel: {
    color: 'var(--text-muted)',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '8px',
  },
  importButton: {
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '6px 12px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    cursor: 'pointer',
    marginRight: '8px',
  },
  textarea: {
    width: '100%',
    minHeight: '160px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '12px',
    resize: 'vertical',
    outline: 'none',
    marginBottom: '12px',
  },
  controlsRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '12px',
  },
  select: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '10px 12px',
    outline: 'none',
  },
  button: (loading) => ({
    background: loading ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '10px 20px',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: loading ? 'not-allowed' : 'pointer',
  }),
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '12px' },
  results: {
    marginTop: '24px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '20px',
  },
  reportHeader: {
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid var(--border)',
  },
  severityBadge: (severity) => ({
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '4px',
    border: `1px solid ${SEVERITY_COLORS[severity] || 'var(--border)'}`,
    color: SEVERITY_COLORS[severity] || 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: '8px',
  }),
  reportTitle: {
    color: 'var(--text-primary)',
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '8px 0 4px',
  },
  reportClassification: { color: 'var(--text-muted)', fontSize: '13px' },
  timelineRow: { display: 'flex', gap: '24px', marginBottom: '20px' },
  label: {
    color: 'var(--text-muted)',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '4px',
  },
  value: {
    color: 'var(--text-primary)',
    fontSize: '14px',
    marginBottom: '20px',
    lineHeight: '1.6',
  },
  exportButton: {
    marginTop: '16px',
    background: 'var(--bg-primary)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '8px 16px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    cursor: 'pointer',
  },
};

function ReportSection({ label, value }) {
  if (!value) return null;
  return (
    <>
      <div style={styles.label}>{label}</div>
      <div style={styles.value}>{value}</div>
    </>
  );
}

export default function IncidentReportTool() {
  const [incidentText, setIncidentText] = useState('');
  const [severityOverride, setSeverityOverride] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const { items } = useWorkspace();

  const triageItems = items.filter(item => item.source === 'alert-triage');

  function handleImport(item) {
    const { severity, attackVector, summary, recommendedActions } = item.data;
    const lines = [
      `Severity: ${severity}`,
      `Attack Vector: ${attackVector}`,
      `Summary: ${summary}`,
      'Recommended Actions:',
      ...recommendedActions.map((a, i) => `  ${i + 1}. ${a}`),
    ];
    setIncidentText(lines.join('\n'));
    if (severity) setSeverityOverride(severity);
  }

  async function handleGenerate() {
    if (!incidentText.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const body = { incidentText };
      if (severityOverride) body.severity = severityOverride;

      const res = await fetch('/api/tools/incident-report/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Report generation failed.');
      } else {
        setReport(data);
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    if (!report) return;
    const sections = [
      `INCIDENT REPORT`,
      `================`,
      `Title: ${report.title}`,
      `Severity: ${report.severity.toUpperCase()}`,
      `Classification: ${report.classification}`,
      `Detected At: ${report.detectedAt || '—'}`,
      `Reported At: ${report.reportedAt || '—'}`,
      ``,
      `=== EXECUTIVE SUMMARY ===`,
      report.executiveSummary,
      ``,
      `=== TECHNICAL DETAILS ===`,
      report.technicalDetails,
      ``,
      `=== IMPACT ASSESSMENT ===`,
      report.impactAssessment,
      ``,
      `=== CONTAINMENT STEPS ===`,
      report.containmentSteps,
      ``,
      `=== RECOMMENDED REMEDIATION ===`,
      report.recommendedRemediation,
      ``,
      `=== LESSONS LEARNED ===`,
      report.lessonsLearned,
    ];
    navigator.clipboard.writeText(sections.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Incident Report Generator</h1>
        <p style={styles.subtitle}>
          Generate a structured incident report from a raw alert or an imported Alert Triage result.
        </p>
      </div>

      {triageItems.length > 0 && (
        <div style={styles.importBanner}>
          <div style={styles.importBannerLabel}>Import from Alert Triage</div>
          {triageItems.map(item => (
            <button key={item.id} style={styles.importButton} onClick={() => handleImport(item)}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      <textarea
        style={styles.textarea}
        placeholder="Paste incident description or alert text here..."
        value={incidentText}
        onChange={e => setIncidentText(e.target.value)}
        disabled={loading}
      />

      <div style={styles.controlsRow}>
        <select
          style={styles.select}
          value={severityOverride}
          onChange={e => setSeverityOverride(e.target.value)}
          disabled={loading}
        >
          <option value="">Severity (auto-detect)</option>
          {SEVERITIES.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <button
          style={styles.button(loading)}
          onClick={handleGenerate}
          disabled={loading || !incidentText.trim()}
        >
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {report && (
        <div style={styles.results}>
          <div style={styles.reportHeader}>
            <div style={styles.severityBadge(report.severity)}>{report.severity}</div>
            <div style={styles.reportTitle}>{report.title}</div>
            <div style={styles.reportClassification}>{report.classification}</div>
          </div>

          <div style={styles.timelineRow}>
            <div>
              <div style={styles.label}>Detected At</div>
              <div style={{ ...styles.value, marginBottom: 0 }}>{report.detectedAt || '—'}</div>
            </div>
            <div>
              <div style={styles.label}>Reported At</div>
              <div style={{ ...styles.value, marginBottom: 0 }}>{report.reportedAt || '—'}</div>
            </div>
          </div>

          <ReportSection label="Executive Summary" value={report.executiveSummary} />
          <ReportSection label="Technical Details" value={report.technicalDetails} />
          <ReportSection label="Impact Assessment" value={report.impactAssessment} />
          <ReportSection label="Containment Steps" value={report.containmentSteps} />
          <ReportSection label="Recommended Remediation" value={report.recommendedRemediation} />
          <ReportSection label="Lessons Learned" value={report.lessonsLearned} />

          <button style={styles.exportButton} onClick={handleExport}>
            {copied ? 'Copied!' : 'Copy as Plain Text'}
          </button>
        </div>
      )}
    </div>
  );
}
