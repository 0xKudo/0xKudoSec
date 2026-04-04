import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
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
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from './hooks/useIsMobile';
import './styles/theme.css';

const styles = {
  layout: { display: 'flex', flexDirection: 'column', height: '100vh' },
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

const NO_AUTH_ROUTES = ['/decoder', '/reverse-shell-generator', '/wordlist-generator', '/payload-generator'];
const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;

function ElectronLoadingScreen() {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setDots(d => d === 3 ? 1 : d + 1), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: 'var(--bg-primary)' }}>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>[ 0xKudoSec ]</div>
      <div style={{ fontSize: '11px', color: 'var(--text-subtle)', letterSpacing: '0.06em', width: '80px' }}>
        Connecting{'.'.repeat(dots)}
      </div>
    </div>
  );
}

function AppInner() {
  const { isAuthenticated, isLoading } = useAuth0();
  const isMobile = useIsMobile();
  const [activeApp, setActiveApp] = useState(() => {
    if (isElectron) return 'tools';
    const path = window.location.pathname;
    return (path !== '/' && path !== '/siem') ? 'tools' : 'siem';
  });
  const [siemView, setSiemView] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const tools = useTools();
  const navigate = useNavigate();

  // Must be above any conditional returns to satisfy rules of hooks
  useEffect(() => {
    function onElectronNavigate(e) {
      const target = e.detail;
      if (target === '/siem/configuration') {
        setActiveApp('siem');
        setSiemView('configuration');
        setMenuOpen(false);
      }
    }
    window.addEventListener('electron:navigate', onElectronNavigate);
    return () => window.removeEventListener('electron:navigate', onElectronNavigate);
  }, []);

  if (isElectron && isLoading) {
    return <ElectronLoadingScreen />;
  }

  if (!isLoading && !isAuthenticated) {
    const path = window.location.pathname;
    if (!isElectron && !NO_AUTH_ROUTES.includes(path)) return <LandingPage />;
  }

  const switchApp = (app) => {
    setActiveApp(app);
    setMenuOpen(false);
    if (app === 'tools') navigate('/dashboard');
  };

  const switchToSiem = () => switchApp('siem');
  const switchToSiemView = (view) => { setActiveApp('siem'); setSiemView(view); setMenuOpen(false); };

  const handleSiemNavigate = (view) => {
    setSiemView(view);
    setMenuOpen(false);
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
            {!isMobile && (
              <SiemSidebar
                activeView={siemView}
                onNavigate={setSiemView}
                onSwitchToTools={() => switchApp('tools')}
                isAuthenticated={isAuthenticated}
              />
            )}
            <main style={isMobile ? { flex: 1, background: 'var(--bg-primary)' } : { flex: 1, overflow: 'auto', background: 'var(--bg-primary)', minWidth: 0 }}>
              <RequireAuth>
                {siemView === 'dashboard' && (isMobile ? <SiemDashboardMobile onNavigate={setSiemView} /> : <SiemDashboard onNavigate={setSiemView} />)}
                {siemView === 'alerts' && <AlertQueue onNavigate={setSiemView} />}
                {siemView === 'rules' && <DetectionRules onNavigate={setSiemView} />}
                {siemView === 'logsearch' && <LogSearch />}
                {siemView === 'cases' && <Cases onNavigate={setSiemView} />}
                {siemView === 'configuration' && <SiemConfiguration />}
                {siemView === 'auditlog' && <AuditLog />}
                {!['dashboard','alerts','rules','logsearch','cases','configuration','auditlog'].includes(siemView) && (
                  <div style={{ padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {siemView.charAt(0).toUpperCase() + siemView.slice(1)} — coming soon
                  </div>
                )}
              </RequireAuth>
            </main>
          </>
        )}

        {activeApp === 'tools' && (
          <>
            {!isMobile && <Sidebar onSwitchToSiem={switchToSiem} onSwitchToSiemView={switchToSiemView} />}
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
                <Route path="/dashboard" element={isElectron && !isAuthenticated ? <ElectronHome onNavigate={(route) => { setActiveApp('tools'); navigate(route); }} /> : isMobile ? <DashboardMobile /> : <Dashboard />} />
                <Route path="*" element={isElectron && !isAuthenticated ? <ElectronHome onNavigate={(route) => { setActiveApp('tools'); navigate(route); }} /> : isMobile ? <DashboardMobile /> : <Dashboard />} />
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
