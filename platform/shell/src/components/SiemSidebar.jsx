const styles = {
  sidebar: {
    width: '240px',
    background: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflowY: 'auto',
  },
  sectionLabel: {
    padding: '14px 16px 6px',
    fontSize: '10px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--text-subtle)',
  },
  navItem: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    cursor: 'pointer',
    borderLeft: `2px solid ${active ? 'var(--accent-amber)' : 'transparent'}`,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: '12px',
    borderBottom: '1px solid var(--border-subtle)',
    background: active ? 'var(--bg-panel)' : 'transparent',
  }),
  badge: (variant) => ({
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '2px',
    background: variant === 'critical' ? 'var(--severity-critical)' : variant === 'med' ? 'var(--severity-medium)' : 'var(--severity-info)',
    color: '#fff',
    marginLeft: 'auto',
  }),
  toolsLink: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: '12px',
    borderBottom: '1px solid var(--border-subtle)',
    borderLeft: '2px solid transparent',
  },
  footer: {
    marginTop: 'auto',
    borderTop: '1px solid var(--border)',
    padding: '12px 16px',
  },
  footerLink: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    textDecoration: 'none',
    letterSpacing: '0.04em',
  },
};

const NAV = [
  { section: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'logsources', label: 'Log Sources', badge: null },
  ]},
  { section: 'Detection', items: [
    { id: 'alerts', label: 'Alert Queue' },
    { id: 'rules', label: 'Detection Rules' },
  ]},
  { section: 'Response', items: [
    { id: 'cases', label: 'Cases' },
    { id: 'playbooks', label: 'Playbooks' },
  ]},
  { section: 'Investigate', items: [
    { id: 'logsearch', label: 'Log Search' },
    { id: 'timeline', label: 'Timeline' },
  ]},
];

export function SiemSidebar({ activeView, onNavigate, onSwitchToTools }) {
  return (
    <aside style={styles.sidebar}>
      {NAV.map(group => (
        <div key={group.section}>
          <div style={styles.sectionLabel}>{group.section}</div>
          {group.items.map(item => (
            <div
              key={item.id}
              style={styles.navItem(activeView === item.id)}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={e => { if (activeView !== item.id) { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
              onMouseLeave={e => { if (activeView !== item.id) { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; } }}
            >
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && <span style={styles.badge(item.badge)}>&nbsp;</span>}
            </div>
          ))}
        </div>
      ))}

      <div
        style={styles.toolsLink}
        onClick={onSwitchToTools}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        Security Tools ↗
      </div>

      <div style={styles.footer}>
        <a href="https://laynekudo.com" style={styles.footerLink}>← laynekudo.com</a>
      </div>
    </aside>
  );
}
