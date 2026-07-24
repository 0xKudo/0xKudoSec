import { Spinner } from '../Spinner.jsx';

/**
 * Button: token-driven, consistent across all tools.
 *
 * Props:
 *   variant: 'primary' | 'ghost' | 'danger'  (default 'primary')
 *   size:    'sm' | 'md'                      (default 'sm')
 *   loading: boolean : shows a spinner and disables the button
 *   icon:    ReactNode: optional leading icon (e.g. a Lucide icon)
 *   ...rest passes through to <button> (onClick, disabled, type, style, aria-*)
 */
export function Button({
  variant = 'primary',
  size = 'sm',
  loading = false,
  icon,
  children,
  disabled,
  className = '',
  ...rest
}) {
  const spinnerColor = variant === 'primary' ? 'var(--btn-primary-text)' : 'currentColor';
  const cls = `kudo-btn kudo-btn--${variant} kudo-btn--${size} ${className}`.trim();
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner size={size === 'md' ? 14 : 12} color={spinnerColor} /> : icon}
      {children}
    </button>
  );
}
