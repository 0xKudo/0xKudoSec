import { createContext, useContext, useEffect, useState } from 'react';

const ToolRegistryContext = createContext([]);

export function ToolRegistryProvider({ children }) {
  const [tools, setTools] = useState([]);

  useEffect(() => {
    fetch('/api/tools')
      .then(r => r.json())
      .then(setTools)
      .catch(err => console.error('[ToolRegistry] Failed to fetch tools:', err));
  }, []);

  return (
    <ToolRegistryContext.Provider value={tools}>
      {children}
    </ToolRegistryContext.Provider>
  );
}

export function useTools() {
  return useContext(ToolRegistryContext);
}
