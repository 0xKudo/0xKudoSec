import { useNavigate } from 'react-router-dom';
import { Clock, Layers, Wrench } from 'lucide-react';
import { useTools } from '../context/ToolRegistry';
import { useWorkspace } from '../context/WorkspaceContext';
import { EmptyState, badgeStyle } from './ui/index.js';
import { PHASES } from '../lib/phases';
import { toolIcon, PHASE_ICONS } from '../lib/toolIcons';

const RECENT_TOOLS_KEY = 'cybertools_recent_tools';
const MAX_RECENT = 6;

export function trackToolVisit(toolId) {
  try {
    const recent = JSON.parse(localStorage.getItem(RECENT_TOOLS_KEY) || '[]');
    const filtered = recent.filter(id => id !== toolId);
    const next = [toolId, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_TOOLS_KEY, JSON.stringify(next));
  } catch {}
}

export function loadRecentTools() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_TOOLS_KEY) || '[]');
  } catch {
    return [];
  }
}

function formatTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

const TYPE_LABELS = {
  alert: 'Alert',
  domain: 'Domain',
  ip: 'IP',
  payload: 'Payload',
  report: 'Report',
  raw: 'Raw',
};

const s = {
  container: { padding: 0 },
  header: {
    padding: '0 20px',
    height: '45px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em' },
  titleSub: { color: 'var(--text-muted)', fontSize: '11px' },
  body: { padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' },

  // Metrics row
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '1px',
    background: 'var(--border-subtle)',
    border: '1px solid var(--border)',
  },
  metricTile: {
    background: 'var(--bg-surface)',
    padding: '14px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  metricIcon: { color: 'var(--text-subtle)', flexShrink: 0, display: 'flex' },
  metricValue: (color) => ({ fontSize: '24px', lineHeight: 1, color: color || 'var(--text-primary)' }),
  metricLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '5px' },

  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' },
  panel: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '300px',
    overflow: 'hidden',
  },
  panelScroll: { overflowY: 'auto', flex: 1 },
  panelHeader: {
    padding: '8px 14px',
    borderBottom: '1px solid var(--border)',
    fontSize: '11px',
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-subtle)',
    fontFamily: 'var(--font)',
    fontSize: '10px',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  toolRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-subtle)',
    cursor: 'pointer',
  },
  toolName: { fontSize: '12px', color: 'var(--text-primary)' },
  toolMeta: { fontSize: '11px', color: 'var(--text-muted)' },
  launchBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font)',
    fontSize: '10px',
    padding: '2px 10px',
    cursor: 'pointer',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  workspaceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 14px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  typeBadge: (type) => {
    const colors = {
      alert: 'var(--severity-critical)',
      ip: 'var(--severity-high)',
      domain: 'var(--severity-medium)',
      payload: 'var(--accent-amber)',
      report: 'var(--severity-low)',
      raw: 'var(--text-muted)',
    };
    return badgeStyle(colors[type] || 'var(--border)', { fontSize: '9px', padding: '1px 6px' });
  },
  workspaceLabel: { fontSize: '12px', color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  workspaceMeta: { fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' },

  // Phase groups
  phaseGroup: { background: 'var(--bg-surface)', border: '1px solid var(--border)' },
  phaseHeader: {
    padding: '8px 14px',
    borderBottom: '1px solid var(--border)',
    fontSize: '11px',
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  phaseCount: { color: 'var(--text-subtle)', fontSize: '10px' },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
    gap: '1px',
    background: 'var(--border-subtle)',
  },
  toolCard: (disabled) => ({
    background: 'var(--bg-primary)',
    padding: '14px 16px',
    cursor: disabled ? 'default' : 'pointer',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    opacity: disabled ? 0.45 : 1,
    minHeight: '64px',
    transition: 'background var(--dur-fast, 150ms) ease',
  }),
  cardIcon: { color: 'var(--text-subtle)', flexShrink: 0, marginTop: '1px', display: 'flex' },
  cardBody: { minWidth: 0, flex: 1 },
  cardName: { fontSize: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' },
  cardDesc: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
  soonTag: {
    fontSize: '8px', padding: '1px 5px', border: '1px solid var(--border)',
    color: 'var(--text-subtle)', letterSpacing: '0.06em', textTransform: 'uppercase',
    whiteSpace: 'nowrap', flexShrink: 0,
  },
};

export function Dashboard() {
  const tools = useTools();
  const navigate = useNavigate();
  const { items, clear } = useWorkspace();

  const recentToolIds = loadRecentTools();
  const recentTools = recentToolIds
    .map(id => tools.find(t => t.id === id))
    .filter(Boolean);

  const workspaceItems = [...items].reverse().slice(0, 10);

  // Group active tools by phase for the tool-card catalog
  const phaseGroups = PHASES.map(phase => ({
    ...phase,
    tools: phase.routes
      .map(r => tools.find(t => t.route === r))
      .filter(Boolean),
  })).filter(p => p.tools.length || (p.comingSoon || []).length);

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>
          Security Toolkit &nbsp;<span style={s.titleSub}>/ Dashboard</span>
        </span>
      </div>

      <div style={s.body}>

        {/* Recently Used + Workspace */}
        <div style={s.row}>
          <div style={s.panel}>
            <div style={s.panelHeader}>Recently Used</div>
            <div className="kudo-scroll" style={s.panelScroll}>
              {recentTools.length === 0 ? (
                <EmptyState icon={<Clock size={24} />} text="No recent tools. Launch one below." />
              ) : (
                recentTools.map(tool => (
                  <div
                    key={tool.id}
                    style={s.toolRow}
                    onClick={() => navigate(tool.route)}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  >
                    <div>
                      <div style={s.toolName}>{tool.name}</div>
                      <div style={s.toolMeta}>{tool.description.slice(0, 60)}…</div>
                    </div>
                    <button style={s.launchBtn} onClick={e => { e.stopPropagation(); navigate(tool.route); }}>
                      Launch
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={s.panel}>
            <div style={s.panelHeader}>
              Workspace
              {items.length > 0 && (
                <button style={s.clearBtn} onClick={clear}>Clear</button>
              )}
            </div>
            <div className="kudo-scroll" style={s.panelScroll}>
              {workspaceItems.length === 0 ? (
                <EmptyState icon={<Layers size={24} />} text={<>No workspace items<br />Results from tools appear here.</>} />
              ) : (
                workspaceItems.map(item => {
                  const tool = tools.find(t => t.id === item.source);
                  const clickable = !!tool;
                  return (
                    <div
                      key={item.id}
                      style={{ ...s.workspaceRow, cursor: clickable ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (!clickable) return;
                        localStorage.setItem(`workspace-restore-${item.source}`, JSON.stringify(item.data));
                        navigate(tool.route);
                      }}
                      onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                      onMouseLeave={e => { if (clickable) e.currentTarget.style.background = ''; }}
                    >
                      <span style={s.typeBadge(item.type)}>{TYPE_LABELS[item.type] || item.type}</span>
                      <span style={s.workspaceLabel}>{item.label}</span>
                      <span style={s.workspaceMeta}>{item.source} &nbsp;·&nbsp; {formatTime(item.timestamp)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Tool catalog, grouped by phase */}
        {phaseGroups.map(phase => {
          const PhaseIcon = PHASE_ICONS[phase.id];
          const total = phase.tools.length + (phase.comingSoon || []).length;
          return (
            <div key={phase.id} style={s.phaseGroup}>
              <div style={s.phaseHeader}>
                {PhaseIcon && <PhaseIcon size={14} strokeWidth={1.5} />}
                <span>{phase.label}</span>
                <span style={s.phaseCount}>· {total}</span>
              </div>
              <div className="kudo-stagger" style={s.cardGrid}>
                {phase.tools.map(tool => {
                  const Icon = toolIcon(tool.route);
                  const soon = tool.status === 'coming-soon';
                  return (
                    <div
                      key={tool.id}
                      style={s.toolCard(soon)}
                      onClick={() => { if (!soon) navigate(tool.route); }}
                      onMouseEnter={e => { if (!soon) e.currentTarget.style.background = 'var(--bg-surface)'; }}
                      onMouseLeave={e => { if (!soon) e.currentTarget.style.background = 'var(--bg-primary)'; }}
                    >
                      <span style={s.cardIcon}><Icon size={18} strokeWidth={1.5} /></span>
                      <div style={s.cardBody}>
                        <div style={s.cardName}>
                          {tool.name}
                          {soon && <span style={s.soonTag}>Soon</span>}
                        </div>
                        <div style={s.cardDesc}>{tool.description}</div>
                      </div>
                    </div>
                  );
                })}
                {(phase.comingSoon || []).map(name => (
                  <div key={name} style={s.toolCard(true)}>
                    <span style={s.cardIcon}><Wrench size={18} strokeWidth={1.5} /></span>
                    <div style={s.cardBody}>
                      <div style={s.cardName}>
                        {name}
                        <span style={s.soonTag}>Soon</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}
