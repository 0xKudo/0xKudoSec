import { useAuth0 } from '@auth0/auth0-react';

const NO_AUTH_TOOLS = [
  { id: 'decoder',                  route: '/decoder',                  name: 'Decoder',                   desc: 'URL, HTML, Base64, Hex, Binary, ROT13, Unicode, JWT — swap output to input.' },
  { id: 'reverse-shell-generator',  route: '/reverse-shell-generator',  name: 'Reverse Shell Generator',   desc: '20 shell types — Bash, Python, PowerShell, Netcat, and more. Static templates, instant copy.' },
  { id: 'wordlist-generator',       route: '/wordlist-generator',       name: 'Wordlist Generator',         desc: 'Charset + pattern tabs, leet/digits/years rules. Download as .txt.' },
  { id: 'payload-generator',        route: '/payload-generator',        name: 'Payload Generator',          desc: 'XSS, SQLi, CMDi, SSTI, path traversal, XXE, open redirect. Web payload templates.' },
];

const styles = {
  page: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)',
    padding: '32px 24px',
  },
  heading: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: '8px',
  },
  sub: {
    fontSize: '12px',
    color: 'var(--text-subtle)',
    marginBottom: '40px',
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    width: '100%',
    maxWidth: '560px',
    marginBottom: '40px',
  },
  card: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    padding: '20px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
    textAlign: 'left',
  },
  cardName: {
    fontSize: '12px',
    color: 'var(--text-primary)',
    letterSpacing: '0.04em',
    marginBottom: '6px',
    fontWeight: 500,
  },
  cardDesc: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: '1.5',
  },
  divider: {
    width: '100%',
    maxWidth: '560px',
    borderTop: '1px solid var(--border)',
    marginBottom: '24px',
  },
  loginSection: {
    textAlign: 'center',
  },
  loginLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '12px',
  },
  loginBtn: {
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    border: 'none',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '8px 24px',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
};

export function ElectronHome({ onNavigate }) {
  const { loginWithRedirect } = useAuth0();

  return (
    <div style={styles.page}>
      <div style={styles.heading}>// 0xKudo Security Toolkit</div>
      <div style={styles.sub}>Tools available without login</div>

      <div style={styles.grid}>
        {NO_AUTH_TOOLS.map(tool => (
          <div
            key={tool.id}
            style={styles.card}
            onClick={() => onNavigate(tool.route)}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-subtle)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <div style={styles.cardName}>{tool.name}</div>
            <div style={styles.cardDesc}>{tool.desc}</div>
          </div>
        ))}
      </div>

      <div style={styles.divider} />

      <div style={styles.loginSection}>
        <div style={styles.loginLabel}>Sign in for SIEM, alert triage, threat intel, and all 19 tools</div>
        <button style={styles.loginBtn} onClick={() => loginWithRedirect()}>[ login ]</button>
      </div>
    </div>
  );
}
