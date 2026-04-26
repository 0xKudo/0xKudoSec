import { useTier } from '../hooks/useTier';
import UpgradePage from '../pages/UpgradePage';

export default function SiemGate({ children }) {
  const { isPaid, isElectron, storageMode, storageModeResolved, isAuthenticated } = useTier();

  // Not authenticated yet — don't gate, let RequireAuth handle it
  if (!isAuthenticated) return children;

  // Wait for storageMode to resolve from Electron store before making gate decisions
  if (!storageModeResolved) return null;

  // Electron local mode: free tier SIEM runs locally, always allow
  if (isElectron && storageMode === 'local') return children;

  // Paid cloud user: allow
  if (isPaid) return children;

  return <UpgradePage />;
}
