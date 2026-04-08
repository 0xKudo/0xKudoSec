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
};

export function SecurityPage() {
  const navigate = useNavigate();

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <span style={s.brand} onClick={() => navigate('/')}>[ 0xKudoSec ]</span>
        <button style={s.back} onClick={() => navigate(-1)}>← Back</button>
      </nav>

      <div style={s.scrollArea}><div style={s.container}>
        <h1 style={s.h1}>Security Practices</h1>
        <div style={s.updated}>Last updated: April 8, 2026</div>

        <p style={s.p}>
          This page describes the technical and organizational security controls in place for the 0xKudoSec platform.
          These controls are designed to meet the requirements of PCI DSS v4.0, SOC 2 Type II, and NIST SP 800-53.
        </p>

        <h2 style={s.h2}>Data Storage</h2>
        <ul style={s.ul}>
          <li style={s.li}>All data is stored in a PostgreSQL database. Each user's data is isolated at the database layer using row-level security policies.</li>
          <li style={s.li}>Database connections use TLS with certificate verification. Unverified connections are rejected.</li>
          <li style={s.li}>Ingest API keys are hashed (SHA-256) before storage. Plaintext keys are never written to the database.</li>
          <li style={s.li}>Audit log rows include tamper-detection hashes that are verified nightly. Any modification to an audit record is detectable.</li>
        </ul>

        <h2 style={s.h2}>Network Security</h2>
        <ul style={s.ul}>
          <li style={s.li}>All traffic is served over HTTPS. HTTP is not accepted.</li>
          <li style={s.li}>Cross-Origin Resource Sharing (CORS) is locked to the platform's own origin. Requests from other origins are rejected.</li>
          <li style={s.li}>HTTP security headers are enforced on all responses, including Content Security Policy, Strict-Transport-Security, X-Frame-Options, and X-Content-Type-Options.</li>
          <li style={s.li}>All API endpoints require a valid authentication token. Unauthenticated requests are rejected.</li>
          <li style={s.li}>All API endpoints are rate-limited to prevent abuse and brute force attacks.</li>
          <li style={s.li}>Dependencies are reviewed for known vulnerabilities on an ongoing basis.</li>
        </ul>

        <h2 style={s.h2}>Authentication and Access Control</h2>
        <ul style={s.ul}>
          <li style={s.li}>Authentication is handled by Auth0 using industry-standard OAuth 2.0 and PKCE flows. Passwords are never handled or stored by the platform.</li>
          <li style={s.li}>Access to privileged features is restricted by role-based access control (RBAC) enforced at both the application and API layers, in accordance with the principle of least privilege.</li>
          <li style={s.li}>Authentication tokens are stored in memory only during a session. They are never written to localStorage, sessionStorage, or any persistent browser storage.</li>
        </ul>

        <h2 style={s.h2}>Desktop App Security</h2>
        <ul style={s.ul}>
          <li style={s.li}>Locally stored application data (preferences and settings) is encrypted at rest using Windows Data Protection API (DPAPI), which ties encryption to the operating system user account and machine.</li>
          <li style={s.li}>Access to sensitive configuration features requires a user-set PIN. The PIN is stored as a salted scrypt hash. The plaintext PIN is never stored.</li>
          <li style={s.li}>A separate recovery passphrase (also scrypt-hashed) is required at PIN setup and can be used to reset the PIN without reinstalling the application.</li>
          <li style={s.li}>Repeated incorrect PIN entries trigger a timed lockout to prevent brute force access.</li>
        </ul>

        <h2 style={s.h2}>Audit Logging</h2>
        <ul style={s.ul}>
          <li style={s.li}>All privileged actions are recorded in a tamper-evident audit log, including authentication events, rule changes, key rotations, exports, case activity, and account deletion.</li>
          <li style={s.li}>Audit log entries are retained for 365 days by default and can be configured for longer retention to meet compliance pipeline requirements.</li>
          <li style={s.li}>When an account is deleted, audit log entries are anonymized rather than deleted, preserving the security record without retaining personal identity data.</li>
        </ul>

        <h2 style={s.h2}>Contact</h2>
        <p style={s.p}>
          For security questions or to report a vulnerability, contact:{' '}
          <span style={s.muted}>contact@laynekudo.com</span>
        </p>
      </div></div>
    </div>
  );
}
