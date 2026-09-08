import { useState, useEffect } from 'react';
import { KpiRow } from './panels/KpiRow.jsx';
import { TopSources } from './panels/TopSources.jsx';
import { EventsExplorer } from './panels/EventsExplorer.jsx';
import { AlertTrend } from './panels/AlertTrend.jsx';
import { AlertsList } from './panels/AlertsList.jsx';
import { AiAlertAnalysis } from './panels/AiAlertAnalysis.jsx';
import { EventInsights } from './panels/EventInsights.jsx';
import { AlertQueue } from '../AlertQueue.jsx';
import { Cases } from '../Cases.jsx';
import { LogSearch } from '../LogSearch.jsx';
import { AttackCoverage } from '../AttackCoverage.jsx';

const placeholder = (msg) => <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>{msg}</div>;

// Generic tool widget. Reuses the same dynamic-import pattern as App.jsx's
// ToolLoader (kept local to avoid a circular import). config.toolId selects the
// tool; the picker UI is deferred to Phase 5, so an unset id shows a prompt.
const toolCache = {};
function ToolPanelWidget({ toolId }) {
  const [Component, setComponent] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!toolId) return;
    if (toolCache[toolId]) { setComponent(() => toolCache[toolId]); return; }
    let live = true;
    import(`../../../../tools/${toolId}/client/index.jsx`)
      .then(mod => { toolCache[toolId] = mod.default; if (live) setComponent(() => mod.default); })
      .catch(err => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [toolId]);
  if (!toolId) return placeholder('Pick a tool in widget settings.');
  if (error) return placeholder(error);
  if (!Component) return placeholder('Loading…');
  return <Component />;
}

// widgetId -> render(ctx, config). ctx carries { onNavigate }.
const RENDERERS = {
  'kpi-row':         () => <KpiRow />,
  'alerts-list':     (ctx) => <AlertsList onNavigate={ctx.onNavigate} />,
  'ai-alert-analysis': () => <AiAlertAnalysis />,
  'top-sources':     () => <TopSources />,
  'recent-events':   () => <EventsExplorer />,
  'alert-trend':     () => <AlertTrend />,
  'event-insights':  (ctx) => <EventInsights onNavigate={ctx.onNavigate} />,
  'alert-queue':     (ctx) => <AlertQueue onNavigate={ctx.onNavigate} />,
  'case-list':       (ctx) => <Cases onNavigate={ctx.onNavigate} />,
  'log-search':      () => <LogSearch />,
  'attack-coverage': (ctx) => <AttackCoverage onSelectTechnique={(id) => {
    try { localStorage.setItem('siem-restore-technique', id); } catch {}
    ctx.onNavigate?.('rules');
  }} />,
  'tool-panel':      (ctx, config) => <ToolPanelWidget toolId={config?.toolId} />,
};

export function renderWidget(entry, ctx = {}) {
  const fn = RENDERERS[entry.widgetId];
  if (!fn) return placeholder('Unavailable widget.');
  return fn(ctx, entry.config);
}
