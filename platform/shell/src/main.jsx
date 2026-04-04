import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import App from './App';

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;
const redirectUri = isElectron ? '0xkudo://callback' : window.location.origin;

// In Electron, handle the custom protocol callback by forwarding to Auth0 SDK
function Auth0CallbackHandler({ children }) {
  const { handleRedirectCallback } = useAuth0();
  useEffect(() => {
    if (!isElectron) return;
    function onCallback(e) {
      const url = e.detail;
      if (url && url.startsWith('0xkudo://callback')) {
        handleRedirectCallback(url).catch(() => {});
      }
    }
    window.addEventListener('auth0-callback', onCallback);
    return () => window.removeEventListener('auth0-callback', onCallback);
  }, [handleRedirectCallback]);
  return children;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
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
