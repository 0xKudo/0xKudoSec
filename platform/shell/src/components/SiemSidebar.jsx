import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;

const styles = {
  sidebar: {
    width: '240px',
    height: '100%',
    background: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  sectionLabel: {
    padding: '14px 16px 6px',
    fontSize: '10px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--text-subtle)',
  },
  navItem: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    cursor: 'pointer',
    borderLeft: `2px solid ${active ? 'var(--accent-amber)' : 'transparent'}`,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: '12px',
    borderBottom: '1px solid var(--border-subtle)',
    background: active ? 'var(--bg-panel)' : 'transparent',
  }),
  badge: (variant) => ({
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '2px',
    background: variant === 'critical' ? 'var(--severity-critical)' : variant === 'med' ? 'var(--severity-medium)' : 'var(--severity-info)',
    color: '#fff',
    marginLeft: 'auto',
  }),
  toolsLink: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: '12px',
    borderBottom: '1px solid var(--border-subtle)',
    borderLeft: '2px solid transparent',
  },
  footer: {
    marginTop: 'auto',
    borderTop: '1px solid var(--border)',
    padding: '12px 16px',
  },
  footerLink: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    textDecoration: 'none',
    letterSpacing: '0.04em',
  },
};

const NAV = [
  { section: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard' },
  ]},
  { section: 'Detection', items: [
    { id: 'alerts', label: 'Alert Queue' },
    { id: 'rules', label: 'Detection Rules' },
  ]},
  { section: 'Response', items: [
    { id: 'cases', label: 'Cases' },
    { id: 'playbooks', label: 'Playbooks' },
  ]},
  { section: 'Investigate', items: [
    { id: 'logsearch', label: 'Log Search' },
    { id: 'timeline', label: 'Timeline' },
  ]},
  { section: 'System', items: [
    { id: 'configuration', label: 'Configuration' },
    { id: 'auditlog', label: 'Audit Log' },
  ]},
];

function useFluentBitStatus() {
  const [status, setStatus] = useState('UNKNOWN');
  useEffect(() => {
    if (!isElectron) return;
    const poll = () => window.electron.fluentBit.getStatus().then(setStatus).catch(() => {});
    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, []);
  return status;
}

const STATUS_COLOR = {
  RUNNING: '#16a34a',
  STOPPED: '#d97706',
  STARTING: '#60a5fa',
  STOPPING: '#60a5fa',
  NOT_INSTALLED: '#6b7280',
  UNKNOWN: '#6b7280',
};

export function SiemSidebar({ activeView, onNavigate, onSwitchToTools, isAuthenticated }) {
  const navigate = useNavigate();
  const fluentStatus = useFluentBitStatus();
  return (
    <aside style={styles.sidebar}>
      {NAV.map(group => (
        <div key={group.section}>
          <div style={styles.sectionLabel}>{group.section}</div>
          {group.items.map(item => {
            const locked = !isAuthenticated && item.id !== 'configuration' && item.id !== 'dashboard';
            return (
              <div
                key={item.id}
                title={locked ? 'Log in to access this feature.' : undefined}
                style={{
                  ...styles.navItem(activeView === item.id),
                  ...(locked ? { opacity: 0.4, cursor: 'default' } : {}),
                }}
                onClick={() => !locked && onNavigate(item.id)}
                onMouseEnter={e => { if (!locked && activeView !== item.id) { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                onMouseLeave={e => { if (!locked && activeView !== item.id) { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; } }}
              >
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && <span style={styles.badge(item.badge)}>&nbsp;</span>}
              </div>
            );
          })}
        </div>
      ))}

      <div
        style={styles.toolsLink}
        onClick={onSwitchToTools}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        Security Tools ↗
      </div>

      {isElectron && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-subtle)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Agent Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: STATUS_COLOR[fluentStatus] || STATUS_COLOR.UNKNOWN, flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Fluent Bit: {fluentStatus.charAt(0) + fluentStatus.slice(1).toLowerCase().replace('_', ' ')}
            </span>
          </div>
        </div>
      )}

      <div style={styles.footer}>
        <div><span style={{ ...styles.footerLink, cursor: 'pointer' }} onClick={() => navigate('/privacy')}>Privacy Policy</span></div>
        <div style={{ marginTop: '4px' }}><span style={{ ...styles.footerLink, cursor: 'pointer' }} onClick={() => navigate('/security')}>Security Practices</span></div>
        <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.04em', opacity: 0.6 }}>
          v{__APP_VERSION__} &nbsp;·&nbsp; {__BUILD_DATE__}
        </div>
      </div>
    </aside>
  );
}
