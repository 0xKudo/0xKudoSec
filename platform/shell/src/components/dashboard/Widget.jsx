// One positioned widget frame: title bar (+ drag grip / remove in edit mode),
// scrollable body, and a corner resize handle in edit mode. Positioning comes
// from item._px (computed by DashboardGrid via cellRect). The reposition
// transition is dropped when the viewer prefers reduced motion.
const REDUCED_MOTION = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Widget({ item, editing, onRemove, children }) {
  return (
    <div
      data-widget-id={item.id}
      style={{
        position: 'absolute',
        left: item._px.left, top: item._px.top, width: item._px.width, height: item._px.height,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box',
        transition: REDUCED_MOTION ? 'none' : 'left 160ms ease, top 160ms ease, width 160ms ease, height 160ms ease',
      }}
    >
      {/* Chrome bar shows ONLY in customize mode. The whole bar is the drag
          handle (no title text — each panel renders its own section label). */}
      {editing && (
        <div data-drag-grip title="Drag to move" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', flex: '0 0 auto', background: 'var(--bg-primary)', cursor: 'grab' }}>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', userSelect: 'none' }}>⠿</span>
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onRemove(item.id)} aria-label="Remove widget"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '14px', lineHeight: 1 }}>×</button>
        </div>
      )}
      <div className="kudo-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>{children}</div>
      {editing && (
        <span data-resize-handle style={{
          position: 'absolute', right: 0, bottom: 0, width: '16px', height: '16px', cursor: 'nwse-resize',
          borderRight: '2px solid var(--accent-amber)', borderBottom: '2px solid var(--accent-amber)',
        }} />
      )}
    </div>
  );
}
