import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToolRegistryProvider, useTools } from './context/ToolRegistry';
import { TopNav } from './components/TopNav';
import { Sidebar } from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
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
    padding: '24px',
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
      })
      .catch(err => setError(err.message));
  }, [toolId]);

  if (error) return <p style={{ color: 'var(--severity-critical)' }}>{error}</p>;
  if (!Component) return <p style={{ color: 'var(--text-muted)' }}>Loading...</p>;
  return <Component />;
}

function ToolRoutes() {
  const tools = useTools();
  return (
    <Routes>
      {tools
        .filter(t => t.status === 'active')
        .map(t => (
          <Route
            key={t.id}
            path={t.route}
            element={
              <ErrorBoundary>
                <ToolLoader toolId={t.id} />
              </ErrorBoundary>
            }
          />
        ))}
      <Route path="*" element={
        <p style={{ color: 'var(--text-muted)' }}>
          Select a tool from the sidebar.
        </p>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToolRegistryProvider>
        <div style={styles.layout}>
          <TopNav />
          <div style={styles.body}>
            <Sidebar />
            <main style={styles.content}>
              <ToolRoutes />
            </main>
          </div>
        </div>
      </ToolRegistryProvider>
    </BrowserRouter>
  );
}
