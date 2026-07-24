/**
 * Native View Transition helpers (no React 19 / canary dependency).
 * Wraps document.startViewTransition with capability + reduced-motion guards
 * so unsupported browsers and reduced-motion users get an instant, un-animated swap.
 */

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function canViewTransition() {
  return typeof document !== 'undefined'
    && typeof document.startViewTransition === 'function'
    && !prefersReducedMotion();
}

/**
 * Run a DOM-mutating callback inside a view transition when supported.
 * The callback must apply the visual change synchronously.
 */
export function withViewTransition(mutate) {
  if (!canViewTransition()) {
    mutate();
    return;
  }
  document.startViewTransition(() => { mutate(); });
}

/**
 * Toggle/set the app theme with a smooth crossfade.
 * Applies the data-theme attribute synchronously (drives the visual change),
 * then calls setTheme so React state + persistence stay in sync.
 */
export function setThemeWithTransition(next, setTheme) {
  withViewTransition(() => {
    document.documentElement.setAttribute('data-theme', next);
  });
  setTheme(next);
}
