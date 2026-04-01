import { useNavigate } from 'react-router-dom';
import { useTools } from '../context/ToolRegistry';
import { useWorkspace } from '../context/WorkspaceContext';

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
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em' },
  titleSub: { color: 'var(--text-muted)', fontSize: '11px' },
  body: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  panel: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
  },
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
  emptyState: {
    padding: '24px 14px',
    fontSize: '12px',
    color: 'var(--text-subtle)',
    textAlign: 'center',
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
    return {
      fontSize: '9px',
      padding: '1px 6px',
      border: `1px solid ${colors[type] || 'var(--border)'}`,
      color: colors[type] || 'var(--text-muted)',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    };
  },
  workspaceLabel: { fontSize: '12px', color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  workspaceMeta: { fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' },
  fullWidthPanel: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
  },
  quickLaunchGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1px',
    background: 'var(--border-subtle)',
  },
  quickCard: {
    background: 'var(--bg-primary)',
    padding: '14px 16px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  quickCardName: { fontSize: '12px', color: 'var(--text-primary)', fontWeight: 'bold' },
  quickCardPhase: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' },
};

const QUICK_LAUNCH = [
  { id: 'alert-triage', phase: 'Detect', route: '/alert-triage' },
  { id: 'threat-intel', phase: 'Detect', route: '/threat-intel' },
  { id: 'osint-recon', phase: 'Investigate', route: '/osint-recon' },
  { id: 'decoder', phase: 'Investigate', route: '/decoder' },
  { id: 'incident-report', phase: 'Respond', route: '/incident-report' },
  { id: 'intruder', phase: 'Simulate', route: '/intruder' },
  { id: 'network-scanner', phase: 'Respond', route: '/network-scanner' },
  { id: 'subdomain-enumerator', phase: 'Investigate', route: '/subdomain-enumerator' },
];

export function Dashboard() {
  const tools = useTools();
  const navigate = useNavigate();
  const { items, clear } = useWorkspace();

  const recentToolIds = loadRecentTools();
  const recentTools = recentToolIds
    .map(id => tools.find(t => t.id === id))
    .filter(Boolean);

  const workspaceItems = [...items].reverse().slice(0, 10);

  const quickTools = QUICK_LAUNCH
    .map(q => ({ ...q, tool: tools.find(t => t.id === q.id) }))
    .filter(q => q.tool);

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>
          Security Toolkit &nbsp;<span style={s.titleSub}>/ Dashboard</span>
        </span>
      </div>

      <div style={s.body}>

        {/* Recent tools + Workspace items */}
        <div style={s.row}>

          {/* Recently Used */}
          <div style={s.panel}>
            <div style={s.panelHeader}>Recently Used</div>
            {recentTools.length === 0 ? (
              <div style={s.emptyState}>No recent tools — launch one from the sidebar.</div>
            ) : (
              recentTools.map(tool => (
                <div
                  key={tool.id}
                  style={s.toolRow}
                  onClick={() => navigate(tool.route)}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-panel)'; }}
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

          {/* Workspace Items */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              Workspace
              {items.length > 0 && (
                <button style={s.clearBtn} onClick={clear}>Clear</button>
              )}
            </div>
            {workspaceItems.length === 0 ? (
              <div style={s.emptyState}>No workspace items — results from tools appear here.</div>
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
                    onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'var(--bg-panel)'; }}
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

        {/* Quick Launch */}
        <div style={s.fullWidthPanel}>
          <div style={s.panelHeader}>Quick Launch</div>
          <div style={s.quickLaunchGrid}>
            {quickTools.map(q => (
              <div
                key={q.id}
                style={s.quickCard}
                onClick={() => navigate(q.route)}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-primary)'; }}
              >
                <div style={s.quickCardName}>{q.tool.name}</div>
                <div style={s.quickCardPhase}>{q.phase}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
