# Desktop-Only Local Execution — Plan 1: Foundation + Network Scanner + nmap Installer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Network Scanner run `nmap` locally in the desktop app via Electron IPC, show a "Desktop only" notice on the web, bundle an nmap installer, and land two adjacent cleanups.

**Architecture:** Port nmap execution out of the VPS route into an Electron main module invoked over a narrow preload IPC bridge. The client branches on `window.electron?.isElectron`: IPC in the app, a shared `<DesktopOnly>` card on the web. The old VPS route returns 410. A bundled nmap installer mirrors the existing Fluent Bit pattern.

**Tech Stack:** Electron (CommonJS main/preload), React 18 (ESM client), Express (ESM server), Vitest, electron-builder.

Spec: `docs/specs/2026-09-04-desktop-only-local-execution.md`

## Global Constraints

- No em dashes in any code comments, commit messages, or UI copy. Use commas or restructure.
- No `Co-Authored-By` / Claude attribution in commit messages.
- Do not `git push` or deploy. Commit locally only.
- nmap execution stays sandboxed: `spawn('nmap', args, { shell: false })`, strict argument whitelist, `--` before the target, no raw user input to a shell.
- Electron IPC handlers must guard the sender with the existing `isValidSender(event)` helper in `main.js`.
- Preload exposes only the narrow per-tool API described here, never a generic command runner.
- Tests run with `npm run test --workspace=platform/server` (Vitest). Only run the tests touched by a task (project convention), not the full suite.
- Run only affected tests, never the whole suite unless shared infra changed.

---

### Task 1: Fix `network-threat-analyzer` oversized-payload status (500 to 413)

Independent quick win. Oversized JSON currently surfaces as 500; the test expects 413.

**Files:**
- Modify: `tools/network-threat-analyzer/server/routes.js`
- Test: `platform/server/tests/network-threat-analyzer.test.js` (existing, already asserts 413)

**Interfaces:**
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Run the existing test to confirm it currently fails**

Run: `cd platform/server && npx vitest run tests/network-threat-analyzer.test.js`
Expected: FAIL — "returns 413 when logData exceeds payload limit" expects 413, receives 500.

- [ ] **Step 2: Inspect the route's JSON parser and add a payload-error handler**

In `tools/network-threat-analyzer/server/routes.js`, the `express.json({ limit: ... })` middleware throws `PayloadTooLargeError` (which carries `err.type === 'entity.too.large'` and `err.status === 413`). Add an error-handling middleware immediately after the route that maps it to 413. Insert this just before `export default router;`:

```js
// Map body-parser payload-size errors to 413 instead of the default 500
router.use((err, _req, res, _next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413)) {
    return res.status(413).json({ error: 'Payload too large.' });
  }
  return res.status(500).json({ error: 'Internal error.' });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd platform/server && npx vitest run tests/network-threat-analyzer.test.js`
Expected: PASS (4/4).

- [ ] **Step 4: Commit**

```bash
git add tools/network-threat-analyzer/server/routes.js
git commit -m "fix(network-threat-analyzer): return 413 on oversized payload"
```

---

### Task 2: Delete dead `forkServer` from Electron main

`forkServer` has been unreachable since commit `a204408` (its only definition, never called). Its env allowlist also omits `PATH`, so it is a latent trap. Remove it.

**Files:**
- Modify: `platform/electron/main.js` (remove the `function forkServer(resolve, reject) { ... }` block, roughly lines 220-290)

**Interfaces:**
- Produces: nothing.

- [ ] **Step 1: Confirm it is unreferenced**

Run: `grep -n "forkServer" platform/electron/main.js`
Expected: exactly one line — the function definition. If any call site exists, STOP and do not delete.

- [ ] **Step 2: Delete the entire `forkServer` function**

Remove the whole `function forkServer(resolve, reject) { ... }` block. Leave `startServer()` (which handles both production early-return and the dev poll) intact.

- [ ] **Step 3: Verify the file still parses**

Run: `node --check platform/electron/main.js`
Expected: no output (syntax OK).

- [ ] **Step 4: Commit**

```bash
git add platform/electron/main.js
git commit -m "chore(electron): remove dead forkServer (unreachable since VPS-load change)"
```

---

### Task 3: Shared `<DesktopOnly>` component

A themed card shown when a desktop-only tool is opened on the web.

**Files:**
- Create: `platform/shell/src/components/DesktopOnly.jsx`
- Test: `platform/server/tests/desktop-only.test.jsx` (render test via Vitest + the project's JSX transform)

**Interfaces:**
- Produces: `export default function DesktopOnly({ toolName, downloadUrl })` — renders a card containing `toolName` and a line explaining the tool runs in the desktop app; if `downloadUrl` is provided, renders an anchor to it.

- [ ] **Step 1: Check whether the server Vitest config transforms JSX**

Run: `grep -rn "jsx\|jsdom\|environment" platform/server/vitest.config.* platform/server/tests/setup.js 2>/dev/null`
Expected: note whether a jsdom environment + JSX are available. If the server config does NOT support JSX/jsdom, SKIP the automated render test (Steps 2 and 4) and instead verify visually in Task 8's manual check; still create the component in Step 3. Record the decision in the commit message.

- [ ] **Step 2 (only if JSX/jsdom available): Write the failing render test**

```jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DesktopOnly from '../../shell/src/components/DesktopOnly.jsx';

describe('DesktopOnly', () => {
  it('shows the tool name and a desktop-app explanation', () => {
    render(<DesktopOnly toolName="Network Scanner" />);
    expect(screen.getByText(/Network Scanner/)).toBeTruthy();
    expect(screen.getByText(/desktop app/i)).toBeTruthy();
  });
});
```

Run: `cd platform/server && npx vitest run tests/desktop-only.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```jsx
// platform/shell/src/components/DesktopOnly.jsx
const wrap = {
  maxWidth: 480,
  margin: '48px auto',
  padding: '24px',
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font)',
  textAlign: 'center',
};
const title = { fontSize: '14px', marginBottom: '10px', letterSpacing: '0.02em' };
const body = { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 };
const link = { color: 'var(--text-primary)', textDecoration: 'underline' };

export default function DesktopOnly({ toolName, downloadUrl }) {
  return (
    <div style={wrap}>
      <div style={title}>{toolName} runs in the desktop app</div>
      <p style={body}>
        This tool executes on your own machine and network, so it is only
        available in the 0xKudo desktop app, not in the browser.
        {downloadUrl ? (
          <>
            {' '}
            <a style={link} href={downloadUrl}>Get the desktop app</a>.
          </>
        ) : null}
      </p>
    </div>
  );
}
```

- [ ] **Step 4 (only if JSX/jsdom available): Run the test to verify it passes**

Run: `cd platform/server && npx vitest run tests/desktop-only.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/shell/src/components/DesktopOnly.jsx platform/server/tests/desktop-only.test.jsx 2>/dev/null
git commit -m "feat(shell): add shared DesktopOnly notice component"
```

---

### Task 4: Network Scanner core module (pure, testable) in Electron

Extract nmap profiles, target validation, argument building, and nmap path resolution into a dependency-free CommonJS module so they can be unit-tested and reused by the main-process handler.

**Files:**
- Create: `platform/electron/tools/network-scanner-core.js`
- Test: `platform/server/tests/network-scanner-core.test.js`

**Interfaces:**
- Produces (CommonJS `module.exports`):
  - `SCAN_PROFILES` — `{ ping, quick, full, service, os, vuln }`, each `{ args: string[], label: string }`.
  - `validateTarget(target: string) : boolean`
  - `buildNmapArgs(target: string, scanType: string) : string[]` — returns `['-oN','-', ...profile.args, '--', target]`; throws `Error` on invalid target or unknown scanType.
  - `resolveNmapPath() : string | null` — resolves nmap from PATH and common Windows install dirs.

- [ ] **Step 1: Write the failing test**

```js
// platform/server/tests/network-scanner-core.test.js
import { describe, it, expect } from 'vitest';
import core from '../../electron/tools/network-scanner-core.js';

describe('network-scanner-core', () => {
  it('accepts a normal host and CIDR', () => {
    expect(core.validateTarget('scanme.nmap.org')).toBe(true);
    expect(core.validateTarget('192.168.1.0/24')).toBe(true);
  });
  it('rejects shell metacharacters and overlong input', () => {
    expect(core.validateTarget('a; rm -rf /')).toBe(false);
    expect(core.validateTarget('$(whoami)')).toBe(false);
    expect(core.validateTarget('a'.repeat(101))).toBe(false);
    expect(core.validateTarget('')).toBe(false);
  });
  it('builds args with the -- separator and known profile', () => {
    const args = core.buildNmapArgs('10.0.0.1', 'quick');
    expect(args[0]).toBe('-oN');
    expect(args).toContain('--');
    expect(args[args.length - 1]).toBe('10.0.0.1');
    expect(args).toContain('-F');
  });
  it('throws on unknown scanType and bad target', () => {
    expect(() => core.buildNmapArgs('10.0.0.1', 'bogus')).toThrow();
    expect(() => core.buildNmapArgs('a; ls', 'quick')).toThrow();
  });
});
```

Run: `cd platform/server && npx vitest run tests/network-scanner-core.test.js`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the core module**

```js
// platform/electron/tools/network-scanner-core.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TARGET_REGEX = /^[a-zA-Z0-9.\-/]+$/;
const MAX_TARGET_LENGTH = 100;

const SCAN_PROFILES = {
  ping:    { args: ['-sn'],                        label: 'Ping Scan (host discovery only)' },
  quick:   { args: ['-T4', '-F'],                  label: 'Quick Scan (top 100 ports)' },
  full:    { args: ['-T4', '-p-'],                 label: 'Full Port Scan (all 65535 ports)' },
  service: { args: ['-T4', '-sV', '-F'],           label: 'Service Version Detection' },
  os:      { args: ['-T4', '-O', '-F'],            label: 'OS Detection' },
  vuln:    { args: ['-T4', '--script=vuln', '-F'], label: 'Vulnerability Scripts' },
};

function validateTarget(target) {
  if (!target || typeof target !== 'string') return false;
  if (target.length > MAX_TARGET_LENGTH) return false;
  return TARGET_REGEX.test(target);
}

function buildNmapArgs(target, scanType) {
  const t = (target || '').trim();
  if (!validateTarget(t)) throw new Error('Invalid target.');
  const profile = SCAN_PROFILES[scanType];
  if (!profile) throw new Error('Invalid scanType.');
  return ['-oN', '-', ...profile.args, '--', t];
}

function resolveNmapPath() {
  // 1. On PATH
  try {
    const cmd = process.platform === 'win32' ? 'where nmap' : 'which nmap';
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) return out;
  } catch { /* not on PATH */ }
  // 2. Common Windows install dirs across drive letters
  if (process.platform === 'win32') {
    const candidates = [];
    for (const drive of ['C', 'D', 'E']) {
      candidates.push(`${drive}:\\Program Files\\Nmap\\nmap.exe`);
      candidates.push(`${drive}:\\Program Files (x86)\\Nmap\\nmap.exe`);
    }
    for (const c of candidates) { if (fs.existsSync(c)) return c; }
  } else {
    for (const c of ['/usr/bin/nmap', '/usr/local/bin/nmap', '/opt/homebrew/bin/nmap']) {
      if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

module.exports = { SCAN_PROFILES, validateTarget, buildNmapArgs, resolveNmapPath };
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd platform/server && npx vitest run tests/network-scanner-core.test.js`
Expected: PASS (4/4).

- [ ] **Step 4: Commit**

```bash
git add platform/electron/tools/network-scanner-core.js platform/server/tests/network-scanner-core.test.js
git commit -m "feat(electron): network-scanner core (profiles, target validation, nmap path)"
```

---

### Task 5: Network Scanner main-process handler module

Streaming nmap execution over IPC, tracked by `runId`, with cancel, timeout, and cleanup.

**Files:**
- Create: `platform/electron/tools/network-scanner.js`
- Modify: `platform/electron/main.js` (require and register in `app.whenReady`, near the existing `setupLlmIpc` call around line 713)

**Interfaces:**
- Consumes: `network-scanner-core.js` (`buildNmapArgs`, `resolveNmapPath`, `SCAN_PROFILES`); the `isValidSender(event)` helper and the `getMainWindow` accessor from `main.js`.
- Produces:
  - IPC `invoke('network-scanner:start', target, scanType)` -> `{ runId }` or `{ error }`.
  - IPC `invoke('network-scanner:cancel', runId)` -> `{ ok }`.
  - Events to the renderer: `network-scanner:line` `{ runId, line }`, `network-scanner:done` `{ runId, target, scanType, scanLabel, rawOutput }`, `network-scanner:error` `{ runId, error }`.
  - Export: `function register(ipcMain, { getMainWindow, isValidSender })`.

- [ ] **Step 1: Write the failing test for the module's registration surface**

Full nmap execution is an integration concern verified manually (Step 6). Here, assert the module wires the two handlers so a regression in registration is caught.

```js
// platform/server/tests/network-scanner-main.test.js
import { describe, it, expect, vi } from 'vitest';
import register from '../../electron/tools/network-scanner.js';

describe('network-scanner main register()', () => {
  it('registers start and cancel invoke handlers', () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => true });
    expect(typeof handlers['network-scanner:start']).toBe('function');
    expect(typeof handlers['network-scanner:cancel']).toBe('function');
  });

  it('start rejects an invalid target without spawning', async () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => true });
    const out = await handlers['network-scanner:start']({}, 'a; rm -rf /', 'quick');
    expect(out.error).toBeTruthy();
    expect(out.runId).toBeUndefined();
  });
});
```

Note: `register` is the default export here for test simplicity; re-export it as default in Step 2.

Run: `cd platform/server && npx vitest run tests/network-scanner-main.test.js`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the handler module**

```js
// platform/electron/tools/network-scanner.js
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const core = require('./network-scanner-core.js');

const SCAN_TIMEOUT_MS = 5 * 60 * 1000;
const active = new Map(); // runId -> { proc, timeout }

function register(ipcMain, { getMainWindow, isValidSender }) {
  function emit(channel, payload) {
    const win = getMainWindow && getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  ipcMain.handle('network-scanner:start', async (event, target, scanType) => {
    if (isValidSender && !isValidSender(event)) return { error: 'Unauthorized' };

    let args;
    try {
      args = core.buildNmapArgs(target, scanType);
    } catch (e) {
      return { error: e.message };
    }

    const nmapPath = core.resolveNmapPath();
    if (!nmapPath) return { error: 'nmap is not installed. Install it from the Network Scanner panel.' };

    const runId = randomUUID();
    const profile = core.SCAN_PROFILES[scanType];
    const cleanTarget = String(target).trim();
    let fullOutput = '';

    const proc = spawn(nmapPath, args, { shell: false });

    const timeout = setTimeout(() => {
      const entry = active.get(runId);
      if (entry) { entry.proc.kill(); active.delete(runId); emit('network-scanner:error', { runId, error: 'Scan timed out after 5 minutes.' }); }
    }, SCAN_TIMEOUT_MS);

    active.set(runId, { proc, timeout });

    proc.stdout.on('data', chunk => {
      const text = chunk.toString();
      fullOutput += text;
      text.split('\n').forEach(line => { if (line.trim()) emit('network-scanner:line', { runId, line }); });
    });
    proc.stderr.on('data', chunk => {
      const text = chunk.toString().trim();
      if (text) emit('network-scanner:line', { runId, line: text });
    });
    proc.on('error', err => {
      clearTimeout(timeout); active.delete(runId);
      emit('network-scanner:error', { runId, error: `Failed to start nmap: ${err.message}` });
    });
    proc.on('close', (code, signal) => {
      clearTimeout(timeout); active.delete(runId);
      if (signal === 'SIGTERM' || signal === 'SIGKILL') return; // cancel path already messaged
      if (code !== 0 && !fullOutput) { emit('network-scanner:error', { runId, error: `nmap exited with code ${code}` }); return; }
      emit('network-scanner:done', {
        runId, target: cleanTarget, scanType, scanLabel: profile.label, rawOutput: fullOutput,
      });
    });

    return { runId };
  });

  ipcMain.handle('network-scanner:cancel', async (event, runId) => {
    if (isValidSender && !isValidSender(event)) return { ok: false };
    const entry = active.get(runId);
    if (entry) {
      clearTimeout(entry.timeout);
      entry.proc.kill();
      active.delete(runId);
      emit('network-scanner:error', { runId, error: 'Scan stopped.' });
      return { ok: true };
    }
    return { ok: false };
  });
}

module.exports = register;
module.exports.register = register;
```

- [ ] **Step 3: Register the module in `main.js`**

In `platform/electron/main.js`, inside `app.whenReady().then(async () => { ... })` (near the `setupLlmIpc` call around line 713), add:

```js
const registerNetworkScanner = require('./tools/network-scanner');
registerNetworkScanner(ipcMain, { getMainWindow: () => mainWindow, isValidSender });
```

Confirm `mainWindow` and `isValidSender` are in scope at that point (they are module-level in `main.js`).

- [ ] **Step 4: Run the test and a syntax check**

Run: `cd platform/server && npx vitest run tests/network-scanner-main.test.js`
Expected: PASS (2/2).
Run: `node --check platform/electron/main.js && node --check platform/electron/tools/network-scanner.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add platform/electron/tools/network-scanner.js platform/electron/main.js platform/server/tests/network-scanner-main.test.js
git commit -m "feat(electron): network-scanner IPC handler with streaming, cancel, timeout"
```

- [ ] **Step 6: Manual smoke (deferred to Task 8's build)** — noted here; do not run yet.

---

### Task 6: Network Scanner VPS route to 410

Remove nmap and Claude from the server; return 410 on the old endpoints.

**Files:**
- Modify: `tools/network-scanner/server/routes.js` (replace entire file)
- Remove obsolete server test: `platform/server/tests/network-scanner.test.js`

**Interfaces:**
- Produces: `GET|POST /api/tools/network-scanner/*` -> 410 JSON `{ error }`.

- [ ] **Step 1: Write the failing test for the 410 behavior**

Create `platform/server/tests/network-scanner-410.test.js`:

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';

describe('network-scanner is desktop-only on the server', () => {
  it('returns 410 for the old scan endpoint', async () => {
    const app = await createApp();
    const res = await request(app).post('/api/tools/network-scanner/scan').send({ target: '1.1.1.1' });
    expect(res.status).toBe(410);
  });
});
```

Note: `createApp` is imported from `../index.js` and is async (`await createApp()`), matching `tests/decoder.test.js`. Network Scanner requires auth, so this route is behind `requireAuth`; confirm how `decoder.test.js` (a public tool) versus an authed tool test handles the token, and follow the authed pattern (e.g. `tests/alert-triage.test.js`) if the 410 route sits behind auth. If auth blocks the request before reaching the 410 handler, assert on the authed path the other tool tests use.

Run: `cd platform/server && npx vitest run tests/network-scanner-410.test.js`
Expected: FAIL (currently the route spawns/validates, not 410).

- [ ] **Step 2: Replace the route file**

```js
// tools/network-scanner/server/routes.js
import { Router } from 'express';

const router = Router();

// Network Scanner runs nmap locally in the 0xKudo desktop app.
// No scanning executes on the server.
router.all('*', (_req, res) =>
  res.status(410).json({ error: 'Network Scanner runs locally in the 0xKudo desktop app.' }));

export default router;
```

- [ ] **Step 3: Delete the obsolete mocked-nmap server test**

Run: `git rm platform/server/tests/network-scanner.test.js`

- [ ] **Step 4: Run the new test**

Run: `cd platform/server && npx vitest run tests/network-scanner-410.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/network-scanner/server/routes.js platform/server/tests/network-scanner-410.test.js
git commit -m "feat(network-scanner): server returns 410, execution moves to desktop"
```

---

### Task 7: Preload bridge for Network Scanner + nmap

**Files:**
- Modify: `platform/electron/preload.js` (add to the `exposeInMainWorld('electron', { ... })` object)

**Interfaces:**
- Consumes: IPC channels from Tasks 5 and 9.
- Produces on `window.electron`:
  - `networkScanner.start(target, scanType) -> Promise<{runId}|{error}>`
  - `networkScanner.cancel(runId) -> Promise<{ok}>`
  - `networkScanner.onLine(cb)`, `onDone(cb)`, `onError(cb)` — each `cb(data)` where data includes `runId`.
  - `nmap.status() -> Promise<{installed, path}>`
  - `nmap.install() -> Promise<{ok, err?}>`

- [ ] **Step 1: Add the APIs to preload**

Inside the object passed to `contextBridge.exposeInMainWorld('electron', { ... })`, add:

```js
  networkScanner: {
    start: (target, scanType) => ipcRenderer.invoke('network-scanner:start', target, scanType),
    cancel: (runId) => ipcRenderer.invoke('network-scanner:cancel', runId),
    onLine: (cb) => ipcRenderer.on('network-scanner:line', (_e, d) => cb(d)),
    onDone: (cb) => ipcRenderer.on('network-scanner:done', (_e, d) => cb(d)),
    onError: (cb) => ipcRenderer.on('network-scanner:error', (_e, d) => cb(d)),
  },
  nmap: {
    status: () => ipcRenderer.invoke('nmap:status'),
    install: () => ipcRenderer.invoke('nmap:install'),
  },
```

- [ ] **Step 2: Syntax check**

Run: `node --check platform/electron/preload.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add platform/electron/preload.js
git commit -m "feat(electron): preload bridge for networkScanner and nmap"
```

---

### Task 8: Network Scanner client — IPC in app, DesktopOnly on web

Branch the client: in Electron use IPC and remove the Claude analysis panel; on web render `<DesktopOnly>`.

**Files:**
- Modify: `tools/network-scanner/client/index.jsx`

**Interfaces:**
- Consumes: `window.electron.networkScanner`, `window.electron.nmap`, `<DesktopOnly>` (Task 3).

- [ ] **Step 1: Add the isElectron guard and DesktopOnly fallback**

Near the top of the component file, add the detection constant (module scope) and import:

```jsx
import DesktopOnly from '../../../platform/shell/src/components/DesktopOnly.jsx';
const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;
```

As the first line inside the component's `return` region, before the existing markup, short-circuit for web:

```jsx
if (!isElectron) return <DesktopOnly toolName="Network Scanner" downloadUrl="https://0xkudo.com/download" />;
```

- [ ] **Step 2: Replace the fetch/EventSource scan flow with IPC**

Replace the body of the scan handler (the `fetch('/api/tools/network-scanner/scan')` + `EventSource` block) with the IPC flow. Register the event listeners once via `useEffect`, dispatching by the active `runId`:

```jsx
// module or component scope: track the current run
const runIdRef = useRef(null);

useEffect(() => {
  if (!isElectron) return;
  window.electron.networkScanner.onLine(({ runId, line }) => {
    if (runId !== runIdRef.current) return;
    setLiveLines(prev => [...prev, line]);
  });
  window.electron.networkScanner.onDone((data) => {
    if (data.runId !== runIdRef.current) return;
    setResult(data);           // { target, scanType, scanLabel, rawOutput }
    setLoading(false);
    push('network-scanner', `${data.scanType}: ${data.target}`, data, 'network-scanner');
    runIdRef.current = null;
  });
  window.electron.networkScanner.onError(({ runId, error }) => {
    if (runId !== runIdRef.current) return;
    setError(error);
    setLoading(false);
    runIdRef.current = null;
  });
}, []);
```

New scan trigger body (replaces the fetch+EventSource section; keep the `!target.trim() || !authorized` guard):

```jsx
setLoading(true);
setError(null);
setResult(null);
setLiveLines([]);
setShowRaw(false);

const nmapState = await window.electron.nmap.status();
if (!nmapState.installed) {
  setNmapMissing(true);   // drives the install prompt (Step 4)
  setLoading(false);
  return;
}

const out = await window.electron.networkScanner.start(target.trim(), scanType);
if (out.error) { setError(out.error); setLoading(false); return; }
runIdRef.current = out.runId;
```

- [ ] **Step 3: Replace `handleStop` with the IPC cancel**

```jsx
async function handleStop() {
  if (runIdRef.current) { await window.electron.networkScanner.cancel(runIdRef.current); runIdRef.current = null; }
  setLoading(false);
  setError('Scan stopped.');
}
```

- [ ] **Step 4: Remove the Claude analysis panel; add the nmap-missing prompt**

The result no longer carries `summary` / `riskLevel` / `findings` / `recommendations`. Remove the JSX that renders those (the risk badge and findings/recommendations sections), keeping the raw nmap output view (`liveLines` / `rawOutput`). Add near the top of the returned markup:

```jsx
{nmapMissing && (
  <div style={styles.warning}>
    nmap is required for Network Scanner and was not found on this machine.
    <div style={{ marginTop: 8 }}>
      <Button onClick={async () => { const r = await window.electron.nmap.install(); if (r.ok) setNmapMissing(false); }}>
        Install nmap
      </Button>
    </div>
  </div>
)}
```

Add the `nmapMissing` state: `const [nmapMissing, setNmapMissing] = useState(false);`. Delete the now-unused `RISK_COLORS`, `analyzing`/`setAnalyzing`, `esRef`, and `scanIdRef` if nothing else references them (grep first).

- [ ] **Step 5: Verify the shell build compiles**

Run: `npm run build --workspace=platform/shell`
Expected: build succeeds with no unresolved-import or undefined-variable errors.

- [ ] **Step 6: Commit**

```bash
git add tools/network-scanner/client/index.jsx
git commit -m "feat(network-scanner): client uses local IPC in app, DesktopOnly on web"
```

---

### Task 9: nmap `status` / `install` IPC + bundled installer

**Files:**
- Modify: `platform/electron/main.js` (add `nmap:status` and `nmap:install` handlers near the Fluent Bit handlers around line 293-338)
- Modify: `platform/electron/electron-builder.yml` (add the installer to `extraResources`)
- Add binary: `platform/electron/assets/nmap-installer.exe` (see Step 1)

**Interfaces:**
- Consumes: `resolveNmapPath` from `network-scanner-core.js`.
- Produces: IPC `nmap:status -> { installed, path }`, `nmap:install -> { ok, err? }`.

- [ ] **Step 1: Obtain the installer and confirm licensing**

Download the official Nmap Windows self-installer (e.g. `nmap-<version>-setup.exe` from nmap.org) and save it as `platform/electron/assets/nmap-installer.exe`. Record the version and confirm redistribution is permitted under the Nmap Public Source License before committing the binary. If licensing cannot be confirmed, STOP and switch to download-on-demand (open nmap.org/download in the browser from `nmap:install` instead of bundling) and note the change.

- [ ] **Step 2: Add the IPC handlers in `main.js`**

Near the other tool handlers, add:

```js
const nsCore = require('./tools/network-scanner-core.js');

ipcMain.handle('nmap:status', async (event) => {
  if (!isValidSender(event)) return { installed: false, path: null };
  const p = nsCore.resolveNmapPath();
  return { installed: !!p, path: p };
});

ipcMain.handle('nmap:install', async (event) => {
  if (!isValidSender(event)) return { ok: false, err: 'Unauthorized' };
  const installerPath = path.join(process.resourcesPath, 'assets', 'nmap-installer.exe');
  if (!fs.existsSync(installerPath)) return { ok: false, err: 'Bundled installer not found. Re-install 0xKudo Security Toolkit to get the latest version.' };
  try {
    exec(`"${installerPath}"`, { windowsHide: false });
    return { ok: true };
  } catch {
    return { ok: false, err: 'Failed to launch installer.' };
  }
});
```

- [ ] **Step 3: Bundle the installer via electron-builder**

In `platform/electron/electron-builder.yml`, under `extraResources`, add a second entry alongside the Fluent Bit one:

```yaml
extraResources:
  - from: "assets/fluent-bit-installer.exe"
    to: "assets/fluent-bit-installer.exe"
  - from: "assets/nmap-installer.exe"
    to: "assets/nmap-installer.exe"
```

- [ ] **Step 4: Syntax check**

Run: `node --check platform/electron/main.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add platform/electron/main.js platform/electron/electron-builder.yml platform/electron/assets/nmap-installer.exe
git commit -m "feat(electron): bundle nmap installer with status/install IPC"
```

---

### Task 10: Full local verification (packaged-behavior smoke)

**Files:** none (verification only).

- [ ] **Step 1: Run the touched server tests together**

Run: `cd platform/server && npx vitest run tests/network-threat-analyzer.test.js tests/network-scanner-410.test.js tests/network-scanner-core.test.js tests/network-scanner-main.test.js tests/desktop-only.test.jsx`
Expected: all PASS (skip the jsx file if Task 3 Step 1 determined no JSX support).

- [ ] **Step 2: Dev-run the app and scan locally**

Run: `npm run electron:dev`
Then in the app: open Network Scanner, run a `quick` scan against `scanme.nmap.org`, confirm lines stream and a raw result renders with no Claude analysis panel. Click Stop mid-scan on a `full` scan and confirm it halts.

- [ ] **Step 3: Verify the nmap-missing path**

Temporarily rename the local Nmap dir (or test on a machine without nmap) so `resolveNmapPath()` returns null; confirm the client shows the install prompt. Restore afterward.

- [ ] **Step 4: Verify the web fallback**

Load `http://localhost:5173` in a plain browser (not the Electron app) and confirm Network Scanner shows the `<DesktopOnly>` card. Confirm `POST /api/tools/network-scanner/scan` against the server returns 410 (`curl` or devtools).

- [ ] **Step 5: No commit** (verification only). Record results in the PR/handoff notes.

---

## Self-Review

- **Spec coverage:** Network Scanner local IPC (Tasks 4-8), DesktopOnly web notice (Tasks 3, 8), server 410 (Task 6), nmap installer + detection + prompt (Tasks 4, 9, 8), Claude removal from Network Scanner (Task 6), `forkServer` deletion (Task 2), `network-threat-analyzer` 413 (Task 1). HTTP Repeater, Intruder, Vuln Scanner, Subdomain Enumerator are intentionally deferred to Plans 2 and 3.
- **Type consistency:** `runId` is the correlation key across main (Task 5), preload (Task 7), and client (Task 8). `resolveNmapPath` is defined in Task 4 and consumed in Tasks 5 and 9. `register(ipcMain, { getMainWindow, isValidSender })` signature matches between Task 5 definition and the `main.js` call site.
- **Placeholder scan:** none; all code steps carry full code.

## Execution Handoff

Follow-up plans (to be written after Plan 1 lands): Plan 2 (HTTP Repeater + Intruder), Plan 3 (Vulnerability Scanner + Subdomain Enumerator). Both reuse the DesktopOnly component, the `tools/<id>.js` main-module pattern, the preload-bridge pattern, and the 410-route pattern established here. Note for Plan 2: the ported Repeater/Intruder main modules must drop the internal/loopback/RFC-1918 host block that the current server routes enforce, since local pentest use requires reaching private and localhost targets.
