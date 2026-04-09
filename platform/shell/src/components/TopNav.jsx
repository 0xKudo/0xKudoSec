import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile';
import { useLocation } from 'react-router-dom';

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;

// ── Update this URL with each Electron release ────────────────────────────────
const DESKTOP_DOWNLOAD_URL = 'https://github.com/0xKudoX/0xKudoSec-releases/releases/download/v1.2.16/0xKudo-Security-Toolkit-Setup-1.2.16.exe';

const styles = {
  nav: {
    background: 'var(--bg-sidebar)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'stretch',
    flexShrink: 0,
    height: '44px',
    zIndex: 100,
    WebkitAppRegion: isElectron ? 'drag' : 'auto',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    fontSize: '16px',
    fontWeight: 'bold',
    color: 'var(--text-primary)',
    letterSpacing: '0.04em',
    borderRight: '1px solid var(--border)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  appTab: (active) => ({
    display: 'flex',
    alignItems: 'center',
    padding: '0 24px',
    fontSize: '12px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: active ? 'var(--accent-amber)' : 'var(--text-muted)',
    cursor: 'pointer',
    borderRight: '1px solid var(--border)',
    borderBottom: active ? '2px solid var(--accent-amber)' : '2px solid transparent',
    background: active ? 'var(--bg-primary)' : 'transparent',
    userSelect: 'none',
    transition: 'color 0.1s',
  }),
  right: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '0 16px',
  },
  themeToggle: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    padding: '4px 10px',
    cursor: 'pointer',
  },
  authBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    padding: '4px 10px',
    cursor: 'pointer',
  },
  userName: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  backLink: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    textDecoration: 'none',
  },
  noDrag: {
    WebkitAppRegion: 'no-drag',
  },
  winControls: {
    display: 'flex',
    alignItems: 'stretch',
    marginLeft: '8px',
    WebkitAppRegion: 'no-drag',
  },
  winBtn: (hover) => ({
    background: hover || 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    width: '40px',
    height: '100%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
};

function UpdateBanner() {
  const [state, setState] = useState(null); // null | 'available' | 'downloading' | 'ready' | 'error'
  const [version, setVersion] = useState('');
  const [percent, setPercent] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isElectron || !window.electron.updater) return;
    window.electron.updater.onUpdateAvailable((info) => { setVersion(info.version); setState('available'); });
    window.electron.updater.onProgress((info) => { setPercent(info.percent); setState('downloading'); });
    window.electron.updater.onReady(() => setState('ready'));
    window.electron.updater.onError(() => setState('error'));
    window.electron.updater.onDismissed(() => setDismissed(true));
    // Check if update-available fired before this component mounted
    window.electron.updater.checkPending().then(info => {
      if (info) { setVersion(info.version); setState('available'); }
    });
  }, []);

  if (!isElectron || dismissed || !state) return null;

  const bannerStyle = {
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--accent-amber)',
    padding: '6px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '11px',
    color: 'var(--accent-amber)',
    flexShrink: 0,
  };

  const dismissBtn = { background: 'none', border: 'none', color: 'var(--accent-amber)', fontFamily: 'var(--font)', fontSize: '11px', cursor: 'pointer', opacity: 0.7 };
  const actionBtn = { background: 'none', border: '1px solid var(--accent-amber)', color: 'var(--accent-amber)', fontFamily: 'var(--font)', fontSize: '11px', padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.04em' };

  if (state === 'available') return (
    <div style={bannerStyle}>
      <span>Update available — v{version}</span>
      <button style={actionBtn} onClick={() => window.electron.updater.download()}>Download</button>
      <button style={dismissBtn} onClick={() => { setDismissed(true); window.electron.updater.dismiss(); }}>✕</button>
    </div>
  );

  if (state === 'downloading') return (
    <div style={bannerStyle}>
      <span>Downloading update... {percent}%</span>
      <div style={{ flex: 1, maxWidth: '120px', height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent-amber)', borderRadius: '2px', transition: 'width 0.2s' }} />
      </div>
    </div>
  );

  if (state === 'ready') return (
    <div style={bannerStyle}>
      <span>Update ready to install</span>
      <button style={actionBtn} onClick={() => window.electron.updater.install()}>Restart & Install</button>
      <button style={dismissBtn} onClick={() => setDismissed(true)}>later</button>
    </div>
  );

  if (state === 'error') return (
    <div style={bannerStyle}>
      <span>Update check failed</span>
      <button style={dismissBtn} onClick={() => setDismissed(true)}>✕</button>
    </div>
  );

  return null;
}

export function TopNav({ activeApp, onSwitchApp, onMenuToggle, menuOpen, theme, setTheme }) {
  const [closeHover, setCloseHover] = useState(false);
  const { isAuthenticated, user, loginWithRedirect, logout } = useAuth0();
  const isMobile = useIsMobile();

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <>
    <UpdateBanner />
    <nav style={styles.nav}>
      {isMobile ? (
        <>
          <button
            onClick={onMenuToggle}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
          <div style={{ ...styles.brand, borderRight: 'none', fontSize: '12px', padding: '0 6px', letterSpacing: '0.02em' }}>[ 0xKudo ]</div>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {['siem', 'tools'].map(app => (
              <div key={app} style={{ ...styles.appTab(activeApp === app), padding: '0 12px' }} onClick={() => onSwitchApp(app)}>
                {app === 'siem' ? 'SIEM' : 'Tools'}
              </div>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px', flexShrink: 0 }}>
            {isAuthenticated ? (
              <button style={{ ...styles.authBtn, padding: '4px 8px', fontSize: '10px' }} onClick={() => isElectron ? logout({ openUrl: false }) : logout({ logoutParams: { returnTo: window.location.origin } })}>logout</button>
            ) : (
              <button style={{ ...styles.authBtn, padding: '4px 8px', fontSize: '10px' }} onClick={() => loginWithRedirect()}>login</button>
            )}
            <button style={{ ...styles.themeToggle, padding: '4px 8px' }} onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
          </div>
        </>
      ) : (
        <>
          <div style={styles.brand}>[ 0xKudo ]</div>
          <div style={{ display: 'flex', alignItems: 'stretch', WebkitAppRegion: 'no-drag' }}>
            {['siem', 'tools'].map(app => (
              <div
                key={app}
                style={styles.appTab(activeApp === app)}
                onClick={() => onSwitchApp(app)}
                onMouseEnter={e => { if (activeApp !== app) e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { if (activeApp !== app) e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                {app === 'siem' ? 'SIEM' : 'Tools'}
              </div>
            ))}
          </div>
          <div style={{ ...styles.right, WebkitAppRegion: 'no-drag' }}>
            {!isElectron && (
              <a
                href={DESKTOP_DOWNLOAD_URL}
                style={{ fontSize: '11px', color: 'var(--accent-amber)', textDecoration: 'none', letterSpacing: '0.04em', whiteSpace: 'nowrap', border: '1px solid var(--accent-amber)', padding: '4px 10px' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-amber)'; e.currentTarget.style.color = 'var(--bg-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--accent-amber)'; }}
              >↓ Desktop App</a>
            )}
            {isAuthenticated ? (
              <>
                <span style={styles.userName}>{user.name || user.email}</span>
                <button style={styles.authBtn} onClick={() => isElectron ? logout({ openUrl: false }) : logout({ logoutParams: { returnTo: window.location.origin } })}>[ logout ]</button>
              </>
            ) : (
              <button style={styles.authBtn} onClick={() => loginWithRedirect()}>[ login ]</button>
            )}
            <button style={styles.themeToggle} onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
          </div>
          {isElectron && (
            <div style={styles.winControls}>
              <button
                style={styles.winBtn()}
                title="Minimize"
                onClick={() => window.electron.window.minimize()}
              >─</button>
              <button
                style={styles.winBtn()}
                title="Maximize"
                onClick={() => window.electron.window.maximize()}
              >□</button>
              <button
                style={styles.winBtn(closeHover ? '#c42b1c' : undefined)}
                title="Close"
                onMouseEnter={() => setCloseHover(true)}
                onMouseLeave={() => setCloseHover(false)}
                onClick={() => window.electron.window.close()}
              >✕</button>
            </div>
          )}
        </>
      )}
    </nav>
    </>
  );
}

// ── Shared tab row styles ─────────────────────────────────────────────────────

const rowStyles = {
  row: {
    background: 'var(--bg-sidebar)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'stretch',
    flexShrink: 0,
    height: '36px',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  tab: (active) => ({
    display: 'flex',
    alignItems: 'center',
    padding: '0 18px',
    fontSize: '11px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: active ? 'var(--accent-amber)' : 'var(--text-muted)',
    cursor: 'pointer',
    borderBottom: active ? '2px solid var(--accent-amber)' : '2px solid transparent',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    flexShrink: 0,
    transition: 'color 0.1s',
  }),
};

// ── SIEM view id → display label ─────────────────────────────────────────────

const SIEM_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'alerts',    label: 'Alerts' },
  { id: 'rules',     label: 'Detection Rules' },
  { id: 'logsearch', label: 'Log Search' },
  { id: 'cases',     label: 'Cases' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'auditlog',  label: 'Audit Log' },
];

const TOOL_CATEGORIES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'detect',    label: 'Detect' },
  { id: 'investigate', label: 'Investigate' },
  { id: 'report',    label: 'Report' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'simulate',  label: 'Simulate / Test' },
  { id: 'config',    label: 'Config ↗' },
];

// Row 2 — category / view tabs
export function CategoryBar({ activeApp, activeCategory, siemView, onSelectCategory, onSiemNavigate }) {
  const tabs = activeApp === 'siem' ? SIEM_TABS : TOOL_CATEGORIES;

  return (
    <div style={rowStyles.row}>
      {tabs.map(tab => {
        const active = activeApp === 'siem'
          ? siemView === tab.id
          : activeCategory === tab.id;
        return (
          <div
            key={tab.id}
            style={rowStyles.tab(active)}
            onClick={() => {
              if (activeApp === 'siem') {
                onSiemNavigate(tab.id);
              } else if (tab.id === 'config') {
                onSiemNavigate('configuration');
              } else {
                onSelectCategory(tab.id);
              }
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            {tab.label}
          </div>
        );
      })}
    </div>
  );
}

// Phase id → tool routes (mirrors Sidebar.jsx PHASES)
const PHASES = [
  { id: 'detect',      routes: ['/alert-triage', '/threat-intel', '/log-anomaly-explainer', '/network-threat-analyzer', '/phishing-analyzer'] },
  { id: 'investigate', routes: ['/osint-recon', '/cve-exploit-mapper', '/payload-obfuscation-explainer', '/decoder', '/subdomain-enumerator', '/network-scanner'] },
  { id: 'report',      routes: ['/incident-report'] },
  { id: 'compliance',  routes: ['/security-policy-translator'] },
  { id: 'simulate',    routes: ['/reverse-shell-generator', '/intruder', '/scanner', '/wordlist-generator', '/http-repeater', '/payload-generator'], comingSoon: ['Proxy'] },
];

// Row 3 — tool tabs for the active category
export function ToolBar({ activeCategory, tools, onNavigate }) {
  const location = useLocation();
  const phase = PHASES.find(p => p.id === activeCategory);
  if (!phase) return null;

  const phaseTabs = phase.routes.map(route => {
    const tool = tools.find(t => t.route === route);
    return tool ? { name: tool.name, route } : null;
  }).filter(Boolean);

  const comingSoonTabs = (phase.comingSoon || []).map(name => ({ name, route: null }));
  const allTabs = [...phaseTabs, ...comingSoonTabs];

  if (allTabs.length === 0) return null;

  return (
    <div style={{ ...rowStyles.row, background: 'var(--bg-primary)' }}>
      {allTabs.map(tab => {
        const active = tab.route && location.pathname === tab.route;
        return (
          <div
            key={tab.name}
            style={{
              ...rowStyles.tab(active),
              color: tab.route ? (active ? 'var(--accent-amber)' : 'var(--text-muted)') : 'var(--text-subtle)',
              cursor: tab.route ? 'pointer' : 'default',
            }}
            onClick={() => tab.route && onNavigate(tab.route)}
            onMouseEnter={e => { if (tab.route && !active) e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { if (tab.route && !active) e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            {tab.name}{!tab.route ? ' (soon)' : ''}
          </div>
        );
      })}
    </div>
  );
}
