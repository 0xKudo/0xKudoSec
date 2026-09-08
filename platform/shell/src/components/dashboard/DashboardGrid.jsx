import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createScope, createDraggable } from 'animejs';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { GRID, WIDGETS, widgetMeta, isKnownWidget, MAX_WIDGETS } from '../../../../shared/dashboardWidgets.js';
import { cellRect, cellW, pxToCell, clampToGrid, resolve, stackForMobile } from './grid.js';
import { renderWidget } from './widgetRegistry.jsx';
import { Widget } from './Widget.jsx';
import { useDashboardLayout } from '../../hooks/useDashboardLayout.js';

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;

// Default layout mirrors the pre-widget SIEM dashboard: a full-width key-stats
// row, then Active Alerts (+ AI Alert Analysis on Electron) on the left with
// Alert Trend + Top Sources over the Event Insights tabs on the right, and the
// full Recent Events explorer across the bottom.
export const DEFAULT_LAYOUT = [
  { id: 'w1', widgetId: 'kpi-row',        x: 0, y: 0,  w: 12, h: 3 },
  { id: 'w2', widgetId: 'alerts-list',    x: 0, y: 3,  w: 6,  h: isElectron ? 6 : 12 },
  { id: 'w3', widgetId: 'alert-trend',    x: 6, y: 3,  w: 3,  h: 4 },
  { id: 'w4', widgetId: 'top-sources',    x: 9, y: 3,  w: 3,  h: 4 },
  { id: 'w5', widgetId: 'event-insights', x: 6, y: 7,  w: 6,  h: 8 },
  ...(isElectron ? [{ id: 'w6', widgetId: 'ai-alert-analysis', x: 0, y: 9, w: 6, h: 6 }] : []),
  { id: 'w7', widgetId: 'recent-events',  x: 0, y: 15, w: 12, h: 8 },
];

const btn = (active) => ({
  background: active ? 'var(--btn-primary-bg)' : 'none',
  border: '1px solid var(--border)', color: active ? 'var(--btn-primary-text)' : 'var(--text-muted)',
  fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em',
});

export function DashboardGrid({ onNavigate, editing: editingProp, onEditingChange }) {
  const isMobile = useIsMobile();
  // Heal a hydrated layout before it renders: drop widget ids that no longer
  // exist (removed widgets) and re-pack through resolve() so the survivors have
  // no gaps or overlaps. Runs only on hydration (see useDashboardLayout).
  const normalize = useCallback((raw) => {
    if (!Array.isArray(raw)) return DEFAULT_LAYOUT;
    const known = raw.filter(w => w && isKnownWidget(w.widgetId));
    if (!known.length) return DEFAULT_LAYOUT;
    return resolve(known.map(w => clampToGrid(w, widgetMeta(w.widgetId) || {})), null);
  }, []);
  // localStorage-first, hydrated from + debounced-saved to /api/siem/dashboards.
  const { layout, setLayout, saving } = useDashboardLayout('default', DEFAULT_LAYOUT, normalize);

  // Editing is controlled by the SIEM nav-bar cog when App passes it in; falls
  // back to internal state (sidebar/mobile layouts that have no nav cog).
  const controlled = onEditingChange !== undefined;
  const [editingInternal, setEditingInternal] = useState(false);
  const editing = controlled ? editingProp : editingInternal;
  const setEditing = controlled ? onEditingChange : setEditingInternal;
  // Widget picker: { x, y } cell target (or 'end') while choosing a widget to add.
  const [picker, setPicker] = useState(null);
  // Show "Saved" briefly after a save settles, then fade it out (was permanent).
  const [savedFlash, setSavedFlash] = useState(false);
  const prevSaving = useRef(saving);
  useEffect(() => {
    if (prevSaving.current && !saving) {
      setSavedFlash(true);
      const t = setTimeout(() => setSavedFlash(false), 2500);
      prevSaving.current = saving;
      return () => clearTimeout(t);
    }
    prevSaving.current = saving;
  }, [saving]);

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
  const addWidget = useCallback((widgetId, at) => {
    const cur = layoutRef.current;
    if (!widgetId || cur.length >= MAX_WIDGETS) return;
    const m = widgetMeta(widgetId);
    const id = `w${Date.now().toString(36)}`;
    // Place at the clicked cell when given (right-click / placeholder), else stack at the bottom.
    const x = at ? Math.max(0, Math.min(GRID.cols - m.defW, at.x)) : 0;
    const y = at ? at.y : cur.reduce((n, w) => Math.max(n, w.y + w.h), 0);
    const next = [...cur, clampToGrid({ id, widgetId, x, y, w: m.defW, h: m.defH }, m)];
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
      // Floor the live drag at the widget's real minimum so contents never clip
      // mid-resize (clampToGrid enforces the same min on commit).
      const it = layoutRef.current.find(x => x.id === id);
      const m = it ? widgetMeta(it.widgetId) : null;
      const minWpx = m ? m.minW * cwUnit + (m.minW - 1) * GRID.gap : 60;
      const minHpx = m ? m.minH * GRID.rowH + (m.minH - 1) * GRID.gap : 60;
      const onMove = (ev) => {
        el.style.width = `${Math.max(minWpx, startW + (ev.clientX - startX))}px`;
        el.style.height = `${Math.max(minHpx, startH + (ev.clientY - startY))}px`;
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

  const showToolbar = !isMobile && (editing || !controlled);
  // Placeholder "add widget" tile sits one row below the current content in edit mode.
  const addTile = editing && !isMobile && !atMax
    ? { id: '__add__', x: 0, y: rows, w: Math.min(4, GRID.cols), h: 3 }
    : null;
  const addPx = addTile ? cellRect(addTile, boardW) : null;
  const boardHWithAdd = addTile ? (rows + addTile.h) * (GRID.rowH + GRID.gap) : boardH;

  const openPickerAt = (e, at) => {
    e.preventDefault();
    setPicker({ at, px: { left: Math.min(e.clientX, window.innerWidth - 240), top: Math.min(e.clientY, window.innerHeight - 320) } });
  };
  const onBoardContextMenu = (e) => {
    if (!editing || isMobile || !boardRef.current) return;
    if (e.target.closest('[data-widget-id]')) return; // let widget-level menus (events table) win
    const b = boardRef.current.getBoundingClientRect();
    const cell = pxToCell({ left: e.clientX - b.left, top: e.clientY - b.top, width: cellW(b.width), height: GRID.rowH }, boardRef.current.clientWidth);
    openPickerAt(e, cell);
  };

  return (
    <div style={{ padding: '16px 20px', overflow: 'auto', flex: 1, minHeight: 0 }}>
      {showToolbar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {editing && <button style={btn(false)} onClick={resetLayout}>Reset layout</button>}
          {editing && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Right-click the board or use the + tile to add a widget.</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {(saving || savedFlash) && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{saving ? 'Saving…' : 'Saved'}</span>
            )}
            {!controlled && <button style={btn(editing)} onClick={() => setEditing(e => !e)}>{editing ? 'Done' : 'Customize'}</button>}
          </span>
        </div>
      )}
      <div ref={boardRef} onContextMenu={onBoardContextMenu} style={{ position: 'relative', width: '100%', height: boardHWithAdd }}>
        {/* Snap-grid wallpaper: only in customize mode, so the user can see where
            widgets align (à la a trading-terminal layout editor). One line per
            column step and per row step, drawn behind the widgets. */}
        {editing && !isMobile && (
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
            backgroundImage: 'linear-gradient(to right, var(--border-subtle) 1px, transparent 1px), linear-gradient(to bottom, var(--border-subtle) 1px, transparent 1px)',
            backgroundSize: `${cellW(boardW) + GRID.gap}px 100%, 100% ${GRID.rowH + GRID.gap}px`,
            opacity: 0.5,
          }} />
        )}
        {items.map(it => (
          <Widget key={it.id} item={it} editing={editing && !isMobile} onRemove={removeWidget}>
            {renderWidget(it, { onNavigate })}
          </Widget>
        ))}
        {addTile && (
          <button
            onClick={(e) => openPickerAt(e, { x: 0, y: rows })}
            title="Add a widget"
            style={{
              position: 'absolute', left: addPx.left, top: addPx.top, width: addPx.width, height: addPx.height,
              background: 'none', border: '1px dashed var(--border)', color: 'var(--text-muted)', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
              fontFamily: 'var(--font)', fontSize: '12px', letterSpacing: '0.04em', boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: '24px', lineHeight: 1 }}>+</span>
            Add a widget
          </button>
        )}
      </div>

      {picker && (
        <>
          <div onClick={() => setPicker(null)} onContextMenu={(e) => { e.preventDefault(); setPicker(null); }} style={{ position: 'fixed', inset: 0, zIndex: 1200 }} />
          <div style={{ position: 'fixed', left: picker.px.left, top: picker.px.top, zIndex: 1201, width: '220px', maxHeight: '300px', overflow: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }} className="kudo-scroll">
            <div style={{ padding: '8px 12px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-subtle)' }}>Add widget</div>
            {WIDGETS.map(w => (
              <button key={w.id}
                onClick={() => { addWidget(w.id, picker.at); setPicker(null); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '12px', padding: '8px 12px', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >{w.title}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
