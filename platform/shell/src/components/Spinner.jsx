/**
 * Spinner — token-driven loading indicator.
 * Usage: <Spinner /> or <Spinner size={14} label="Analyzing" inline />
 * Respects prefers-reduced-motion via the global rule in theme.css.
 */
export function Spinner({ size = 16, label, inline = false, color = 'var(--text-muted)' }) {
  const ring = (
    <span
      role="status"
      aria-label={label || 'Loading'}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `2px solid var(--border)`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'kudo-spin 0.7s linear infinite',
        boxSizing: 'border-box',
        verticalAlign: 'middle',
      }}
    />
  );

  if (!label) return ring;

  return (
    <span
      style={{
        display: inline ? 'inline-flex' : 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font)',
        fontWeight: 500,
      }}
    >
      {ring}
      <span>{label}</span>
    </span>
  );
}
