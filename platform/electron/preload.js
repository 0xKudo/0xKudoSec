const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,

  fluentBit: {
    getStatus: () => ipcRenderer.invoke('fluent-bit:status'),
    start: () => ipcRenderer.invoke('fluent-bit:start'),
    stop: () => ipcRenderer.invoke('fluent-bit:stop'),
    restart: () => ipcRenderer.invoke('fluent-bit:restart'),
    writeConfig: (configText) => ipcRenderer.invoke('fluent-bit:write-config', configText),
  },

  settings: {
    getTrayOnClose: () => ipcRenderer.invoke('settings:getTrayOnClose'),
    setTrayOnClose: (val) => ipcRenderer.invoke('settings:setTrayOnClose', val),
  },

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
});
