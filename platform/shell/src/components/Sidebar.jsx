import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Settings, Database, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTools } from '../context/ToolRegistry';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile';
import { PHASES } from '../lib/phases';
import { toolIcon, PHASE_ICONS } from '../lib/toolIcons';

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;
const COLLAPSE_KEY = 'cybertools_sidebar_collapsed';

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

const RAIL_W = '52px';
const FULL_W = '240px';

const styles = {
  sidebar: (collapsed) => ({
    width: collapsed ? RAIL_W : FULL_W,
    height: '100%',
    background: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    boxSizing: 'border-box',
    transition: 'width var(--dur-base, 200ms) ease',
  }),
  sectionLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '12px',
    letterSpacing: '0.02em',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border-subtle)',
    userSelect: 'none',
    transition: 'background var(--dur-fast, 150ms) ease, color var(--dur-fast, 150ms) ease',
  },
  sectionLabelInner: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 },
  chevron: (open) => ({
    fontSize: '9px',
    color: 'var(--text-subtle)',
    transform: open ? 'rotate(90deg)' : 'none',
    transition: 'transform 0.15s',
    flexShrink: 0,
  }),
  navItem: (active, collapsed) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: collapsed ? '11px 0' : '10px 16px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    cursor: 'pointer',
    borderLeft: `2px solid ${active ? 'var(--accent-amber)' : 'transparent'}`,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: '12px',
    borderBottom: '1px solid var(--border-subtle)',
    background: active ? 'var(--active-bg)' : 'transparent',
    transition: 'background var(--dur-fast, 150ms) ease, color var(--dur-fast, 150ms) ease',
  }),
  icon: (active) => ({
    flexShrink: 0,
    display: 'flex',
    color: active ? 'var(--accent-amber)' : 'inherit',
  }),
  label: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
  comingSoonItem: (collapsed) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: collapsed ? '11px 0' : '10px 16px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderLeft: '2px solid transparent',
    color: 'var(--text-subtle)',
    fontSize: '12px',
    borderBottom: '1px solid var(--border-subtle)',
    opacity: 0.5,
  }),
  siemLink: (collapsed) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: collapsed ? '11px 0' : '10px 16px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: '12px',
    borderBottom: '1px solid var(--border-subtle)',
    borderLeft: '2px solid transparent',
    transition: 'background var(--dur-fast, 150ms) ease, color var(--dur-fast, 150ms) ease',
  }),
  collapseBtn: (collapsed) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    padding: collapsed ? '11px 0' : '10px 16px',
    background: 'none',
    border: 'none',
    borderTop: '1px solid var(--border-subtle)',
    color: 'var(--text-subtle)',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    cursor: 'pointer',
    width: '100%',
    letterSpacing: '0.04em',
    transition: 'color var(--dur-fast, 150ms) ease',
  }),
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
  const isMobile = useIsMobile();
  const [openSections, setOpenSections] = useState(() => {
    // Auto-open the phase that contains the current route.
    const active = PHASES.find(p => p.routes.includes(location.pathname));
    return active ? { [active.id]: true } : {};
  });
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [toast, setToast] = useState(false);

  // Collapse is a desktop affordance only; the mobile drawer is always full width.
  const isCollapsed = collapsed && !isMobile;

  const toggleCollapsed = () => {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const showToast = () => {
    setToast(true);
    setTimeout(() => setToast(false), 2000);
  };

  const toggleSection = (id) => setOpenSections(s => ({ ...s, [id]: !s[id] }));

  const dashActive = location.pathname === '/dashboard';

  return (
    <aside style={styles.sidebar(isCollapsed)}>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', padding: '8px 16px', zIndex: 300, whiteSpace: 'nowrap' }}>
          Log in to access this feature.
        </div>
      )}

      {/* Dashboard */}
      <div
        style={styles.navItem(dashActive, isCollapsed)}
        title={isCollapsed ? 'Dashboard' : undefined}
        onClick={() => navigate('/dashboard')}
        onMouseEnter={e => { if (!dashActive) { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
        onMouseLeave={e => { if (!dashActive) { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; } }}
      >
        <span style={styles.icon(dashActive)}><LayoutDashboard size={16} strokeWidth={1.75} /></span>
        {!isCollapsed && <span style={styles.label}>Dashboard</span>}
      </div>

      {PHASES.map(phase => {
        const phaseTools = tools.filter(t => phase.routes.includes(t.route));
        const isOpen = !!openSections[phase.id];
        const PhaseIcon = PHASE_ICONS[phase.id];

        // Collapsed rail: skip section toggles, render tool icons flat.
        if (isCollapsed) {
          return (
            <div key={phase.id}>
              {phaseTools.map(tool => {
                const isActive = location.pathname === tool.route;
                const isComingSoon = tool.status === 'coming-soon';
                const isLocked = tool.requiresAuth && !isAuthenticated;
                const Icon = toolIcon(tool.route);
                return (
                  <div
                    key={tool.id}
                    title={isLocked ? `${tool.name} (log in to access)` : tool.name}
                    style={{ ...styles.navItem(isActive, true), ...(isLocked ? { opacity: 0.4, cursor: 'default' } : {}) }}
                    onClick={() => { if (isLocked) { showToast(); return; } if (!isComingSoon) navigate(tool.route); }}
                    onMouseEnter={e => { if (!isActive && !isLocked) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { if (!isActive && !isLocked) e.currentTarget.style.background = ''; }}
                  >
                    <span style={styles.icon(isActive)}><Icon size={16} strokeWidth={1.75} /></span>
                  </div>
                );
              })}
            </div>
          );
        }

        return (
          <div key={phase.id}>
            <div
              style={styles.sectionLabel}
              onClick={() => toggleSection(phase.id)}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <span style={styles.sectionLabelInner}>
                {PhaseIcon && <PhaseIcon size={14} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--text-subtle)' }} />}
                <span style={styles.label}>{phase.label}</span>
              </span>
              <span style={styles.chevron(isOpen)}>&#9654;</span>
            </div>
            {isOpen && phaseTools.map(tool => {
              const isActive = location.pathname === tool.route;
              const isComingSoon = tool.status === 'coming-soon';
              const isLocked = tool.requiresAuth && !isAuthenticated;
              const Icon = toolIcon(tool.route);
              return (
                <div
                  key={tool.id}
                  title={isLocked ? 'Log in to access this feature.' : undefined}
                  style={{
                    ...styles.navItem(isActive, false),
                    ...(isLocked ? { opacity: 0.4, cursor: 'default' } : {}),
                  }}
                  onClick={() => { if (isLocked) { showToast(); return; } if (!isComingSoon) navigate(tool.route); }}
                  onMouseEnter={e => { if (!isActive && !isLocked) { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                  onMouseLeave={e => { if (!isActive && !isLocked) { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                >
                  <span style={styles.icon(isActive)}><Icon size={15} strokeWidth={1.75} /></span>
                  <span style={styles.label}>{tool.name}</span>
                </div>
              );
            })}
            {isOpen && (phase.comingSoon || []).map(name => (
              <div key={name} style={styles.comingSoonItem(false)}>
                <span style={styles.icon(false)}><Settings size={15} strokeWidth={1.75} /></span>
                <span style={styles.label}>{name}</span>
              </div>
            ))}
          </div>
        );
      })}

      <div
        style={styles.siemLink(isCollapsed)}
        title={isCollapsed ? 'Configuration' : undefined}
        onClick={() => onSwitchToSiemView?.('configuration')}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <span style={styles.icon(false)}><Settings size={15} strokeWidth={1.75} /></span>
        {!isCollapsed && <span style={styles.label}>Configuration</span>}
      </div>
      <div
        style={styles.siemLink(isCollapsed)}
        title={isCollapsed ? 'SIEM' : undefined}
        onClick={onSwitchToSiem}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <span style={styles.icon(false)}><Database size={15} strokeWidth={1.75} /></span>
        {!isCollapsed && <span style={styles.label}>SIEM</span>}
      </div>

      {isElectron && !isCollapsed && (
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

      {!isCollapsed && (
        <div style={styles.footer}>
          <div><span style={{ ...styles.footerLink, cursor: 'pointer' }} onClick={() => navigate('/privacy')}>Privacy Policy</span></div>
          <div style={{ marginTop: '4px' }}><span style={{ ...styles.footerLink, cursor: 'pointer' }} onClick={() => navigate('/security')}>Security Practices</span></div>
          <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.04em', opacity: 0.6 }}>
            v{__APP_VERSION__} &nbsp;&nbsp;&nbsp; {__BUILD_DATE__}
          </div>
        </div>
      )}

      {/* Collapse toggle (desktop only) */}
      {!isMobile && (
        <button
          style={{ ...styles.collapseBtn(isCollapsed), marginTop: isCollapsed ? 'auto' : 0 }}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={toggleCollapsed}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-subtle)'; }}
        >
          {isCollapsed
            ? <PanelLeftOpen size={16} strokeWidth={1.75} />
            : <><PanelLeftClose size={16} strokeWidth={1.75} /><span style={styles.label}>Collapse</span></>}
        </button>
      )}
    </aside>
  );
}
