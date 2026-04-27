const { app, BrowserWindow, ipcMain, shell, protocol, safeStorage, Menu, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const { exec } = require('child_process');
const fs = require('fs');
const http = require('http');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

// Override userData path before app is ready so electron-store and all
// Chromium profile data land in a folder named after the app, not the
// package name (@cybertools/electron → "electron")
app.setPath('userData', path.join(app.getPath('appData'), '0xKudo'));

let store = null;

// ── Encrypted store initialisation ────────────────────────────────────────
// safeStorage uses Windows DPAPI to protect a randomly generated encryption
// key. The encrypted blob is written to disk; the plaintext key never is.
function initStore() {
  const keyFile = path.join(app.getPath('userData'), '.store-key');
  let encryptionKey;

  if (safeStorage.isEncryptionAvailable()) {
    if (fs.existsSync(keyFile)) {
      const encrypted = fs.readFileSync(keyFile);
      encryptionKey = safeStorage.decryptString(encrypted);
    } else {
      // First run — generate a random key, encrypt it, persist the blob
      const raw = require('crypto').randomBytes(32).toString('hex');
      const encrypted = safeStorage.encryptString(raw);
      fs.writeFileSync(keyFile, encrypted, { mode: 0o600 });
      encryptionKey = raw;
    }
    store = new Store({ encryptionKey });
  } else {
    // safeStorage unavailable (rare edge case) — fall back to unencrypted
    store = new Store();
  }
}
const SHELL_PORT = 5173;
const SERVER_PORT = 4000;
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
const PRODUCTION_URL = 'https://0xkudo.com';

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let tray = null;

function isValidSender(event) {
  const url = event.senderFrame?.url ?? '';
  return (
    url.startsWith('http://localhost:') ||
    url.startsWith('http://127.0.0.1:') ||
    url.startsWith(PRODUCTION_URL)
  );
}

// ── Auth0 localhost callback interceptor ──────────────────────────────────
// Auth0 does not accept custom protocol URIs. We use http://localhost:8765/callback
// and spin up a tiny HTTP server that catches the redirect and forwards the
// full URL to the renderer so the Auth0 SDK can complete the exchange.
// The server binds only to 127.0.0.1 and validates that the callback contains
// both a code and state param (PKCE flow) before forwarding via IPC.
// Note (finding 27): Auth0 strips unknown query params from callback redirects,
// so a per-session nonce cannot be verified this way. The existing code+state
// validation plus 127.0.0.1 binding is the practical defense here.
const AUTH0_CALLBACK_PORT = 8765;
let callbackServer = null;

function startCallbackServer() {
  if (callbackServer) return;
  callbackServer = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${AUTH0_CALLBACK_PORT}`);

    // Reject requests that don't look like a real Auth0 PKCE callback
    const hasCode = parsedUrl.searchParams.has('code');
    const hasState = parsedUrl.searchParams.has('state');
    if (!hasCode || !hasState || parsedUrl.pathname !== '/callback') {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    // Respond to the browser tab so it can close itself
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><p>Login complete. You may close this tab.</p><script>setTimeout(()=>window.close(),500);</script></body></html>');

    // Forward the callback URL to the Electron renderer via typed IPC
    const fullUrl = `http://localhost:${AUTH0_CALLBACK_PORT}${req.url}`;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth0:callback', fullUrl);
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
    : (serverProcess ? `http://localhost:${SERVER_PORT}/app` : PRODUCTION_URL);

  mainWindow.loadURL(url);

  // Disable built-in Electron reload shortcuts at the session level
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setIgnoreMenuShortcuts(true);
  });

  // Block keyboard shortcuts that shouldn't work in production
  mainWindow.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;

    // F12 DevTools — dev only
    if (input.key === 'F12') {
      if (!app.isPackaged) mainWindow.webContents.toggleDevTools();
      e.preventDefault();
      return;
    }

    // Block reload shortcuts
    if (input.key === 'F5') { e.preventDefault(); return; }
    if (input.control && input.key === 'r') { e.preventDefault(); return; }

    // Block DevTools / inspect shortcuts
    if (input.control && input.shift && ['i', 'I', 'j', 'J', 'c', 'C'].includes(input.key)) {
      e.preventDefault();
      return;
    }

    // Block view source
    if (input.control && ['u', 'U'].includes(input.key)) {
      e.preventDefault();
    }
  });

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

// ── Local server (free tier) ──────────────────────────────────────────────
function startLocalServer() {
  return new Promise((resolve, reject) => {
    if (serverProcess) { resolve(); return; }

    const serverEntry = app.isPackaged
      ? path.join(process.resourcesPath, 'platform', 'server', 'index.js')
      : path.join(__dirname, '..', 'server', 'index.js');

    const dbPath = store.get('sqlitePath', getSubScopedDbPath());
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const ALLOWED_ENV_VARS = [
      'AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_AUDIENCE',
      'SHODAN_API_KEY', 'VIRUSTOTAL_API_KEY', 'HUNTER_API_KEY',
      'IPINFO_TOKEN', 'ABUSEIPDB_API_KEY', 'ABUSECH_API_KEY',
    ];
    const env = Object.fromEntries(
      ALLOWED_ENV_VARS
        .filter(k => process.env[k] !== undefined)
        .map(k => [k, process.env[k]])
    );
    env.NODE_ENV = 'production';
    env.STORAGE_MODE = 'local';
    env.SQLITE_PATH = dbPath;
    env.PORT = String(SERVER_PORT);
    env.ALLOWED_ORIGIN = `http://localhost:${SERVER_PORT}`;
    const ingestKeyHash = store.get('ingestKeyHash', '');
    if (ingestKeyHash) env.LOCAL_INGEST_KEY_HASH = ingestKeyHash;
    const userSub = store.get('userSub', '');
    if (userSub) env.LOCAL_USER_ID = userSub;

    // Cloud storage forwarding (paid users only)
    const isPaid = store.get('isPaid', false);
    env.IS_PAID = String(isPaid);
    if (isPaid && store.get('cloudStorage', false)) {
      env.CLOUD_STORAGE = 'true';
      env.VPS_WS_URL = 'wss://0xkudo.com/ws/ingest';
      const jwt = store.get('userJwt', '');
      if (jwt) env.USER_JWT = jwt;
    }

    if (app.isPackaged) {
      env.NODE_PATH = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');
    }
    serverProcess = fork(serverEntry, [], { env, stdio: 'pipe', execArgv: [] });
    serverProcess.stdout?.on('data', d => console.log('[local-server]', d.toString().trim()));
    serverProcess.stderr?.on('data', d => console.error('[local-server]', d.toString().trim()));
    serverProcess.on('error', reject);

    const deadline = Date.now() + 15000;
    function poll() {
      http.get(`http://localhost:${SERVER_PORT}/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    }
    function retry() {
      if (Date.now() > deadline) { reject(new Error('Local server failed to start')); return; }
      setTimeout(poll, 300);
    }
    setTimeout(poll, 500);
  });
}

// Returns %APPDATA%\0xKudo\<sanitized-sub>\siem.db for the current user.
// Falls back to the flat path if no sub is stored yet (first launch before auth).
function getSubScopedDbPath() {
  const sub = store.get('userSub', '');
  const safeSub = sub.replace(/\|/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '_');
  if (!safeSub) return path.join(app.getPath('userData'), 'siem.db');
  return path.join(app.getPath('userData'), safeSub, 'siem.db');
}

ipcMain.handle('electron:setUserSub', (event, sub) => {
  if (!isValidSender(event)) return;
  if (typeof sub !== 'string' || sub.length > 256) return;
  const current = store.get('userSub', '');
  if (current === sub) return;
  store.set('userSub', sub);

  // Migrate existing siem.db from old flat path to sub-scoped path if needed
  const safeSub = sub.replace(/\|/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '_');
  const newDir = path.join(app.getPath('userData'), safeSub);
  const newPath = path.join(newDir, 'siem.db');
  const oldFlatPath = path.join(app.getPath('userData'), 'siem.db');
  const oldStoredPath = store.get('sqlitePath', '');

  if (!fs.existsSync(newPath)) {
    // Create the sub directory
    fs.mkdirSync(newDir, { recursive: true });
    // Copy from old stored path first, then flat path as fallback
    const source = (oldStoredPath && fs.existsSync(oldStoredPath)) ? oldStoredPath
      : fs.existsSync(oldFlatPath) ? oldFlatPath : null;
    if (source) {
      try { fs.copyFileSync(source, newPath); } catch (_) {}
    }
  }

  // Update stored path to the sub-scoped location
  store.set('sqlitePath', newPath);
});

ipcMain.handle('electron:setTier', async (event, isPaid) => {
  if (!isValidSender(event)) return;
  store.set('isPaid', !!isPaid);
  store.set('storageMode', isPaid ? 'cloud' : 'local');

  if (!isPaid && app.isPackaged) {
    try {
      await startLocalServer();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://localhost:${SERVER_PORT}/app`);
      }
    } catch (e) {
      console.error('Failed to start local server:', e.message);
    }
  }
});

ipcMain.handle('electron:getStorageMode', (event) => {
  if (!isValidSender(event)) return 'cloud';
  return store.get('storageMode', 'cloud');
});

ipcMain.handle('electron:getIsPaid', (event) => {
  if (!isValidSender(event)) return true;
  return store.get('isPaid', true);
});

ipcMain.handle('electron:getStoragePath', (event) => {
  if (!isValidSender(event)) return null;
  return store.get('sqlitePath', getSubScopedDbPath());
});

ipcMain.handle('electron:pickStoragePath', async (event) => {
  if (!isValidSender(event)) return { cancelled: true };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose log storage location',
    defaultPath: path.dirname(store.get('sqlitePath', getSubScopedDbPath())),
    properties: ['openDirectory'],
  });

  if (result.cancelled || !result.filePaths.length) return { cancelled: true };

  const newDir = result.filePaths[0];
  const newPath = path.join(newDir, 'siem.db');
  const oldPath = store.get('sqlitePath', getSubScopedDbPath());

  if (newPath === oldPath) return { cancelled: true };

  // Copy existing DB to new location if it exists
  if (fs.existsSync(oldPath)) {
    try {
      fs.copyFileSync(oldPath, newPath);
    } catch (e) {
      return { cancelled: false, error: `Failed to copy database: ${e.message}` };
    }
  }

  store.set('sqlitePath', newPath);

  // Restart local server with new path
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  try {
    await startLocalServer();
  } catch (e) {
    return { cancelled: false, error: `Database moved but server restart failed: ${e.message}`, newPath };
  }

  return { cancelled: false, newPath };
});

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

    // Allowlist — only pass vars the server actually needs, never forward all of process.env
    const ALLOWED_ENV_VARS = [
      'ANTHROPIC_API_KEY',
      'ALLOWED_ORIGIN',
      'PORT',
      'AUTH0_DOMAIN',
      'AUTH0_CLIENT_ID',
      'AUTH0_AUDIENCE',
      'AUTH0_MGMT_CLIENT_ID',
      'AUTH0_MGMT_CLIENT_SECRET',
      'AUTH0_TENANT_DOMAIN',
      'DB_ENCRYPTION_KEY',
      'DATABASE_URL',
      'INGEST_AUTH_DB_URL',
      'OPS_DB_URL',
      'DATABASE_CA_CERT',
      'INGEST_API_KEY',
      'AUDIT_LOG_RETENTION_DAYS',
      'SHODAN_API_KEY',
      'VIRUSTOTAL_API_KEY',
      'HUNTER_API_KEY',
      'IPINFO_TOKEN',
      'ABUSEIPDB_API_KEY',
      'ABUSECH_API_KEY',
    ];
    const env = Object.fromEntries(
      ALLOWED_ENV_VARS
        .filter(k => process.env[k] !== undefined)
        .map(k => [k, process.env[k]])
    );
    env.NODE_ENV = isDev ? 'development' : 'production';

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

ipcMain.handle('fluent-bit:status', async (event) => {
  if (!isValidSender(event)) return 'UNKNOWN';
  const { stdout, err } = await runSc('query fluent-bit');
  if (err && err.includes('1060')) return 'NOT_INSTALLED';
  if (stdout.includes('RUNNING')) return 'RUNNING';
  if (stdout.includes('STOPPED')) return 'STOPPED';
  if (stdout.includes('START_PENDING')) return 'STARTING';
  if (stdout.includes('STOP_PENDING')) return 'STOPPING';
  return 'UNKNOWN';
});

ipcMain.handle('fluent-bit:start', async (event) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  const { err } = await runSc('start fluent-bit');
  return { ok: !err, err };
});

ipcMain.handle('fluent-bit:stop', async (event) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  const { err } = await runSc('stop fluent-bit');
  return { ok: !err, err };
});

ipcMain.handle('fluent-bit:restart', async (event) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  await runSc('stop fluent-bit');
  // Wait for stop
  await new Promise(r => setTimeout(r, 2000));
  const { err } = await runSc('start fluent-bit');
  return { ok: !err, err };
});

ipcMain.handle('fluent-bit:install', async (event) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  const installerPath = path.join(process.resourcesPath, 'assets', 'fluent-bit-installer.exe');
  if (!fs.existsSync(installerPath)) return { ok: false, err: 'Bundled installer not found. Re-install 0xKudo Security Toolkit to get the latest version.' };
  try {
    // Run installer interactively (no /S) so the user sees the Fluent Bit install wizard
    const { exec } = require('child_process');
    exec(`"${installerPath}"`, { windowsHide: false });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: 'Failed to launch installer.' };
  }
});

// ── Fluent Bit path detection ─────────────────────────────────────────────
// Returns the full path to cybertools.conf, or null if Fluent Bit is not installed.
function findFluentBitConfPath() {
  // 1. Registry — respects non-default install locations
  try {
    const { execSync } = require('child_process');
    const result = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\fluent-bit" /v InstallLocation',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const match = result.match(/InstallLocation\s+REG_SZ\s+(.+)/);
    if (match) {
      const installDir = match[1].trim();
      return path.join(installDir, 'conf', 'cybertools.conf');
    }
  } catch (_) {}

  // 2. Default install path fallback
  const defaultConf = 'C:\\Program Files\\fluent-bit\\conf\\cybertools.conf';
  if (fs.existsSync(path.dirname(defaultConf))) return defaultConf;

  return null;
}

ipcMain.handle('fluent-bit:info', async (event) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };

  const confPath = findFluentBitConfPath();
  if (!confPath) return { ok: true, installed: false, version: null, confPath: null };

  let version = null;
  try {
    const { execSync } = require('child_process');
    // Derive bin path from conf path (e.g. C:\Program Files\fluent-bit\conf\ → bin\fluent-bit.exe)
    const binPath = path.join(path.dirname(path.dirname(confPath)), 'bin', 'fluent-bit.exe');
    const out = execSync(`"${binPath}" --version`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const match = out.match(/v?(\d+\.\d+\.\d+)/);
    if (match) version = match[1];
  } catch (_) {}

  return { ok: true, installed: true, version, confPath };
});

// Sanitize fs errors — in packaged app, never expose raw system messages with full paths
function fsErrMsg(e) {
  if (!app.isPackaged) return e.message;
  if (e.code === 'ENOENT') return 'Config file not found. Check your Fluent Bit installation path.';
  if (e.code === 'EACCES' || e.code === 'EPERM') return 'Permission denied. The app may need elevated access to read this file.';
  return 'Failed to access config file.';
}

ipcMain.handle('fluent-bit:read-config', async (event) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  const confPath = findFluentBitConfPath();
  if (!confPath) return { ok: false, err: 'Fluent Bit is not installed.' };
  try {
    const text = fs.readFileSync(confPath, 'utf8');
    return { ok: true, text };
  } catch (e) {
    return { ok: false, err: fsErrMsg(e) };
  }
});

ipcMain.handle('fluent-bit:write-config', async (event, configText) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };

  if (typeof configText !== 'string') return { ok: false, err: 'Invalid config: must be a string' };
  if (configText.length > 51200) return { ok: false, err: 'Invalid config: exceeds 50KB limit' };
  if (/\x00/.test(configText)) return { ok: false, err: 'Invalid config: null bytes not allowed' };
  if (/`|\$\(/.test(configText)) return { ok: false, err: 'Invalid config: shell expansion not allowed' };

  const confPath = findFluentBitConfPath();
  if (!confPath) return { ok: false, err: 'Fluent Bit is not installed.' };
  try {
    fs.writeFileSync(confPath, configText, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, err: fsErrMsg(e) };
  }
});

// ── PIN IPC ───────────────────────────────────────────────────────────────
const { scryptSync, randomBytes, timingSafeEqual } = require('crypto');

function hashPin(pin, salt) {
  return scryptSync(pin, salt, 64).toString('hex');
}

ipcMain.handle('settings:hasPin', (event) => {
  if (!isValidSender(event)) return { hasPin: false, hasRecovery: false };
  return {
    hasPin: !!store.get('pinHash'),
    hasRecovery: !!store.get('recoveryHash'),
  };
});

ipcMain.handle('settings:setPin', (event, pin, recoveryPassphrase) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  if (typeof pin !== 'string' || pin.length < 4 || pin.length > 64) {
    return { ok: false, err: 'PIN must be between 4 and 64 characters' };
  }
  if (typeof recoveryPassphrase !== 'string' || recoveryPassphrase.length < 8 || recoveryPassphrase.length > 256) {
    return { ok: false, err: 'Recovery passphrase must be between 8 and 256 characters' };
  }
  if (pin === recoveryPassphrase) {
    return { ok: false, err: 'Recovery passphrase must differ from PIN' };
  }

  const pinSalt = randomBytes(16).toString('hex');
  const recoverySalt = randomBytes(16).toString('hex');
  store.set('pinSalt', pinSalt);
  store.set('pinHash', hashPin(pin, pinSalt));
  store.set('recoverySalt', recoverySalt);
  store.set('recoveryHash', hashPin(recoveryPassphrase, recoverySalt));
  return { ok: true };
});

ipcMain.handle('settings:addRecovery', (event, pin, recoveryPassphrase) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  if (typeof pin !== 'string' || pin.length > 256) return { ok: false, err: 'Invalid input' };
  if (typeof recoveryPassphrase !== 'string' || recoveryPassphrase.length < 8 || recoveryPassphrase.length > 256) {
    return { ok: false, err: 'Recovery passphrase must be between 8 and 256 characters' };
  }
  if (pin === recoveryPassphrase) return { ok: false, err: 'Recovery passphrase must differ from PIN' };

  // Verify current PIN before allowing recovery passphrase to be set
  if (pinAttempts.lockedUntil && Date.now() < pinAttempts.lockedUntil) {
    const secsLeft = Math.ceil((pinAttempts.lockedUntil - Date.now()) / 1000);
    return { ok: false, err: `Too many attempts. Try again in ${secsLeft} seconds.` };
  }

  const salt = store.get('pinSalt');
  const storedHash = store.get('pinHash');
  if (!salt || !storedHash) return { ok: false, err: 'No PIN set' };

  const attemptHash = hashPin(pin, salt);
  if (storedHash.length !== attemptHash.length) return { ok: false, err: 'PIN verification failed' };

  const match = timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(attemptHash, 'hex'));
  if (!match) {
    pinAttempts.count += 1;
    if (pinAttempts.count >= PIN_MAX_ATTEMPTS) {
      pinAttempts.lockedUntil = Date.now() + PIN_LOCKOUT_MS;
      pinAttempts.count = 0;
      return { ok: false, err: 'Too many attempts. Try again in 60 seconds.' };
    }
    return { ok: false, err: 'Incorrect PIN' };
  }

  pinAttempts.count = 0;
  pinAttempts.lockedUntil = null;
  const recoverySalt = randomBytes(16).toString('hex');
  store.set('recoverySalt', recoverySalt);
  store.set('recoveryHash', hashPin(recoveryPassphrase, recoverySalt));
  return { ok: true };
});

ipcMain.handle('settings:resetWithPassphrase', (event, recoveryPassphrase) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  if (typeof recoveryPassphrase !== 'string') return { ok: false, err: 'Invalid input' };
  if (recoveryPassphrase.length > 256) return { ok: false, err: 'Passphrase too long' };

  // Use same lockout tracker as PIN — shared counter, shared lockout
  if (pinAttempts.lockedUntil && Date.now() < pinAttempts.lockedUntil) {
    const secsLeft = Math.ceil((pinAttempts.lockedUntil - Date.now()) / 1000);
    return { ok: false, err: `Too many attempts. Try again in ${secsLeft} seconds.` };
  }

  const recoverySalt = store.get('recoverySalt');
  const storedRecoveryHash = store.get('recoveryHash');
  if (!recoverySalt || !storedRecoveryHash) return { ok: false, err: 'No recovery passphrase set' };

  const attemptHash = hashPin(recoveryPassphrase, recoverySalt);
  if (storedRecoveryHash.length !== attemptHash.length) {
    return { ok: false, err: 'Recovery verification failed' };
  }

  const match = timingSafeEqual(Buffer.from(storedRecoveryHash, 'hex'), Buffer.from(attemptHash, 'hex'));

  if (match) {
    pinAttempts.count = 0;
    pinAttempts.lockedUntil = null;
    store.delete('pinHash');
    store.delete('pinSalt');
    // Keep recoveryHash/recoverySalt — user will set new PIN + passphrase together
    store.delete('recoveryHash');
    store.delete('recoverySalt');
    return { ok: true };
  } else {
    pinAttempts.count += 1;
    if (pinAttempts.count >= PIN_MAX_ATTEMPTS) {
      pinAttempts.lockedUntil = Date.now() + PIN_LOCKOUT_MS;
      pinAttempts.count = 0;
      return { ok: false, err: 'Too many attempts. Try again in 60 seconds.' };
    }
    return { ok: false, err: 'Incorrect recovery passphrase' };
  }
});

// In-memory PIN attempt tracker — resets on app restart (intentional)
const pinAttempts = { count: 0, lockedUntil: null };
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 60 * 1000;

ipcMain.handle('settings:verifyPin', (event, pin) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  if (typeof pin !== 'string') return { ok: false, err: 'Invalid input' };
  if (pin.length > 256) return { ok: false, err: 'PIN too long' };

  // Lockout check
  if (pinAttempts.lockedUntil && Date.now() < pinAttempts.lockedUntil) {
    const secsLeft = Math.ceil((pinAttempts.lockedUntil - Date.now()) / 1000);
    return { ok: false, err: `Too many attempts. Try again in ${secsLeft} seconds.` };
  }

  const salt = store.get('pinSalt');
  const storedHash = store.get('pinHash');
  if (!salt || !storedHash) return { ok: false, err: 'No PIN set' };

  const attemptHash = hashPin(pin, salt);

  // Guard against corrupted store causing timingSafeEqual to throw
  if (storedHash.length !== attemptHash.length) {
    return { ok: false, err: 'PIN verification failed' };
  }

  const match = timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(attemptHash, 'hex'));

  if (match) {
    pinAttempts.count = 0;
    pinAttempts.lockedUntil = null;
    return { ok: true, err: null };
  } else {
    pinAttempts.count += 1;
    if (pinAttempts.count >= PIN_MAX_ATTEMPTS) {
      pinAttempts.lockedUntil = Date.now() + PIN_LOCKOUT_MS;
      pinAttempts.count = 0;
      return { ok: false, err: 'Too many attempts. Try again in 60 seconds.' };
    }
    return { ok: false, err: 'Incorrect PIN' };
  }
});

// ── Local ingest key IPC ──────────────────────────────────────────────────
const { randomBytes: _randomBytes, createHash: _createHash } = require('crypto');

function hashIngestKey(key) {
  return _createHash('sha256').update(key).digest('hex');
}

ipcMain.handle('electron:generateIngestKey', (event) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  const key = _randomBytes(32).toString('hex');
  const hash = hashIngestKey(key);
  store.set('ingestKeyHash', hash);
  store.set('ingestKeyCreatedAt', new Date().toISOString());
  return { ok: true, api_key: key, created_at: store.get('ingestKeyCreatedAt') };
});

ipcMain.handle('electron:hasIngestKey', (event) => {
  if (!isValidSender(event)) return { ok: false };
  const exists = store.has('ingestKeyHash');
  return { ok: true, exists, created_at: store.get('ingestKeyCreatedAt', null) };
});

ipcMain.handle('electron:revokeIngestKey', (event) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  store.delete('ingestKeyHash');
  store.delete('ingestKeyCreatedAt');
  return { ok: true };
});

// ── JWT + Cloud Storage IPC ───────────────────────────────────────────────
ipcMain.handle('electron:setJwt', (event, token) => {
  if (!isValidSender(event)) return;
  if (typeof token !== 'string' || token.length > 8192) return;
  store.set('userJwt', token);
  // Propagate to running local server via restart-with-updated-env if cloud storage active
  if (store.get('cloudStorage', false) && store.get('isPaid', false) && serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    startLocalServer().catch(e => console.error('Failed to restart local server after JWT update:', e.message));
  }
});

ipcMain.handle('electron:getCloudStorage', (event) => {
  if (!isValidSender(event)) return false;
  return store.get('cloudStorage', false);
});

ipcMain.handle('electron:setCloudStorage', async (event, enabled) => {
  if (!isValidSender(event)) return { ok: false };
  // Only paid users may enable cloud storage
  if (enabled && !store.get('isPaid', false)) {
    return { ok: false, error: 'Cloud storage requires a paid subscription.' };
  }
  store.set('cloudStorage', !!enabled);
  // Restart local server with updated env
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  try {
    await startLocalServer();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Settings IPC ──────────────────────────────────────────────────────────
ipcMain.handle('settings:getTrayOnClose', (event) => {
  if (!isValidSender(event)) return true;
  return store.get('trayOnClose', true);
});
ipcMain.handle('settings:setTrayOnClose', (event, val) => {
  if (!isValidSender(event)) return;
  store.set('trayOnClose', val);
});

// ── Window control IPC ────────────────────────────────────────────────────
ipcMain.on('window:minimize', (event) => {
  if (!isValidSender(event)) return;
  mainWindow?.minimize();
});
ipcMain.on('window:maximize', (event) => {
  if (!isValidSender(event)) return;
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', (event) => {
  if (!isValidSender(event)) return;
  mainWindow?.close();
});
ipcMain.on('window:expand', (event) => {
  if (!isValidSender(event)) return;
  if (!mainWindow) return;
  mainWindow.setMinimumSize(900, 600);
  mainWindow.setSize(1400, 900);
  mainWindow.center();
});

// Send a navigation event to the renderer — used by tray menu instead of executeJavaScript
function navigateTo(path) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window:navigate', path);
  }
}

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

ipcMain.handle('update:check-pending', (event) => {
  if (!isValidSender(event)) return null;
  return pendingUpdateInfo;
});
ipcMain.handle('update:download', (event) => {
  if (!isValidSender(event)) return;
  return autoUpdater.downloadUpdate();
});
ipcMain.handle('update:install', (event) => {
  if (!isValidSender(event)) return;
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
ipcMain.handle('update:dismiss', (event) => {
  if (!isValidSender(event)) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:dismissed');
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Remove default application menu — eliminates Chromium's built-in
  // keyboard shortcuts (Ctrl+R, Ctrl+Shift+R, Ctrl+Shift+I, etc.)
  Menu.setApplicationMenu(null);

  initStore();
  startCallbackServer();
  createSplash();

  try {
    await startServer();
  } catch (e) {
    console.error('Server failed to start:', e.message);
  }

  // Start local server for all Electron users (free = local storage, paid = local + optional cloud forward)
  try {
    await startLocalServer();
  } catch (e) {
    console.error('Failed to start local server on startup:', e.message);
    if (serverProcess) { serverProcess.kill(); serverProcess = null; }
  }

  createMainWindow();

  // Tray is set up after main window exists
  const { createTray } = require('./tray');
  tray = createTray(mainWindow, store, navigateTo, runSc);

  // LLM IPC — registered after mainWindow exists so progress events can be sent
  const { setupLlmIpc, scheduleStartupUpdateCheck } = require('./llmWorker');
  setupLlmIpc(mainWindow);
  scheduleStartupUpdateCheck(mainWindow);

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
