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
});
