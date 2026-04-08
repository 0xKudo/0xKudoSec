import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ToolRegistryProvider, useTools } from './context/ToolRegistry';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { TopNav } from './components/TopNav';
import { Sidebar } from './components/Sidebar';
import { SiemSidebar } from './components/SiemSidebar';
import { Dashboard, trackToolVisit } from './components/Dashboard';
import { DashboardMobile } from './components/DashboardMobile';
import { SiemDashboard } from './components/SiemDashboard';
import { SiemDashboardMobile } from './components/SiemDashboardMobile';
import { AlertQueue } from './components/AlertQueue';
import { DetectionRules } from './components/DetectionRules';
import { LogSearch } from './components/LogSearch';
import { Cases } from './components/Cases';
import { SiemConfiguration } from './components/SiemConfiguration';
import { AuditLog } from './components/AuditLog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RequireAuth } from './components/RequireAuth';
import { LandingPage } from './pages/LandingPage';
import { ElectronHome } from './pages/ElectronHome';
import { PrivacyPage } from './pages/PrivacyPage';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from './hooks/useIsMobile';
import './styles/theme.css';

const styles = {
  layout: { display: 'flex', flexDirection: 'column', height: '100%' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  content: { flex: 1, overflow: 'auto' },
  overlay: {
    position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 201,
    width: '240px',
  },
  overlayBackdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
  },
  overlayDrawer: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: 'var(--bg-sidebar)', overflowY: 'auto',
  },
};

const toolModuleCache = {};

function ToolLoader({ toolId }) {
  const [Component, setComponent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (toolModuleCache[toolId]) {
      setComponent(() => toolModuleCache[toolId]);
      return;
    }
    import(`../../../tools/${toolId}/client/index.jsx`)
      .then(mod => {
        toolModuleCache[toolId] = mod.default;
        setComponent(() => mod.default);
        trackToolVisit(toolId);
      })
      .catch(err => setError(err.message));
  }, [toolId]);

  if (error) return <p style={{ color: 'var(--severity-critical)' }}>{error}</p>;
  if (!Component) return <p style={{ color: 'var(--text-muted)' }}>Loading...</p>;
  return <Component />;
}

const NO_AUTH_ROUTES = ['/decoder', '/reverse-shell-generator', '/wordlist-generator', '/payload-generator', '/privacy'];
const SIEM_VIEW_PATHS = {
  '/siem': 'dashboard',
  '/siem/alerts': 'alerts',
  '/siem/rules': 'rules',
  '/siem/logsearch': 'logsearch',
  '/siem/cases': 'cases',
  '/siem/configuration': 'configuration',
  '/siem/auditlog': 'auditlog',
};
const SIEM_VIEW_TO_PATH = Object.fromEntries(Object.entries(SIEM_VIEW_PATHS).map(([k, v]) => [v, k]));
const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;

function ElectronLoadingScreen() {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111110', userSelect: 'none', WebkitAppRegion: 'drag' }}>
      <div style={{ fontSize: '22px', fontWeight: 'bold', letterSpacing: '0.08em', color: '#e8e6e3', fontFamily: 'Courier New, Courier, monospace', marginBottom: '6px' }}>0xKudo</div>
      <div style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6e6b68', fontFamily: 'Courier New, Courier, monospace', marginBottom: '40px' }}>Security Toolkit</div>
      <div style={{ width: '32px', height: '32px', border: '2px solid #2a2928', borderTopColor: '#e8e6e3', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '20px' }} />
      <div style={{ fontSize: '11px', letterSpacing: '0.06em', color: '#4a4845', textTransform: 'uppercase', fontFamily: 'Courier New, Courier, monospace' }}>Connecting...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const collapseBtn = (collapsed) => ({
  position: 'fixed',
  left: collapsed ? 0 : '240px',
  bottom: 'calc(80px / 1.15)',
  width: '16px',
  height: '48px',
  background: 'var(--accent-amber)',
  border: 'none',
  borderRadius: '0 4px 4px 0',
  color: 'var(--bg-primary)',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 'bold',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  zIndex: 10,
});

function ElectronCollapsibleSiemSidebar({ siemView, setSiemView, onSwitchToTools }) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div style={{ position: 'relative', flexShrink: 0, height: '100%', width: collapsed ? 0 : '240px', overflow: 'visible' }}>
      {!collapsed && (
        <SiemSidebar
          activeView={siemView}
          onNavigate={setSiemView}
          onSwitchToTools={onSwitchToTools}
          isAuthenticated={false}
        />
      )}
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        style={collapseBtn(collapsed)}
      >{collapsed ? '›' : '‹'}</button>
    </div>
  );
}

function ElectronCollapsibleToolsSidebar({ onSwitchToSiem, onSwitchToSiemView }) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div style={{ position: 'relative', flexShrink: 0, height: '100%', width: collapsed ? 0 : '240px', overflow: 'visible' }}>
      {!collapsed && (
        <Sidebar onSwitchToSiem={onSwitchToSiem} onSwitchToSiemView={onSwitchToSiemView} />
      )}
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        style={collapseBtn(collapsed)}
      >{collapsed ? '›' : '‹'}</button>
    </div>
  );
}

function AppInner() {
  const { isAuthenticated, isLoading } = useAuth0();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();

  // Derive activeApp and siemView from URL (web only — Electron stays state-based)
  const derivedSiemView = !isElectron ? (SIEM_VIEW_PATHS[location.pathname] ?? null) : null;
  const derivedActiveApp = !isElectron
    ? (derivedSiemView !== null || location.pathname === '/' ? 'siem' : 'tools')
    : 'tools';

  const [activeApp, setActiveApp] = useState(() => {
    if (isElectron) return 'tools';
    return derivedActiveApp;
  });
  const [siemView, setSiemView] = useState(() => {
    if (isElectron) return 'dashboard';
    return derivedSiemView ?? 'dashboard';
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyRotatedBanner, setKeyRotatedBanner] = useState(false);

  // Sync state from URL on navigation (back/forward buttons, direct URL load)
  useEffect(() => {
    if (isElectron) return;
    if (derivedSiemView !== null) {
      setActiveApp('siem');
      setSiemView(derivedSiemView);
    } else if (location.pathname === '/') {
      setActiveApp('siem');
      setSiemView('dashboard');
    } else {
      setActiveApp('tools');
    }
  }, [location.pathname]);

  useEffect(() => {
    if (isElectron && !isLoading) {
      window.electron?.window?.expand?.();
    }
  }, [isLoading]);

  useEffect(() => {
    if (isElectron && isAuthenticated) {
      setActiveApp('siem');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ingest_key_rotated') setKeyRotatedBanner(true);
        if (msg.type === 'new_events') setKeyRotatedBanner(false);
      } catch {}
    };
    return () => { if (ws.readyState !== WebSocket.CONNECTING) ws.close(); else ws.onopen = () => ws.close(); };
  }, [isAuthenticated]);
  const tools = useTools();

  // Must be above any conditional returns to satisfy rules of hooks
  useEffect(() => {
    if (!isElectron || !window.electron?.window?.onNavigate) return;
    window.electron.window.onNavigate((target) => {
      if (target === '/siem/configuration') {
        setActiveApp('siem');
        setSiemView('configuration');
        setMenuOpen(false);
      }
    });
  }, []);

  if (isElectron && isLoading) {
    return <ElectronLoadingScreen />;
  }

  if (window.location.pathname === '/privacy') return <PrivacyPage />;

  if (!isLoading && !isAuthenticated) {
    const path = window.location.pathname;
    if (!isElectron && !NO_AUTH_ROUTES.includes(path)) return <LandingPage />;
    if (isElectron && !NO_AUTH_ROUTES.includes(path)) {
      if (activeApp === 'siem') {
        return (
          <div style={styles.layout}>
            <TopNav activeApp="siem" onSwitchApp={setActiveApp} onMenuToggle={() => {}} menuOpen={false} />
            <div style={{ ...styles.body, overflow: 'visible' }}>
              <ElectronCollapsibleSiemSidebar siemView={siemView} setSiemView={setSiemView} onSwitchToTools={() => setActiveApp('tools')} />
              <main style={{ flex: 1, minHeight: 0, overflow: siemView === 'configuration' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', minWidth: 0, ...(siemView !== 'configuration' ? { alignItems: 'center', justifyContent: 'center' } : {}) }}>
                {siemView === 'configuration' ? <SiemConfiguration /> : <RequireAuth />}
              </main>
            </div>
          </div>
        );
      }
      return (
        <div style={styles.layout}>
          <TopNav activeApp="tools" onSwitchApp={setActiveApp} onMenuToggle={() => {}} menuOpen={false} />
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <ElectronHome onNavigate={(route) => { setActiveApp('tools'); navigate(route); }} />
          </div>
        </div>
      );
    }
  }

  const switchApp = (app) => {
    setMenuOpen(false);
    if (isElectron) {
      setActiveApp(app);
      return;
    }
    if (app === 'tools') {
      navigate('/dashboard');
    } else {
      navigate(SIEM_VIEW_TO_PATH[siemView] ?? '/siem');
    }
  };

  const switchToSiem = () => switchApp('siem');
  const switchToSiemView = (view) => {
    setMenuOpen(false);
    navigate(SIEM_VIEW_TO_PATH[view] ?? '/siem');
  };

  const handleSiemNavigate = (view) => {
    setMenuOpen(false);
    if (isElectron) {
      setSiemView(view);
    } else {
      navigate(SIEM_VIEW_TO_PATH[view] ?? '/siem');
    }
  };

  const handleToolNavigate = (route) => {
    navigate(route);
    setMenuOpen(false);
  };

  const layoutStyle = isMobile
    ? { display: 'flex', flexDirection: 'column', height: '100%' }
    : styles.layout;

  const bodyStyle = isMobile
    ? { display: 'flex', flex: 1, flexDirection: 'column' }
    : styles.body;

  const navStyle = isMobile
    ? { position: 'sticky', top: 0, zIndex: 100 }
    : {};

  return (
    <div style={layoutStyle}>
      <div style={navStyle}>
        <TopNav activeApp={activeApp} onSwitchApp={switchApp} onMenuToggle={() => setMenuOpen(o => !o)} menuOpen={menuOpen} />
      </div>

      {/* Mobile slide-out drawer */}
      {isMobile && menuOpen && (
        <>
          <div style={styles.overlayBackdrop} onClick={() => setMenuOpen(false)} />
          <div style={styles.overlay}>
            <div style={styles.overlayDrawer}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', height: '44px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Menu</span>
                <button onClick={() => setMenuOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0', lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {activeApp === 'siem' ? (
                  <SiemSidebar
                    activeView={siemView}
                    onNavigate={handleSiemNavigate}
                    onSwitchToTools={() => switchApp('tools')}
                    isAuthenticated={isAuthenticated}
                  />
                ) : (
                  <Sidebar onSwitchToSiem={switchToSiem} onSwitchToSiemView={switchToSiemView} onNavigate={handleToolNavigate} />
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <div style={bodyStyle}>

        {activeApp === 'siem' && (
          <>
            {!isMobile && (isElectron && !isAuthenticated
              ? <ElectronCollapsibleSiemSidebar siemView={siemView} setSiemView={setSiemView} onSwitchToTools={() => switchApp('tools')} />
              : <SiemSidebar activeView={siemView} onNavigate={handleSiemNavigate} onSwitchToTools={() => switchApp('tools')} isAuthenticated={isAuthenticated} />
            )}
            <main style={isMobile ? { flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' } : { flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', minWidth: 0, ...(isElectron && !isAuthenticated ? { alignItems: 'center', justifyContent: 'center' } : {}) }}>
              {keyRotatedBanner && (
                <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--accent-amber)', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--accent-amber)', flexShrink: 0 }}>
                  <span>Ingest key rotated. Update your Fluent Bit config and restart the agent.</span>
                  <button onClick={() => setKeyRotatedBanner(false)} style={{ background: 'none', border: 'none', color: 'var(--accent-amber)', fontFamily: 'var(--font)', fontSize: '11px', cursor: 'pointer', opacity: 0.7, marginLeft: 'auto' }}>✕</button>
                </div>
              )}
              {isElectron && siemView === 'configuration'
                ? <SiemConfiguration />
                : (
                  <RequireAuth>
                    {siemView === 'dashboard' && (isMobile ? <SiemDashboardMobile onNavigate={handleSiemNavigate} /> : <SiemDashboard onNavigate={handleSiemNavigate} />)}
                    {siemView === 'alerts' && <AlertQueue onNavigate={handleSiemNavigate} />}
                    {siemView === 'rules' && <DetectionRules onNavigate={handleSiemNavigate} />}
                    {siemView === 'logsearch' && <LogSearch />}
                    {siemView === 'cases' && <Cases onNavigate={handleSiemNavigate} />}
                    {siemView === 'configuration' && <SiemConfiguration />}
                    {siemView === 'auditlog' && <AuditLog />}
                    {!['dashboard','alerts','rules','logsearch','cases','configuration','auditlog'].includes(siemView) && (
                      <div style={{ padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        {siemView.charAt(0).toUpperCase() + siemView.slice(1)} — coming soon
                      </div>
                    )}
                  </RequireAuth>
                )
              }
            </main>
          </>
        )}

        {activeApp === 'tools' && (
          <>
            {!isMobile && (isElectron && !isAuthenticated
              ? <ElectronCollapsibleToolsSidebar onSwitchToSiem={switchToSiem} onSwitchToSiemView={switchToSiemView} />
              : <Sidebar onSwitchToSiem={switchToSiem} onSwitchToSiemView={switchToSiemView} />
            )}
            <main style={isMobile ? { flex: 1 } : styles.content}>
              <Routes>
                {tools.filter(t => t.status === 'active').map(t => (
                  <Route
                    key={t.id}
                    path={t.route}
                    element={
                      <ErrorBoundary>
                        <div style={{ padding: '24px' }}>
                          {t.requiresAuth ? (
                            <RequireAuth><ToolLoader toolId={t.id} /></RequireAuth>
                          ) : (
                            <ToolLoader toolId={t.id} />
                          )}
                        </div>
                      </ErrorBoundary>
                    }
                  />
                ))}
                <Route path="/dashboard" element={isMobile ? <DashboardMobile /> : <Dashboard />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/siem/*" element={null} />
                <Route path="*" element={isMobile ? <DashboardMobile /> : <Dashboard />} />
              </Routes>
            </main>
          </>
        )}

      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToolRegistryProvider>
        <WorkspaceProvider>
          <AppInner />
        </WorkspaceProvider>
      </ToolRegistryProvider>
    </BrowserRouter>
  );
}
