import { useNavigate } from 'react-router-dom';
import { useTools } from '../context/ToolRegistry';
import { useWorkspace } from '../context/WorkspaceContext';
import { loadRecentTools, trackToolVisit } from './Dashboard';

const QUICK_LAUNCH = [
  { id: 'alert-triage', phase: 'Detect' },
  { id: 'threat-intel', phase: 'Detect' },
  { id: 'osint-recon', phase: 'Investigate' },
  { id: 'decoder', phase: 'Investigate' },
  { id: 'incident-report', phase: 'Report' },
  { id: 'intruder', phase: 'Simulate' },
  { id: 'network-scanner', phase: 'Investigate' },
  { id: 'subdomain-enumerator', phase: 'Investigate' },
];

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
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  clearBtn: {
    background: 'none', border: 'none', color: 'var(--text-subtle)',
    fontFamily: 'var(--font)', fontSize: '10px', cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  emptyState: { padding: '16px 14px', fontSize: '12px', color: 'var(--text-subtle)', textAlign: 'center' },
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
  typeBadge: (type) => ({
    fontSize: '9px', padding: '1px 5px',
    border: `1px solid ${TYPE_COLORS[type] || 'var(--border)'}`,
    color: TYPE_COLORS[type] || 'var(--text-muted)',
    letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
  }),
  workspaceLabel: { fontSize: '12px', color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  quickGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border-subtle)' },
  quickCard: {
    background: 'var(--bg-primary)', padding: '12px 14px',
    cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '2px',
  },
  quickCardName: { fontSize: '12px', color: 'var(--text-primary)' },
  quickCardPhase: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' },
};

export function DashboardMobile() {
  const tools = useTools();
  const navigate = useNavigate();
  const { items, clear } = useWorkspace();

  const recentToolIds = loadRecentTools();
  const recentTools = recentToolIds.map(id => tools.find(t => t.id === id)).filter(Boolean);
  const workspaceItems = [...items].reverse().slice(0, 8);
  const quickTools = QUICK_LAUNCH.map(q => ({ ...q, tool: tools.find(t => t.id === q.id) })).filter(q => q.tool);

  return (
    <div style={s.container}>

      {/* Recently Used */}
      <div style={s.panel}>
        <div style={s.panelHeader}>Recently Used</div>
        {recentTools.length === 0 ? (
          <div style={s.emptyState}>No recent tools — launch one from the menu.</div>
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
          <div style={s.emptyState}>No workspace items — results from tools appear here.</div>
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

      {/* Quick Launch */}
      <div style={s.panel}>
        <div style={s.panelHeader}>Quick Launch</div>
        <div style={s.quickGrid}>
          {quickTools.map(q => (
            <div
              key={q.id}
              style={s.quickCard}
              onClick={() => { trackToolVisit(q.id); navigate(q.tool.route); }}
            >
              <div style={s.quickCardName}>{q.tool.name}</div>
              <div style={s.quickCardPhase}>{q.phase}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
