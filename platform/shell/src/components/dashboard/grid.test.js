import { describe, it, expect } from 'vitest';
import { cellRect, overlaps, clampToGrid, pushDown, compactUp, resolve, stackForMobile } from './grid.js';

const meta = { minW: 2, minH: 2 };

describe('cellRect', () => {
  it('derives pixel geometry from grid units', () => {
    // boardW 1220, cols 12, gap 10 -> cellW = (1220 - 11*10)/12 = 92.5
    const r = cellRect({ x: 0, y: 0, w: 2, h: 1 }, 1220);
    expect(r.left).toBe(0);
    expect(r.top).toBe(0);
    expect(r.width).toBeCloseTo(92.5 * 2 + 10, 1); // two cells + one interior gap
    expect(r.height).toBe(46);
  });
  it('offsets by gap for non-zero x/y', () => {
    const r = cellRect({ x: 1, y: 1, w: 1, h: 1 }, 1220);
    expect(r.left).toBeCloseTo(92.5 + 10, 1);
    expect(r.top).toBe(46 + 10);
  });
});

describe('overlaps', () => {
  it('true when rectangles intersect', () => {
    expect(overlaps({ x: 0, y: 0, w: 3, h: 3 }, { x: 2, y: 2, w: 3, h: 3 })).toBe(true);
  });
  it('false when adjacent but not overlapping', () => {
    expect(overlaps({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 })).toBe(false);
  });
});

describe('clampToGrid', () => {
  it('keeps a widget inside 12 columns and enforces min size', () => {
    const c = clampToGrid({ x: 11, y: -1, w: 1, h: 1 }, meta);
    expect(c.x).toBeLessThanOrEqual(12 - c.w);
    expect(c.y).toBe(0);
    expect(c.w).toBe(2);
    expect(c.h).toBe(2);
  });
});

describe('pushDown', () => {
  it('slides an overlapping widget below the active one', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 4, h: 3 },
      { id: 'b', x: 0, y: 0, w: 4, h: 3 }, // dropped on top of a's spot; a is active
    ];
    const out = pushDown(layout, 'b'); // b is fixed (active), a must move
    const a = out.find(w => w.id === 'a');
    expect(a.y).toBeGreaterThanOrEqual(3);
  });
});

describe('compactUp', () => {
  it('closes vertical gaps but pins the anchor', () => {
    const layout = [
      { id: 'a', x: 0, y: 5, w: 4, h: 2 }, // anchor stays at y=5
      { id: 'b', x: 6, y: 9, w: 4, h: 2 }, // rises to y=0
    ];
    const out = compactUp(layout, 'a');
    expect(out.find(w => w.id === 'a').y).toBe(5);
    expect(out.find(w => w.id === 'b').y).toBe(0);
  });
});

describe('resolve', () => {
  it('produces a non-overlapping layout', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 3 },
      { id: 'b', x: 0, y: 0, w: 6, h: 3 },
      { id: 'c', x: 0, y: 1, w: 6, h: 3 },
    ];
    const out = resolve(layout, 'a');
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++)
        expect(overlaps(out[i], out[j])).toBe(false);
  });
});

describe('resolve heals a stale saved layout', () => {
  const noOverlap = (out) => {
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++)
        expect(overlaps(out[i], out[j])).toBe(false);
  };

  it('re-packs survivors after removed ids leave gaps and overlaps', () => {
    // A removed widget (its row now empty) plus two survivors left overlapping
    // at their old coordinates — the exact failure the dashboard hit.
    const stale = [
      { id: 'kpi-row',      x: 0, y: 0, w: 12, h: 3 },
      { id: 'alerts-list',  x: 0, y: 8, w: 6,  h: 6 }, // gap above (removed widget)
      { id: 'top-sources',  x: 0, y: 9, w: 6,  h: 4 }, // overlaps alerts-list
    ];
    const out = resolve(stale, null);
    noOverlap(out);
    // nothing floats: at least one widget sits at the very top
    expect(Math.min(...out.map(w => w.y))).toBe(0);
  });

  it('packs the default-shaped layout with no gaps or overlaps', () => {
    const def = [
      { id: 'w1', x: 0, y: 0,  w: 12, h: 3 },
      { id: 'w2', x: 0, y: 3,  w: 6,  h: 12 },
      { id: 'w3', x: 6, y: 3,  w: 3,  h: 4 },
      { id: 'w4', x: 9, y: 3,  w: 3,  h: 4 },
      { id: 'w5', x: 6, y: 7,  w: 6,  h: 8 },
      { id: 'w7', x: 0, y: 15, w: 12, h: 8 },
    ];
    const out = resolve(def, null);
    noOverlap(out);
    // the default already packs, so resolve must not move anything
    for (const w of def) expect(out.find(o => o.id === w.id).y).toBe(w.y);
  });
});

describe('stackForMobile', () => {
  it('single column, full width, ordered by y then x', () => {
    const layout = [
      { id: 'a', x: 6, y: 0, w: 6, h: 2 },
      { id: 'b', x: 0, y: 0, w: 6, h: 2 },
    ];
    const out = stackForMobile(layout);
    expect(out.map(w => w.id)).toEqual(['b', 'a']); // b has smaller x at same y
    expect(out.every(w => w.x === 0 && w.w === 12)).toBe(true);
    expect(out[1].y).toBe(out[0].h); // stacked sequentially
  });
});
