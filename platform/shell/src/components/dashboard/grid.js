import { GRID } from '../../../../shared/dashboardWidgets.js';

const { cols, rowH, gap } = GRID;

export function cellW(boardW) {
  return (boardW - (cols - 1) * gap) / cols;
}

export function cellRect(item, boardW) {
  const cw = cellW(boardW);
  return {
    left: item.x * (cw + gap),
    top: item.y * (rowH + gap),
    width: item.w * cw + (item.w - 1) * gap,
    height: item.h * rowH + (item.h - 1) * gap,
  };
}

export function pxToCell(px, boardW) {
  const cw = cellW(boardW);
  const x = Math.round(px.left / (cw + gap));
  const y = Math.round(px.top / (rowH + gap));
  const w = Math.max(1, Math.round((px.width + gap) / (cw + gap)));
  const h = Math.max(1, Math.round((px.height + gap) / (rowH + gap)));
  return { x, y, w, h };
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function clampToGrid(item, meta = {}) {
  const minW = meta.minW || 1;
  const minH = meta.minH || 1;
  const w = Math.min(cols, Math.max(minW, item.w || minW));
  const h = Math.max(minH, item.h || minH);
  const x = Math.min(cols - w, Math.max(0, item.x || 0));
  const y = Math.max(0, item.y || 0);
  return { ...item, x, y, w, h };
}

// The active/anchor widget is fixed; every widget that overlaps it slides just
// below it, cascading to anything then in the way. Terminates because each push
// strictly increases a y. Process in reading order (y then x) for stable output.
export function pushDown(layout, activeId) {
  const out = layout.map(w => ({ ...w }));
  const active = out.find(w => w.id === activeId);
  if (!active) return out;
  const settled = [active];
  const rest = out.filter(w => w.id !== activeId).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const w of rest) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const seat of settled) {
        if (overlaps(w, seat)) { w.y = seat.y + seat.h; moved = true; }
      }
    }
    settled.push(w);
  }
  return out;
}

// Raise every widget to the lowest y at which it does not overlap an already
// placed widget. The anchor is placed first at its own y and never raised, so it
// stays under the cursor while the rest rearrange.
export function compactUp(layout, anchorId) {
  const order = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  const anchor = anchorId ? order.find(w => w.id === anchorId) : null;
  if (anchor) placed.push({ ...anchor });
  for (const w of order) {
    if (anchorId && w.id === anchorId) continue;
    const cand = { ...w };
    let y = 0;
    // scan upward: lowest y with no collision against already-placed widgets
    // eslint-disable-next-line no-constant-condition
    while (true) {
      cand.y = y;
      if (!placed.some(p => overlaps(cand, p))) break;
      y++;
    }
    placed.push(cand);
  }
  // preserve original array order for stable React keys
  return layout.map(w => placed.find(p => p.id === w.id));
}

export function resolve(layout, activeId) {
  return compactUp(pushDown(layout, activeId), activeId);
}

export function stackForMobile(layout) {
  const ordered = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  let y = 0;
  return ordered.map(w => {
    const item = { ...w, x: 0, w: cols, y };
    y += w.h;
    return item;
  });
}
