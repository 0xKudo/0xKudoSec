/**
 * Card: a single consistent surface (background, border, radius, padding).
 * Pass `className`/`style` to extend. Any extra props pass through to the div.
 */
export function Card({ children, className = '', style, ...rest }) {
  return (
    <div className={`kudo-card ${className}`.trim()} style={style} {...rest}>
      {children}
    </div>
  );
}
