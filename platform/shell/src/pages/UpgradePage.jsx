import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const DESKTOP_DOWNLOAD_URL = 'https://github.com/0xKudoX/0xKudoSec-releases/releases/download/v1.2.55/0xKudo-Security-Toolkit-Setup-1.2.55.exe';

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
  planRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  planBtn: {
    padding: '10px 24px',
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    minWidth: '140px',
  },
  successBox: {
    border: '1px solid var(--severity-low)',
    borderRadius: '6px',
    padding: '16px 24px',
    maxWidth: '380px',
    fontSize: '13px',
    color: 'var(--severity-low)',
    lineHeight: 1.6,
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
    margin: '0 0 8px',
  },
  freeBody: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: 1.5,
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
  errorText: {
    fontSize: '12px',
    color: 'var(--severity-critical)',
    margin: 0,
  },
};

export default function UpgradePage() {
  const { getAccessTokenSilently } = useAuth0();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const upgraded = searchParams.get('upgraded') === '1';
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!upgraded) return;
    setRefreshing(true);
    // Give the webhook a moment to assign the role, then force a fresh token
    const timer = setTimeout(async () => {
      try {
        await getAccessTokenSilently({ cacheMode: 'off' });
        navigate('/siem', { replace: true });
      } catch {
        setRefreshing(false);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [upgraded]);

  async function startCheckout(plan) {
    setLoading(plan);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout');
      window.location.href = data.url;
      // In Electron, will-navigate intercepts this and opens the browser externally.
      // The component stays mounted, so reset loading state.
      if (window.electron?.isElectron) setLoading(null);
    } catch (e) {
      setError(e.message);
      setLoading(null);
    }
  }

  return (
    <div style={styles.page}>
      <div>
        <p style={styles.eyebrow}>SIEM</p>
        <h1 style={styles.heading}>Cloud SIEM requires a paid plan</h1>
      </div>

      <p style={styles.body}>
        The SIEM covers log ingestion, alert queue, case management, and real-time AI analysis. It runs on dedicated cloud infrastructure, and a paid plan covers the server costs.
      </p>

      {upgraded ? (
        <div style={styles.successBox}>
          {refreshing ? 'Payment successful. Activating your plan...' : 'Payment successful. Redirecting...'}
        </div>
      ) : (
        <>
          <div style={styles.planRow}>
            <button
              style={{ ...styles.planBtn, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
              onClick={() => startCheckout('monthly')}
              disabled={!!loading}
            >
              {loading === 'monthly' ? 'Loading...' : 'Monthly plan'}
            </button>
            <button
              style={{ ...styles.planBtn, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
              onClick={() => startCheckout('yearly')}
              disabled={!!loading}
            >
              {loading === 'yearly' ? 'Loading...' : 'Yearly plan'}
            </button>
          </div>
          {error && <p style={styles.errorText}>{error}</p>}
        </>
      )}

      <div style={styles.divider} />

      <div style={styles.freeBox}>
        <p style={styles.freeHeading}>Free tier: desktop app</p>
        <p style={styles.freeBody}>
          Download the desktop app to run the full SIEM locally on your machine.<br />
          All 19 tools included.<br />
          No data leaves your device.
        </p>
        <a href={DESKTOP_DOWNLOAD_URL} style={styles.downloadBtn}>
          Download for Windows
        </a>
      </div>
    </div>
  );
}
