/**
 * Badge: the single source of truth for every badge in the app.
 *
 * One design rule, everywhere (severity, status, verdict, risk, signal, count).
 * Do not hand-roll badge styles in components; import `badgeStyle` or <Badge>.
 *
 * Why these specific properties:
 *   - inline-flex + align/justify center : optically centers uppercase text.
 *     `line-height: 1` does NOT center caps (it crops the line box and the text
 *     rides high) -- lineHeight 'normal' plus flex centering is what works.
 *   - justifySelf/alignSelf 'start'/'center' : badges are often placed in CSS
 *     grid rows (e.g. the dashboard alert rows use a fixed first column). Grid
 *     items stretch to fill their track by default, which made badges render
 *     full-width. These keep the badge sized to its content in ANY container.
 *   - flexShrink 0 : never squash inside flex rows.
 */

const BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 'normal',
  fontSize: '10px',
  padding: '1px 7px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  flexShrink: 0,
  justifySelf: 'start',
  alignSelf: 'center',
};

/**
 * badgeStyle(color, overrides)
 *   color     : accent used for border + text (outlined variant, the default)
 *   overrides : any extra style props (e.g. { fontSize: '9px' })
 *
 * For a filled badge pass { filled: true } in overrides.
 */
export function badgeStyle(color = 'var(--border)', overrides = {}) {
  const { filled, ...rest } = overrides;
  return {
    ...BASE,
    border: `1px solid ${color}`,
    ...(filled
      ? { background: color, color: '#fff' }
      : { background: 'none', color }),
    ...rest,
  };
}

export function Badge({ color, filled, style, children, ...rest }) {
  return (
    <span style={{ ...badgeStyle(color, { filled, ...(style || {}) }) }} {...rest}>
      {children}
    </span>
  );
}
