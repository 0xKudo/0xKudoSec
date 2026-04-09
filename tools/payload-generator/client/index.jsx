import { useState, useEffect } from 'react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';

const SEND_TARGETS = [
  { id: 'intruder',     label: 'Send to Intruder',      route: '/intruder' },
  { id: 'http-repeater',label: 'Send to HTTP Repeater', route: '/http-repeater' },
  { id: 'scanner',      label: 'Send to Scanner',        route: '/scanner' },
];

function sendToTool(payload, targetId, navigate) {
  localStorage.setItem('payload-generator-import', JSON.stringify({ payload, target: targetId }));
  navigate(SEND_TARGETS.find(t => t.id === targetId).route);
}

const PHASE_COLORS = {
  xss:          'var(--severity-critical)',
  sqli:         'var(--severity-high)',
  cmdi:         'var(--severity-critical)',
  ssti:         'var(--severity-medium)',
  path:         'var(--severity-medium)',
  xxe:          'var(--accent-amber)',
  openredirect: 'var(--severity-low)',
};

const s = {
  container: { padding: 0 },
  header: {
    margin: '-24px -24px 0 -24px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em' },
  titleSub: { color: 'var(--text-muted)', fontSize: '11px' },
  body: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' },
  tabs: { display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', margin: '0 -24px 0 -24px', paddingLeft: '8px' },
  tab: (active) => ({
    padding: '4px 12px',
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent-amber)' : '2px solid transparent',
    background: 'none',
    border: 'none',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: active ? 'var(--accent-amber)' : 'transparent',
    fontFamily: 'var(--font)',
  }),
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
  },
  panelBody: { padding: '14px' },
  row: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '140px' },
  label: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
        fontSize: '12px',
    padding: '6px 10px',
  },
  select: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
        fontSize: '12px',
    padding: '6px 10px',
    width: '100%',
  },
  generateBtn: {
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    border: 'none',
        fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '8px 20px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    alignSelf: 'flex-end',
  },
  codeBlock: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '12px 14px',
    fontSize: '11px',
    color: 'var(--text-primary)',
        whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    position: 'relative',
  },
  copyBtn: {
    position: 'absolute',
    top: '6px',
    right: '8px',
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
        fontSize: '10px',
    padding: '2px 8px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  error: { fontSize: '12px', color: 'var(--severity-critical)', padding: '8px 0' },
  warn: {
    padding: '10px 14px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--severity-high)',
    color: 'var(--severity-high)',
    fontSize: '11px',
    letterSpacing: '0.02em',
  },
  catGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1px',
    background: 'var(--border-subtle)',
  },
  catCard: (active) => ({
    background: active ? 'var(--bg-panel)' : 'var(--bg-primary)',
    padding: '12px 14px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    borderLeft: `2px solid ${active ? 'var(--accent-amber)' : 'transparent'}`,
  }),
  catLabel: { fontSize: '12px', color: 'var(--text-primary)' },
  catCount: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' },
  payloadList: { display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--border-subtle)' },
  payloadRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'var(--bg-primary)',
    gap: '12px',
  },
  payloadLabel: { fontSize: '12px', color: 'var(--text-primary)', flex: 1 },
  sendBtn: {
    background: 'none',
    border: '1px solid var(--accent-amber)',
    color: 'var(--accent-amber)',
        fontSize: '10px',
    padding: '2px 8px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    flexShrink: 0,
    position: 'relative',
  },
  sendMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '2px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    zIndex: 10,
    minWidth: '160px',
  },
  sendMenuItem: {
    display: 'block',
    width: '100%',
    padding: '8px 12px',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    color: 'var(--text-primary)',
        fontSize: '11px',
    cursor: 'pointer',
        letterSpacing: '0.02em',
  },
  copySmall: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
        fontSize: '10px',
    padding: '2px 8px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  handlerBlock: { display: 'flex', flexDirection: 'column', gap: '4px' },
  handlerLine: { fontSize: '11px', color: 'var(--text-muted)', padding: '2px 0' },
};

function CopyButton({ text, style }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button style={style || s.copySmall} onClick={copy}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function SendMenu({ payload }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const targets = [
    { id: 'intruder',      label: 'Intruder',      route: '/intruder' },
    { id: 'http-repeater', label: 'HTTP Repeater',  route: '/http-repeater' },
    { id: 'scanner',       label: 'Scanner',        route: '/scanner' },
  ];

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button style={s.sendBtn} onClick={() => setOpen(o => !o)}>
        Send to {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={s.sendMenu}>
          {targets.map(t => (
            <button
              key={t.id}
              style={s.sendMenuItem}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-panel)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; }}
              onClick={() => {
                setOpen(false);
                sendToTool(payload, t.id, navigate);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── msfvenom tab ────────────────────────────────────────────────────────────

function MsfTab() {
  const isMobile = useIsMobile();
  const { push } = useWorkspace();
  const [payloads, setPayloads] = useState([]);
  const [encoders, setEncoders] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [lhost, setLhost] = useState('');
  const [lport, setLport] = useState('4444');
  const [encoder, setEncoder] = useState('none');
  const [iterations, setIterations] = useState(1);
  const [badchars, setBadchars] = useState('');
  const [outputFile, setOutputFile] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/tools/payload-generator/msf-payloads')
      .then(r => r.json())
      .then(data => {
        setPayloads(data.payloads || []);
        setEncoders(data.encoders || []);
        if (data.payloads?.length) setSelectedId(data.payloads[0].id);
      });
  }, []);

  const generate = async () => {
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/tools/payload-generator/msf-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payloadId: selectedId, lhost, lport: parseInt(lport), encoder, iterations, badchars, outputFile }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error'); return; }
      setResult(data);
      push('payload', `msfvenom ${data.payload.payload} → ${lhost}:${lport}`, data, 'Payload Generator');
    } catch {
      setError('Request failed.');
    }
  };

  const selected = payloads.find(p => p.id === selectedId);
  const grouped = {};
  for (const p of payloads) {
    if (!grouped[p.os]) grouped[p.os] = [];
    grouped[p.os].push(p);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={s.warn}>
        Authorization required. Only use against systems you own or have explicit written permission to test.
      </div>

      <div style={s.panel}>
        <div style={s.panelHeader}>Payload</div>
        <div style={{ ...s.panelBody, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={s.field}>
            <span style={s.label}>Payload type</span>
            <select style={s.select} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              {Object.entries(grouped).map(([os, list]) => (
                <optgroup key={os} label={os}>
                  {list.map(p => (
                    <option key={p.id} value={p.id}>{p.payload} ({p.format})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div style={s.row}>
            <div style={s.field}>
              <span style={s.label}>LHOST</span>
              <input style={s.input} value={lhost} onChange={e => setLhost(e.target.value)} placeholder="10.0.0.1" />
            </div>
            <div style={s.field}>
              <span style={s.label}>LPORT</span>
              <input style={s.input} value={lport} onChange={e => setLport(e.target.value)} placeholder="4444" />
            </div>
            <div style={s.field}>
              <span style={s.label}>Output file</span>
              <input style={s.input} value={outputFile} onChange={e => setOutputFile(e.target.value)} placeholder={`payload.${selected?.format || 'bin'}`} />
            </div>
          </div>

          <div style={s.row}>
            <div style={s.field}>
              <span style={s.label}>Encoder</span>
              <select style={s.select} value={encoder} onChange={e => setEncoder(e.target.value)}>
                {encoders.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
            {encoder !== 'none' && (
              <div style={{ ...s.field, maxWidth: '100px' }}>
                <span style={s.label}>Iterations</span>
                <input style={s.input} type="number" min={1} max={20} value={iterations} onChange={e => setIterations(parseInt(e.target.value) || 1)} />
              </div>
            )}
            <div style={s.field}>
              <span style={s.label}>Bad chars (e.g. \x00\x0a)</span>
              <input style={s.input} value={badchars} onChange={e => setBadchars(e.target.value)} placeholder="\x00\x0a" />
            </div>
          </div>

          {error && <div style={s.error}>{error}</div>}
          <button style={s.generateBtn} onClick={generate}>Generate</button>
        </div>
      </div>

      {result && (
        <>
          <div style={s.panel}>
            <div style={{ ...s.panelHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>msfvenom command</span>
              <SendMenu payload={result.command} />
            </div>
            <div style={{ ...s.codeBlock, margin: '14px' }}>
              {result.command}
              <CopyButton text={result.command} style={s.copyBtn} />
            </div>
          </div>

          <div style={s.panel}>
            <div style={s.panelHeader}>Metasploit listener</div>
            <div style={{ ...s.panelBody, ...s.handlerBlock }}>
              {result.handlerCommands.map((line, i) => (
                <div key={i} style={s.handlerLine}>{line}</div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Web payloads tab ─────────────────────────────────────────────────────────

function WebTab() {
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [payloads, setPayloads] = useState([]);

  useEffect(() => {
    fetch('/api/tools/payload-generator/web-categories')
      .then(r => r.json())
      .then(data => {
        setCategories(data.categories || []);
        if (data.categories?.length) setActiveCategory(data.categories[0].id);
      });
  }, []);

  useEffect(() => {
    if (!activeCategory) return;
    fetch(`/api/tools/payload-generator/web-payloads/${activeCategory}`)
      .then(r => r.json())
      .then(data => setPayloads(data.payloads || []));
  }, [activeCategory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={s.warn}>
        For authorized testing, CTF challenges, and educational use only. Never use against systems you don't own.
      </div>

      <div style={s.panel}>
        <div style={s.panelHeader}>Category</div>
        <div style={s.catGrid}>
          {categories.map(cat => (
            <div
              key={cat.id}
              style={s.catCard(activeCategory === cat.id)}
              onClick={() => setActiveCategory(cat.id)}
              onMouseEnter={e => { if (activeCategory !== cat.id) e.currentTarget.style.background = 'var(--bg-surface)'; }}
              onMouseLeave={e => { if (activeCategory !== cat.id) e.currentTarget.style.background = 'var(--bg-primary)'; }}
            >
              <div style={{ ...s.catLabel, color: PHASE_COLORS[cat.id] || 'var(--text-primary)' }}>{cat.label}</div>
              <div style={s.catCount}>{cat.count} payloads</div>
            </div>
          ))}
        </div>
      </div>

      {payloads.length > 0 && (
        <div style={s.panel}>
          <div style={s.panelHeader}>{categories.find(c => c.id === activeCategory)?.label} payloads</div>
          <div style={s.payloadList}>
            {payloads.map(p => (
              <div key={p.id} style={s.payloadRow}>
                <span style={s.payloadLabel}>{p.label}</span>
                <CopyButton text={p.payload} />
                <SendMenu payload={p.payload} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function PayloadGenerator() {
  const [tab, setTab] = useState('msf');

  return (
    <div style={s.container}>
      <div style={{ ...s.header, margin: isMobile ? '-16px -16px 0 -16px' : '-24px -24px 0 -24px' }}>
        <span style={s.title}>Payload Generator</span>
      </div>

      <div style={s.tabs}>
        <button style={s.tab(tab === 'msf')} onClick={() => setTab('msf')}>msfvenom</button>
        <button style={s.tab(tab === 'web')} onClick={() => setTab('web')}>Web Payloads</button>
      </div>

      <div style={s.body}>
        {tab === 'msf' && <MsfTab />}
        {tab === 'web' && <WebTab />}
      </div>
    </div>
  );
}
