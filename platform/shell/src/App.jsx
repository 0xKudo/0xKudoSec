import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ToolRegistryProvider, useTools } from './context/ToolRegistry';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { TopNav } from './components/TopNav';
import { Sidebar } from './components/Sidebar';
import { SiemSidebar } from './components/SiemSidebar';
import { Dashboard, trackToolVisit } from './components/Dashboard';
import { SiemDashboard } from './components/SiemDashboard';
import { LogSources } from './components/LogSources';
import { AlertQueue } from './components/AlertQueue';
import { DetectionRules } from './components/DetectionRules';
import { LogSearch } from './components/LogSearch';
import { Cases } from './components/Cases';
import { SiemSettings } from './components/SiemSettings';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RequireAuth } from './components/RequireAuth';
import { useAuth0 } from '@auth0/auth0-react';
import './styles/theme.css';

const styles = {
  layout: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    overflow: 'auto',
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

function AppInner() {
  const { isAuthenticated } = useAuth0();
  const [activeApp, setActiveApp] = useState('siem');
  const [siemView, setSiemView] = useState('dashboard');
  const tools = useTools();
  const navigate = useNavigate();

  const switchApp = (app) => {
    setActiveApp(app);
    if (app === 'tools') navigate('/dashboard');
  };

  const navigateDashboard = () => navigate('/dashboard');
  const switchToSiem = () => switchApp('siem');

  return (
    <div style={styles.layout}>
      <TopNav activeApp={activeApp} onSwitchApp={switchApp} />
      <div style={styles.body}>

        {activeApp === 'siem' && (
          <>
            <SiemSidebar
              activeView={siemView}
              onNavigate={setSiemView}
              onSwitchToTools={() => switchApp('tools')}
              isAuthenticated={isAuthenticated}
            />
            <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)', minWidth: 0 }}>
              <RequireAuth>
                {siemView === 'dashboard' && <SiemDashboard onNavigate={setSiemView} />}
                {siemView === 'logsources' && <LogSources />}
                {siemView === 'alerts' && <AlertQueue onNavigate={setSiemView} />}
                {siemView === 'rules' && <DetectionRules onNavigate={setSiemView} />}
                {siemView === 'logsearch' && <LogSearch />}
                {siemView === 'cases' && <Cases onNavigate={setSiemView} />}
                {siemView === 'settings' && <SiemSettings />}
                {!['dashboard','logsources','alerts','rules','logsearch','cases','settings'].includes(siemView) && (
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
            <Sidebar onSwitchToSiem={switchToSiem} />
            <main style={styles.content}>
              <Routes>
                {tools.filter(t => t.status === 'active').map(t => (
                  <Route
                    key={t.id}
                    path={t.route}
                    element={
                      <ErrorBoundary>
                        <div style={{ padding: '24px' }}>
                          {t.requiresAuth ? (
                            <RequireAuth>
                              <ToolLoader toolId={t.id} />
                            </RequireAuth>
                          ) : (
                            <ToolLoader toolId={t.id} />
                          )}
                        </div>
                      </ErrorBoundary>
                    }
                  />
                ))}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="*" element={<Dashboard />} />
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
