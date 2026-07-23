/**
 * Field primitives — consistent labelled inputs with inline error + optional char count.
 *
 * <TextField label="Target" value=... onChange=... error=... />
 * <TextArea  label="Alert"  value=... onChange=... maxLength={20000} showCount />
 *
 * The label sits above the control; errors render below, near the field (not at the top of the form).
 */

function FieldShell({ label, htmlFor, error, count, children, style }) {
  return (
    <div className="kudo-field" style={style}>
      {(label || count != null) && (
        <div className="kudo-field__row">
          {label ? <label className="kudo-field__label" htmlFor={htmlFor}>{label}</label> : <span />}
          {count != null && <span className="kudo-field__count">{count}</span>}
        </div>
      )}
      {children}
      {error && <span className="kudo-field__error" role="alert">{error}</span>}
    </div>
  );
}

let uid = 0;
function nextId(prefix) { return `${prefix}-${++uid}`; }

/**
 * Input — bare, unlabelled input for inline use inside flex rows / control bars.
 * Token-styled with a working focus state (unlike the old inline inputs that set
 * outline:none and showed no focus indicator). Pass `style`/`className` for width.
 */
export function Input({ className = '', style, ...rest }) {
  return <input className={`kudo-input ${className}`.trim()} style={style} {...rest} />;
}

/**
 * Select — bare, token-styled dropdown for inline use (shares the input look).
 * Pass options as <option> children. Pass `style`/`className` for width.
 */
export function Select({ className = '', style, children, ...rest }) {
  return (
    <select className={`kudo-input kudo-select ${className}`.trim()} style={style} {...rest}>
      {children}
    </select>
  );
}

export function TextField({ label, error, showCount, maxLength, id, style, ...rest }) {
  const inputId = id || nextId('kudo-input');
  const count = showCount && maxLength != null ? `${(rest.value || '').length} / ${maxLength}` : null;
  return (
    <FieldShell label={label} htmlFor={inputId} error={error} count={count} style={style}>
      <input
        id={inputId}
        className="kudo-field__control"
        maxLength={maxLength}
        aria-invalid={!!error}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextArea({ label, error, showCount, maxLength, id, style, ...rest }) {
  const inputId = id || nextId('kudo-textarea');
  const count = showCount && maxLength != null ? `${(rest.value || '').length} / ${maxLength}` : null;
  return (
    <FieldShell label={label} htmlFor={inputId} error={error} count={count} style={style}>
      <textarea
        id={inputId}
        className="kudo-field__control"
        maxLength={maxLength}
        aria-invalid={!!error}
        {...rest}
      />
    </FieldShell>
  );
}
