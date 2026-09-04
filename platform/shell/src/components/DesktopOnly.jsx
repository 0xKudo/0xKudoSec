const wrap = {
  maxWidth: 480,
  margin: '48px auto',
  padding: '24px',
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font)',
  textAlign: 'center',
};
const title = { fontSize: '14px', marginBottom: '10px', letterSpacing: '0.02em' };
const body = { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 };
const link = { color: 'var(--text-primary)', textDecoration: 'underline' };

export default function DesktopOnly({ toolName, downloadUrl }) {
  return (
    <div style={wrap}>
      <div style={title}>{toolName} runs in the desktop app</div>
      <p style={body}>
        This tool executes on your own machine and network, so it is only
        available in the 0xKudo desktop app, not in the browser.
        {downloadUrl ? (
          <>
            {' '}
            <a style={link} href={downloadUrl}>Get the desktop app</a>.
          </>
        ) : null}
      </p>
    </div>
  );
}
