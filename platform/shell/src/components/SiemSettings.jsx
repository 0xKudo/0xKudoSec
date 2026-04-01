import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

const s = {
  container: { padding: '24px 28px', maxWidth: '560px' },
  header: {
    fontSize: '11px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--text-subtle)',
    marginBottom: '20px',
  },
  section: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    padding: '20px',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '12px',
    color: 'var(--text-primary)',
    letterSpacing: '0.04em',
    marginBottom: '8px',
  },
  sectionDesc: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '16px',
    lineHeight: '1.5',
  },
  row: { display: 'flex', alignItems: 'center', gap: '12px' },
  input: {
    width: '80px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
  },
  label: { fontSize: '12px', color: 'var(--text-muted)' },
  btn: {
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    border: 'none',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    padding: '6px 16px',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  status: (ok) => ({
    fontSize: '11px',
    color: ok ? 'var(--severity-low)' : 'var(--severity-critical)',
    marginTop: '10px',
  }),
};

export function SiemSettings() {
  const { getAccessTokenSilently } = useAuth0();
  const [retentionDays, setRetentionDays] = useState('');
  const [saved, setSaved] = useState(null); // null | 'ok' | 'error'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await fetch('/api/siem/settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setRetentionDays(String(data.log_retention_days ?? 90));
      } catch {
        setRetentionDays('90');
      } finally {
        setLoading(false);
      }
    })();
  }, [getAccessTokenSilently]);

  async function save() {
    setSaved(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/settings', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_retention_days: parseInt(retentionDays, 10) }),
      });
      setSaved(res.ok ? 'ok' : 'error');
    } catch {
      setSaved('error');
    }
  }

  return (
    <div style={s.container}>
      <div style={s.header}>Settings</div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Log Retention</div>
        <div style={s.sectionDesc}>
          Logs older than this will be automatically purged each night. Applies to your events only.
          Min 1 day, max 3650 days (10 years).
        </div>
        {loading ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading...</div>
        ) : (
          <>
            <div style={s.row}>
              <input
                style={s.input}
                type="number"
                min="1"
                max="3650"
                value={retentionDays}
                onChange={e => { setRetentionDays(e.target.value); setSaved(null); }}
              />
              <span style={s.label}>days</span>
              <button style={s.btn} onClick={save}>Save</button>
            </div>
            {saved === 'ok' && <div style={s.status(true)}>Saved.</div>}
            {saved === 'error' && <div style={s.status(false)}>Failed to save. Check value and try again.</div>}
          </>
        )}
      </div>
    </div>
  );
}
