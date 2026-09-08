import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createScope, createDraggable } from 'animejs';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { GRID, WIDGETS, widgetMeta, MAX_WIDGETS } from '../../../../shared/dashboardWidgets.js';
import { cellRect, cellW, pxToCell, clampToGrid, resolve, stackForMobile } from './grid.js';
import { renderWidget } from './widgetRegistry.jsx';
import { Widget } from './Widget.jsx';
import { useDashboardLayout } from '../../hooks/useDashboardLayout.js';

export const DEFAULT_LAYOUT = [
  { id: 'w1', widgetId: 'kpi-active',     x: 0, y: 0, w: 3, h: 2 },
  { id: 'w2', widgetId: 'kpi-critical',   x: 3, y: 0, w: 3, h: 2 },
  { id: 'w3', widgetId: 'kpi-high',       x: 6, y: 0, w: 3, h: 2 },
  { id: 'w4', widgetId: 'kpi-events',     x: 9, y: 0, w: 3, h: 2 },
  { id: 'w5', widgetId: 'alert-queue',    x: 0, y: 2, w: 6, h: 6 },
  { id: 'w6', widgetId: 'severity-donut', x: 6, y: 2, w: 4, h: 5 },
  { id: 'w7', widgetId: 'recent-events',  x: 0, y: 8, w: 8, h: 6 },
];

const btn = (active) => ({
  background: active ? 'var(--btn-primary-bg)' : 'none',
  border: '1px solid var(--border)', color: active ? 'var(--btn-primary-text)' : 'var(--text-muted)',
  fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em',
});
const selectStyle = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
  fontFamily: 'var(--font)', fontSize: '12px', padding: '4px 8px', outline: 'none', cursor: 'pointer',
};

export function DashboardGrid({ onNavigate }) {
  const isMobile = useIsMobile();
  // localStorage-first, hydrated from + debounced-saved to /api/siem/dashboards.
  const { layout, setLayout, saving } = useDashboardLayout('default', DEFAULT_LAYOUT);

  const [editing, setEditing] = useState(false);
  const boardRef = useRef(null);
  const [boardW, setBoardW] = useState(1200);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useLayoutEffect(() => {
    if (!boardRef.current) return;
    const ro = new ResizeObserver(([e]) => setBoardW(e.contentRect.width));
    ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, []);

  // ── layout mutations (all routed through resolve so overlaps never persist) ──
  const addWidget = useCallback((widgetId) => {
    const cur = layoutRef.current;
    if (!widgetId || cur.length >= MAX_WIDGETS) return;
    const m = widgetMeta(widgetId);
    const id = `w${Date.now().toString(36)}`;
    const maxY = cur.reduce((n, w) => Math.max(n, w.y + w.h), 0);
    const next = [...cur, clampToGrid({ id, widgetId, x: 0, y: maxY, w: m.defW, h: m.defH }, m)];
    setLayout(resolve(next, id));
  }, [setLayout]);

  const removeWidget = useCallback((id) => {
    setLayout(resolve(layoutRef.current.filter(w => w.id !== id), null));
  }, [setLayout]);

  const resetLayout = useCallback(() => setLayout(DEFAULT_LAYOUT), [setLayout]);

  // ── commit helpers: read the element's real rect, round to grid, resolve ──
  const commitMove = useCallback((id, el, board) => {
    const b = board.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const cell = pxToCell({ left: r.left - b.left, top: r.top - b.top, width: r.width, height: r.height }, board.clientWidth);
    const cur = layoutRef.current;
    const w = cur.find(x => x.id === id);
    if (!w) return;
    const m = widgetMeta(w.widgetId);
    const next = cur.map(x => x.id === id ? clampToGrid({ ...x, x: cell.x, y: cell.y }, m) : x);
    el.style.transform = '';
    setLayout(resolve(next, id));
  }, [setLayout]);

  const commitResize = useCallback((id, w, h) => {
    const cur = layoutRef.current;
    const item = cur.find(x => x.id === id);
    if (!item) return;
    const m = widgetMeta(item.widgetId);
    const next = cur.map(x => x.id === id ? clampToGrid({ ...x, w, h }, m) : x);
    setLayout(resolve(next, id));
  }, [setLayout]);

  // ── customize mode: anime.js move draggables + native resize handles ──
  const idsKey = layout.map(l => `${l.id}:${l.x},${l.y},${l.w},${l.h}`).join('|');
  useEffect(() => {
    if (!editing || isMobile || !boardRef.current) return;
    const board = boardRef.current;
    const stepX = cellW(board.clientWidth) + GRID.gap;
    const cleanups = [];

    const scope = createScope({ root: board }).add(() => {
      for (const it of layoutRef.current) {
        const el = board.querySelector(`[data-widget-id="${it.id}"]`);
        if (!el) continue;
        const grip = el.querySelector('[data-drag-grip]');
        if (grip) {
          createDraggable(el, {
            trigger: grip,
            container: board,
            containerPadding: 0,
            onSettle: (self) => commitMove(it.id, self.$target, board),
          });
        }
      }
    });

    // Native pointer resize: anime translates elements, it does not resize a
    // parent, so the corner handle drives width/height directly, then commits.
    const onHandleDown = (e) => {
      const handle = e.target.closest('[data-resize-handle]');
      if (!handle) return;
      const el = handle.closest('[data-widget-id]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const id = el.getAttribute('data-widget-id');
      const startX = e.clientX, startY = e.clientY;
      const startW = el.offsetWidth, startH = el.offsetHeight;
      const cwUnit = cellW(board.clientWidth);
      const onMove = (ev) => {
        el.style.width = `${Math.max(60, startW + (ev.clientX - startX))}px`;
        el.style.height = `${Math.max(60, startH + (ev.clientY - startY))}px`;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const w = Math.max(1, Math.round((el.offsetWidth + GRID.gap) / (cwUnit + GRID.gap)));
        const h = Math.max(1, Math.round((el.offsetHeight + GRID.gap) / (GRID.rowH + GRID.gap)));
        el.style.width = ''; el.style.height = '';
        commitResize(id, w, h);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    board.addEventListener('pointerdown', onHandleDown);
    cleanups.push(() => board.removeEventListener('pointerdown', onHandleDown));

    return () => { cleanups.forEach(fn => fn()); scope.revert(); };
  }, [editing, isMobile, boardW, idsKey, commitMove, commitResize]);

  const placed = isMobile ? stackForMobile(layout) : layout;
  const items = placed.map(it => ({
    ...it,
    title: widgetMeta(it.widgetId)?.title || it.widgetId,
    _px: cellRect(it, boardW),
  }));
  const rows = placed.reduce((n, it) => Math.max(n, it.y + it.h), 0) || 1;
  const boardH = rows * (GRID.rowH + GRID.gap);
  const atMax = layout.length >= MAX_WIDGETS;

  return (
    <div style={{ padding: '16px 20px', overflow: 'auto', flex: 1, minHeight: 0 }}>
      {!isMobile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <button style={btn(editing)} onClick={() => setEditing(e => !e)}>{editing ? 'Done' : 'Customize'}</button>
          {editing && (
            <>
              <select style={selectStyle} value="" disabled={atMax} onChange={e => { addWidget(e.target.value); e.target.value = ''; }}>
                <option value="">{atMax ? 'Max widgets reached' : 'Add widget…'}</option>
                {WIDGETS.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
              </select>
              <button style={btn(false)} onClick={resetLayout}>Reset layout</button>
            </>
          )}
          {saving !== undefined && (
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>{saving ? 'Saving…' : 'Saved'}</span>
          )}
        </div>
      )}
      <div ref={boardRef} style={{ position: 'relative', width: '100%', height: boardH }}>
        {items.map(it => (
          <Widget key={it.id} item={it} editing={editing && !isMobile} onRemove={removeWidget}>
            {renderWidget(it, { onNavigate })}
          </Widget>
        ))}
      </div>
    </div>
  );
}
