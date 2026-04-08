import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import App from './App';

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;
// Auth0 doesn't accept custom protocols -- use a localhost callback server
// that Electron intercepts and forwards to the Auth0 SDK
const redirectUri = isElectron ? 'http://localhost:8765/callback' : window.location.origin;

// In Electron, handle the localhost callback forwarded from main process via typed IPC
function Auth0CallbackHandler({ children }) {
  const { handleRedirectCallback } = useAuth0();
  useEffect(() => {
    if (!isElectron) return;
    window.electron.auth.onCallback((url) => {
      if (url && url.includes('localhost:8765/callback')) {
        handleRedirectCallback(url).catch(() => {});
      }
    });
  }, [handleRedirectCallback]);
  return children;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Auth0Provider uses in-memory token storage by default (no cacheLocation prop).
        This is intentional — storing tokens in localStorage exposes them to XSS.
        Do NOT add cacheLocation: 'localstorage'. Tokens are never written to
        localStorage or sessionStorage anywhere in the codebase. */}
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: redirectUri,
        audience,
      }}
    >
      <Auth0CallbackHandler>
        <App />
      </Auth0CallbackHandler>
    </Auth0Provider>
  </StrictMode>
);
