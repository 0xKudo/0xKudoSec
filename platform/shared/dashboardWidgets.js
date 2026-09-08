// Shared widget metadata — imported by the shell (to render) and the server
// (to validate a saved layout). Pure data, no React, no DOM.

export const GRID = { cols: 12, rowH: 46, gap: 10 };
export const MAX_WIDGETS = 24;

// kind: 'siem' = a built-in SIEM panel; 'tool' = the generic tool-surface widget.
// Sizes are in grid units (w = columns, h = rows).
export const WIDGETS = [
  { id: 'kpi-active',     title: 'Active Alerts (KPI)', kind: 'siem', minW: 2, minH: 2, defW: 3, defH: 2 },
  { id: 'kpi-critical',   title: 'Critical (KPI)',      kind: 'siem', minW: 2, minH: 2, defW: 3, defH: 2 },
  { id: 'kpi-high',       title: 'High (KPI)',          kind: 'siem', minW: 2, minH: 2, defW: 3, defH: 2 },
  { id: 'kpi-events',     title: 'Total Events (KPI)',  kind: 'siem', minW: 2, minH: 2, defW: 3, defH: 2 },
  { id: 'alert-queue',    title: 'Active Alerts',       kind: 'siem', minW: 4, minH: 4, defW: 6, defH: 6 },
  { id: 'severity-donut', title: 'Severity Breakdown',  kind: 'siem', minW: 3, minH: 4, defW: 4, defH: 5 },
  { id: 'top-sources',    title: 'Top Sources',         kind: 'siem', minW: 3, minH: 3, defW: 4, defH: 5 },
  { id: 'recent-events',  title: 'Recent Events',       kind: 'siem', minW: 5, minH: 4, defW: 8, defH: 6 },
  { id: 'alert-trend',    title: 'Alert Trend',         kind: 'siem', minW: 4, minH: 3, defW: 6, defH: 4 },
  { id: 'attack-coverage',title: 'ATT&CK Coverage',     kind: 'siem', minW: 5, minH: 4, defW: 8, defH: 6 },
  { id: 'case-list',      title: 'Cases',               kind: 'siem', minW: 4, minH: 4, defW: 6, defH: 6 },
  { id: 'log-search',     title: 'Log Search',          kind: 'siem', minW: 5, minH: 5, defW: 8, defH: 7 },
  { id: 'tool-panel',     title: 'Tool',                kind: 'tool', minW: 4, minH: 4, defW: 6, defH: 6 },
];

const byId = new Map(WIDGETS.map(w => [w.id, w]));
export const WIDGET_IDS = new Set(WIDGETS.map(w => w.id));
export function isKnownWidget(id) { return byId.has(id); }
export function widgetMeta(id) { return byId.get(id) || null; }
