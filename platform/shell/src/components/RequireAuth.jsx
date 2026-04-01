import { useAuth0 } from '@auth0/auth0-react';
import { useEffect } from 'react';

export function RequireAuth({ children }) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  useEffect(() => {
    // Don't redirect while Auth0 is processing a callback (code/state in URL)
    const params = new URLSearchParams(window.location.search);
    if (params.get('code') || params.get('state')) return;
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect({ appState: { returnTo: window.location.pathname } });
    }
  }, [isLoading, isAuthenticated]); // eslint-disable-line

  if (isLoading) {
    return (
      <div style={{ padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
        Authenticating...
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return children;
}
