// ProcessTreePanel.jsx
// Shared component: fetches and renders process lineage for any log event.
// Used in SiemDashboard event modal, LogSearch event modal, and AlertQueue alert modal.

import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';

const s = {
  section: { marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' },
  label: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  muted: { fontSize: '11px', color: 'var(--text-muted)' },
  fallbackNote: { fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', fontStyle: 'italic' },
  nodeRow: { display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' },
  nodeMeta: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  btn: {
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
    fontFamily: 'var(--font)', fontSize: '10px', padding: '2px 8px', cursor: 'pointer',
    letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
  },
};

// Parse ProcessGuid out of a Sysmon message string (fallback for rows ingested before guid columns existed)
// Matches ProcessGuid, SourceProcessGuid (EID 8), etc.
function extractGuidFromMessage(message) {
  if (!message) return null;
  // Prefer plain ProcessGuid, fall back to SourceProcessGuid
  const m = message.match(/(?:^|\n)\s*(?:Source)?ProcessGuid:\s*(\{[^}]+\})/im);
  return m ? m[1] : null;
}

// event: the log row object (needs process_guid, process_name, host, id)
export function ProcessTreePanel({ event }) {
  const { getAccessTokenSilently } = useAuth0();
  const navigate = useNavigate();
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!event) { setTree(null); return; }
    // Use stored guid, or parse from message for pre-migration rows
    const processGuid = event.process_guid || extractGuidFromMessage(event.message);
    const hasGuid = !!processGuid;
    const hasNameHost = event.process_name && event.host;
    if (!hasGuid && !hasNameHost) { setTree(null); return; }

    let cancelled = false;
    async function fetch_() {
      setLoading(true);
      setTree(null);
      try {
        const token = await getAccessTokenSilently();
        const params = hasGuid
          ? `?process_guid=${encodeURIComponent(processGuid)}`
          : `?process_name=${encodeURIComponent(event.process_name)}&host=${encodeURIComponent(event.host)}`;
        const res = await fetch(`/api/siem/events/process-tree${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && res.ok) setTree(await res.json());
      } catch {}
      if (!cancelled) setLoading(false);
    }
    fetch_();
    return () => { cancelled = true; };
  }, [event?.id, event?.process_guid, event?.message, getAccessTokenSilently]);

  function lookupCve(processName) {
    localStorage.setItem('workspace-restore-cve-exploit-mapper', JSON.stringify({ query: processName }));
    navigate('/cve-exploit-mapper');
  }

  const hasProcess = event && (event.process_guid || (event.process_name && event.host));

  return (
    <div style={s.section}>
      <div style={s.label}>Process Tree</div>
      {loading && <div style={s.muted}>Loading...</div>}
      {!loading && !hasProcess && <div style={s.muted}>No process data on this event.</div>}
      {!loading && hasProcess && !tree && <div style={s.muted}>No process lineage found.</div>}
      {!loading && tree?.nodes?.length > 0 && (
        <div>
          {tree.mode === 'name_fallback' && (
            <div style={s.fallbackNote}>No process GUIDs — showing events by process name on this host.</div>
          )}
          {tree.nodes.map((node, i) => {
            const depth = node.depth || 0;
            const indent = Math.max(0, depth) * 16;
            const isAncestor = depth < 0;
            const isRoot = depth === 0;
            const marker = isAncestor ? '↑ ' : isRoot ? '● ' : '└ ';
            return (
              <div key={i} style={{ ...s.nodeRow, paddingLeft: `${indent}px` }}>
                <div style={s.nodeMeta}>
                  <span style={{
                    fontSize: '11px',
                    color: 'var(--text-primary)',
                    fontWeight: isRoot ? 'bold' : 'normal',
                    wordBreak: 'break-all',
                    opacity: isAncestor ? 0.7 : 1,
                  }}>
                    {marker}{node.process_name || '(unknown)'}
                  </span>
                  {node.process_id && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>PID {node.process_id}</span>}
                  {node.username && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{node.username}</span>}
                  {node.timestamp && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(node.timestamp).toLocaleTimeString()}</span>}
                </div>
                {node.process_name && (
                  <button style={s.btn} onClick={() => lookupCve(node.process_name)} title={`Look up CVEs for ${node.process_name}`}>
                    CVE Lookup
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ContextMenu: right-click menu rendered at cursor position
// items: [{ label, onClick }]
export function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close); };
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', top: y, left: x, zIndex: 3000,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        minWidth: '180px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            padding: '8px 14px', fontSize: '12px', color: 'var(--text-primary)',
            cursor: 'pointer', letterSpacing: '0.02em',
            borderBottom: i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
          onMouseLeave={e => e.currentTarget.style.background = ''}
          onClick={() => { item.onClick(); onClose(); }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
