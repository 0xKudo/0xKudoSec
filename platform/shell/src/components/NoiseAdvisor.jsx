import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile';

const API = '/api/siem/noise';
const isElectron = typeof window !== 'undefined' && !!window.electron;

const s = {
  container: { padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' },
  header: {
    padding: '0 20px', height: '45px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  tabs: { display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 },
  tabsMobile: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 },
  tab: (active) => ({
    padding: '8px 20px', fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase',
    cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'var(--font)',
    color: active ? 'var(--accent-amber)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent-amber)' : '2px solid transparent',
    marginBottom: '-1px', whiteSpace: 'nowrap',
  }),
  tabMobile: (active) => ({
    flex: '0 0 50%', textAlign: 'center',
    padding: '8px 4px', fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase',
    cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'var(--font)',
    color: active ? 'var(--accent-amber)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent-amber)' : '2px solid transparent',
    marginBottom: '-1px', whiteSpace: 'nowrap',
  }),
  body: { flex: 1, overflow: 'auto', minHeight: 0, padding: '24px' },
  bodyMobile: { flex: 1, overflow: 'auto', minHeight: 0, padding: '16px' },
  settingsBar: { display: 'flex', gap: '16px', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', marginBottom: '20px', flexWrap: 'wrap' },
  label: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  select: { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '12px', padding: '4px 8px', fontFamily: 'var(--font)' },
  btn: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', padding: '6px 14px', fontSize: '11px', fontFamily: 'var(--font)', cursor: 'pointer', letterSpacing: '0.04em' },
  btnSmall: { background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '4px 10px', fontSize: '11px', fontFamily: 'var(--font)', cursor: 'pointer' },
  runBtn: { background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '4px 12px', fontSize: '11px', fontFamily: 'var(--font)', cursor: 'pointer', letterSpacing: '0.04em' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' },
  thChk: { textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', width: '36px' },
  thSm: { textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', width: '80px' },
  thCve: { textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', width: '70px' },
  thActions: { textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', width: '100px' },
  tdLlm: { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', verticalAlign: 'top', wordBreak: 'break-word' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', verticalAlign: 'top' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' },
  badge: (color) => ({ display: 'inline-block', padding: '2px 8px', fontSize: '10px', border: `1px solid ${color}`, color, letterSpacing: '0.06em' }),
  progress: { width: '100%', height: '4px', background: 'var(--border)', marginTop: '6px' },
  progressFill: (pct) => ({ height: '100%', width: `${Math.min(pct, 100)}%`, background: 'var(--accent-amber)', transition: 'width 0.3s' }),
  empty: { padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' },
  thresholdBlock: { padding: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', marginBottom: '20px' },
  thresholdLabel: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' },
  thresholdHint: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', fontStyle: 'italic' },
  bulkBar: { display: 'flex', gap: '8px', marginBottom: '12px' },
  card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '12px', marginBottom: '10px' },
  cardTitle: { fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' },
  cardMeta: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' },
  cardActions: { display: 'flex', gap: '6px' },
  banner: (color) => ({
    padding: '8px 14px', marginBottom: '16px', background: 'var(--bg-surface)',
    border: `1px solid ${color}`, fontSize: '11px', color,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
  }),
  bannerClose: (color) => ({ background: 'none', border: 'none', color, fontFamily: 'var(--font)', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }),
  divider: { width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0 },
};

const TABS = ['Candidates', 'Activity Log'];
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info', null];
const SEV_COLOR = { critical: 'var(--severity-critical)', high: 'var(--severity-high)', medium: 'var(--severity-medium)', low: 'var(--severity-low)', info: 'var(--severity-info)' };

const LLM_MODELS = [
  { key: 'phi-3.5-mini-q4', label: 'Phi-3.5 Mini Q4 (~2.2GB)' },
  { key: 'qwen2.5-1.5b-q4', label: 'Qwen2.5 1.5B Q4 (~1GB)' },
  { key: 'llama-3.2-3b-q4', label: 'Llama 3.2 3B Q4 (~2GB)' },
];

function CveSafeCell({ candidate, llmResults }) {
  const result = llmResults[candidate.id];
  const dbSafe = candidate.llm_cve_safe;
  const dbChecked = candidate.llm_checked_at;

  // Prefer in-session result over DB value
  if (result === 'analyzing') {
    return <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>checking...</span>;
  }
  if (result) {
    return result.cve_safe
      ? <span style={{ color: 'var(--severity-low)', fontSize: '11px' }}>safe</span>
      : <span style={{ color: 'var(--severity-critical)', fontSize: '11px' }} title={result.cve_note}>unsafe</span>;
  }
  if (dbChecked) {
    return dbSafe === false
      ? <span style={{ color: 'var(--severity-critical)', fontSize: '11px' }} title={candidate.llm_cve_note || ''}>unsafe</span>
      : <span style={{ color: 'var(--severity-low)', fontSize: '11px' }}>safe</span>;
  }
  return <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>;
}

function LlmExplanationCell({ candidate, llmResults }) {
  const result = llmResults[candidate.id];
  if (result === 'analyzing') return <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>analyzing...</span>;
  if (result?.explanation) return <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{result.explanation}</span>;
  if (candidate.llm_explanation) return <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{candidate.llm_explanation}</span>;
  return <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>;
}

function isCveUnsafe(candidate, llmResults) {
  const result = llmResults[candidate.id];
  if (result && result !== 'analyzing') return result.cve_safe === false;
  return candidate.llm_cve_safe === false;
}

function groupBySeverity(candidates) {
  const groups = {};
  for (const c of candidates) {
    const sev = c.field_signature?.dominant_severity || null;
    const key = sev || 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  return SEV_ORDER.map(sev => {
    const key = sev || 'unknown';
    return groups[key] ? { sev: key, items: groups[key] } : null;
  }).filter(Boolean);
}

export default function NoiseAdvisor() {
  const { getAccessTokenSilently } = useAuth0();
  const isMobile = useIsMobile();

  const [status, setStatus] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [activity, setActivity] = useState([]);
  const [settings, setSettings] = useState({ noise_auto_suppress: 'off', noise_llm_enabled: true, noise_llm_trigger: 'manual', llm_model: 'phi-3.5-mini-q4' });
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(null);
  const [collapsedSev, setCollapsedSev] = useState(new Set());
  const [runResult, setRunResult] = useState(null);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [actionBanner, setActionBanner] = useState(null);
  const [undoingId, setUndoingId] = useState(null);
  const [overrideId, setOverrideId] = useState(null); // candidate id showing override input
  const [overrideNote, setOverrideNote] = useState('');

  // LLM state
  const [llmStatus, setLlmStatus] = useState('idle'); // idle | loading | running | unavailable
  const [llmResults, setLlmResults] = useState({}); // candidateId → { explanation, cve_safe, cve_note } | 'analyzing'
  const [llmRunning, setLlmRunning] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [modelLibrary, setModelLibrary] = useState([]); // from llm:get-library
  const [modelUpdateAvailable, setModelUpdateAvailable] = useState(null); // { modelKey, displayName }
  const [downloadProgress, setDownloadProgress] = useState(null); // { modelKey/filename, percent }
  const [downloadingModel, setDownloadingModel] = useState(null);
  const isMountedRef = useRef(true);

  const authHeaders = useCallback(async () => {
    const token = await getAccessTokenSilently();
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, [getAccessTokenSilently]);

  const load = useCallback(async () => {
    try {
      const h = await authHeaders();
      const [statusRes, candidatesRes, activityRes, settingsRes] = await Promise.all([
        fetch(`${API}/status`, { headers: h }),
        fetch(`${API}/candidates`, { headers: h }),
        fetch(`${API}/activity`, { headers: h }),
        fetch(`${API}/settings`, { headers: h }),
      ]);
      if (!isMountedRef.current) return;
      setStatus(await statusRes.json());
      setCandidates(await candidatesRes.json());
      setActivity(await activityRes.json());
      setSettings(await settingsRes.json());
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [authHeaders]);

  // Load model library from Electron
  const loadModelLibrary = useCallback(async () => {
    if (!isElectron) return;
    const res = await window.electron.llm.getLibrary();
    if (res.ok && isMountedRef.current) setModelLibrary(res.models);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    load();
    loadModelLibrary();

    // Get initial LLM status — restore llmRunning if analysis was in progress when we navigated away
    if (isElectron) {
      window.electron.llm.getStatus().then(s => {
        if (isMountedRef.current) {
          setLlmStatus(s);
          if (s === 'running' || s === 'loading') setLlmRunning(true);
        }
      });

      // Push events from main process
      window.electron.llm.onStatusChange(s => {
        if (!isMountedRef.current) return;
        setLlmStatus(s);
        if (s === 'idle' || s === 'unavailable') setLlmRunning(false);
      });
      window.electron.llm.onUpdateAvailable(info => { if (isMountedRef.current) setModelUpdateAvailable(info); });
      window.electron.llm.onDownloadProgress(info => {
        if (isMountedRef.current) setDownloadProgress(info);
      });
      window.electron.llm.onCandidateResult(async result => {
        if (!result.error) {
          // Write to server immediately so results survive navigation
          try {
            const h = await authHeaders();
            await fetch(`${API}/candidates/${result.id}/llm-result`, {
              method: 'PATCH',
              headers: h,
              body: JSON.stringify({ llm_explanation: result.explanation, llm_cve_safe: result.cve_safe, llm_cve_note: result.cve_note }),
            });
          } catch (_) {}
        }
        if (isMountedRef.current) {
          setLlmResults(prev => ({ ...prev, [result.id]: result.error ? null : result }));
        }
      });
    }

    return () => { isMountedRef.current = false; };
  }, [load, loadModelLibrary]);

  // Auto-trigger LLM if trigger is 'auto' and there are unanalyzed candidates
  useEffect(() => {
    if (!isElectron || !settings.noise_llm_enabled || settings.noise_llm_trigger !== 'auto') return;
    if (llmStatus !== 'idle' || llmRunning) return;
    const unanalyzed = candidates.filter(c => !c.llm_checked_at && !llmResults[c.id]);
    if (unanalyzed.length > 0) runLlmAnalysis(unanalyzed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, settings.noise_llm_trigger, settings.noise_llm_enabled]);

  const saveSetting = async (key, value) => {
    setSaving(true);
    const h = await authHeaders();
    await fetch(`${API}/settings`, { method: 'PATCH', headers: h, body: JSON.stringify({ [key]: value }) });
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaving(false);
  };

  const runAnalysis = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const h = await authHeaders();
      const res = await fetch(`${API}/run`, { method: 'POST', headers: h });
      if (!res.ok) {
        setRunning(false);
        setRunResult({ error: true });
        return;
      }
      const data = await res.json();
      setRunning(false);
      setRunResult(data.result ?? { scored: 0, total: 0 });
      await load();
    } catch {
      setRunning(false);
      setRunResult({ error: true });
    }
  };

  // Run LLM analysis via Electron IPC, then write results back to server
  const runLlmAnalysis = async (targetCandidates) => {
    if (!isElectron || llmRunning) return;
    const toAnalyze = targetCandidates || candidates.filter(c => !c.llm_checked_at);
    if (!toAnalyze.length) return;

    setLlmRunning(true);
    setLlmError(null);

    // Mark all targets as 'analyzing' so rows show spinners immediately
    setLlmResults(prev => {
      const next = { ...prev };
      toAnalyze.forEach(c => { next[c.id] = 'analyzing'; });
      return next;
    });

    const res = await window.electron.llm.analyze(
      toAnalyze.map(c => ({ id: c.id, field_signature: c.field_signature, daily_avg: c.daily_avg, days: 7 })),
      settings.llm_model
    );

    setLlmRunning(false);

    if (!res.ok) {
      setLlmError(res.err);
      setLlmResults(prev => {
        const next = { ...prev };
        toAnalyze.forEach(c => { delete next[c.id]; });
        return next;
      });
      return;
    }

    // Results were written to server per-candidate in onCandidateResult — just refresh
    setLlmResults({});
    await load();
  };

  const downloadModel = async (modelKey) => {
    if (!isElectron || downloadingModel) return;
    setDownloadingModel(modelKey);
    setDownloadProgress({ modelKey, percent: 0 });
    const res = await window.electron.llm.downloadModel(modelKey);
    setDownloadingModel(null);
    setDownloadProgress(null);
    if (!res.ok) {
      setLlmError(res.err);
    } else {
      await loadModelLibrary();
      // Auto-set as active if no active model
      const lib = await window.electron.llm.getLibrary();
      const hasActive = lib.ok && lib.models.some(m => m.active);
      if (!hasActive) {
        const managed = LLM_MODELS.find(m => m.key === modelKey);
        if (managed) {
          const filename = lib.ok && lib.models.find(m => m.modelKey === modelKey)?.filename;
          if (filename) await window.electron.llm.setActive(filename);
        }
      }
      await loadModelLibrary();
    }
  };

  const updateStatus = async (id, newStatus) => {
    setPendingIds(prev => new Set([...prev, id]));
    try {
      const h = await authHeaders();
      const res = await fetch(`${API}/candidates/${id}`, {
        method: 'PATCH', headers: h, body: JSON.stringify({ status: newStatus }),
      });
      if (res.status === 409) {
        const data = await res.json();
        setActionBanner({ text: data.llm_cve_note ? `CVE unsafe: ${data.llm_cve_note}` : 'Cannot suppress: this pattern is flagged as CVE-unsafe.', color: 'var(--severity-critical)' });
        setTimeout(() => setActionBanner(null), 6000);
      } else {
        setActionBanner({ text: newStatus === 'approved' ? 'Suppression rule created.' : 'Candidate rejected.', color: 'var(--severity-low)' });
        setTimeout(() => setActionBanner(null), 3000);
        await load();
      }
    } finally {
      setPendingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const overrideApprove = async (id) => {
    if (!overrideNote.trim()) return;
    setPendingIds(prev => new Set([...prev, id]));
    setOverrideId(null);
    try {
      const h = await authHeaders();
      await fetch(`${API}/candidates/${id}`, {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ status: 'approved', llm_override: true, llm_override_note: overrideNote.trim() }),
      });
      setOverrideNote('');
      setActionBanner({ text: 'Override applied. Suppression rule created.', color: 'var(--severity-low)' });
      setTimeout(() => setActionBanner(null), 3000);
      await load();
    } finally {
      setPendingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const bulkUpdate = async (newStatus) => {
    const ids = [...selected];
    setPendingIds(new Set(ids));
    try {
      const h = await authHeaders();
      const res = await fetch(`${API}/candidates/bulk`, {
        method: 'POST', headers: h, body: JSON.stringify({ ids, status: newStatus }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setActionBanner({ text: 'All selected candidates are CVE-unsafe and cannot be suppressed.', color: 'var(--severity-critical)' });
        setTimeout(() => setActionBanner(null), 6000);
      } else {
        const blocked = data.cve_blocked?.length || 0;
        const updated = data.updated || 0;
        const baseMsg = newStatus === 'approved'
          ? `${updated} suppression rule${updated !== 1 ? 's' : ''} created.`
          : `${updated} candidate${updated !== 1 ? 's' : ''} rejected.`;
        const blockMsg = blocked > 0 ? ` ${blocked} skipped (CVE-unsafe).` : '';
        setActionBanner({ text: baseMsg + blockMsg, color: blocked > 0 ? 'var(--severity-medium)' : 'var(--severity-low)' });
        setTimeout(() => setActionBanner(null), 4000);
        setSelected(new Set());
        await load();
      }
    } finally {
      setPendingIds(new Set());
    }
  };

  const undo = async (id) => {
    setUndoingId(id);
    const h = await authHeaders();
    await fetch(`${API}/candidates/${id}/undo`, { method: 'POST', headers: h });
    await load();
    setUndoingId(null);
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectGroup = (items) => {
    const ids = items.map(c => c.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(candidates.map(c => c.id)));
  const deselectAll = () => setSelected(new Set());

  if (loading) return <div style={s.empty}>Loading...</div>;

  const eventsPct = Math.min(((status?.total_events || 0) / 10000) * 100, 100);
  const daysPct = Math.min(((status?.days_ingested || 0) / 7) * 100, 100);
  const thresholdMet = status?.threshold_met;

  // Determine model install state for UI prompts
  const activeModel = modelLibrary.find(m => m.active);
  const selectedModelEntry = modelLibrary.find(m => m.modelKey === settings.llm_model);
  const modelInstalled = selectedModelEntry?.status === 'ready';
  const llmEnabled = settings.noise_llm_enabled;
  const showDownloadPrompt = isElectron && llmEnabled && !modelInstalled && !downloadingModel;
  const llmUnavailable = isElectron && llmStatus === 'unavailable';

  // Unanalyzed candidates count
  const unanalyzedCount = candidates.filter(c => !c.llm_checked_at && llmResults[c.id] !== 'analyzing' && !llmResults[c.id]).length;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={isMobile ? { ...s.header, flexWrap: 'wrap' } : s.header}>
        <span style={s.title}>Noise Advisor</span>
        {isElectron && modelUpdateAvailable && (
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--accent-amber)', letterSpacing: '0.06em' }}>
            model update available: {modelUpdateAvailable.displayName}
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div style={isMobile ? s.tabsMobile : s.tabs}>
        {TABS.map((t, i) => (
          <button
            key={t}
            style={isMobile ? s.tabMobile(tab === i) : s.tab(tab === i)}
            onClick={() => setTab(i)}
            onMouseEnter={e => { if (tab !== i) e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { if (tab !== i) e.currentTarget.style.color = 'var(--text-muted)'; }}
          >{t}</button>
        ))}
      </div>

      <div style={isMobile ? s.bodyMobile : s.body}>

        {/* LLM unavailable banner */}
        {llmUnavailable && (
          <div style={s.banner('var(--severity-medium)')}>
            <span>LLM engine unavailable. Candidates are shown without CVE analysis. This may be due to low memory or a model load error.</span>
            <button style={s.bannerClose('var(--severity-medium)')} onClick={() => setLlmStatus('idle')}>✕</button>
          </div>
        )}

        {/* LLM error banner */}
        {llmError && (
          <div style={s.banner('var(--severity-critical)')}>
            <span>LLM error: {llmError}</span>
            <button style={s.bannerClose('var(--severity-critical)')} onClick={() => setLlmError(null)}>✕</button>
          </div>
        )}

        {/* Download model prompt */}
        {showDownloadPrompt && (
          <div style={s.banner('var(--border)')}>
            <span style={{ color: 'var(--text-muted)' }}>
              Download a model to enable CVE safety checks.{' '}
              {selectedModelEntry ? `${selectedModelEntry.displayName} (~${Math.round((selectedModelEntry.sizeBytes || 0) / 1e9 * 10) / 10}GB)` : 'Select a model below.'}
            </span>
            {selectedModelEntry?.downloadUrl ? (
              <button style={s.runBtn} onClick={() => downloadModel(settings.llm_model)}>Download</button>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Check for an app update to enable downloads.</span>
            )}
          </div>
        )}

        {/* Download progress */}
        {downloadProgress && (
          <div style={{ padding: '8px 14px', marginBottom: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: '4px' }}>Downloading model... {downloadProgress.percent ?? 0}%</div>
            <div style={s.progress}><div style={s.progressFill(downloadProgress.percent ?? 0)} /></div>
          </div>
        )}

        {/* Run result banners */}
        {runResult?.error && (
          <div style={s.banner('var(--severity-critical)')}>
            <span>Analysis failed. Check server logs.</span>
            <button style={s.bannerClose('var(--severity-critical)')} onClick={() => setRunResult(null)}>✕</button>
          </div>
        )}
        {runResult && !runResult.skipped && !runResult.error && (
          <div style={s.banner('var(--severity-low)')}>
            <span>Analysis complete: {runResult.scored ?? 0} new candidate{runResult.scored !== 1 ? 's' : ''} found.</span>
            <button style={s.bannerClose('var(--severity-low)')} onClick={() => setRunResult(null)}>✕</button>
          </div>
        )}
        {runResult?.skipped && (
          <div style={s.banner('var(--border)')}>
            <span style={{ color: 'var(--text-muted)' }}>Not enough data yet: {Math.round(runResult.days_ingested ?? 0)} of 7 days, {parseInt(runResult.total_events ?? 0).toLocaleString()} of 10,000 events.</span>
            <button style={s.bannerClose('var(--text-muted)')} onClick={() => setRunResult(null)}>✕</button>
          </div>
        )}

        {/* Action banner */}
        {actionBanner && (
          <div style={s.banner(actionBanner.color || 'var(--severity-low)')}>
            <span>{actionBanner.text}</span>
            <button style={s.bannerClose(actionBanner.color || 'var(--severity-low)')} onClick={() => setActionBanner(null)}>✕</button>
          </div>
        )}

        {/* Settings bar */}
        <div style={s.settingsBar}>
          <span style={s.label}>Auto-suppress{saving ? ' saving...' : ''}</span>
          <select style={s.select} value={settings.noise_auto_suppress} onChange={e => saveSetting('noise_auto_suppress', e.target.value)}>
            <option value="off">Suggest only</option>
            <option value="high_only">Auto-create (high confidence)</option>
            <option value="all">Auto-create (all)</option>
          </select>

          {isElectron && <>
            <div style={s.divider} />
            <span style={s.label}>LLM</span>
            <select style={s.select} value={settings.noise_llm_enabled ? 'on' : 'off'} onChange={e => saveSetting('noise_llm_enabled', e.target.value === 'on')}>
              <option value="on">Enabled</option>
              <option value="off">Disabled</option>
            </select>
            {llmEnabled && <>
              <select style={s.select} value={settings.noise_llm_trigger} onChange={e => saveSetting('noise_llm_trigger', e.target.value)}>
                <option value="manual">Manual trigger</option>
                <option value="auto">Auto trigger</option>
              </select>
              <select
                style={s.select}
                value={settings.llm_model}
                onChange={e => saveSetting('llm_model', e.target.value)}
              >
                {LLM_MODELS.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
              {llmStatus !== 'idle' && llmStatus !== 'unavailable' && (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  {llmStatus === 'loading' ? 'loading model...' : `analyzing (${Object.values(llmResults).filter(r => r !== 'analyzing').length}/${Object.keys(llmResults).length})`}
                </span>
              )}
            </>}
          </>}

          <button
            style={{ ...s.runBtn, marginLeft: 'auto', opacity: running ? 0.5 : 1 }}
            onClick={runAnalysis}
            disabled={running}
            onMouseEnter={e => { if (!running) e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            {running ? 'Running...' : 'Run Analysis'}
          </button>

          {isElectron && llmEnabled && modelInstalled && settings.noise_llm_trigger === 'manual' && (
            <button
              style={{ ...s.runBtn, opacity: (llmRunning || !unanalyzedCount) ? 0.5 : 1 }}
              onClick={() => runLlmAnalysis()}
              disabled={llmRunning || !unanalyzedCount}
              onMouseEnter={e => { if (!llmRunning && unanalyzedCount) e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              {llmRunning ? 'Analyzing...' : `Run LLM${unanalyzedCount ? ` (${unanalyzedCount})` : ''}`}
            </button>
          )}

          {llmRunning && (
            <button
              style={{ ...s.btnSmall, fontSize: '10px' }}
              onClick={() => window.electron.llm.cancel()}
            >
              Cancel
            </button>
          )}
        </div>

        {/* Threshold progress */}
        {!thresholdMet && (
          <div style={s.thresholdBlock}>
            <div style={s.thresholdLabel}>Events ingested: {(status?.total_events || 0).toLocaleString()} / 10,000</div>
            <div style={s.progress}><div style={s.progressFill(eventsPct)} /></div>
            <div style={{ ...s.thresholdLabel, marginTop: '12px' }}>Days active: {Math.floor(status?.days_ingested || 0)} / 7</div>
            <div style={s.progress}><div style={s.progressFill(daysPct)} /></div>
            <div style={s.thresholdHint}>Noise candidates appear when either threshold is met.</div>
          </div>
        )}

        {/* Candidates tab */}
        {tab === 0 && (
          <>
            {candidates.length > 0 && (
              <div style={{ ...s.bulkBar, marginBottom: selected.size > 0 ? '0' : '12px' }}>
                <button style={s.btnSmall} onClick={selected.size === candidates.length ? deselectAll : selectAll}>
                  {selected.size === candidates.length ? 'Deselect All' : `Select All ${candidates.length}`}
                </button>
                {selected.size > 0 && <>
                  <button style={s.btn} onClick={() => bulkUpdate('approved')}>Approve {selected.size}</button>
                  <button style={s.btnSmall} onClick={() => bulkUpdate('rejected')}>Reject {selected.size}</button>
                </>}
              </div>
            )}

            {candidates.length === 0 ? (
              <div style={s.empty}>
                {thresholdMet
                  ? 'No noise candidates found. Check back after the next daily analysis or click Run Analysis.'
                  : 'Candidates will appear here once the learning threshold is met.'}
              </div>
            ) : (
              groupBySeverity(candidates).map(({ sev, items }) => {
                const collapsed = collapsedSev.has(sev);
                const color = SEV_COLOR[sev] || 'var(--text-muted)';
                const toggle = () => setCollapsedSev(prev => {
                  const next = new Set(prev);
                  next.has(sev) ? next.delete(sev) : next.add(sev);
                  return next;
                });
                const showLlmCols = isElectron && llmEnabled;
                return (
                  <div key={sev} style={{ marginBottom: '16px' }}>
                    <button
                      onClick={toggle}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${color}`, padding: '6px 0', cursor: 'pointer', marginBottom: collapsed ? 0 : '8px' }}
                    >
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font)', color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{sev}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font)' }}>{items.length}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font)' }}>{collapsed ? '+' : '−'}</span>
                    </button>

                    {!collapsed && (isMobile ? (
                      items.map(c => {
                        const unsafe = isCveUnsafe(c, llmResults);
                        const result = llmResults[c.id];
                        return (
                          <div key={c.id} style={{ ...s.card, border: unsafe ? '1px solid var(--severity-critical)' : s.card.border }}>
                            <div style={s.cardTitle}>{c.field_signature.event_category}</div>
                            <div style={s.cardMeta}>
                              {[c.field_signature.source, c.field_signature.event_id ? `Event ID ${c.field_signature.event_id}` : null, c.field_signature.process_name, c.field_signature.username].filter(Boolean).join(' / ')}, {parseFloat(c.daily_avg).toFixed(1)}/day
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                              <span style={s.badge(c.confidence === 'high' ? 'var(--severity-critical)' : 'var(--severity-medium)')}>{c.confidence.toUpperCase()}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>score {c.score}</span>
                              {showLlmCols && (
                                result === 'analyzing'
                                  ? <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>checking CVE...</span>
                                  : unsafe
                                    ? <span style={{ fontSize: '11px', color: 'var(--severity-critical)' }}>CVE unsafe</span>
                                    : (c.llm_checked_at || result) ? <span style={{ fontSize: '11px', color: 'var(--severity-low)' }}>CVE safe</span> : null
                              )}
                            </div>
                            {unsafe && (result?.cve_note || c.llm_cve_note) && (
                              <div style={{ fontSize: '11px', color: 'var(--severity-critical)', marginBottom: '8px' }}>
                                {result?.cve_note || c.llm_cve_note}
                              </div>
                            )}
                            {(result?.explanation || c.llm_explanation) && !unsafe && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                {result?.explanation || c.llm_explanation}
                              </div>
                            )}
                            <div style={s.cardActions}>
                              {unsafe ? (
                                <button style={{ ...s.btnSmall, color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }} onClick={() => { setOverrideId(c.id); setOverrideNote(''); }}>Override</button>
                              ) : (
                                <button style={s.btnSmall} onClick={() => updateStatus(c.id, 'approved')}>Approve</button>
                              )}
                              <button style={s.btnSmall} onClick={() => updateStatus(c.id, 'rejected')}>Reject</button>
                            </div>
                            {overrideId === c.id && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                                <textarea
                                  autoFocus
                                  placeholder="Why is this safe to suppress?"
                                  value={overrideNote}
                                  onChange={e => setOverrideNote(e.target.value)}
                                  style={{ fontSize: '11px', fontFamily: 'var(--font)', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '4px 6px', resize: 'vertical', minHeight: '56px', width: '100%' }}
                                />
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button style={{ ...s.btnSmall, opacity: overrideNote.trim() ? 1 : 0.4 }} disabled={!overrideNote.trim()} onClick={() => overrideApprove(c.id)}>Confirm</button>
                                  <button style={s.btnSmall} onClick={() => { setOverrideId(null); setOverrideNote(''); }}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <table style={s.table}>
                        <thead>
                          <tr>
                            <th style={s.thChk}><input type="checkbox" checked={items.every(c => selected.has(c.id))} ref={el => { if (el) el.indeterminate = items.some(c => selected.has(c.id)) && !items.every(c => selected.has(c.id)); }} onChange={() => toggleSelectGroup(items)} /></th>
                            <th style={s.th}>Pattern</th>
                            <th style={s.thSm}>Daily Avg</th>
                            <th style={s.thSm}>Confidence</th>
                            <th style={{ ...s.thSm, width: '60px' }}>Score</th>
                            {showLlmCols && <th style={s.thCve}>CVE Safe</th>}
                            {showLlmCols && <th style={s.th}>LLM Analysis</th>}
                            <th style={s.thActions}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(c => {
                            const pending = pendingIds.has(c.id);
                            const unsafe = isCveUnsafe(c, llmResults);
                            return (
                              <tr key={c.id} style={{ opacity: pending ? 0.4 : 1, transition: 'opacity 0.2s', background: unsafe ? 'color-mix(in srgb, var(--severity-critical) 5%, transparent)' : undefined }}>
                                <td style={s.td}><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} disabled={pending} /></td>
                                <td style={s.td}>
                                  <div style={{ fontWeight: 600 }}>{c.field_signature.event_category}</div>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                    {[c.field_signature.source, c.field_signature.event_id ? `Event ID ${c.field_signature.event_id}` : null, c.field_signature.process_name, c.field_signature.username].filter(Boolean).join(' / ')}
                                  </div>
                                </td>
                                <td style={s.td}>{parseFloat(c.daily_avg).toFixed(1)}/day</td>
                                <td style={s.td}>
                                  <span style={s.badge(c.confidence === 'high' ? 'var(--severity-critical)' : 'var(--severity-medium)')}>
                                    {c.confidence.toUpperCase()}
                                  </span>
                                </td>
                                <td style={s.td}>{c.score}</td>
                                {showLlmCols && <td style={s.td}><CveSafeCell candidate={c} llmResults={llmResults} /></td>}
                                {showLlmCols && <td style={s.tdLlm}><LlmExplanationCell candidate={c} llmResults={llmResults} /></td>}
                                <td style={s.td}>
                                  {pending ? (
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Updating...</span>
                                  ) : (
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                      {unsafe ? (
                                        <button
                                          style={{ ...s.btnSmall, color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }}
                                          onClick={() => { setOverrideId(c.id); setOverrideNote(''); }}
                                        >Override</button>
                                      ) : (
                                        <button style={s.btnSmall} onClick={() => updateStatus(c.id, 'approved')}>Approve</button>
                                      )}
                                      <button style={s.btnSmall} onClick={() => updateStatus(c.id, 'rejected')}>Reject</button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ))}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* Activity Log tab */}
        {tab === 1 && (
          <>
            {activity.length === 0 ? (
              <div style={s.empty}>No suppression activity in the last 30 days.</div>
            ) : isMobile ? (
              activity.map(c => (
                <div key={c.id} style={s.card}>
                  <div style={s.cardTitle}>{c.field_signature.event_category}</div>
                  <div style={s.cardMeta}>{c.field_signature.source}, {c.rule_name || 'No rule'}</div>
                  <div style={{ marginBottom: '8px' }}>
                    <span style={s.badge('var(--severity-low)')}>{c.status}</span>
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(c.updated_at).toLocaleDateString()}</span>
                  </div>
                  <div style={s.cardActions}>
                    <button style={s.btnSmall} onClick={() => undo(c.id)} disabled={undoingId === c.id}>
                      {undoingId === c.id ? 'Undoing...' : 'Undo'}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Pattern</th>
                    <th style={s.th}>Rule Created</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map(c => (
                    <tr key={c.id}>
                      <td style={s.td}>
                        <div>{c.field_signature.event_category}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{c.field_signature.source}</div>
                      </td>
                      <td style={s.td}>{c.rule_name || 'None'}</td>
                      <td style={s.td}><span style={s.badge('var(--severity-low)')}>{c.status}</span></td>
                      <td style={s.td}>{new Date(c.updated_at).toLocaleDateString()}</td>
                      <td style={s.td}><button style={s.btnSmall} onClick={() => undo(c.id)} disabled={undoingId === c.id}>{undoingId === c.id ? 'Undoing...' : 'Undo'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* Override modal */}
      {overrideId && (
        <div style={s.modalOverlay} onClick={() => { setOverrideId(null); setOverrideNote(''); }}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Override LLM Verdict</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              The LLM flagged this pattern as potentially unsafe. Provide a reason why it is safe to suppress. This will be used to improve future analysis.
            </div>
            <textarea
              autoFocus
              placeholder="e.g. Known NVIDIA overlay network activity, not a threat"
              value={overrideNote}
              onChange={e => setOverrideNote(e.target.value)}
              style={{ fontSize: '12px', fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '8px', resize: 'vertical', minHeight: '80px', width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button style={s.btnSmall} onClick={() => { setOverrideId(null); setOverrideNote(''); }}>Cancel</button>
              <button
                style={{ ...s.btnSmall, opacity: overrideNote.trim() ? 1 : 0.4, color: 'var(--severity-low)', borderColor: 'var(--severity-low)' }}
                disabled={!overrideNote.trim()}
                onClick={() => overrideApprove(overrideId)}
              >Confirm Override</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
