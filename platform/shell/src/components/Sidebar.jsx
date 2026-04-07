import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTools } from '../context/ToolRegistry';
import { useAuth0 } from '@auth0/auth0-react';

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;

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

const PHASES = [
  {
    id: 'detect',
    label: 'Detect',
    routes: ['/alert-triage', '/threat-intel', '/log-anomaly-explainer', '/network-threat-analyzer', '/phishing-analyzer'],
  },
  {
    id: 'investigate',
    label: 'Investigate',
    routes: ['/osint-recon', '/cve-exploit-mapper', '/payload-obfuscation-explainer', '/decoder', '/subdomain-enumerator', '/network-scanner'],
  },
  {
    id: 'report',
    label: 'Report',
    routes: ['/incident-report'],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    routes: ['/security-policy-translator'],
  },
  {
    id: 'simulate',
    label: 'Simulate / Test',
    routes: ['/reverse-shell-generator', '/intruder', '/scanner', '/wordlist-generator', '/http-repeater', '/payload-generator'],
    comingSoon: ['Proxy'],
  },
];

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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    fontSize: '12px',
    letterSpacing: '0.02em',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border-subtle)',
    userSelect: 'none',
  },
  chevron: (open) => ({
    fontSize: '9px',
    color: 'var(--text-subtle)',
    transform: open ? 'rotate(90deg)' : 'none',
    transition: 'transform 0.15s',
  }),
  navItem: (active) => ({
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    cursor: 'pointer',
    borderLeft: `2px solid ${active ? 'var(--accent-amber)' : 'transparent'}`,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: '12px',
    borderBottom: '1px solid var(--border-subtle)',
    background: active ? 'var(--bg-panel)' : 'transparent',
  }),
  comingSoonItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderLeft: '2px solid transparent',
    color: 'var(--text-subtle)',
    fontSize: '12px',
    borderBottom: '1px solid var(--border-subtle)',
    opacity: 0.5,
  },
  siemLink: {
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

export function Sidebar({ onSwitchToSiem, onSwitchToSiemView }) {
  const tools = useTools();
  const navigate = useNavigate();
  const location = useLocation();
  const fluentStatus = useFluentBitStatus();
  const { isAuthenticated } = useAuth0();
  const [openSections, setOpenSections] = useState({});
  const [toast, setToast] = useState(false);

  const showToast = () => {
    setToast(true);
    setTimeout(() => setToast(false), 2000);
  };

  const toggleSection = (id) => setOpenSections(s => ({ ...s, [id]: !s[id] }));

  return (
    <aside style={styles.sidebar}>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', padding: '8px 16px', zIndex: 300, whiteSpace: 'nowrap' }}>
          Log in to access this feature.
        </div>
      )}
      <div
        style={styles.navItem(location.pathname === '/dashboard')}
        onClick={() => navigate('/dashboard')}
        onMouseEnter={e => { if (location.pathname !== '/dashboard') { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
        onMouseLeave={e => { if (location.pathname !== '/dashboard') { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; } }}
      >
        Dashboard
      </div>
      {PHASES.map(phase => {
        const phaseTools = tools.filter(t => phase.routes.includes(t.route));
        const isOpen = !!openSections[phase.id];

        return (
          <div key={phase.id}>
            <div
              style={styles.sectionLabel}
              onClick={() => toggleSection(phase.id)}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <span>{phase.label}</span>
              <span style={styles.chevron(isOpen)}>&#9654;</span>
            </div>
            {isOpen && phaseTools.map(tool => {
              const isActive = location.pathname === tool.route;
              const isComingSoon = tool.status === 'coming-soon';
              const isLocked = tool.requiresAuth && !isAuthenticated;
              return (
                <div
                  key={tool.id}
                  title={isLocked ? 'Log in to access this feature.' : undefined}
                  style={{
                    ...styles.navItem(isActive),
                    ...(isLocked ? { opacity: 0.4, cursor: 'default' } : {}),
                  }}
                  onClick={() => { if (isLocked) { showToast(); return; } if (!isComingSoon) navigate(tool.route); }}
                  onMouseEnter={e => { if (!isActive && !isLocked) { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                  onMouseLeave={e => { if (!isActive && !isLocked) { e.currentTarget.style.background = isActive ? 'var(--bg-panel)' : ''; e.currentTarget.style.color = isActive ? 'var(--text-primary)' : 'var(--text-muted)'; } }}
                >
                  {tool.name}
                </div>
              );
            })}
            {isOpen && (phase.comingSoon || []).map(name => (
              <div key={name} style={styles.comingSoonItem}>{name}</div>
            ))}
          </div>
        );
      })}

      <div
        style={styles.siemLink}
        onClick={() => onSwitchToSiemView?.('configuration')}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        Configuration ↗
      </div>
      <div
        style={styles.siemLink}
        onClick={onSwitchToSiem}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        SIEM ↗
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
        <span style={{ ...styles.footerLink, cursor: 'pointer' }} onClick={() => navigate('/privacy')}>Privacy Policy</span>
        <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.04em', opacity: 0.6 }}>
          v{__APP_VERSION__} &nbsp;·&nbsp; {__BUILD_DATE__}
        </div>
      </div>
    </aside>
  );
}
