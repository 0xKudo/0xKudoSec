import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';

const ROLES_CLAIM = 'https://0xkudo.com/roles';
const isElectronEnv = typeof window !== 'undefined' && window.electron?.isElectron === true;

export function useTier() {
  const { user, isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [storageMode, setStorageMode] = useState('cloud');
  const [storageModeResolved, setStorageModeResolved] = useState(!isElectronEnv);

  useEffect(() => {
    if (isElectronEnv && window.electron?.tier?.getStorageMode) {
      window.electron.tier.getStorageMode().then(mode => {
        setStorageMode(mode);
        setStorageModeResolved(true);
      });
    }
  }, []);

  const roles = user?.[ROLES_CLAIM] ?? [];
  const isPaid = roles.includes('paid');

  // After auth resolves, notify Electron main process of tier, identity, and JWT
  useEffect(() => {
    if (!isElectronEnv || !isAuthenticated || !user?.sub) return;
    if (window.electron?.tier?.setUserSub) window.electron.tier.setUserSub(user.sub);
    if (window.electron?.tier?.setTier) window.electron.tier.setTier(isPaid);
    // Push fresh JWT so the local server can forward events to VPS if cloud storage is on
    if (window.electron?.auth?.setJwt) {
      getAccessTokenSilently().then(token => {
        window.electron.auth.setJwt(token);
      }).catch(() => {});
    }
  }, [isAuthenticated, isPaid, user?.sub]);

  return {
    isPaid,
    isElectron: isElectronEnv,
    storageMode,
    storageModeResolved,
    isAuthenticated,
  };
}
