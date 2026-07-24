/**
 * Skeleton: token-driven placeholder block to reserve space while loading.
 * Usage:
 *   <Skeleton width="100%" height={16} />
 *   <Skeleton lines={3} />           // stacked text lines
 * Respects prefers-reduced-motion via the global rule in theme.css.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 'var(--radius-sm)',
  lines = 1,
  gap = 'var(--space-2)',
  style,
}) {
  const block = (w, key) => (
    <span
      key={key}
      aria-hidden="true"
      style={{
        display: 'block',
        width: w,
        height,
        borderRadius: radius,
        background: 'var(--bg-panel)',
        animation: 'kudo-pulse 1.4s ease-in-out infinite',
      }}
    />
  );

  if (lines <= 1) {
    return (
      <span
        role="status"
        aria-label="Loading"
        style={{ display: 'block', ...style }}
      >
        {block(width, 0)}
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ display: 'flex', flexDirection: 'column', gap, ...style }}
    >
      {Array.from({ length: lines }).map((_, i) =>
        // last line is shorter, like real text
        block(i === lines - 1 ? '60%' : width, i)
      )}
    </span>
  );
}
