# Desktop-Only Local Execution — Plan 3: Vulnerability Scanner + Subdomain Enumerator

**Date:** 2026-09-04 (written 2026-09-05)
**Spec:** `docs/specs/2026-09-04-desktop-only-local-execution.md`
**Depends on:** Plan 1 (pattern, `<DesktopOnly>`, 410 convention) and Plan 2 (streaming client pattern).
**Branch:** continue on the desktop-only branch (or `feat/desktop-only-plan3`).
**Tool ids:** Vulnerability Scanner = **`scanner`** (`tools/scanner/`); Subdomain Enumerator =
`subdomain-enumerator`.

---

## Global constraints

Same as Plans 1–2: `-core.js` pure validators + Vitest; `platform/electron/tools/<id>.js` with
`register()`; `main.js` registration; 410 server catch-all; `isElectron` client branch with
`<DesktopOnly>` on web. **Both tools drop Claude** (the current routes call `askClaude`) and return
only their rule-based / discovered output. Apply the Plan 1 streaming lesson: findings/subdomains
render live and stay visible after completion.

**Claude removal is the defining change here.** Per spec: Vulnerability Scanner returns its own
passive/active findings (already computed without Claude); Subdomain Enumerator returns the discovered
subdomain list with resolved IPs. Delete the `askClaude` import and the `analysis` block from both
route files as they are ported out.

---

## Current state

- `tools/scanner/server/routes.js` (~330 lines): `POST /scan` → passive header/cookie/form checks +
  active XSS/SQLi probes, then `askClaude` for an analysis object. Has an SSRF/loopback guard.
  **Requires the authorization checkbox.**
- `tools/subdomain-enumerator/server/routes.js` (193 lines): `POST /enumerate` → crt.sh + HackerTarget
  + DNS brute-force, then `askClaude` (line ~167) for analysis.

---

## Task 1: Vulnerability Scanner core validators (pure)

**File:** `platform/electron/tools/scanner-core.js`

- [ ] **Step 1 (TDD):** `platform/server/tests/scanner-core.test.js`
  - `validateScanConfig({url, authorized, active})`: rejects when `authorized !== true`
    (the hard gate), rejects bad/again non-http(s) URL, accepts a valid authorized config.
  - Keep any pure probe/payload helpers here (XSS/SQLi payload lists, response-diff heuristic) and
    test at least one (e.g. an injected-error signature match).
  - Decide on the SSRF guard: **local tool → allow loopback/RFC-1918** (a vuln scan of `127.0.0.1` or
    a LAN host is a legitimate local pentest). Assert those are accepted. The `authorized:true` gate is
    the safety control, not an origin block.
- [ ] **Step 2: implement**; export `{ validateScanConfig, XSS_PAYLOADS, SQLI_PAYLOADS, … }`.
- [ ] **Step 3: green.**  **Step 4: commit** — `feat(scanner): pure vuln-scan validators, authorized gate kept`.

## Task 2: Vulnerability Scanner main handler (streaming, authorized-gated)

**File:** `platform/electron/tools/scanner.js`

- [ ] **Step 1 (TDD):** `scanner-main.test.js` — `register` wires `vuln-scanner:start` + `vuln-scanner:cancel`;
  a `start` call with `authorized:false` returns `{error}` and performs no fetch.
- [ ] **Step 2: implement** `register(ipcMain, { getMainWindow, isValidSender })`:
  - `vuln-scanner:start` (→ `{runId}`): `isValidSender` guard, `validateScanConfig` (reject if not
    authorized), run passive checks then active probes, emit `vuln-scanner:finding { runId, … }` per
    finding, then `vuln-scanner:done { runId, findings, target }`; `vuln-scanner:error` on fatal.
  - `vuln-scanner:cancel` by `runId`. Per-request timeout + total cap.
- [ ] **Step 3: register in `main.js`.**  **Step 4: test + `node --check`.**
- [ ] **Step 5: commit** — `feat(electron): vuln-scanner IPC handler, streaming, authorized-gated`.

## Task 3: Vulnerability Scanner preload + client

- [ ] **Step 1: preload** `vulnScanner: { start, cancel, onFinding, onDone, onError }`.
- [ ] **Step 2: client** `tools/scanner/client/index.jsx`:
  - `if (!isElectron) return <DesktopOnly toolName="Vulnerability Scanner" … />`.
  - Replace `fetch('/api/tools/scanner/scan')` with `vulnScanner.start(...)` + `on*` by `runId`.
  - **Keep the authorization checkbox**; pass `authorized: true` only when checked (mirror the
    network-scanner `AuthGate`).
  - **Remove the Claude analysis panel;** render the rule-based findings live and keep them after done.
- [ ] **Step 3: build compiles.**  **Step 4: commit** — `feat(scanner): local IPC in app, Claude panel removed, DesktopOnly on web`.

## Task 4: Vulnerability Scanner VPS route → 410

- [ ] **Step 1 (TDD):** `scanner-410.test.js`.  **Step 2:** 410 catch-all; drop `askClaude` import.
- [ ] **Step 3:** delete obsolete scan test.  **Step 4:** green.
- [ ] **Step 5: commit** — `feat(scanner): server returns 410, execution moves to desktop`.

---

## Task 5: Subdomain Enumerator core validators (pure)

**File:** `platform/electron/tools/subdomain-enum-core.js`

- [ ] **Step 1 (TDD):** `subdomain-enum-core.test.js`
  - `validateDomain(domain)`: accepts `example.com`, `sub.example.co.uk`; rejects schemes, paths,
    spaces, overly long input, shell metacharacters.
  - If a wordlist/host-name builder is pure, test it.
- [ ] **Step 2: implement**; export `{ validateDomain, DEFAULT_WORDLIST }`.
- [ ] **Step 3: green.**  **Step 4: commit** — `feat(subdomain-enum): pure domain validator`.

## Task 6: Subdomain Enumerator main handler (streaming)

**File:** `platform/electron/tools/subdomain-enum.js`

- [ ] **Step 1 (TDD):** `subdomain-enum-main.test.js` — `register` wires `subdomain-enum:start` +
  `subdomain-enum:cancel`.
- [ ] **Step 2: implement** `register(...)`:
  - `subdomain-enum:start` (→ `{runId}`): `validateDomain`, then in parallel: fetch crt.sh, fetch
    HackerTarget, and DNS brute-force using `dns/promises` (`resolve4`) over the wordlist with a
    concurrency cap. Dedupe; emit `subdomain-enum:found { runId, subdomain, ip, source }` as each is
    discovered/resolved; `subdomain-enum:done { runId, results }`; `subdomain-enum:error`.
  - `subdomain-enum:cancel` by `runId`.
  - Note: crt.sh/HackerTarget work from anywhere; per spec decision they run locally with the rest for
    consistent origin. Handle their failures gracefully (one source down ≠ whole run fails).
- [ ] **Step 3: register in `main.js`.**  **Step 4: test + `node --check`.**
- [ ] **Step 5: commit** — `feat(electron): subdomain-enum IPC handler with DNS brute + streaming`.

## Task 7: Subdomain Enumerator preload + client

- [ ] **Step 1: preload** `subdomainEnum: { start, cancel, onFound, onDone, onError }`.
- [ ] **Step 2: client** `tools/subdomain-enumerator/client/index.jsx`:
  - `if (!isElectron) return <DesktopOnly toolName="Subdomain Enumerator" … />`.
  - Replace `fetch('/api/tools/subdomain-enumerator/enumerate')` with `subdomainEnum.start(...)` + `on*`.
  - **Remove the Claude analysis panel;** render the discovered list (subdomain + IP + source) live,
    kept after completion.
- [ ] **Step 3: build compiles.**  **Step 4: commit** — `feat(subdomain-enum): local IPC in app, Claude panel removed, DesktopOnly on web`.

## Task 8: Subdomain Enumerator VPS route → 410

- [ ] **Step 1 (TDD):** `subdomain-enum-410.test.js`.  **Step 2:** 410 catch-all; drop `askClaude`.
- [ ] **Step 3:** delete obsolete enumerate test.  **Step 4:** green.
- [ ] **Step 5: commit** — `feat(subdomain-enum): server returns 410, execution moves to desktop`.

---

## Verification (manual, Electron dev run)

- **Vulnerability Scanner:** without the authorization checkbox, Scan is blocked; with it checked,
  a scan of an authorized local target streams passive + active findings live, no Claude panel.
- **Subdomain Enumerator:** enumerate a domain you own; crt.sh/HackerTarget/DNS results stream in and
  persist; killing one source mid-run doesn't abort the whole run; Cancel works.
- **Web fallback:** both show `<DesktopOnly>` in a plain browser; old routes → 410.

## Release (all three plans together)

After Plans 1–3 are merged: one Electron rebuild + release (`electron-release` skill) and one VPS
deploy of all 410 routes + the 413 fix, shipped together so web users get `<DesktopOnly>` and desktop
users get local execution simultaneously (spec "Rollout"). Confirm nmap installer licensing before the
build (Plan 1 open item).
