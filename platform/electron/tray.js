const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let tray = null;
let statusInterval = null;
let currentStatus = 'UNKNOWN';

function getIconPath(status) {
  // Use the same icon for now; can be swapped for status-colored variants
  return path.join(__dirname, 'assets', 'icon.ico');
}

function buildMenu(mainWindow, store, status) {
  const statusLabel = {
    RUNNING: '● Fluent Bit: Running',
    STOPPED: '○ Fluent Bit: Stopped',
    STARTING: '◌ Fluent Bit: Starting...',
    STOPPING: '◌ Fluent Bit: Stopping...',
    NOT_INSTALLED: '✕ Fluent Bit: Not Installed',
    UNKNOWN: '? Fluent Bit: Unknown',
  }[status] || '? Fluent Bit: Unknown';

  return Menu.buildFromTemplate([
    {
      label: '0xKudo Security Toolkit',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Configure Agent',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.executeJavaScript(
          `window.dispatchEvent(new CustomEvent('electron:navigate', { detail: '/siem/configuration' }))`
        );
      },
    },
    { type: 'separator' },
    {
      label: statusLabel,
      enabled: false,
    },
    {
      label: 'Start Fluent Bit',
      enabled: status === 'STOPPED',
      click: async () => {
        const { exec } = require('child_process');
        exec('powershell -Command "Start-Process sc -ArgumentList \'start fluent-bit\' -Verb RunAs -WindowStyle Hidden"', { windowsHide: true });
      },
    },
    {
      label: 'Stop Fluent Bit',
      enabled: status === 'RUNNING',
      click: async () => {
        const { exec } = require('child_process');
        exec('powershell -Command "Start-Process sc -ArgumentList \'stop fluent-bit\' -Verb RunAs -WindowStyle Hidden"', { windowsHide: true });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow._forceClose = true;
        app.quit();
      },
    },
  ]);
}

function createTray(mainWindow, store) {
  const iconPath = getIconPath('UNKNOWN');
  const img = nativeImage.createFromPath(iconPath);
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('0xKudo Security Toolkit');

  let currentMenu = null;

  function refreshMenu() {
    currentMenu = buildMenu(mainWindow, store, currentStatus);
    // Do NOT call setContextMenu -- it suppresses click events on Windows
  }

  // Left click: open window
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  // Right click: show menu
  tray.on('right-click', () => {
    tray.popUpContextMenu(currentMenu);
  });

  // Double click: also open window
  tray.on('double-click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  });

  refreshMenu();

  // Poll Fluent Bit status every 15s to keep tray menu current
  async function pollStatus() {
    try {
      const { exec } = require('child_process');
      exec('sc query fluent-bit', { windowsHide: true }, (err, stdout) => {
        let status = 'UNKNOWN';
        if (err && err.message.includes('1060')) status = 'NOT_INSTALLED';
        else if (stdout.includes('RUNNING')) status = 'RUNNING';
        else if (stdout.includes('STOPPED')) status = 'STOPPED';
        else if (stdout.includes('START_PENDING')) status = 'STARTING';
        else if (stdout.includes('STOP_PENDING')) status = 'STOPPING';
        if (status !== currentStatus) {
          currentStatus = status;
          refreshMenu();
        }
      });
    } catch (_) {}
  }

  pollStatus();
  statusInterval = setInterval(pollStatus, 15000);

  app.on('before-quit', () => {
    if (statusInterval) clearInterval(statusInterval);
    tray.destroy();
  });

  return tray;
}

module.exports = { createTray };
