import { BrowserRouter } from 'react-router-dom';
import { TopNav } from './components/TopNav';
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

export default function App() {
  return (
    <BrowserRouter>
      <div style={styles.layout}>
        <TopNav />
        <div style={styles.body}>
          <ErrorBoundary>
            <main style={styles.content}>
              <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                Loading tools...
              </p>
            </main>
          </ErrorBoundary>
        </div>
      </div>
    </BrowserRouter>
  );
}
