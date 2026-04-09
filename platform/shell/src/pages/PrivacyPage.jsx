import { useNavigate } from 'react-router-dom';

const s = {
  page: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    height: '48px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
  },
  brand: {
    fontSize: '16px',
    letterSpacing: '0.04em',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  back: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'var(--font)',
    letterSpacing: '0.04em',
  },
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '48px 24px 80px',
  },
  h1: {
    fontSize: '18px',
    fontWeight: 'normal',
    letterSpacing: '0.04em',
    marginBottom: '6px',
    color: 'var(--text-primary)',
  },
  updated: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '40px',
    letterSpacing: '0.04em',
  },
  h2: {
    fontSize: '12px',
    fontWeight: 'normal',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
    marginTop: '36px',
    marginBottom: '12px',
    borderBottom: '1px solid var(--border)',
    paddingBottom: '8px',
  },
  p: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    lineHeight: '1.7',
    marginBottom: '14px',
  },
  ul: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    lineHeight: '1.7',
    paddingLeft: '20px',
    marginBottom: '14px',
  },
  li: {
    marginBottom: '6px',
  },
  muted: {
    color: 'var(--text-muted)',
  },
  link: {
    color: 'var(--text-primary)',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};

export function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <span style={s.brand} onClick={() => navigate('/')}>[ 0xKudo ]</span>
        <button style={s.back} onClick={() => navigate(-1)}>← Back</button>
      </nav>

      <div style={s.scrollArea}><div style={s.container}>
        <h1 style={s.h1}>Privacy Policy</h1>
        <div style={s.updated}>Last updated: April 8, 2026</div>

        <p style={s.p}>
          0xKudo ("the platform") is a cybersecurity operations platform operated by Layne Kudo.
          This policy explains what data is collected, how it is used, how long it is retained, and your rights as a user.
        </p>

        <h2 style={s.h2}>What We Collect</h2>
        <p style={s.p}>The platform collects only data you explicitly provide or ship:</p>
        <ul style={s.ul}>
          <li style={s.li}><strong>Account identity:</strong> your Auth0 user ID (an opaque identifier). We do not store your name or email address in our database; those remain with Auth0.</li>
          <li style={s.li}><strong>Security event logs:</strong> Windows event log data shipped from your own machines via the Fluent Bit agent or file upload. This may include hostnames, usernames, IP addresses, process names, file paths, and registry keys from your environment.</li>
          <li style={s.li}><strong>Detection rules, alerts, and cases:</strong> security content you create within the platform.</li>
          <li style={s.li}><strong>Ingest API key:</strong> stored as a hash only. The plaintext key is shown once at creation and never stored.</li>
          <li style={s.li}><strong>Audit log entries:</strong> a record of privileged actions (key rotation, rule changes, exports, account deletion) including your user ID, the action taken, and your IP address at the time.</li>
          <li style={s.li}><strong>Usage preferences:</strong> log retention settings you configure.</li>
        </ul>

        <h2 style={s.h2}>What We Do Not Collect</h2>
        <ul style={s.ul}>
          <li style={s.li}>We do not collect payment information.</li>
          <li style={s.li}>We do not use tracking pixels, analytics scripts, or advertising cookies.</li>
          <li style={s.li}>We do not collect browsing behavior or session recordings.</li>
          <li style={s.li}>We do not store passwords; authentication is handled entirely by Auth0.</li>
        </ul>

        <h2 style={s.h2}>How Data Is Used</h2>
        <p style={s.p}>
          All data is used solely to operate the platform for you. Security event logs are stored to power the SIEM dashboard, detection rules, log search, and alerts. Audit log entries are maintained for security traceability and compliance. No data is used for advertising, profiling, or sold to third parties.
        </p>

        <h2 style={s.h2}>Third-Party Services</h2>
        <ul style={s.ul}>
          <li style={s.li}><strong>Auth0:</strong> handles authentication and identity. Your login credentials and identity are governed by Auth0's privacy policy.</li>
          <li style={s.li}><strong>Anthropic (Claude API):</strong> certain analysis tools (Alert Triage, Incident Report, Phishing Analyzer, Log Anomaly Explainer) send security event data to the Anthropic API to generate analysis. Data sent is limited to the specific event you submit and is not stored persistently by the platform after the response is returned. Anthropic's data handling is governed by their API terms.</li>
          <li style={s.li}><strong>Threat intelligence providers:</strong> tools such as Threat Intelligence Aggregator, OSINT Recon, and CVE Exploit Mapper send IP addresses, domain names, or file hashes to third-party APIs (VirusTotal, Shodan, AbuseIPDB, IPInfo, Hunter.io) when you actively use those tools. Only data you explicitly submit is sent.</li>
        </ul>
        <p style={s.p}>No data is shared with any third party outside of these service integrations.</p>

        <h2 style={s.h2}>Data Retention</h2>
        <ul style={s.ul}>
          <li style={s.li}><strong>Security event logs:</strong> retained for 90 days by default. You can configure this between 1 and 3,650 days in Configuration.</li>
          <li style={s.li}><strong>Audit log entries:</strong> retained for 365 days by default. You can configure this or disable auto-purge entirely for compliance pipelines.</li>
          <li style={s.li}><strong>Detection rules, alerts, cases:</strong> retained until you delete them or delete your account.</li>
          <li style={s.li}>Automatic purge runs daily. Data older than your configured retention window is permanently deleted.</li>
        </ul>

        <h2 style={s.h2}>Data Security</h2>
        <p style={s.p}>
          We use industry-standard technical and organizational controls to protect your data.
          For a full description of the security measures in place, see our{' '}
          <span style={s.link} onClick={() => navigate('/security')}>Security Practices</span> page.
        </p>

        <h2 style={s.h2}>Your Rights</h2>
        <ul style={s.ul}>
          <li style={s.li}><strong>Export:</strong> download all your event logs as CSV at any time from the Log Search page.</li>
          <li style={s.li}><strong>Delete:</strong> delete your account and all associated data from the Account tab in Configuration. This permanently removes all logs, rules, alerts, cases, and your ingest key. Your Auth0 account is also deleted. Audit log entries are anonymized (user ID replaced with "[deleted]") instead of deleted, as required for security traceability.</li>
          <li style={s.li}><strong>Configure retention:</strong> adjust how long your data is kept at any time in Configuration.</li>
        </ul>

        <h2 style={s.h2}>Contact</h2>
        <p style={s.p}>
          For privacy questions or data requests, contact:{' '}
          <span style={s.muted}>contact@laynekudo.com</span>
        </p>
      </div></div>
    </div>
  );
}
