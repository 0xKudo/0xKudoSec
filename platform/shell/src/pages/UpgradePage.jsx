const DESKTOP_DOWNLOAD_URL = 'https://github.com/0xKudoX/0xKudoSec-releases/releases/download/v1.2.50/0xKudo-Security-Toolkit-Setup-1.2.50.exe';

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '48px 24px',
    textAlign: 'center',
    gap: '24px',
    fontFamily: 'var(--font)',
    color: 'var(--text-primary)',
  },
  eyebrow: {
    fontSize: '11px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: '4px',
    margin: 0,
  },
  heading: {
    fontSize: '22px',
    fontWeight: 500,
    margin: '4px 0 0',
  },
  body: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    maxWidth: '420px',
    lineHeight: 1.6,
    margin: 0,
  },
  divider: {
    width: '40px',
    height: '1px',
    background: 'var(--border)',
  },
  freeBox: {
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '20px 28px',
    maxWidth: '380px',
    width: '100%',
  },
  freeHeading: {
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '8px',
    margin: '0 0 8px',
  },
  freeBody: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    marginBottom: '16px',
    margin: '0 0 16px',
  },
  downloadBtn: {
    display: 'inline-block',
    padding: '8px 18px',
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    textDecoration: 'none',
    fontFamily: 'var(--font)',
  },
  upgradeBtn: {
    padding: '9px 22px',
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
};

export default function UpgradePage() {
  return (
    <div style={styles.page}>
      <div>
        <p style={styles.eyebrow}>SIEM</p>
        <h1 style={styles.heading}>Cloud SIEM requires a paid plan</h1>
      </div>
      <p style={styles.body}>
        The SIEM covers log ingestion, alert queue, case management, and real-time AI analysis. It runs on dedicated cloud infrastructure, and a paid plan covers the server costs.
      </p>

      <button style={styles.upgradeBtn} disabled>
        Upgrade coming soon
      </button>

      <div style={styles.divider} />

      <div style={styles.freeBox}>
        <p style={styles.freeHeading}>Free tier: desktop app</p>
        <p style={styles.freeBody}>
          Download the desktop app to run the full SIEM locally on your machine. All 19 tools included. No data leaves your device.
        </p>
        <a href={DESKTOP_DOWNLOAD_URL} style={styles.downloadBtn}>
          Download for Windows
        </a>
      </div>
    </div>
  );
}
