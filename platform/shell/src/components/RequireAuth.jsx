import { useAuth0 } from '@auth0/auth0-react';
import { useEffect } from 'react';

export function RequireAuth({ children }) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect();
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

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
