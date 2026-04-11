/**
 * llmWorker.js — LLM IPC handler for Noise Advisor
 *
 * Manages model lifecycle, downloads, and inference via node-llama-cpp v3.
 * The model is NEVER loaded on startup — only when analysis is triggered.
 * After analysis completes the context is disposed and memory is freed.
 *
 * node-llama-cpp v3 is ESM-only; all imports use dynamic import().
 *
 * Registers the following ipcMain channels:
 *   llm:status          → 'idle' | 'loading' | 'running' | 'unavailable'
 *   llm:analyze         → analyze an array of noise candidates
 *   llm:download-model  → download a managed model with progress events
 *   llm:check-update    → check GitHub releases for a newer managed model
 *   llm:cancel          → cancel in-progress analysis
 *   llm:add-custom      → validate and register a custom GGUF path
 *   llm:download-url    → download a model from a URL with progress events
 *   llm:remove-model    → remove a model from the library
 *   llm:get-library     → list all managed + custom models with disk status
 *   llm:set-active      → set the active model for analysis
 */

const { ipcMain, app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const { fork } = require('child_process');

const _isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
const _SERVER_PORT = 4000;
const _PRODUCTION_URL = 'https://0xkudo.com';
const LLM_SERVER_URL = _isDev ? `http://localhost:${_SERVER_PORT}` : _PRODUCTION_URL;

// ── File logger ───────────────────────────────────────────────────────────

const getLogsDir = () => path.join(app.getPath('userData'), 'logs');

function llmLog(level, ...args) {
  try {
    const logsDir = getLogsDir();
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const line = `[${new Date().toISOString()}] [${level}] ${args.map(a =>
      typeof a === 'object' ? JSON.stringify(a) : String(a)
    ).join(' ')}\n`;
    fs.appendFileSync(path.join(logsDir, 'llm.log'), line, 'utf8');
  } catch (_) {}
}

// ── Constants ─────────────────────────────────────────────────────────────

// Lazy — app.getPath() must not be called at module load time in packaged builds
const getModelsDir = () => path.join(app.getPath('userData'), 'models');
const getModelLibraryFile = () => path.join(app.getPath('userData'), 'model-library.json');

// GitHub releases manifest URL — set this when publishing model releases.
// Expected format: { "models": { "<modelKey>": { "sha256": "...", "downloadUrl": "...", "version": "..." } } }
// null = remote update checks disabled (no network call made).
const GITHUB_MODEL_MANIFEST_URL = null;

// Managed models — download URLs and SHA-256 are populated at release time.
// Set downloadUrl + sha256 when publishing models to 0xKudoSec-releases.
const MANAGED_MODELS = {
  'phi-3.5-mini-q4': {
    filename: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
    displayName: 'Phi-3.5 Mini Q4',
    sizeBytes: 2370000000,    // ~2.2 GB
    ramEstimateBytes: 3221225472, // ~3 GB
    quantization: 'Q4_K_M',
    downloadUrl: 'https://huggingface.co/0xKudoX/noise-advisor-models/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
    sha256: 'e4165e3a71af97f1b4820da61079826d8752a2088e313af0c7d346796c38eff5',
  },
  'qwen2.5-1.5b-q4': {
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    displayName: 'Qwen2.5 1.5B Q4',
    sizeBytes: 1000000000,
    ramEstimateBytes: 1610612736,
    quantization: 'Q4_K_M',
    downloadUrl: 'https://huggingface.co/0xKudoX/noise-advisor-models/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
  },
  'llama-3.2-3b-q4': {
    filename: 'llama-3.2-3b-instruct-q4_k_m.gguf',
    displayName: 'Llama 3.2 3B Q4',
    sizeBytes: 2000000000,
    ramEstimateBytes: 2684354560,
    quantization: 'Q4_K_M',
    downloadUrl: 'https://huggingface.co/0xKudoX/noise-advisor-models/resolve/main/llama-3.2-3b-instruct-q4_k_m.gguf',
    sha256: 'c55a83bfb6396799337853ca69918a0b9bbb2917621078c34570bc17d20fd7a1',
  },
};

// GGUF magic bytes: "GGUF" as bytes
const GGUF_MAGIC = Buffer.from([0x47, 0x47, 0x55, 0x46]);

// ── State ─────────────────────────────────────────────────────────────────

let llmStatus = 'idle'; // 'idle' | 'loading' | 'running' | 'unavailable'
let cancelRequested = false;
let activeChild = null; // reference to the running inference child process

// ── Model library persistence ─────────────────────────────────────────────

function loadLibrary() {
  try {
    if (fs.existsSync(getModelLibraryFile())) {
      return JSON.parse(fs.readFileSync(getModelLibraryFile(), 'utf8'));
    }
  } catch (_) {}
  return { models: [] };
}

function saveLibrary(library) {
  fs.writeFileSync(getModelLibraryFile(), JSON.stringify(library, null, 2), 'utf8');
}

function upsertLibraryModel(entry) {
  const lib = loadLibrary();
  const idx = lib.models.findIndex(m => m.filename === entry.filename);
  if (idx >= 0) lib.models[idx] = { ...lib.models[idx], ...entry };
  else lib.models.push(entry);
  saveLibrary(lib);
}

function removeLibraryModel(filename) {
  const lib = loadLibrary();
  lib.models = lib.models.filter(m => m.filename !== filename);
  saveLibrary(lib);
}

// ── Utilities ─────────────────────────────────────────────────────────────

function ensureModelsDir() {
  if (!fs.existsSync(getModelsDir())) fs.mkdirSync(getModelsDir(), { recursive: true });
}

function modelPath(filename) {
  return path.join(getModelsDir(), filename);
}

function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function validateGgufHeader(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    if (!buf.equals(GGUF_MAGIC)) return { valid: false, reason: 'Not a valid GGUF file' };
    return { valid: true };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}

function inferQuantization(filename) {
  const upper = filename.toUpperCase();
  for (const q of ['Q8', 'Q6', 'Q5', 'Q4', 'Q3', 'Q2', 'F32', 'F16']) {
    if (upper.includes(q)) return q;
  }
  return 'unknown';
}

function estimateRam(filePath) {
  try {
    const { size } = fs.statSync(filePath);
    return Math.ceil(size * 1.05);
  } catch (_) {
    return 0;
  }
}

function availableRam() {
  return os.freemem();
}

function buildCompatibilityWarnings(filePath, filename, headerCheck) {
  const warnings = [];
  if (!headerCheck.valid) warnings.push(headerCheck.reason);
  const quantization = inferQuantization(filename);
  if (['Q2', 'Q3'].includes(quantization)) {
    warnings.push('Q2/Q3 quantization may produce poor reasoning quality');
  }
  const ramEst = estimateRam(filePath);
  const ramAvail = availableRam();
  if (ramEst > ramAvail) {
    warnings.push(
      `This model requires approximately ${Math.round(ramEst / 1e9)}GB of RAM. ` +
      `Your system has ${Math.round(ramAvail / 1e9)}GB available. You can still use it.`
    );
  }
  return warnings;
}

/** Fetch JSON from an HTTPS URL, following redirects. */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    function doRequest(requestUrl) {
      const parsed = new URL(requestUrl);
      https.get({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': '0xKudo-SecurityToolkit', 'Accept': 'application/json' },
      }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          doRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Invalid JSON in response')); }
        });
        res.on('error', reject);
      }).on('error', reject);
    }
    doRequest(url);
  });
}

/** Download a file from an HTTPS URL, following redirects, with progress callbacks. */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const tmp = destPath + '.download';
    const file = fs.createWriteStream(tmp);
    let received = 0;

    function doRequest(requestUrl) {
      const parsed = new URL(requestUrl);
      https.get({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': '0xKudo-SecurityToolkit' },
      }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          doRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        res.on('data', (chunk) => {
          received += chunk.length;
          file.write(chunk);
          if (onProgress && total > 0) {
            onProgress({ received, total, percent: Math.round((received / total) * 100) });
          }
        });
        res.on('end', () => {
          file.end(() => {
            try {
              fs.renameSync(tmp, destPath);
            } catch (_) {
              // renameSync can fail across volume/path boundaries; fall back to copy+delete
              fs.copyFileSync(tmp, destPath);
              try { fs.unlinkSync(tmp); } catch (_2) {}
            }
            resolve();
          });
        });
        res.on('error', reject);
      }).on('error', (e) => {
        file.destroy();
        try { fs.unlinkSync(tmp); } catch (_) {}
        reject(e);
      });
    }

    doRequest(url);
  });
}

// ── LLM prompt + response parsing ────────────────────────────────────────

function buildPrompt(candidate, kbContext) {
  const sig = typeof candidate.field_signature === 'string'
    ? candidate.field_signature
    : JSON.stringify(candidate.field_signature, null, 2);

  const kbSection = kbContext && kbContext.length > 0
    ? '\nRecent vulnerabilities relevant to this pattern:\n' +
      kbContext.map(v => `- ${v.id}: ${v.title} - ${v.affected_products}`).join('\n') + '\n'
    : '';

  // Phi-3.5 chat template format — avoids Jinja special token resolution errors
  return `<|system|>
You are a security analyst assistant.<|end|>
<|user|>
Analyze this SIEM event pattern and answer two questions:

Pattern: ${sig}
Frequency: ${candidate.daily_avg || 0} events/day over ${candidate.days || 7} days
No analyst action taken in this period.
${kbSection}
1. Is this likely noise? Give a one-sentence explanation.
2. Does this pattern match any known CVE or active attack technique?
   If yes, name the CVE or technique and explain why suppression would be dangerous.
   If no, say "No known CVE match - safe to suppress."

Respond ONLY in JSON with this exact structure:
{"explanation": "...", "cve_safe": true, "cve_note": "..."}<|end|>
<|assistant|>`;
}

function parseResponse(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return {
        explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : cleaned.slice(0, 500),
        cve_safe: parsed.cve_safe !== false,
        cve_note: typeof parsed.cve_note === 'string' ? parsed.cve_note.trim() : '',
      };
    } catch (_) {}
  }
  // Fallback: treat entire response as explanation, assume safe
  return {
    explanation: cleaned.slice(0, 500),
    cve_safe: true,
    cve_note: '',
  };
}

// ── Inference (isolated child process) ───────────────────────────────────

function getLlmProcessScript() {
  // In packaged builds __dirname points inside app.asar — use app.asar.unpacked equivalent
  const base = __dirname.replace('app.asar', 'app.asar.unpacked');
  return path.join(base, 'llmProcess.js');
}

async function runAnalysis(modelFilePath, modelKey, templateFamily, candidates, mainWindow, authToken) {
  // Kill any lingering child from a previous run (e.g. app closed mid-analysis)
  if (activeChild) {
    llmLog('INFO', 'Killing stale child process before starting new run');
    try { activeChild.kill(); } catch (_) {}
    activeChild = null;
  }

  llmStatus = 'loading';
  emitStatus(mainWindow, 'loading');
  llmLog('INFO', 'Spawning llmProcess for', candidates.length, 'candidates');

  return new Promise((resolve, reject) => {
    const scriptPath = getLlmProcessScript();
    llmLog('INFO', 'llmProcess script path:', scriptPath);

    // node_modules lives in app.asar.unpacked — pass it explicitly so the child
    // process can resolve node-llama-cpp and all its dependencies
    const nodeModulesPath = path.join(
      __dirname.replace('app.asar', 'app.asar.unpacked'),
      'node_modules'
    );

    let child;
    try {
      child = fork(scriptPath, [], {
        execArgv: ['--experimental-vm-modules'],
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          NODE_PATH: nodeModulesPath,
          LLM_SERVER_URL: LLM_SERVER_URL,
          LLM_AUTH_TOKEN: authToken || '',
        },
      });
    } catch (e) {
      llmStatus = 'unavailable';
      emitStatus(mainWindow, 'unavailable');
      llmLog('ERROR', 'Failed to fork llmProcess:', e.message);
      return reject(new Error(`Failed to start inference process: ${e.message}`));
    }

    activeChild = child;
    const results = [];

    child.stderr?.on('data', (d) => llmLog('CHILD_ERR', d.toString().trim()));
    child.stdout?.on('data', (d) => llmLog('CHILD_OUT', d.toString().trim()));

    child.on('message', (msg) => {
      if (msg.type === 'log') {
        llmLog(msg.level, '[child]', msg.msg);
        return;
      }
      if (msg.type === 'result') {
        const { type: _, ...result } = msg;
        results.push(result);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('llm:candidate-result', result);
        }
        return;
      }
      if (msg.type === 'done') {
        llmLog('INFO', 'Child process done');
        llmStatus = 'idle';
        emitStatus(mainWindow, 'idle');
        resolve(results);
        return;
      }
      if (msg.type === 'error') {
        llmLog('ERROR', 'Child process error:', msg.msg);
        llmStatus = 'unavailable';
        emitStatus(mainWindow, 'unavailable');
        reject(new Error(msg.msg));
      }
    });

    child.on('exit', (code, signal) => {
      llmLog('INFO', `Child exited code=${code} signal=${signal}`);
      activeChild = null;
      if (llmStatus === 'loading' || llmStatus === 'running') {
        llmStatus = 'idle';
        emitStatus(mainWindow, 'idle');
        resolve(results);
      }
    });

    child.on('error', (e) => {
      llmLog('ERROR', 'Child process spawn error:', e.message);
      activeChild = null;
      llmStatus = 'unavailable';
      emitStatus(mainWindow, 'unavailable');
      reject(e);
    });

    llmStatus = 'running';
    emitStatus(mainWindow, 'running');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('llm:analysis-started', { total: candidates.length });
    }

    child.send({ type: 'analyze', modelPath: modelFilePath, modelKey, templateFamily, candidates });
  });
}

function emitStatus(mainWindow, s) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('llm:status-change', s);
  }
}

// ── Sender validation ─────────────────────────────────────────────────────

function isValidSender(event) {
  const url = event.senderFrame?.url ?? '';
  return (
    url.startsWith('http://localhost:') ||
    url.startsWith('http://127.0.0.1:') ||
    url.startsWith('https://0xkudo.com') ||
    url.startsWith('https://tools.laynekudo.com')
  );
}

// ── IPC registration ──────────────────────────────────────────────────────

function setupLlmIpc(mainWindow) {
  ensureModelsDir();

  // llm:status ─────────────────────────────────────────────────────────────
  ipcMain.handle('llm:status', (event) => {
    if (!isValidSender(event)) return 'unavailable';
    return llmStatus;
  });

  // llm:cancel ─────────────────────────────────────────────────────────────
  ipcMain.handle('llm:cancel', (event) => {
    if (!isValidSender(event)) return;
    cancelRequested = true;
    if (activeChild) {
      try { activeChild.kill(); } catch (_) {}
      activeChild = null;
    }
  });

  // llm:analyze ────────────────────────────────────────────────────────────
  ipcMain.handle('llm:analyze', async (event, candidates, modelKey, authToken) => {
    llmLog('INFO', `llm:analyze token=${authToken ? 'present (' + String(authToken).slice(0, 20) + '...)' : 'MISSING'}`);
    if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { ok: false, err: 'No candidates provided' };
    }
    if (llmStatus === 'loading' || llmStatus === 'running') {
      return { ok: false, err: 'Analysis already in progress' };
    }

    cancelRequested = false;

    // Resolve which model file to use
    let filePath;
    let templateFamily = null;
    if (modelKey && MANAGED_MODELS[modelKey]) {
      filePath = modelPath(MANAGED_MODELS[modelKey].filename);
    } else {
      const lib = loadLibrary();
      const active = lib.models.find(m => m.active);
      if (!active) {
        return { ok: false, err: 'No model selected. Download a model in Configuration > Tuning Center.' };
      }
      filePath = modelPath(active.filename);
      templateFamily = active.templateFamily || null;
    }

    if (!fs.existsSync(filePath)) {
      return { ok: false, err: 'Model file not found. Download it in Configuration > Tuning Center.' };
    }

    try {
      const results = await runAnalysis(filePath, modelKey, templateFamily, candidates, mainWindow, authToken);
      return { ok: true, results, cancelled: cancelRequested };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  });

  // llm:download-model ─────────────────────────────────────────────────────
  ipcMain.handle('llm:download-model', async (event, modelKey) => {
    if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
    const managed = MANAGED_MODELS[modelKey];
    if (!managed) return { ok: false, err: `Unknown model: ${modelKey}` };
    if (!managed.downloadUrl) {
      return { ok: false, err: 'Download URL not configured for this model. Check for an app update.' };
    }

    const dest = modelPath(managed.filename);
    if (fs.existsSync(dest)) return { ok: false, err: 'Model already downloaded.' };

    ensureModelsDir();
    try { fs.unlinkSync(dest + '.download'); } catch (_) {} // clean up stale temp file
    try {
      await downloadFile(managed.downloadUrl, dest, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('llm:download-progress', { modelKey, ...progress });
        }
      });
    } catch (e) {
      try { fs.unlinkSync(dest + '.download'); } catch (_) {}
      return { ok: false, err: e.message };
    }

    // Verify checksum if available
    if (managed.sha256) {
      const hash = await computeSha256(dest);
      if (hash !== managed.sha256) {
        fs.unlinkSync(dest);
        return { ok: false, err: 'Checksum mismatch — download may be corrupted. Try again.' };
      }
    }

    upsertLibraryModel({
      filename: managed.filename,
      displayName: managed.displayName,
      type: 'managed',
      modelKey,
      sizeBytes: managed.sizeBytes,
      ramEstimateBytes: managed.ramEstimateBytes,
      quantization: managed.quantization,
      sha256: managed.sha256,
      status: 'ready',
      active: false,
    });

    return { ok: true };
  });

  // llm:check-update ───────────────────────────────────────────────────────
  ipcMain.handle('llm:check-update', async (event, modelKey) => {
    if (!isValidSender(event)) return { ok: false, updateAvailable: false };
    const managed = MANAGED_MODELS[modelKey];
    if (!managed) return { ok: false, err: `Unknown model: ${modelKey}`, updateAvailable: false };

    const dest = modelPath(managed.filename);
    if (!fs.existsSync(dest)) return { ok: true, updateAvailable: false };

    if (!GITHUB_MODEL_MANIFEST_URL) return { ok: true, updateAvailable: false };

    let remoteManifest;
    try {
      remoteManifest = await fetchJson(GITHUB_MODEL_MANIFEST_URL);
    } catch (e) {
      return { ok: true, updateAvailable: false, err: `Could not reach update server: ${e.message}` };
    }

    const remoteEntry = remoteManifest?.models?.[modelKey];
    if (!remoteEntry?.sha256) return { ok: true, updateAvailable: false };

    try {
      const localHash = await computeSha256(dest);
      const updateAvailable = localHash !== remoteEntry.sha256;
      if (updateAvailable) {
        // Cache updated metadata so download-model uses the current URL
        if (remoteEntry.downloadUrl) MANAGED_MODELS[modelKey].downloadUrl = remoteEntry.downloadUrl;
        MANAGED_MODELS[modelKey].sha256 = remoteEntry.sha256;
      }
      return { ok: true, updateAvailable, remoteVersion: remoteEntry.version || null };
    } catch (e) {
      return { ok: false, err: e.message, updateAvailable: false };
    }
  });

  // llm:browse-gguf ────────────────────────────────────────────────────────
  ipcMain.handle('llm:browse-gguf', async (event) => {
    if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
    const result = await dialog.showOpenDialog({
      title: 'Select GGUF Model File',
      filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true };
    return { ok: true, filePath: result.filePaths[0] };
  });

  // llm:add-custom ─────────────────────────────────────────────────────────
  ipcMain.handle('llm:add-custom', async (event, filePath, templateFamily) => {
    if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
    if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.gguf')) {
      return { ok: false, err: 'Path must point to a .gguf file' };
    }
    if (!fs.existsSync(filePath)) return { ok: false, err: 'File not found' };

    const filename = path.basename(filePath);
    const dest = modelPath(filename);

    if (path.resolve(filePath) !== path.resolve(dest)) {
      try { fs.copyFileSync(filePath, dest); } catch (e) {
        return { ok: false, err: `Failed to copy model: ${e.message}` };
      }
    }

    const headerCheck = validateGgufHeader(dest);
    const quantization = inferQuantization(filename);
    const { size } = fs.statSync(dest);
    const ramEst = estimateRam(dest);
    const warnings = buildCompatibilityWarnings(dest, filename, headerCheck);
    const sha256 = await computeSha256(dest);

    upsertLibraryModel({
      filename,
      displayName: filename.replace(/\.gguf$/i, ''),
      type: 'custom',
      templateFamily: templateFamily || 'phi',
      sizeBytes: size,
      ramEstimateBytes: ramEst,
      quantization,
      sha256,
      warnings,
      status: headerCheck.valid ? 'ready' : 'incompatible',
      active: false,
    });

    return { ok: true, warnings, filename };
  });

  // llm:download-url ───────────────────────────────────────────────────────
  ipcMain.handle('llm:download-url', async (event, url, templateFamily) => {
    if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      return { ok: false, err: 'URL must start with https://' };
    }

    let filename;
    try {
      filename = path.basename(new URL(url).pathname);
    } catch (_) {
      return { ok: false, err: 'Invalid URL' };
    }
    if (!filename.toLowerCase().endsWith('.gguf')) {
      return { ok: false, err: 'URL must point to a .gguf file' };
    }

    ensureModelsDir();
    const dest = modelPath(filename);

    try {
      await downloadFile(url, dest, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('llm:download-progress', { filename, ...progress });
        }
      });
    } catch (e) {
      try { fs.unlinkSync(dest + '.download'); } catch (_) {}
      return { ok: false, err: e.message };
    }

    const headerCheck = validateGgufHeader(dest);
    const quantization = inferQuantization(filename);
    const { size } = fs.statSync(dest);
    const ramEst = estimateRam(dest);
    const warnings = buildCompatibilityWarnings(dest, filename, headerCheck);
    const sha256 = await computeSha256(dest);

    upsertLibraryModel({
      filename,
      displayName: filename.replace(/\.gguf$/i, ''),
      type: 'custom',
      templateFamily: templateFamily || 'phi',
      sizeBytes: size,
      ramEstimateBytes: ramEst,
      quantization,
      sha256,
      warnings,
      status: headerCheck.valid ? 'ready' : 'incompatible',
      active: false,
    });

    return { ok: true, warnings, filename };
  });

  // llm:remove-model ───────────────────────────────────────────────────────
  ipcMain.handle('llm:remove-model', async (event, filename) => {
    if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
    if (
      typeof filename !== 'string' ||
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      return { ok: false, err: 'Invalid filename' };
    }

    const lib = loadLibrary();
    const entry = lib.models.find(m => m.filename === filename);
    if (!entry) return { ok: false, err: 'Model not found in library' };

    // Managed: delete .gguf from AppData. Custom: unregister only.
    if (entry.type === 'managed') {
      const filePath = modelPath(filename);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {
          return { ok: false, err: `Failed to delete model file: ${e.message}` };
        }
      }
    }

    removeLibraryModel(filename);
    return { ok: true };
  });

  // llm:get-library ────────────────────────────────────────────────────────
  ipcMain.handle('llm:get-library', (event) => {
    if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
    const lib = loadLibrary();

    const managed = Object.entries(MANAGED_MODELS).map(([key, m]) => {
      let entry = lib.models.find(e => e.modelKey === key) || {};
      const onDisk = fs.existsSync(modelPath(m.filename));

      const derivedTemplate = key.startsWith('qwen') ? 'qwen' : key.startsWith('llama') ? 'llama' : 'phi';

      // Auto-recover: file on disk but no library entry (e.g. crashed mid-download)
      if (onDisk && !entry.modelKey) {
        upsertLibraryModel({
          filename: m.filename,
          type: 'managed',
          modelKey: key,
          templateFamily: derivedTemplate,
          status: 'ready',
          active: false,
        });
        entry = { modelKey: key, templateFamily: derivedTemplate, status: 'ready', active: false };
        llmLog('INFO', `Auto-recovered managed model from disk: ${key}`);
      }

      // Backfill missing templateFamily on existing library entries
      if (entry.modelKey && !entry.templateFamily) {
        upsertLibraryModel({ ...entry, templateFamily: derivedTemplate });
        entry = { ...entry, templateFamily: derivedTemplate };
        llmLog('INFO', `Backfilled templateFamily for managed model: ${key} → ${derivedTemplate}`);
      }

      return {
        filename: m.filename,
        displayName: m.displayName,
        type: 'managed',
        modelKey: key,
        sizeBytes: m.sizeBytes,
        ramEstimateBytes: m.ramEstimateBytes,
        quantization: m.quantization,
        downloadUrl: m.downloadUrl,
        status: onDisk ? (entry.status || 'ready') : 'not-downloaded',
        active: entry.active || false,
        warnings: [],
      };
    });

    const custom = lib.models
      .filter(m => m.type === 'custom')
      .map(m => ({
        ...m,
        status: fs.existsSync(modelPath(m.filename)) ? (m.status || 'ready') : 'missing',
      }));

    return { ok: true, models: [...managed, ...custom] };
  });

  // llm:set-active ─────────────────────────────────────────────────────────
  ipcMain.handle('llm:set-active', async (event, filename) => {
    if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
    if (typeof filename !== 'string') return { ok: false, err: 'Invalid filename' };

    // If it's a managed model not yet in the library, add it first
    const managedEntry = Object.entries(MANAGED_MODELS).find(([, m]) => m.filename === filename);
    if (managedEntry) {
      const [key, m] = managedEntry;
      if (!fs.existsSync(modelPath(filename))) {
        return { ok: false, err: 'Model not downloaded. Download it first.' };
      }
      const lib = loadLibrary();
      if (!lib.models.find(e => e.filename === filename)) {
        upsertLibraryModel({
          filename: m.filename,
          displayName: m.displayName,
          type: 'managed',
          modelKey: key,
          sizeBytes: m.sizeBytes,
          ramEstimateBytes: m.ramEstimateBytes,
          quantization: m.quantization,
          sha256: m.sha256,
          status: 'ready',
          active: false,
        });
      }
    }

    const lib = loadLibrary();
    if (!lib.models.find(m => m.filename === filename)) {
      return { ok: false, err: 'Model not found in library' };
    }

    lib.models = lib.models.map(m => ({ ...m, active: m.filename === filename }));
    saveLibrary(lib);

    return { ok: true };
  });
}

// ── Startup update check ──────────────────────────────────────────────────

function scheduleStartupUpdateCheck(mainWindow) {
  setTimeout(async () => {
    if (!GITHUB_MODEL_MANIFEST_URL) return;

    const lib = loadLibrary();
    const installedManaged = lib.models.filter(m => m.type === 'managed');
    if (installedManaged.length === 0) return;

    let remoteManifest;
    try {
      remoteManifest = await fetchJson(GITHUB_MODEL_MANIFEST_URL);
    } catch (_) {
      return; // network unavailable — silent
    }

    for (const entry of installedManaged) {
      const managed = MANAGED_MODELS[entry.modelKey];
      if (!managed) continue;
      const remoteEntry = remoteManifest?.models?.[entry.modelKey];
      if (!remoteEntry?.sha256) continue;

      const filePath = modelPath(entry.filename);
      if (!fs.existsSync(filePath)) continue;

      try {
        const localHash = await computeSha256(filePath);
        if (localHash !== remoteEntry.sha256) {
          if (remoteEntry.downloadUrl) MANAGED_MODELS[entry.modelKey].downloadUrl = remoteEntry.downloadUrl;
          MANAGED_MODELS[entry.modelKey].sha256 = remoteEntry.sha256;

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('llm:update-available', {
              modelKey: entry.modelKey,
              displayName: managed.displayName,
              remoteVersion: remoteEntry.version || null,
            });
          }
        }
      } catch (_) {}
    }
  }, 10000);
}

module.exports = { setupLlmIpc, scheduleStartupUpdateCheck };
