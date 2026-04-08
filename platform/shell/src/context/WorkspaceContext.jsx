import { createContext, useContext, useState, useCallback } from 'react';

const WORKSPACE_KEY = 'cybertools_workspace';

// WorkspaceContext persists inter-tool data (e.g. alert triage results passed to incident report)
// in localStorage as plaintext JSON. This is intentional — the data is transient, same-origin only,
// and contains no long-term PII. localStorage is cleared when the user clears browser data.
// Do not store sensitive secrets or credentials here.
// Security note: same-origin scripts are already trusted under the platform's CSP.
// If requirements change (e.g. multi-origin, sensitive fields), switch to sessionStorage
// or encrypt values before storage.
function loadFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(WORKSPACE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveToStorage(items) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(items));
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const WorkspaceContext = createContext({ items: [], push: () => {}, clear: () => {} });

export function WorkspaceProvider({ children }) {
  const [items, setItems] = useState(loadFromStorage);

  const push = useCallback((type, label, data, source) => {
    const item = { id: generateId(), type, label, data, source, timestamp: Date.now() };
    setItems(prev => {
      const next = [...prev, item];
      saveToStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    saveToStorage([]);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ items, push, clear }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
