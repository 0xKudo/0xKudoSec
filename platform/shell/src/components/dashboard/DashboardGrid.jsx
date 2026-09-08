import { useState, useRef, useLayoutEffect } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { GRID, widgetMeta } from '../../../../shared/dashboardWidgets.js';
import { cellRect, stackForMobile } from './grid.js';
import { renderWidget } from './widgetRegistry.jsx';
import { Widget } from './Widget.jsx';

// Phase 1: static widget grid in view mode. Customize mode (drag/resize/add) is
// layered on in Task 6; persistence replaces the local layout state in Task 7.
export const DEFAULT_LAYOUT = [
  { id: 'w1', widgetId: 'kpi-active',     x: 0, y: 0, w: 3, h: 2 },
  { id: 'w2', widgetId: 'kpi-critical',   x: 3, y: 0, w: 3, h: 2 },
  { id: 'w3', widgetId: 'kpi-high',       x: 6, y: 0, w: 3, h: 2 },
  { id: 'w4', widgetId: 'kpi-events',     x: 9, y: 0, w: 3, h: 2 },
  { id: 'w5', widgetId: 'alert-queue',    x: 0, y: 2, w: 6, h: 6 },
  { id: 'w6', widgetId: 'severity-donut', x: 6, y: 2, w: 4, h: 5 },
  { id: 'w7', widgetId: 'recent-events',  x: 0, y: 8, w: 8, h: 6 },
];

export function DashboardGrid({ onNavigate }) {
  const isMobile = useIsMobile();
  const [layout] = useState(DEFAULT_LAYOUT);
  const boardRef = useRef(null);
  const [boardW, setBoardW] = useState(1200);

  useLayoutEffect(() => {
    if (!boardRef.current) return;
    const ro = new ResizeObserver(([e]) => setBoardW(e.contentRect.width));
    ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, []);

  const placed = isMobile ? stackForMobile(layout) : layout;
  const items = placed.map(it => ({
    ...it,
    title: widgetMeta(it.widgetId)?.title || it.widgetId,
    _px: cellRect(it, boardW),
  }));
  const rows = placed.reduce((n, it) => Math.max(n, it.y + it.h), 0) || 1;
  const boardH = rows * (GRID.rowH + GRID.gap);

  return (
    <div style={{ padding: '16px 20px', overflow: 'auto', flex: 1, minHeight: 0 }}>
      <div ref={boardRef} style={{ position: 'relative', width: '100%', height: boardH }}>
        {items.map(it => (
          <Widget key={it.id} item={it} editing={false} onRemove={() => {}}>
            {renderWidget(it, { onNavigate })}
          </Widget>
        ))}
      </div>
    </div>
  );
}
