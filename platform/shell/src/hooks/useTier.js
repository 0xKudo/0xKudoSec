import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';

const ROLES_CLAIM = 'https://0xkudo.com/roles';
const isElectronEnv = typeof window !== 'undefined' && window.electron?.isElectron === true;

export function useTier() {
  const { user, isAuthenticated } = useAuth0();
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

  // After auth resolves, notify Electron main process of tier so it can start local server if needed
  useEffect(() => {
    if (isElectronEnv && isAuthenticated && window.electron?.tier?.setTier) {
      window.electron.tier.setTier(isPaid);
    }
  }, [isAuthenticated, isPaid]);

  return {
    isPaid,
    isElectron: isElectronEnv,
    storageMode,
    storageModeResolved,
    isAuthenticated,
  };
}
