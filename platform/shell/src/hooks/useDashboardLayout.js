import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

// Per-user dashboard layout: localStorage-first for instant feel, hydrated from
// the server once (server wins if it has a saved layout), and every change is
// debounce-written back to the server. Returns { layout, setLayout, saving }.
const LS_KEY = (name) => `kudo_dashboard_${name}`;

export function useDashboardLayout(name = 'default', fallback = []) {
  const { getAccessTokenSilently } = useAuth0();
  const [layout, setLayoutState] = useState(() => {
    try { const v = localStorage.getItem(LS_KEY(name)); if (v) return JSON.parse(v); } catch { /* ignore */ }
    return fallback;
  });
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await fetch(`/api/siem/dashboards/${name}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (live && Array.isArray(data.layout) && data.layout.length) setLayoutState(data.layout);
      } catch { /* offline: keep localStorage/fallback */ }
    })();
    return () => { live = false; };
  }, [getAccessTokenSilently, name]);

  const setLayout = useCallback((next) => {
    setLayoutState(prev => {
      const value = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(LS_KEY(name), JSON.stringify(value)); } catch { /* ignore */ }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        setSaving(true);
        try {
          const token = await getAccessTokenSilently();
          await fetch(`/api/siem/dashboards/${name}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ layout: value }),
          });
        } catch { /* transient; localStorage still holds it */ }
        finally { setSaving(false); }
      }, 800);
      return value;
    });
  }, [name, getAccessTokenSilently]);

  return { layout, setLayout, saving };
}
