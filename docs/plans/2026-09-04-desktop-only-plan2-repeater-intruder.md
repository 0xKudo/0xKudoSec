# Desktop-Only Local Execution — Plan 2: HTTP Repeater + Intruder

**Date:** 2026-09-04 (written 2026-09-05)
**Spec:** `docs/specs/2026-09-04-desktop-only-local-execution.md`
**Depends on:** Plan 1 (shared `<DesktopOnly>`, the `platform/electron/tools/<id>.js` + `register()`
pattern, the 410 server-route convention). Plan 1 is code-complete and dev-verified.
**Branch:** continue on `feat/desktop-only-network-scanner` (or a `feat/desktop-only-plan2` cut from it).

---

## Global constraints

- Same pattern as Plan 1: one CommonJS `platform/electron/tools/<id>.js` exporting
  `register(ipcMain, { getMainWindow, isValidSender })`, registered in `main.js` `whenReady`.
- Pure validators extracted to a `-core.js` module, unit-tested via the server Vitest (no Electron).
- Each tool's `tools/<id>/server/routes.js` reduced to the `router.all('*', … 410)` catch-all;
  obsolete server tests deleted.
- Client branches on `window.electron?.isElectron`: IPC in app, shared `<DesktopOnly>` on web.
- **Neither tool uses Claude** — no server route survives.
- **DROP the SSRF block.** Both current routes reject internal/loopback/RFC-1918 targets
  (`BLOCKED_HOSTS`, `127.`/`10.`/`192.168.`/`169.254.`/`::1`). Local pentest use must reach
  private/localhost targets, so the ported local versions **do not** carry this block. This is the
  deliberate reversal of HANDOFF Finding 33 — it was correct for a VPS-hosted route, wrong for a
  local-only tool. Record the rationale in the commit message.
- **Apply the Plan 1 streaming lesson to Intruder:** render streamed per-request results live and keep
  them visible after completion. Do not gate the results table behind a `!done` guard (the bug found
  in Network Scanner where output only appeared post-run).

---

## Current state (what we are porting)

- `tools/http-repeater/server/routes.js` (140 lines): `POST /send` → validates method/URL/headers/body,
  `fetch`, returns `{status, statusText, headers, body, timingMs, size}`. Has the SSRF block. No Claude.
- `tools/intruder/server/routes.js` (204 lines): `POST /attack` → parses `§placeholder§`, iterates the
  payload set, fetches each, computes anomaly, returns results. Has the SSRF block. No Claude.

Client files today `fetch('/api/tools/http-repeater/send')` and `.../intruder/attack`.

---

## Task 1: HTTP Repeater core validators (pure, testable)

**File:** `platform/electron/tools/http-repeater-core.js`

- [ ] **Step 1 (TDD): failing test** `platform/server/tests/http-repeater-core.test.js`
  - `validateRequest({method,url,headers,body})` returns `{ok:true, normalized}` for a valid request.
  - Rejects: unknown method, non-http(s) scheme, malformed URL, header object with non-string values.
  - **Asserts loopback/RFC-1918 URLs are ACCEPTED** (`http://127.0.0.1:8080`, `http://192.168.1.1`) —
    this locks in the SSRF-block removal.
- [ ] **Step 2: implement** `validateRequest` — allowlist methods
  (`GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS`), require `http:`/`https:` via `new URL()`, coerce headers
  to string/string, cap body length (reuse the 50kb cap). Export `{ ALLOWED_METHODS, validateRequest }`.
- [ ] **Step 3: run test green.**
- [ ] **Step 4: commit** — `feat(http-repeater): pure request validator (SSRF block dropped for local)`.

## Task 2: HTTP Repeater main-process handler

**File:** `platform/electron/tools/http-repeater.js`

- [ ] **Step 1 (TDD): registration-surface test** `platform/server/tests/http-repeater-main.test.js`
  (mirror `network-scanner-main.test.js`): `register` wires `ipcMain.handle('http-repeater:send', …)`.
- [ ] **Step 2: implement** `register(ipcMain, { isValidSender })`:
  - `ipcMain.handle('http-repeater:send', async (event, req) => …)` — `isValidSender` guard,
    `validateRequest`, `fetch` with a timeout (AbortController, ~30s), read response with a body cap,
    return `{status, statusText, headers, body, timingMs, size}` or `{error}`.
  - No `runId` needed (single request/response, `invoke` round-trip).
- [ ] **Step 3: register in `main.js`** `whenReady` alongside network-scanner.
- [ ] **Step 4: test + `node --check`.**
- [ ] **Step 5: commit** — `feat(electron): http-repeater IPC send handler`.

## Task 3: HTTP Repeater preload + client

- [ ] **Step 1: preload** add `httpRepeater: { send: (req) => ipcRenderer.invoke('http-repeater:send', req) }`.
- [ ] **Step 2: client** `tools/http-repeater/client/index.jsx`:
  - `if (!isElectron) return <DesktopOnly toolName="HTTP Repeater" downloadUrl="…" />`.
  - Replace `fetch('/api/tools/http-repeater/send', …)` with `window.electron.httpRepeater.send(req)`.
  - Keep the existing request/response UI and localStorage history untouched.
- [ ] **Step 3: shell build compiles.**
- [ ] **Step 4: commit** — `feat(http-repeater): local IPC in app, DesktopOnly on web`.

## Task 4: HTTP Repeater VPS route → 410

- [ ] **Step 1 (TDD): 410 test** `platform/server/tests/http-repeater-410.test.js` (mirror
  `network-scanner-410.test.js`): `POST /send` and any path → 410.
- [ ] **Step 2:** replace `routes.js` with the `router.all('*', … 410)` catch-all
  (message: "HTTP Repeater runs locally in the 0xKudo desktop app.").
- [ ] **Step 3:** delete the obsolete `http-repeater` send test if one exists.
- [ ] **Step 4: test green.**
- [ ] **Step 5: commit** — `feat(http-repeater): server returns 410, execution moves to desktop`.

---

## Task 5: Intruder core validators (pure, testable)

**File:** `platform/electron/tools/intruder-core.js`

- [ ] **Step 1 (TDD): failing test** `platform/server/tests/intruder-core.test.js`
  - `parsePlaceholders(template)` finds `§…§` positions; returns `[]` for none; handles multiple.
  - `validateAttackConfig({template, payloads, …})` rejects: no placeholder, empty payloads,
    payload count over the cap, bad method/URL scheme.
  - Asserts loopback/RFC-1918 base URLs are ACCEPTED.
- [ ] **Step 2: implement** `parsePlaceholders`, `buildRequest(template, payload)` (substitute `§…§`),
  `validateAttackConfig`, and a `MAX_REQUESTS` / `CONCURRENCY` constant. Reuse the existing anomaly
  helper if pure; otherwise extract it here and test it.
- [ ] **Step 3: run green.**
- [ ] **Step 4: commit** — `feat(intruder): pure placeholder/attack validators`.

## Task 6: Intruder main-process handler (streaming)

**File:** `platform/electron/tools/intruder.js`

- [ ] **Step 1 (TDD): registration test** `platform/server/tests/intruder-main.test.js`: `register`
  wires `intruder:start` and `intruder:cancel`.
- [ ] **Step 2: implement** `register(ipcMain, { getMainWindow, isValidSender })`:
  - `intruder:start` (invoke → returns `{runId}`): validate, iterate payloads with a concurrency cap
    and a total-request cap, `fetch` each with per-request timeout, emit
    `intruder:result { runId, index, payload, status, length, timingMs, anomaly }` **as each returns**,
    then `intruder:done { runId, count }`; `intruder:error` on fatal.
  - `intruder:cancel` (by `runId`) — AbortController-abort the in-flight batch; stop the queue.
  - Track runs by `runId` in a `Map` (mirror network-scanner). Hard cap total run time.
- [ ] **Step 3: register in `main.js`.**
- [ ] **Step 4: test + `node --check`.**
- [ ] **Step 5: commit** — `feat(electron): intruder IPC handler with streaming + cancel`.

## Task 7: Intruder preload + client

- [ ] **Step 1: preload** `intruder: { start, cancel, onResult, onDone, onError }` (dispatch by `runId`).
- [ ] **Step 2: client** `tools/intruder/client/index.jsx`:
  - `if (!isElectron) return <DesktopOnly toolName="Intruder" … />`.
  - Replace the `fetch('/api/tools/intruder/attack')` flow with `window.electron.intruder.start(...)`
    + `onResult`/`onDone`/`onError` subscriptions dispatched by `runId` (register once in a
    `useEffect`, guard `runId !== runIdRef.current`, same shape as the network-scanner client).
  - **Render results live:** append each `onResult` row to the table as it arrives; keep the table
    visible during and after the run (do NOT hide it until `done` — this is the Plan 1 streaming fix).
  - Wire the Stop button to `intruder.cancel(runId)`.
- [ ] **Step 3: shell build compiles.**
- [ ] **Step 4: commit** — `feat(intruder): local IPC streaming in app, DesktopOnly on web`.

## Task 8: Intruder VPS route → 410

- [ ] **Step 1 (TDD): 410 test** `platform/server/tests/intruder-410.test.js`.
- [ ] **Step 2:** replace `routes.js` with the 410 catch-all.
- [ ] **Step 3:** delete obsolete `intruder` attack test if present.
- [ ] **Step 4: test green.**
- [ ] **Step 5: commit** — `feat(intruder): server returns 410, execution moves to desktop`.

---

## Verification (manual, after an Electron dev run)

Run locally per `project_local_dev_env` (backend on 4000, shell on 5173, `electron main.js`; no
`electron:dev` script on Windows). Then, in the app:

- **HTTP Repeater:** send a GET to `http://127.0.0.1:4000/api/health` (proves loopback works now) and
  an external `https://` request; confirm status/headers/body/timing render; confirm history persists.
- **Intruder:** small run (e.g. 10 payloads) against a local target; confirm rows appear **live** as
  each request completes, Stop halts mid-run, and the table stays after completion.
- **Web fallback:** open `http://localhost:5173` in a plain browser (not Electron) → both tools show
  `<DesktopOnly>`; `curl` the old `/send` and `/attack` routes → 410.

## Out of scope for Plan 2

- Vulnerability Scanner + Subdomain Enumerator (Plan 3).
- Electron rebuild/release and VPS deploy — batched with Plan 1 (and Plan 3) into one release.
- The Network Scanner real-time streaming enhancement (tracked separately in the spec).
