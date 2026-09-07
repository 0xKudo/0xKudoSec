/**
 * Badge: the single source of truth for every badge in the app.
 *
 * One design rule, everywhere (severity, status, verdict, risk, signal, count).
 * Do not hand-roll badge styles in components; import `badgeStyle` or <Badge>.
 *
 * Vertical centering of uppercase text (Field root-cause fix, 2026-09-08):
 *   - Root cause: with a normal line box, uppercase caps sit high (no descenders
 *     fill the space below), so the ink rides above the optical centre.
 *   - Real fix: `text-box-trim: trim-both; text-box-edge: cap alphabetic;` on an
 *     INLINE-BLOCK element trims the box to the cap band so symmetric padding
 *     centres perfectly. Flex defeats the trim (its anonymous text box no-ops it),
 *     so this element must be inline-block, not inline-flex. That rule + an
 *     @supports guard + the symmetric-padding override live on `.kudo-badge` in
 *     theme.css (inline styles cannot express @supports).
 *   - Fallback (engines without text-box-trim): biased padding here -- a little
 *     more top than bottom -- nudges the caps down to the optical centre.
 *   - justifySelf/alignSelf 'start'/'center' : badges often sit in CSS grid rows;
 *     grid items stretch to fill their track by default, which made badges render
 *     full-width. These keep the badge sized to its content in ANY container.
 *   - flexShrink 0 : never squash inside flex rows.
 */

const BASE = {
  display: 'inline-block',
  textAlign: 'center',
  lineHeight: 1,
  fontSize: '10px',
  padding: '3px 7px 2px',
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

export function Badge({ color, filled, style, className = '', children, ...rest }) {
  return (
    <span
      className={`kudo-badge ${className}`.trim()}
      style={{ ...badgeStyle(color, { filled, ...(style || {}) }) }}
      {...rest}
    >
      {children}
    </span>
  );
}
