const { contextBridge, ipcRenderer } = require('electron');

// Inject CSS to remove outer scrollbars and style inner ones
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root {
      overflow: hidden !important;
      height: 100% !important;
      width: 100% !important;
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #2a2928; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #3a3936; }
  `;
  document.head.appendChild(style);
});

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,

  fluentBit: {
    getStatus: () => ipcRenderer.invoke('fluent-bit:status'),
    start: () => ipcRenderer.invoke('fluent-bit:start'),
    stop: () => ipcRenderer.invoke('fluent-bit:stop'),
    restart: () => ipcRenderer.invoke('fluent-bit:restart'),
    info: () => ipcRenderer.invoke('fluent-bit:info'),
    install: () => ipcRenderer.invoke('fluent-bit:install'),
    readConfig: () => ipcRenderer.invoke('fluent-bit:read-config'),
    writeConfig: (configText) => ipcRenderer.invoke('fluent-bit:write-config', configText),
  },

  settings: {
    getTrayOnClose: () => ipcRenderer.invoke('settings:getTrayOnClose'),
    setTrayOnClose: (val) => ipcRenderer.invoke('settings:setTrayOnClose', val),
    hasPin: () => ipcRenderer.invoke('settings:hasPin'),
    setPin: (pin, recoveryPassphrase) => ipcRenderer.invoke('settings:setPin', pin, recoveryPassphrase),
    verifyPin: (pin) => ipcRenderer.invoke('settings:verifyPin', pin),
    addRecovery: (pin, passphrase) => ipcRenderer.invoke('settings:addRecovery', pin, passphrase),
    resetWithPassphrase: (passphrase) => ipcRenderer.invoke('settings:resetWithPassphrase', passphrase),
  },

  auth: {
    onCallback: (cb) => ipcRenderer.on('auth0:callback', (_e, url) => cb(url)),
    setJwt: (token) => ipcRenderer.invoke('electron:setJwt', token),
  },

  tier: {
    setTier: (isPaid) => ipcRenderer.invoke('electron:setTier', isPaid),
    getStorageMode: () => ipcRenderer.invoke('electron:getStorageMode'),
    getIsPaid: () => ipcRenderer.invoke('electron:getIsPaid'),
    setUserSub: (sub) => ipcRenderer.invoke('electron:setUserSub', sub),
  },

  storage: {
    getStoragePath: () => ipcRenderer.invoke('electron:getStoragePath'),
    pickStoragePath: () => ipcRenderer.invoke('electron:pickStoragePath'),
    getCloudStorage: () => ipcRenderer.invoke('electron:getCloudStorage'),
    setCloudStorage: (enabled) => ipcRenderer.invoke('electron:setCloudStorage', enabled),
  },

  ingest: {
    generateKey: () => ipcRenderer.invoke('electron:generateIngestKey'),
    hasKey: () => ipcRenderer.invoke('electron:hasIngestKey'),
    revokeKey: () => ipcRenderer.invoke('electron:revokeIngestKey'),
  },

  eventLog: {
    getChannels: () => ipcRenderer.invoke('eventlog:getChannels'),
    setChannels: (channels) => ipcRenderer.invoke('eventlog:setChannels', channels),
    start: () => ipcRenderer.invoke('eventlog:start'),
    stop: () => ipcRenderer.invoke('eventlog:stop'),
    getStatus: () => ipcRenderer.invoke('eventlog:status'),
  },

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    expand: () => ipcRenderer.send('window:expand'),
    onNavigate: (cb) => ipcRenderer.on('window:navigate', (_e, path) => cb(path)),
  },

  updater: {
    onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, info) => cb(info)),
    onProgress: (cb) => ipcRenderer.on('update:progress', (_e, info) => cb(info)),
    onReady: (cb) => ipcRenderer.on('update:ready', () => cb()),
    onError: (cb) => ipcRenderer.on('update:error', (_e, info) => cb(info)),
    onDismissed: (cb) => ipcRenderer.on('update:dismissed', () => cb()),
    checkPending: () => ipcRenderer.invoke('update:check-pending'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    dismiss: () => ipcRenderer.invoke('update:dismiss'),
  },

  debug: {
    onServerLog: (cb) => ipcRenderer.on('debug:server-log', (_e, entry) => cb(entry)),
  },

  llm: {
    // Query / control
    getStatus: () => ipcRenderer.invoke('llm:status'),
    cancel: () => ipcRenderer.invoke('llm:cancel'),
    cancelDownload: () => ipcRenderer.invoke('llm:cancel-download'),

    // Analysis
    analyze: (candidates, modelKey, authToken) => ipcRenderer.invoke('llm:analyze', candidates, modelKey, authToken),

    // Model library
    getLibrary: () => ipcRenderer.invoke('llm:get-library'),
    setActive: (filename) => ipcRenderer.invoke('llm:set-active', filename),
    removeModel: (filename) => ipcRenderer.invoke('llm:remove-model', filename),

    // Managed model download + update check
    downloadModel: (modelKey) => ipcRenderer.invoke('llm:download-model', modelKey),
    checkUpdate: (modelKey) => ipcRenderer.invoke('llm:check-update', modelKey),

    // Custom model — local file or URL
    browseGguf: () => ipcRenderer.invoke('llm:browse-gguf'),
    addCustom: (filePath, templateFamily) => ipcRenderer.invoke('llm:add-custom', filePath, templateFamily),
    downloadUrl: (url, templateFamily) => ipcRenderer.invoke('llm:download-url', url, templateFamily),

    // Push events from main → renderer
    onStatusChange: (cb) => ipcRenderer.on('llm:status-change', (_e, s) => cb(s)),
    onCandidateResult: (cb) => ipcRenderer.on('llm:candidate-result', (_e, result) => cb(result)),
    onAnalysisStarted: (cb) => ipcRenderer.on('llm:analysis-started', (_e, info) => cb(info)),
    onDownloadProgress: (cb) => ipcRenderer.on('llm:download-progress', (_e, info) => cb(info)),
    onUpdateAvailable: (cb) => ipcRenderer.on('llm:update-available', (_e, info) => cb(info)),
    onRealtimeResult: (cb) => ipcRenderer.on('llm:realtime-result', (_e, result) => cb(result)),
    onRealtimeDisabled: (cb) => ipcRenderer.on('llm:realtime-disabled', (_e, reason) => cb(reason)),

    // Renderer → main: new alerts fired, trigger real-time analysis queue
    notifyNewAlerts: (authToken, sinceId) => ipcRenderer.invoke('llm:notify-new-alerts', authToken, sinceId),
  },
});
