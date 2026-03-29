const styles = {
  nav: {
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border)',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  brand: {
    color: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
    fontWeight: 'bold',
    fontSize: '15px',
  },
  backLink: {
    color: 'var(--text-muted)',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    textDecoration: 'none',
  },
};

export function TopNav() {
  return (
    <nav style={styles.nav}>
      <span style={styles.brand}>// 0xKudo Tools</span>
      <a href="https://laynekudo.com" style={styles.backLink}>
        ← laynekudo.com
      </a>
    </nav>
  );
}
