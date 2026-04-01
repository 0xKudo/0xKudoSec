import { useAuth0 } from '@auth0/auth0-react';

const s = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100vh',
    padding: '40px 24px',
    boxSizing: 'border-box',
  },
  card: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    padding: '40px 36px',
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
  },
  title: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    letterSpacing: '0.04em',
    marginBottom: '12px',
  },
  body: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: '1.6',
    marginBottom: '24px',
  },
  btn: {
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    border: 'none',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '10px 28px',
    cursor: 'pointer',
    letterSpacing: '0.06em',
  },
};

export function RequireAuth({ children }) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  if (isLoading) {
    return (
      <div style={{ padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
        Authenticating...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={s.title}>Authentication Required</div>
          <div style={s.body}>
            You must create an account or log in to an existing account to use this feature.
          </div>
          <button
            style={s.btn}
            onClick={() => loginWithRedirect({ appState: { returnTo: window.location.pathname } })}
          >
            Log In / Sign Up
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
