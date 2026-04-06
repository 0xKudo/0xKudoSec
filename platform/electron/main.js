const { app, BrowserWindow, ipcMain, shell, protocol } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const { exec } = require('child_process');
const http = require('http');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

const store = new Store();
const SHELL_PORT = 5173;
const SERVER_PORT = 4000;
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
const PRODUCTION_URL = 'https://tools.laynekudo.com';

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let tray = null;

// ── Auth0 localhost callback interceptor ──────────────────────────────────
// Auth0 does not accept custom protocol URIs. We use http://localhost:8765/callback
// and spin up a tiny HTTP server that catches the redirect and forwards the
// full URL to the renderer so the Auth0 SDK can complete the exchange.
const AUTH0_CALLBACK_PORT = 8765;
let callbackServer = null;

function startCallbackServer() {
  if (callbackServer) return;
  callbackServer = http.createServer((req, res) => {
    // Respond to the browser tab so it can close itself
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><p>Login complete. You may close this tab.</p><script>setTimeout(()=>window.close(),500);</script></body></html>');

    // Forward the callback URL to the Electron renderer for Auth0 SDK to process
    const fullUrl = `http://localhost:${AUTH0_CALLBACK_PORT}${req.url}`;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(
          `window.dispatchEvent(new CustomEvent('auth0-callback', { detail: ${JSON.stringify(fullUrl)} }))`
        ).catch(() => {});
      }
    }, 500);
  });
  callbackServer.listen(AUTH0_CALLBACK_PORT, '127.0.0.1');
}

app.on('before-quit', () => {
  if (callbackServer) { callbackServer.close(); callbackServer = null; }
});

// ── Splash window ─────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 280,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    show: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

// ── Main window ───────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 280,
    minWidth: 480,
    minHeight: 280,
    frame: false,
    movable: true,
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  const url = isDev
    ? `http://localhost:${SHELL_PORT}`
    : PRODUCTION_URL;

  mainWindow.loadURL(url);

  // F12 opens DevTools — only when not packaged (dev mode)
  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (_e, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow._forceClose = false;

  mainWindow.on('close', (e) => {
    if (mainWindow._forceClose) return; // allow quit via tray menu
    e.preventDefault();
    mainWindow.hide();
  });
}

// ── Express server ────────────────────────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    // Production mode: app loads the live VPS -- no local server needed
    if (!isDev) {
      resolve();
      return;
    }

    // Dev mode: poll until the already-running npm run dev server responds
    const deadline = Date.now() + 15000;
    function poll() {
      http.get(`http://localhost:${SERVER_PORT}/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    }
    function retry() {
      if (Date.now() > deadline) { reject(new Error('Server failed to start')); return; }
      setTimeout(poll, 300);
    }
    poll();
  });
}

function forkServer(resolve, reject) {
    const serverEntry = isDev
      ? path.join(__dirname, '../server/index.js')
      : path.join(process.resourcesPath, 'server/index.js');

    const env = { ...process.env, NODE_ENV: isDev ? 'development' : 'production' };

    serverProcess = fork(serverEntry, [], {
      env,
      stdio: 'inherit',
      execArgv: [],
    });

    serverProcess.on('error', reject);

    // Poll until health endpoint responds
    const deadline = Date.now() + 15000;
    function poll() {
      http.get(`http://localhost:${SERVER_PORT}/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    }
    function retry() {
      if (Date.now() > deadline) { reject(new Error('Server failed to start')); return; }
      setTimeout(poll, 300);
    }
    setTimeout(poll, 500);
}

// ── Fluent Bit IPC ────────────────────────────────────────────────────────
function runSc(args) {
  return new Promise((resolve) => {
    const needsElevation = args.startsWith('start') || args.startsWith('stop');
    const cmd = needsElevation
      ? `powershell -Command "Start-Process sc -ArgumentList '${args}' -Verb RunAs -WindowStyle Hidden -Wait"`
      : `sc ${args}`;
    exec(cmd, { windowsHide: true }, (err, stdout) => {
      resolve({ err: err ? err.message : null, stdout: (stdout || '').trim() });
    });
  });
}

ipcMain.handle('fluent-bit:status', async () => {
  const { stdout, err } = await runSc('query fluent-bit');
  if (err && err.includes('1060')) return 'NOT_INSTALLED';
  if (stdout.includes('RUNNING')) return 'RUNNING';
  if (stdout.includes('STOPPED')) return 'STOPPED';
  if (stdout.includes('START_PENDING')) return 'STARTING';
  if (stdout.includes('STOP_PENDING')) return 'STOPPING';
  return 'UNKNOWN';
});

ipcMain.handle('fluent-bit:start', async () => {
  const { err } = await runSc('start fluent-bit');
  return { ok: !err, err };
});

ipcMain.handle('fluent-bit:stop', async () => {
  const { err } = await runSc('stop fluent-bit');
  return { ok: !err, err };
});

ipcMain.handle('fluent-bit:restart', async () => {
  await runSc('stop fluent-bit');
  // Wait for stop
  await new Promise(r => setTimeout(r, 2000));
  const { err } = await runSc('start fluent-bit');
  return { ok: !err, err };
});

ipcMain.handle('fluent-bit:write-config', async (_event, configText) => {
  const fs = require('fs');
  const confPath = 'C:\\Program Files\\fluent-bit\\conf\\cybertools.conf';
  try {
    fs.writeFileSync(confPath, configText, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e.message };
  }
});

// ── Settings IPC ──────────────────────────────────────────────────────────
ipcMain.handle('settings:getTrayOnClose', () => store.get('trayOnClose', true));
ipcMain.handle('settings:setTrayOnClose', (_event, val) => { store.set('trayOnClose', val); });

// ── Window control IPC ────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.on('window:expand', () => {
  if (!mainWindow) return;
  mainWindow.setMinimumSize(900, 600);
  mainWindow.setSize(1400, 900);
  mainWindow.center();
});

// ── Auto-updater ──────────────────────────────────────────────────────────
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

let pendingUpdateInfo = null; // cache in case renderer registers listener after event fires

function setupAutoUpdater() {
  // Only run in packaged app -- not during dev
  if (!app.isPackaged) return;

  autoUpdater.on('update-available', (info) => {
    pendingUpdateInfo = { version: info.version };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:available', { version: info.version });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:progress', { percent: Math.round(progress.percent) });
    }
  });

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:ready');
    }
  });

  autoUpdater.on('error', (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:error', { message: err.message });
    }
  });

  // Check for updates 5 seconds after launch, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates(), 5000);
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}

ipcMain.handle('update:check-pending', () => pendingUpdateInfo);
ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
ipcMain.handle('update:install', () => {
  // Clear Electron cache before install so the new version loads fresh
  const session = mainWindow?.webContents?.session;
  if (session) {
    session.clearCache().then(() => {
      mainWindow._forceClose = true;
      autoUpdater.quitAndInstall(false, true);
    });
  } else {
    mainWindow._forceClose = true;
    autoUpdater.quitAndInstall(false, true);
  }
});
ipcMain.handle('update:dismiss', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:dismissed');
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  startCallbackServer();
  createSplash();

  try {
    await startServer();
  } catch (e) {
    console.error('Server failed to start:', e.message);
  }

  createMainWindow();

  // Tray is set up after main window exists
  const { createTray } = require('./tray');
  tray = createTray(mainWindow, store);

  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  // Do nothing -- window is hidden not closed, so this shouldn't fire
  // If it does fire, don't quit -- stay alive in tray
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

// Open external links in system browser, not Electron window
app.on('web-contents-created', (_event, contents) => {
  // Intercept window.open() calls
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Intercept top-level navigations away from the app (e.g. Auth0 login redirect)
  contents.on('will-navigate', (e, url) => {
    const isLocal = url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:');
    const isProductionApp = url.startsWith(PRODUCTION_URL);
    if (!isLocal && !isProductionApp) {
      e.preventDefault();
      if (url.startsWith('https://')) shell.openExternal(url);
    }
  });
});
