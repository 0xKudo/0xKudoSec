/**
 * EmptyState — consistent placeholder for empty panels.
 * <EmptyState icon={<Inbox size={28} />} text="No results yet." action={<Button>…</Button>} />
 */
export function EmptyState({ icon, text, action, className = '', style }) {
  return (
    <div className={`kudo-empty ${className}`.trim()} style={style}>
      {icon && <div className="kudo-empty__icon">{icon}</div>}
      {text && <div className="kudo-empty__text">{text}</div>}
      {action}
    </div>
  );
}
