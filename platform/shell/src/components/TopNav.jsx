import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile';

const styles = {
  nav: {
    background: 'var(--bg-sidebar)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'stretch',
    flexShrink: 0,
    height: '44px',
    zIndex: 100,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    fontSize: '14px',
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
};

export function TopNav({ activeApp, onSwitchApp, onMenuToggle, menuOpen }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('cybertools_theme') || 'dark';
  });
  const { isAuthenticated, user, loginWithRedirect, logout } = useAuth0();
  const isMobile = useIsMobile();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cybertools_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <nav style={styles.nav}>
      {isMobile ? (
        <>
          <button
            onClick={onMenuToggle}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
          <div style={{ ...styles.brand, borderRight: 'none', fontSize: '12px', padding: '0 8px' }}>// 0xKudo</div>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {['siem', 'tools'].map(app => (
              <div key={app} style={{ ...styles.appTab(activeApp === app), padding: '0 12px' }} onClick={() => onSwitchApp(app)}>
                {app === 'siem' ? 'SIEM' : 'Tools'}
              </div>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px', flexShrink: 0 }}>
            {isAuthenticated ? (
              <button style={{ ...styles.authBtn, padding: '4px 8px', fontSize: '10px' }} onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>out</button>
            ) : (
              <button style={{ ...styles.authBtn, padding: '4px 8px', fontSize: '10px' }} onClick={() => loginWithRedirect()}>login</button>
            )}
            <button style={{ ...styles.themeToggle, padding: '4px 8px' }} onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
          </div>
        </>
      ) : (
        <>
          <div style={styles.brand}>// 0xKudo Security Platform</div>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
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
          <div style={styles.right}>
            {isAuthenticated ? (
              <>
                <span style={styles.userName}>{user.name || user.email}</span>
                <button style={styles.authBtn} onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>[ logout ]</button>
              </>
            ) : (
              <button style={styles.authBtn} onClick={() => loginWithRedirect()}>[ login ]</button>
            )}
            <button style={styles.themeToggle} onClick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
          </div>
        </>
      )}
    </nav>
  );
}
