export default function SiemGate({ children }) {
  // Free users can read from the VPS SIEM — only writes are blocked server-side.
  // No client-side gate needed; all authenticated users get access.
  return children;
}
