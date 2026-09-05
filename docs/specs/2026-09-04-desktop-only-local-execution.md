# Desktop-Only Tools with Local IPC Execution

**Date:** 2026-09-04
**Status:** Approved design — pending implementation plan
**Author:** Layne Kudo (with Claude)

---

## Problem

Commit `a204408` ("production mode loads tools.laynekudo.com, dev mode uses localhost", 2026-04-04) changed the packaged Electron app from *"load a local shell + fork a local server"* to *"load the live VPS directly."* As a side effect:

- `startServer()` now early-returns in production, so `forkServer` is never called (dead code).
- Every `/api/*` call from the packaged app — including tools that must run from the user's own machine/network — now executes on the **VPS**.

This broke the **Network Scanner**, which is meant to run `nmap` locally. It also silently mis-routes every other tool whose behavior depends on request origin (HTTP Repeater, Intruder, Vulnerability Scanner, Subdomain Enumerator): those requests now leave from the VPS IP instead of the user's machine.

## Goal

Make the five origin-sensitive tools execute **locally in the desktop app** via Electron IPC, and present a **"Desktop only"** notice when the app is opened as a plain website (VPS/browser). No offensive/network execution ever runs on the VPS.

Bundle an **nmap installer** with the desktop app (mirroring the existing Fluent Bit pattern), since Network Scanner depends on nmap being present on the user's machine.

## Non-Goals

- Migrating non-origin-sensitive tools (Alert Triage, Phishing Analyzer, Threat Intel, OSINT Recon, CVE Mapper, etc.). These call Claude or key-based threat-intel APIs and correctly stay VPS-backed and web-accessible.
- The full intercepting Proxy (still backlog).
- macOS/Linux nmap bundling. Windows installer only this round (matches Fluent Bit); other platforms fall back to the "install nmap" prompt without a bundled binary.

---

## Scope: the five desktop-only tools

| Tool | Local work | Uses Claude? |
|------|-----------|--------------|
| Network Scanner | spawn `nmap`, stream output | **No** (Claude analysis removed) |
| HTTP Repeater | single outbound HTTP request | No |
| Intruder | `§placeholder§` injection, many outbound requests | No |
| Vulnerability Scanner | passive checks + active XSS/SQLi probes | **No** (Claude analysis removed) |
| Subdomain Enumerator | crt.sh + HackerTarget + local DNS brute-force | **No** (Claude analysis removed) |

**Behavior change:** Network Scanner, Vulnerability Scanner, and Subdomain Enumerator currently append an AI "analysis" object (`summary` / `riskLevel` / `findings` / `recommendations`) produced by `askClaude`. Per direction, **the Claude step is removed from all three.** They return only their raw / rule-based output:

- Network Scanner → raw nmap output.
- Vulnerability Scanner → its own rule-based passive/active findings (already computed without Claude).
- Subdomain Enumerator → the discovered subdomain list (with resolved IPs).

Consequently **none of the five tools call Claude**, so **none of them need any VPS server route.**

---

## Architecture

A single pattern applied five times. Each tool has three touch points: an Electron main module (does the work), a preload API (bridge), and a client branch (`isElectron` → IPC, else `<DesktopOnly>`).

### 1. Electron main modules

One CommonJS module per tool under `platform/electron/tools/<id>.js`, each exporting `register(ipcMain, getMainWindow)` that wires the tool's IPC handlers. `main.js` calls each module's `register` during startup. This keeps `main.js` (already ~756 lines) from growing unbounded and gives each tool an independently testable unit.

The offensive logic is **ported out of the current `tools/<id>/server/routes.js`** into these modules (Node built-ins: `child_process` for nmap, global `fetch` for HTTP, `dns/promises` for resolution). The server versions are then deleted (see §3), so the electron module is the single source of truth.

**Pure, testable validators** are extracted into plain functions (no Electron dependency) so they can be unit-tested directly:

- `validateTarget(target)` / `SCAN_PROFILES` (Network Scanner) — unchanged sandbox rules.
- `validateRequest({method, url, headers, body})` (HTTP Repeater / Intruder).
- `parsePlaceholders(template)` (Intruder `§...§`).
- `validateScanConfig(...)` (Vulnerability Scanner).
- `validateDomain(domain)` (Subdomain Enumerator).

**Per-tool handler shapes:**

- **network-scanner** — `network-scanner:start` (validate, spawn `nmap ['-oN','-', ...profile.args, '--', target]`, `shell:false`; stream `line` events; emit `done` with full raw output or `error`), `network-scanner:cancel`. Track processes by `runId`. 5-minute hard timeout. Kill on window close. nmap path resolution (see §5).
- **http-repeater** — `http-repeater:send` (invoke) → validate, `fetch`, return `{status, statusText, headers, body, timingMs, size}`. Cap response body read.
- **intruder** — `intruder:start` (parse placeholders, iterate the payload set, fetch each, stream `{index, payload, status, length, timingMs, anomaly}`), `intruder:cancel`. Concurrency + total-request cap.
- **vuln-scanner** — `vuln-scanner:start` (passive header/cookie/form checks + active XSS/SQLi probes; stream `finding` events; emit `done`), `vuln-scanner:cancel`. **Requires** the caller to pass `authorized: true` (the UI authorization checkbox); reject otherwise.
- **subdomain-enum** — `subdomain-enum:start` (crt.sh + HackerTarget fetch + DNS brute; stream `found` events or return the full list), `subdomain-enum:cancel`.

All handlers validate every input in the main process before any process spawn or outbound request. No raw user input is ever passed to a shell.

### 2. preload bridge

Extend `contextBridge.exposeInMainWorld('electron', …)` with a narrow API per tool, matching the existing style (`fluentBit`, `llm`, …):

```js
networkScanner: {
  start: (target, scanType) => ipcRenderer.invoke('network-scanner:start', target, scanType),
  cancel: (runId) => ipcRenderer.invoke('network-scanner:cancel', runId),
  onLine: (cb) => ipcRenderer.on('network-scanner:line', (_e, d) => cb(d)),
  onDone: (cb) => ipcRenderer.on('network-scanner:done', (_e, d) => cb(d)),
  onError: (cb) => ipcRenderer.on('network-scanner:error', (_e, d) => cb(d)),
},
httpRepeater: { send: (req) => ipcRenderer.invoke('http-repeater:send', req) },
intruder:     { start, cancel, onResult, onDone, onError },
vulnScanner:  { start, cancel, onFinding, onDone, onError },
subdomainEnum:{ start, cancel, onFound, onDone, onError },
nmap:         { status: () => ipcRenderer.invoke('nmap:status'),
                install: () => ipcRenderer.invoke('nmap:install') },
```

Streaming tools carry a `runId` so multiple runs and cancellation are unambiguous. Event listeners are registered once and dispatch by `runId` on the client side.

### 3. VPS server changes

For each of the five tools, **delete the execution routes** from `tools/<id>/server/routes.js` (`/scan`, `/scan-stream`, `/cancel`, `/send`, `/attack`, `/scan`, `/enumerate`). Since none of the five use Claude, **no route remains**.

To keep the API self-documenting and prevent silent VPS execution, each tool's `routes.js` is reduced to a catch-all that returns **HTTP 410 Gone**:

```js
router.all('*', (_req, res) =>
  res.status(410).json({ error: 'This tool runs locally in the 0xKudo desktop app.' }));
```

The loader (`platform/server/loader.js`) continues to mount these routers unchanged; `requiresAuth` stays `true` in each manifest so the 410 sits behind auth like before.

The `askClaude` import and all analysis code are removed from the three affected route files.

### 4. Client changes

Each of the five `tools/<id>/client/index.jsx`:

- If `!window.electron?.isElectron` → render the shared `<DesktopOnly toolName="…" />` component (new, in `platform/shell/src/components/DesktopOnly.jsx`). No scan/send controls are shown.
- If in Electron → call the IPC API instead of `fetch('/api/tools/...')`. Streaming tools subscribe to the `on*` events and dispatch by `runId`.
- Remove the Claude "analysis" panel from Network Scanner, Vulnerability Scanner, and Subdomain Enumerator; render their raw / rule-based output instead.

`<DesktopOnly>` is a small themed card: tool name, one line explaining it runs locally in the desktop app for safety/origin reasons, and (for Network Scanner) a link to the desktop download.

### 5. nmap bundled installer (mirrors Fluent Bit)

- **Bundle:** add to `electron-builder.yml` `extraResources`:
  ```yaml
  - from: "assets/nmap-installer.exe"
    to: "assets/nmap-installer.exe"
  ```
  Ship the official Nmap Windows self-installer (includes Npcap).
- **Detect:** `nmap:status` resolves nmap from `PATH` plus common install dirs (`%ProgramFiles%\Nmap\nmap.exe`, `%ProgramFiles(x86)%\Nmap\nmap.exe`, and any drive-letter `Program Files\Nmap`). Returns `{ installed, path }`.
- **Install:** `nmap:install` launches the bundled installer interactively (`exec('"<installerPath>"', { windowsHide: false })`), exactly like `fluent-bit:install`. Missing-installer error message matches the Fluent Bit one.
- **UI:** Network Scanner checks `window.electron.nmap.status()` on mount. If not installed, it shows an inline prompt: *"Network Scanner needs nmap. Install it now?"* with an Install button that calls `nmap:install`, plus a manual-download link. Re-checks status after install.
- The resolved nmap path from `nmap:status` is what `network-scanner:start` uses to spawn, so a fresh install works without an app restart where possible.

### 6. Cleanup / bundled fixes

- **Delete `forkServer`** and its PATH-less env allowlist from `platform/electron/main.js` (dead since `a204408`).
- **`network-threat-analyzer` 413:** oversized JSON input currently surfaces as `500`. Ensure the body-parser `PayloadTooLargeError` maps to **413** (route-level catch or shared error middleware). Keep the existing test that asserts 413.

---

## Data flow (desktop, Network Scanner example)

```
renderer: networkScanner.start(target, type)
  → IPC network-scanner:start
    → main validates, resolves nmap path, spawns nmap locally
      → stdout lines → network-scanner:line events → UI live output
    → nmap close → network-scanner:done { rawOutput } → UI renders result
(no VPS round-trip, no Claude)
```

Web browser at 0xkudo.com: client sees no `window.electron` → renders `<DesktopOnly>`. Any direct hit on the old endpoint → 410.

---

## Enhancement: real-time streaming output (Network Scanner) — requested 2026-09-05

**Current behavior (confirmed working but not live):** during a scan the UI shows nothing; the
results appear only once the scan completes and the user clicks "Show Raw nmap Output." The user
wants the output to **update in real time as nmap produces it**, the same way nmap prints to a
terminal.

Two root causes, both to fix:

1. **Client hides streamed lines on completion.** The live-output panel renders only while
   `!result` (`{(loading || liveLines.length > 0) && !result && ...}` in
   `tools/network-scanner/client/index.jsx`). The instant `onDone` fires, `setResult(data)` unmounts
   the live panel and replaces it with the summary card + collapsed "Show Raw nmap Output" toggle, so
   any lines that did stream disappear into the post-scan raw view. **Fix:** keep the streamed output
   visible and appended live during the run, and carry it straight into the completed result view
   (the raw panel should show the same text, expanded by default or continuous with the live panel) —
   no separate hidden toggle for what the user just watched scroll by.
2. **nmap block-buffers stdout to a pipe.** With `-oN -` to a non-TTY, nmap does not flush host
   results line-by-line, so lines arrive in a burst near the end (especially for fast single-host
   scans; a `/24` sweep shows it less). **Fix:** add `-v` (verbose — emits "Discovered open port…"
   and "Nmap scan report for…" as they happen) and `--stats-every 1s` to the profile args so nmap
   reports progress incrementally to the pipe. Verify each stream chunk is emitted per-line
   (`network-scanner:line`) as it is received (the main handler already splits on `\n` per chunk).

**Acceptance:** starting a scan against a `/24` (e.g. `192.168.1.0/24`, Ping Scan) shows host lines
appearing progressively while the scan runs, and the same output remains visible after completion
without an extra click.

---

## Security considerations

- All offensive execution moves off the VPS entirely (410 on the old routes). The VPS can no longer be used as an attack origin through these tools.
- Input validation stays in the main process, before any spawn/fetch/DNS. nmap keeps `shell:false`, the argument whitelist, and the `--` target separator.
- Vulnerability Scanner still requires the explicit authorization checkbox (`authorized: true`) before any active probe.
- The preload surface is narrow and per-tool; no generic "run arbitrary command" bridge is exposed.
- nmap installer: confirm redistribution licensing before bundling (Nmap ships under the Nmap Public Source License; the self-installer is generally redistributable, but verify and record the basis). Note the installer adds ~30–40 MB to the desktop package.

## Testing

- **Server:** each of the five tools returns **410** on its former execution path; the three formerly-Claude tools no longer import `askClaude`. Remove obsolete scan/send/attack/enumerate server tests. Keep and pass the `network-threat-analyzer` 413 test.
- **Electron main:** unit-test the extracted pure validators for every tool (reject shell metacharacters, bad scanType, bad method/URL, malformed placeholders, unauthorized scan). These run without launching Electron.
- **Manual:** in the packaged app — real local nmap scan (incl. the "nmap missing → install → scan" path), a Repeater request, a small Intruder run, a passive+active Vuln scan against an authorized target, and a subdomain enumeration. In a browser — each of the five shows `<DesktopOnly>`.

## Rollout

- Only affects packaged-app behavior for the five tools and the VPS routes for those five. No DB or auth changes.
- Requires an Electron rebuild + release (see `electron-release` skill) and a VPS deploy of the route changes.
- Deploy order: ship the VPS 410 changes and the new desktop build together, so web users see `<DesktopOnly>` and desktop users get local execution at the same time.

## Open items to confirm during implementation

- Exact source/version of the bundled `nmap-installer.exe` and its license basis.
- Whether Subdomain Enumerator's crt.sh/HackerTarget calls should remain (they work from anywhere) or also be treated as strictly local — current decision: run them locally with the rest for a consistent origin.
