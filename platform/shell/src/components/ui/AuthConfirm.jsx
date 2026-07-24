/**
 * Authorization-confirmation primitives shared across offensive tools.
 *
 * The user must affirm they own the target or have written authorization before
 * an active/offensive action runs. Two forms:
 *
 *   <AuthGate checked={ok} onChange={setOk} />          inline checkbox gate
 *   <AuthConfirmModal open onConfirm={run} onCancel=... /> blocking modal/popup
 *
 * Default authorization copy is shared so every tool reads identically.
 */

import { Button } from './Button.jsx';

export const AUTH_CONFIRM_TEXT =
  'I confirm I own this target or have explicit written authorization to perform active security testing against it.';

const styles = {
  // Matches the vulnerability scanner's authorization box exactly, so every
  // tool's authorization gate reads identically.
  gate: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 14px',
    border: '1px solid var(--severity-critical)',
    background: 'rgba(239, 68, 68, 0.06)',
  },
  checkbox: { marginTop: '2px', flexShrink: 0, accentColor: 'var(--text-primary)', cursor: 'pointer' },
  label: { fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5, cursor: 'pointer', fontWeight: 'normal' },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', width: '460px', maxWidth: '92vw',
    display: 'flex', flexDirection: 'column',
  },
  head: {
    padding: '14px 16px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', fontSize: '12px', letterSpacing: '0.06em',
    textTransform: 'uppercase', color: 'var(--text-primary)',
  },
  body: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' },
  actions: {
    padding: '12px 16px', borderTop: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', justifyContent: 'flex-end', gap: '8px',
  },
};

let gateUid = 0;

/** Inline checkbox gate. Controlled: pass `checked` + `onChange(bool)`. */
export function AuthGate({ checked, onChange, disabled, text = AUTH_CONFIRM_TEXT, id }) {
  const inputId = id || `auth-gate-${++gateUid}`;
  return (
    <div style={styles.gate}>
      <input
        type="checkbox"
        id={inputId}
        checked={!!checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        style={styles.checkbox}
      />
      <label htmlFor={inputId} style={styles.label}>{text}</label>
    </div>
  );
}

/**
 * Blocking confirmation modal. Shown before an action fires; the confirm button
 * stays disabled until the box is checked. Manage `open` + a local checked state
 * in the parent, or let the modal own the checkbox via internal state.
 */
export function AuthConfirmModal({
  open,
  onConfirm,
  onCancel,
  checked,
  onCheckedChange,
  title = 'Authorization Required',
  text = AUTH_CONFIRM_TEXT,
  confirmLabel = 'Confirm & Continue',
}) {
  if (!open) return null;
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.head}>{title}</div>
        <div style={styles.body}>
          <AuthGate checked={checked} onChange={onCheckedChange} text={text} />
        </div>
        <div style={styles.actions}>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={!checked} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
