import { useNavigate } from 'react-router-dom';
import { useTools } from '../context/ToolRegistry';
import { useWorkspace } from '../context/WorkspaceContext';
import { loadRecentTools, trackToolVisit } from './Dashboard';
import { badgeStyle } from './ui/index.js';
import { PHASES } from '../lib/phases';
import { toolIcon, PHASE_ICONS } from '../lib/toolIcons';

const TYPE_COLORS = {
  alert: 'var(--severity-critical)',
  ip: 'var(--severity-high)',
  domain: 'var(--severity-medium)',
  payload: 'var(--accent-amber)',
  report: 'var(--severity-low)',
  raw: 'var(--text-muted)',
};

const s = {
  container: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' },
  panel: { background: 'var(--bg-surface)', border: '1px solid var(--border)' },
  panelHeader: {
    padding: '8px 14px',
    borderBottom: '1px solid var(--border)',
    fontSize: '10px', color: 'var(--text-muted)',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between',
  },
  clearBtn: {
    background: 'none', border: 'none', color: 'var(--text-subtle)',
    fontFamily: 'var(--font)', fontSize: '10px', cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  emptyState: { padding: '16px 14px', fontSize: '12px', color: 'var(--text-subtle)', textAlign: 'center' },

  // Metrics row
  metricsRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border-subtle)', border: '1px solid var(--border)' },
  metricTile: { background: 'var(--bg-surface)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' },
  metricIcon: { color: 'var(--text-subtle)', flexShrink: 0, display: 'flex' },
  metricValue: (color) => ({ fontSize: '20px', lineHeight: 1, color: color || 'var(--text-primary)' }),
  metricLabel: { fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '4px' },

  toolRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
  },
  toolName: { fontSize: '12px', color: 'var(--text-primary)' },
  toolMeta: { fontSize: '10px', color: 'var(--text-muted)' },
  launchBtn: {
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
    fontFamily: 'var(--font)', fontSize: '10px', padding: '3px 10px',
    cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0,
  },
  workspaceRow: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)',
  },
  typeBadge: (type) => badgeStyle(TYPE_COLORS[type] || 'var(--border)', { fontSize: '9px', padding: '1px 5px' }),
  workspaceLabel: { fontSize: '12px', color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  // Phase tool cards
  cardRow: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '11px 14px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
  },
  cardIcon: { color: 'var(--text-subtle)', flexShrink: 0, display: 'flex' },
  cardName: { fontSize: '12px', color: 'var(--text-primary)' },
};

export function DashboardMobile() {
  const tools = useTools();
  const navigate = useNavigate();
  const { items, clear } = useWorkspace();

  const recentToolIds = loadRecentTools();
  const recentTools = recentToolIds.map(id => tools.find(t => t.id === id)).filter(Boolean);
  const workspaceItems = [...items].reverse().slice(0, 8);

  const phaseGroups = PHASES.map(phase => ({
    ...phase,
    tools: phase.routes.map(r => tools.find(t => t.route === r)).filter(Boolean),
  })).filter(p => p.tools.length);

  return (
    <div style={s.container}>

      {/* Recently Used */}
      <div style={s.panel}>
        <div style={s.panelHeader}>Recently Used</div>
        {recentTools.length === 0 ? (
          <div style={s.emptyState}>No recent tools. Launch one below.</div>
        ) : (
          recentTools.map(tool => (
            <div key={tool.id} style={s.toolRow} onClick={() => navigate(tool.route)}>
              <div>
                <div style={s.toolName}>{tool.name}</div>
                <div style={s.toolMeta}>{tool.description?.slice(0, 50)}…</div>
              </div>
              <button style={s.launchBtn} onClick={e => { e.stopPropagation(); navigate(tool.route); }}>Go</button>
            </div>
          ))
        )}
      </div>

      {/* Workspace */}
      <div style={s.panel}>
        <div style={s.panelHeader}>
          Workspace
          {items.length > 0 && <button style={s.clearBtn} onClick={clear}>Clear</button>}
        </div>
        {workspaceItems.length === 0 ? (
          <div style={s.emptyState}>No workspace items.<br />Results from tools appear here.</div>
        ) : (
          workspaceItems.map(item => {
            const tool = tools.find(t => t.id === item.source);
            return (
              <div
                key={item.id}
                style={{ ...s.workspaceRow, cursor: tool ? 'pointer' : 'default' }}
                onClick={() => {
                  if (!tool) return;
                  localStorage.setItem(`workspace-restore-${item.source}`, JSON.stringify(item.data));
                  navigate(tool.route);
                }}
              >
                <span style={s.typeBadge(item.type)}>{item.type}</span>
                <span style={s.workspaceLabel}>{item.label}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Tool catalog, grouped by phase */}
      {phaseGroups.map(phase => {
        const PhaseIcon = PHASE_ICONS[phase.id];
        return (
          <div key={phase.id} style={s.panel}>
            <div style={s.panelHeader}>
              {PhaseIcon && <PhaseIcon size={13} strokeWidth={1.5} />}
              <span style={{ marginRight: 'auto' }}>{phase.label}</span>
            </div>
            {phase.tools.map(tool => {
              const Icon = toolIcon(tool.route);
              const soon = tool.status === 'coming-soon';
              return (
                <div
                  key={tool.id}
                  style={{ ...s.cardRow, opacity: soon ? 0.45 : 1, cursor: soon ? 'default' : 'pointer' }}
                  onClick={() => { if (!soon) { trackToolVisit(tool.id); navigate(tool.route); } }}
                >
                  <span style={s.cardIcon}><Icon size={16} strokeWidth={1.5} /></span>
                  <span style={s.cardName}>{tool.name}</span>
                </div>
              );
            })}
          </div>
        );
      })}

    </div>
  );
}
