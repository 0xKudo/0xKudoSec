# 0xKudo Security Toolkit — Handoff

## What This Is

Unified cybersecurity tools platform at `tools.laynekudo.com`. Monorepo — shared Express/React platform, 19+ isolated tool modules.

**Spec:** `docs/specs/2026-03-26-cybertools-platform-design.md`
**Plan:** `docs/plans/2026-03-26-cybertools-platform.md`

---

## Current Status

**All 19 tools complete. Auth complete. SIEM complete. Electron wrapper complete.**

### Recently Completed (2026-04-08, mobile UI polish — inputs, buttons, controls)

**Comprehensive mobile layout pass across all tools and SIEM components.**

Key fixes applied:
- **Header margin:** All 19 tool headers now use `-16px` escape on mobile: `margin: isMobile ? '-16px -16px 20px -16px' : '-24px -24px 20px -24px'`
- **Buttons — natural width:** All primary buttons use natural width on mobile (no `width: '100%'`). Buttons in flex column containers use `alignSelf: 'flex-start'` to prevent stretch. `theme.css` has `button { width: auto; }` as a global baseline.
- **Select dropdowns — natural width:** All select elements on mobile use natural width. Where a select sits in a flex column, `alignSelf: 'flex-start'` prevents stretch.
- **Full-width inputs:** Inputs that should be full-width on mobile now have `width: '100%', boxSizing: 'border-box'` applied conditionally. Affected: osint-recon, threat-intel, cve-exploit-mapper, intruder (URL template).
- **Tab amber active style:** All tool tabs (log-anomaly-explainer, network-threat-analyzer, wordlist-generator, http-repeater, payload-generator) updated to amber active: `color: 'var(--accent-amber)'` + `borderBottom: '2px solid var(--accent-amber)'`.
- **Control row ordering:** log-anomaly-explainer and network-threat-analyzer — select + analyze button moved below the textarea/upload area on all screen sizes (was above on desktop, broken on mobile).
- **SIEM headers:** DetectionRules, AlertQueue, Cases — mobile header is flexible height column layout; buttons don't clip.
- **Log Search:** Severity filter row split into two rows on mobile (Time | Severity each on own row with label).
- **Audit Log:** Mobile header flexible height, "retained N days" on own line; filter row compact.
- **Sidebar/SiemSidebar footer:** Privacy Policy and Security Practices each on separate `<div>` lines.
- **HTTP Repeater mobile:** URL full-width on row 1, method select + Send button on row 2.
- **Payload Generator:** isMobile added to root component; web tab category grid 2-col on mobile.
- **Decoder mobile:** Two-level tab UI — 4-column grid of group tabs (URL/HTML/Base64/Hex/Binary/ROT13/Unicode/JWT), sub-tabs as 2-column grid below (only shown when group has >1 op). No borderRadius.
- **Reverse shell generator:** Generate button `alignSelf: 'flex-start'` on mobile (was `flex-end`, appeared right-aligned).
- **Network scanner mobile:** Select and buttons use `alignSelf: 'flex-start'` (no `width: '100%'`).
- **Intruder URL template:** Full-width on mobile, wrapper div also `width: '100%'` on mobile.

**Files changed:** All `tools/*/client/index.jsx`, `platform/shell/src/App.jsx`, `platform/shell/src/styles/theme.css`, `platform/shell/src/components/Sidebar.jsx`, `platform/shell/src/components/SiemSidebar.jsx`, `platform/shell/src/components/DetectionRules.jsx`, `platform/shell/src/components/AlertQueue.jsx`, `platform/shell/src/components/Cases.jsx`, `platform/shell/src/components/LogSearch.jsx`, `platform/shell/src/components/AuditLog.jsx`

---

### Recently Completed (2026-04-08, mobile header margin fix + sidebar footer fix)

**Tool header bars on mobile no longer use the negative margin escape.**

- `App.jsx` tool wrapper: `padding: '16px'` on mobile (was `'24px'` same as desktop)
- All 19 `tools/*/client/index.jsx`: header `style` spread with conditional margin:
  `margin: isMobile ? '0 0 20px 0' : '-24px -24px 20px -24px'` (tab tools use `'0'` on mobile)
- `alert-triage` and `payload-generator`: added `useIsMobile` import and `const isMobile = useIsMobile()` declaration (were the only two tools without it)
- `Sidebar.jsx` footer: Privacy Policy and Security Practices links now each wrapped in `<div>` so they appear on separate lines
- `docs/specs/ui-component-standards.md`: updated mobile section to document the header margin rule

**Files changed:** `platform/shell/src/App.jsx`, all `tools/*/client/index.jsx`, `platform/shell/src/components/Sidebar.jsx`, `docs/specs/ui-component-standards.md`

---

### Recently Completed (2026-04-08, UI polish — tool font-weight normalization)

**All tool components now render at correct weight (Fira Code 500, non-bold).**

Root cause: browsers don't inherit `font-weight` from `body` for `<button>`, `<input>`, `<select>`, `<textarea>`, and `<label>` — they apply their own UA bold defaults. React inline styles also bypass CSS cascade, so setting `font-weight` on `body` alone is insufficient.

Fixes applied:
- `platform/shell/src/styles/theme.css`: added global reset `button, input, select, textarea, label { font-family: var(--font); font-weight: 500; }`
- All tool `client/index.jsx` files: added `fontFamily: 'var(--font)'` to every button/tab style object (setting `fontFamily` inline forces the browser to re-resolve font properties from the cascade, picking up `font-weight: 500`)
- All tool title style objects: added `fontWeight: 'normal'`
- Checkbox label style objects (`checkItem`): added `fontWeight: 'normal'`
- Duplicate `fontFamily` keys (introduced by sed) cleaned up — build is warning-free

**Files changed:** `platform/shell/src/styles/theme.css`, all `tools/*/client/index.jsx`

---

### Recently Completed (2026-04-07, TopNav navigation + Fira Code — implemented)

**Navigation layout toggle + Fira Code font — fully implemented in live app.**

- **Fira Code** loaded via Google Fonts `@import` in `platform/shell/src/styles/theme.css`. `--font` updated from `'Source Code Pro'` to `'Fira Code'`. Applies to all platforms including mobile.
- **`navLayout` state** added to `App.jsx` (`AppInner`). Reads/writes `localStorage` under `cybertools_nav_layout` (`'topnav'` | `'sidebar'`). Default: `'topnav'`.
- **TopNav layout (desktop only):**
  - `CategoryBar` (Row 2) — renders below TopNav when `navLayout === 'topnav' && !isMobile`. Tools mode: Dashboard/Detect/Investigate/Report/Compliance/Simulate-Test/Config ↗. SIEM mode: SIEM view tabs.
  - `ToolBar` (Row 3) — renders when a category with tools is selected. Lists tools in that category as tabs. Hidden for Dashboard/Config.
  - Both exported from `platform/shell/src/components/TopNav.jsx`.
- **Sidebar layout** — `Sidebar.jsx` and `SiemSidebar.jsx` (plus Electron collapsible wrappers) now gated by `navLayout === 'sidebar'`. Mobile hamburger drawer untouched.
- **Footer** — shown when `navLayout === 'topnav' && !isMobile`. Version · build date · Privacy Policy, centered.
- **Appearance tab** added to `SiemConfiguration.jsx` (tab index 5). Two-button toggle: `[ Top Nav ]  [ Sidebar ]`. Receives `navLayout` + `setNavLayout` props from App.jsx. Applies immediately, no save button.
  - Desktop App tab shifted to index 6, Edit Config to index 7. All `tab === N` references and PIN gate `useEffect` checks updated.
- **`activeCategory` state** in `App.jsx` — derived from route on mount and sync'd on navigation. Drives which ToolBar row to show.

**Files changed:** `platform/shell/src/styles/theme.css`, `platform/shell/src/App.jsx`, `platform/shell/src/components/TopNav.jsx`, `platform/shell/src/components/SiemConfiguration.jsx`

---

### Recently Completed (2026-04-07, TopNav navigation redesign mockup)

**Navigation redesign — mockup approved, not yet implemented in code.**

Mockup: `mockups/topnav-navigation-mockup.html`

Three-row navigation pattern replacing the sidebar:
- **Row 1 (TopNav):** brand, SIEM | Tools app switcher (SIEM first), download button, user, logout, theme toggle
- **Row 2 (Category bar):** Dashboard, Detect, Investigate, Report, Compliance, Simulate/Test, Config ↗ — flat tabs, amber underline on active
- **Row 3 (Tool bar):** appears below Row 2 when a category is selected — lists all tools in that category as horizontal tabs, amber underline on active tool. Hidden for Dashboard and Config. Hidden entirely in SIEM mode.
- **SIEM mode:** Row 2 becomes flat SIEM view tabs (Dashboard, Alerts, Detection Rules, Log Search, Cases, Configuration, Audit Log). Row 3 hidden.
- **Footer:** version · build date · Privacy Policy, centered.
- Sidebar is removed entirely in this pattern.

**Also in this session:**
- Active alerts dedup count badge fixed — was clipped by `overflow:hidden` on title span; moved to flex sibling with `flexShrink:0`
- Domain migration spec created at `docs/specs/domain-migration.md` — full checklist for moving off `tools.laynekudo.com` including Epik DNS, Auth0, code, env vars, SSL, Electron rebuild
- Font decision: **Fira Code weight 500** chosen to replace Source Code Pro. Reason: slashed zero (0̷) preferred for security UI. JetBrains Mono and Inconsolata also tested and rejected. Not yet applied to live app — will be implemented alongside the TopNav navigation redesign. Load via Google Fonts or self-host; update `--font` in `platform/shell/src/styles/theme.css`.
- Navigation layout toggle spec written: `docs/specs/nav-layout-toggle.md`. Users will be able to switch between TopNav (default) and Sidebar from the Configuration Appearance section. State stored in localStorage under `cybertools_nav_layout`. Both sidebars kept as-is — conditionally rendered. Mobile unaffected.

---

### Recently Completed (2026-04-07, mobile UI fixes — no version bump)

**Mobile SIEM dashboard parity:**
- Auto-refresh every 15s with `loadingRef` guard (matches desktop)
- Severity filter replaced with multi-select `sevFilters` Set — single sev passes `?severity=` to server, multiple sevs filter client-side
- Collapsible "filter" button opens severity panel; button shows "filter (N)" when filters active
- Time range buttons (1h/6h/24h/48h/7d) applied to all four API calls
- Search bar with 300ms debounce, passes `?q=` to `/events/recent` — same as desktop
- Recent Events header shows active sev + search context with single Clear button
- Donut legend and event row badges both toggle sevFilters

**Audit log mobile fix:**
- Table was wider than viewport and draggable; root cause was `<main>` missing `minWidth:0` + `overflow:hidden` on mobile
- Replaced table with card-per-row layout on mobile (action badge + timestamp + IP + detail), matching AlertQueue pattern
- Desktop table unchanged

**Files changed:** `platform/shell/src/components/SiemDashboardMobile.jsx`, `platform/shell/src/components/AuditLog.jsx`, `platform/shell/src/App.jsx`

Full detail in `docs/specs/ui-improvements.md`.

---

### Recently Completed (2026-04-07, Electron security audit continued — v1.1.0 → v1.2.5)

**All actionable Electron security findings resolved. Current version: v1.2.5.**

Full audit spec: `docs/specs/2026-04-05-electron-security-audit.md`

Fixes by version:
- **v1.1.0:** fluent-bit:write-config input validation (length cap 64KB, dangerous directive block, path/section header checks)
- **v1.1.1:** Session-level CSP attempted — reverted in v1.1.4 (breaks Auth0 callback, deferred, needs F12 in packaged app to debug)
- **v1.1.5:** Auth0 callback server validates PKCE `code` + `state` params and `/callback` path before forwarding (Finding 3)
- **v1.1.6:** `electron-store` encrypted via `safeStorage`/Windows DPAPI — random key generated on first run, encrypted blob stored at `%APPDATA%\0xKudoSec\.store-key` (Finding 11)
- **v1.1.7:** userData path moved from `%APPDATA%\@cybertools\electron` to `%APPDATA%\0xKudoSec`
- **v1.1.8:** `process.env` subprocess allowlist — only 22 named vars passed to forked server, never `...process.env` (Finding 7). `app-builder-bin` moved to devDependencies (app size: 466MB → 277MB)
- **v1.1.9:** `allowToChangeInstallationDirectory` set to `false` then reverted to `true` — user wants choice, low risk
- **v1.2.0:** `executeJavaScript` in tray replaced with typed IPC `window:navigate` via preload bridge (Finding 12). `App.jsx` listens via `window.electron.window.onNavigate`
- **v1.2.1–v1.2.3:** Fluent Bit tray start/stop fixed — now calls `runSc()` from main process directly (same path as in-app buttons). UAC prompt appears on click.
- **v1.2.4:** DevTools/reload keyboard shortcuts blocked via `before-input-event` (F12, Ctrl+R, Ctrl+Shift+R, F5, Ctrl+Shift+I/J/C, Ctrl+U)
- **v1.2.5:** Reload shortcuts fully blocked via `Menu.setApplicationMenu(null)` — removes Chromium built-in shortcuts at root level

**Additional improvements in this session:**
- Agent status (Fluent Bit) added to both `Sidebar.jsx` and `SiemSidebar.jsx` above footer — polls every 15s, color-coded dot, Electron-only
- `.env.example` updated with missing vars: `AUTH0_TENANT_DOMAIN`, `INGEST_AUTH_DB_URL`, `OPS_DB_URL`, `DATABASE_CA_CERT`

**Remaining findings (deferred/blocked):**
- Finding 2: `fluent-bit:write-config` validation — deferred, no config editor UI exists yet
- Finding 10: Session-level CSP — deferred, breaks Auth0 callback flow
- Finding 13: Code signing — requires EV cert purchase (~$300-500/year)

**Note on Finding 3 (Auth0 state):** Auth0 SDK validates state internally as part of PKCE — the callback server now also validates `code` + `state` presence and correct path before forwarding

### Recently Completed (2026-04-07, security hardening continued — v1.2.6 → v1.2.15)

**Fluent Bit config editor (complete):**
- `Edit Config` tab in SiemConfiguration — visible only to users with `config-editor` Auth0 role in Electron
- Role detected from JWT custom claim `https://tools.laynekudo.com/roles`
- Auth0 setup: `config-editor` role created, Post Login Action deployed, assigned to Layne
- `requireRole` middleware added to `platform/server/middleware/requireAuth.js`
- Input sanitization: 50KB cap, null byte rejection, backtick/`$()` shell expansion blocked
- PIN gate: user sets a PIN (4-64 chars) stored as scrypt hash + salt in DPAPI-encrypted electron-store. Must re-enter every tab visit. PIN never stored in plaintext.
- PIN brute force lockout: 5 failed attempts triggers 60s lockout, tracked in memory (resets on app restart)
- scrypt guards: input length cap (256 chars) before hash, `timingSafeEqual` hash length guard prevents crash on corrupted store
- PIN recovery passphrase: scrypt hash + salt stored separately in electron-store. Required at PIN setup. Used to reset PIN without reinstalling.
- Existing PIN installs without recovery: `needs-recovery` state prompts user to add passphrase using current PIN
- IPC handlers: `fluent-bit:read-config`, `fluent-bit:write-config`, `settings:hasPin`, `settings:setPin`, `settings:verifyPin`, `settings:addRecovery`, `settings:resetWithPassphrase`
- Privacy policy updated: DPAPI encryption, scrypt PIN hashing, RBAC documented (Last updated: April 7, 2026)

**Full security review pass — findings 23-36 added to `docs/specs/security-hardening.md`:**
- 23: scrypt input length cap ✅ fixed in v1.2.8
- 24: timingSafeEqual hash length guard ✅ fixed in v1.2.8
- 25: PIN brute force lockout ✅ fixed in v1.2.8
- 26: `executeJavaScript` in Auth0 callback replaced with typed IPC `auth0:callback` ✅ fixed in v1.2.9/v1.2.10
- 27: Auth0 callback session nonce — deferred. Auth0 strips unknown params from redirects. appState approach documented in spec for future. Current posture: 127.0.0.1 binding + PKCE code+state validation.
- 28: PIN reset via recovery passphrase ✅ fixed in v1.2.11/v1.2.12
- 29: WorkspaceContext localStorage ✅ documented with intent comment in v1.2.13
- 30: CORS no-origin bypass ✅ documented with intent comment in v1.2.13
- 31: SRI on Vite build output ✅ fixed in v1.2.9 (`vite-plugin-subresource-integrity`)
- 32: Auth0 in-memory token storage ✅ documented with intent comment in v1.2.13
- 33: SSRF risk if Repeater/Intruder move server-side — deferred (future)
- 34: Raw system errors in IPC responses ✅ fixed in v1.2.13 (`fsErrMsg()` helper)
- 35: Electron version upgrade (17+ CVEs in Electron <=39.x) — open (medium, pre-enterprise rollout)
- 36: Fluent Bit bundled install + dynamic path + ACL + version check + GitHub Actions — open (large, pre-public release)

**Em dash cleanup:** Replaced em dashes with colons/periods in all security comments added this session (v1.2.13+).

**Splash-to-connecting flicker fix attempted and reverted:**
- `showInactive()` + `app:ready` IPC approach caused black window on launch
- Reverted to original `ready-to-show` handler in v1.2.10
- Documented in `docs/specs/ui-improvements.md` for future investigation

**Current version: v1.2.15**

**VPS npm audit warnings:** electron-builder dep vulnerabilities are build-time only, not runtime. Electron CVEs not directly exploitable given current posture but tracked as finding 35.

### Recently Completed (2026-04-06, session 8 cont. 4)

**Electron UX improvements:**
- Connecting screen resized to 480x280 (same as splash), moveable while connecting, expands to 1400x900 after auth resolves via `window:expand` IPC
- Connecting screen redesigned to match splash: `0xKudo` brand, spinner, "Connecting..." — same fonts/colors as `splash.html`
- Electron loads into SIEM automatically after the user authenticates (`useEffect` on `isAuthenticated` calls `setActiveApp('siem')`)
- Unauthenticated state remains on tools (`ElectronHome` grid)

**Privacy page Electron fixes:**
- Clicking Privacy Policy link no longer causes full page reload — switched from `<a href>` to `navigate()` in both `Sidebar.jsx` and `SiemSidebar.jsx`
- Privacy page scroll fixed in Electron: page div uses `display:flex, flexDirection:column, height:100%` with `flex:1, overflowY:auto` scroll area — respects `overflow:hidden !important` on `#root` from preload CSS

**Rate limit raised:**
- General API limiter raised from 60 to 200 req/min — SIEM dashboard polling alone hits ~40 req/min, previous limit caused 429 floods

**Build date from GitHub releases:**
- `vite.config.js` now fetches GitHub API at build time to get the `published_at` date for the current version tag
- Falls back to today's date if no release exists yet (dev builds, pre-release)
- Footer date now only changes when a new release is actually published

**Security hardening items 21 + 22:**
- Item 21: All 15 `INTERVAL '${hours} hours'` template literal interpolations in `siem.js` replaced with `make_interval(hours := $N)` — fully parameterized, eliminates SQL injection risk in interval expressions
- Item 22: Privacy policy page added at `/privacy` — accessible pre-login, post-login, and in Electron; no em dashes; links in both sidebar footers use `navigate()` for Electron compat

**Version bump to v1.0.6:**
- `platform/electron/package.json` and `platform/shell/package.json` bumped to `1.0.6`
- Download URLs updated to v1.0.6 in `LandingPage.jsx` and `TopNav.jsx`

### Recently Completed (2026-04-06, session 8 cont. 3)

**Security hardening item 20 — per-user rate limit on key rotation:**
- `ingestKeyLimiter` now keyed on `req.auth.sub` instead of IP — blocks distributed attacks
- Window changed from 1 minute to 1 hour, max 5 rotations
- `handler` logs `ingest_key.rotation_blocked` audit entry when limit hit
- Falls back to IP if `req.auth.sub` is undefined

**All 20 security hardening items complete.**

### Recently Completed (2026-04-06, session 8 cont. 2)

**Security hardening item 17 — PostgreSQL SSL with trusted cert:**
- Generated self-signed CA + server cert on VPS (`~/pg-certs/`), 10-year expiry
- PostgreSQL configured to use `/etc/ssl/certs/pg-server.crt` and `/etc/ssl/private/pg-server.key`
- CA cert copied to `/var/www/cybertools/platform/server/certs/pg-ca.crt` (gitignored)
- `db.js` `getSsl()` reads `DATABASE_CA_CERT` env var, loads CA cert, sets `rejectUnauthorized: true`
- `DATABASE_CA_CERT` added to `/var/www/cybertools/.env`
- All three pools (main, ingest_auth, ops) log `[db] SSL mode: enabled (CA-verified)`
- Falls back to `rejectUnauthorized: false` with warning if `DATABASE_CA_CERT` not set
- **Gotcha:** `import.meta.url` resolves to CWD under PM2, not the file's directory — never use `__dirname` for cert paths; use an env var pointing to the absolute path instead

### Recently Completed (2026-04-06, session 8 cont.)

**Security hardening item 18 — secrets management:**
- Created `/var/www/cybertools/.env` with all secrets, permissions `600` owned by `layne`
- `ecosystem.config.cjs` replaced with minimal config using `env_file: '/var/www/cybertools/.env'`
- All plaintext secrets removed from `ecosystem.config.cjs` — file is now safe to inspect
- PM2 v6.0.14 supports `env_file` natively — no dotenv code change needed
- DB password rotation deferred — can be done anytime by updating `.env` + `ALTER ROLE` + `pm2 restart all --update-env`
- **Note:** use `pm2 restart all --update-env` (not just `pm2 restart all`) when `.env` changes, otherwise PM2 uses cached env

### Recently Completed (2026-04-06, session 8)

**Security hardening item 16 — audit log tamper detection:**
- Added `row_hash VARCHAR(64)` column to `audit_log`
- `audit.js` now generates `created_at` in app, computes SHA-256 of `(user_id|action|meta|ip|created_at)`, stores in `row_hash` on every INSERT
- PostgreSQL trigger `audit_log_no_modify` blocks all UPDATE/DELETE on `audit_log` for the `cybertools` app role
- `cybertools_ops` role (NOLOGIN) granted DELETE + UPDATE on `audit_log` as a carve-out for retention cron and future GDPR deletes
- `db.js` — added `getOpsPool()` using `OPS_DB_URL` env var, same pattern as `ingest_auth`
- `retentionCron.js` — audit_log DELETE queries switched to ops pool
- `retentionCron.js` — integrity check cron added (daily at 02:15), recomputes hashes for last 25h of rows, logs any mismatches to console
- `OPS_DB_URL` added to `ecosystem.config.cjs` on VPS
- **Gotcha:** same alphanumeric-only password rule applies to `cybertools_ops` as to `ingest_auth`

### Recently Completed (2026-04-05, session 7)

**SIEM alert queue — Add to Existing Case:**
- Alert detail modal now shows "Add to Existing Case" section (only when cases exist) below the existing Create Case section
- `loadCases()` fetches `GET /api/siem/cases` when a modal opens, populates a select dropdown
- `addToCase()` POSTs `{ alert_id }` to `POST /api/siem/cases/:id/alerts` and shows toast confirmation
- State: `cases` array, `selectedCaseId` string, `addingToCase` bool
- Section hidden when user has no cases

**Log Search severity filter — multi-select:**
- `sevFilter` (single string) replaced with `sevFilters` (Set) — multi-select, matches Detection Rules style
- Color-coded bordered buttons: filled when active, border-only when inactive
- Clear button appears when any filter is active
- Server-side: `/events/recent` accepts comma-separated severity values, builds `IN (...)` clause

**Dashboard active alerts — UX fixes:**
- Severity badge: fixed to `width: 64px`, `textAlign: center`, `display: inline-block` — uniform sizing, no layout shift
- Alert timestamp changed from `toLocaleTimeString()` to `toLocaleString()` — full date + time shown

### Recently Completed (2026-04-05, session 6)

**URL-based SIEM navigation:**
- SIEM views now sync to URL: `/siem`, `/siem/alerts`, `/siem/rules`, `/siem/logsearch`, `/siem/cases`, `/siem/configuration`, `/siem/auditlog`
- `activeApp` and `siemView` are derived from `location.pathname` on load via `useLocation`
- `useEffect` on `location.pathname` keeps state in sync with URL (handles back/forward buttons and direct URL loads)
- All SIEM navigation goes through `handleSiemNavigate` which calls `navigate()` to update the URL
- Electron is unaffected — still uses state-based navigation (no address bar)
- `SIEM_VIEW_PATHS` and `SIEM_VIEW_TO_PATH` lookup maps defined at module level for clean bidirectional mapping
- Added `<Route path="/siem/*" element={null} />` so React Router doesn't redirect `/siem/*` paths to the dashboard catchall
- Refresh on any SIEM view loads the correct view

### Recently Completed (2026-04-05, session 5)

**Security hardening item 15 — RLS audit and tightening:**
- Full audit of all `pool.query()` calls across `siem.js`, `ingest.js` confirmed every query has explicit `user_id` filter except the two ingest key lookup queries in `requireIngestKey` (by design — user_id not yet known at that point)
- Created `ingest_auth` PostgreSQL role with `BYPASSRLS`, granted SELECT + UPDATE on `user_ingest_keys` only
- Added `getIngestAuthPool()` to `db.js` — separate Pool using `INGEST_AUTH_DB_URL` env var, falls back to main pool with warning if not set
- Updated `requireIngestKey` in `ingest.js` to use `ingestAuthPool` for both the SELECT and the `last_used_at` UPDATE
- Revoked `BYPASSRLS` from `cybertools` role — RLS now active as second layer of defense
- Had to grant explicit table permissions to `cybertools` after BYPASSRLS revoke (permissions were previously implicit via bypass) — `audit_log`, `logs`, `alerts`, `cases`, `case_alerts`, `detection_rules`, `ingest_sources`, `user_settings`, `user_ingest_keys`, and `audit_log_id_seq` sequence
- `INGEST_AUTH_DB_URL` added to `ecosystem.config.cjs` on VPS
- **Gotcha:** `ingest_auth` password must not use special characters that require URL encoding in the connection string, or the pg driver will fail to authenticate silently (catch {} swallows the error, falls through to 401). Use a simple alphanumeric password for this role.
- **Gotcha:** `fluent-bit.conf` must include `@INCLUDE cybertools.conf` — the default install does not include it, so Fluent Bit was only outputting to stdout and not sending events to the server.
- **Gotcha:** Fluent Bit conf indentation must be exactly 4 spaces — 3 spaces causes `invalid indentation level` error and service fails to start (error 1067).
- Tested: 490 events accepted after fix, no errors in PM2 logs

### Recently Completed (2026-04-05, session 4)

**Security hardening item 14 — ingest key rotation banner:**
- Server: `broadcast('ingest_key_rotated', { userId })` added to `siem.js` after key rotate (not on first create)
- Client: WS listener in `AppInner` (`App.jsx`) sets `keyRotatedBanner` state; amber banner renders inside SIEM `<main>` so it appears on all SIEM views including dashboard and configuration
- Banner auto-dismisses when `new_events` WS message received — confirms Fluent Bit is connected with the new key
- Banner style matches Electron update banner: `--bg-surface` background, `--accent-amber` border/text, dismiss ✕ button
- Bug fixed: `make_interval(days := $3)` replaces interval string concat — PostgreSQL rejected `$3` used as both integer and text in same query
- Bug fixed: key rotation now correctly updates `created_at` and `last_used_at` — previously broken by RLS (resolved by BYPASSRLS in item 6)
- All 14 hardening items now complete (12 + 13 deferred). Next: Phase 2 hardening spec additions.

**Security hardening items 9 + 10 + 11:**
- Item 9: CSP tuned in helmet config — explicit directives, `connect-src` includes Auth0 domain + WSS origin, `frame-ancestors 'none'`, `report-uri /api/csp-report`. Report endpoint added at `POST /api/csp-report` (logs violations, returns 204).
- Item 10: PostgreSQL SSL enforced in production via `ssl: { rejectUnauthorized: false }` in `db.js`. `rejectUnauthorized: true` was tried first but failed — VPS uses a self-signed cert. Connection is still encrypted.
- Item 11: Removed `DEFAULT ''` from `user_id` on `logs` and `ingest_sources` via migration (`ALTER TABLE ... ALTER COLUMN user_id DROP DEFAULT`). App-layer guard added to `/api/ingest/beats` — rejects requests where `req.ingestUserId` is null with 401.
- Migration confirmed safe — zero rows had `user_id = ''` before migration.
- CSP middleware must be placed AFTER correlation ID middleware or `X-Request-ID` won't appear (helmet ordering issue from items 7+8).

**Security hardening items 7 + 8 — error sanitization + correlation IDs:**
- Error handler in `index.js` now returns generic message + requestId in production, full message in dev
- Correlation ID middleware generates `crypto.randomUUID()` per request, sets `req.id` and `X-Request-ID` response header
- `audit()` in `audit.js` accepts optional `requestId` param, stored in meta for traceability
- Middleware must be placed AFTER `helmet()` and `corsMiddleware` — placing it before caused the header to be absent (helmet/cors middleware ordering issue)
- **VPS bug:** A root-owned PM2 instance (from a prior `sudo pm2` invocation) was holding port 4000 and intercepting all requests before the user-level PM2 process. Fixed by `sudo pm2 delete all` to clear the root instance. Never use `sudo pm2` — always run PM2 as the `layne` user.
- Verified working: `X-Request-ID` header visible in curl and DevTools Network tab

**Security hardening item 6 — ingest broken after RLS fix:**
- Root cause: `requireIngestKey` middleware uses direct `pool.query()` which doesn't set `app.user_id`, so RLS on `user_ingest_keys` blocked the SELECT and returned 0 rows, falling through to 401
- Fix: `ALTER ROLE cybertools BYPASSRLS;` run as postgres superuser on VPS (takes effect immediately, no restart)
- RLS revisit deferred — app enforces user scoping in every query, BYPASSRLS is acceptable for now
- **Fluent Bit gotcha:** after generating or rotating an ingest key, Fluent Bit must be restarted to pick up the new key: `net stop fluent-bit; net start fluent-bit` (PowerShell, run as admin)
- `last_used_at` is now updating correctly post-fix

### Recently Completed (2026-04-05, session 3)

**Releases repo cleanup + v1.0.5:**
- Created fresh `0xKudoSec-releases1` repo, deleted old `0xKudoSec-releases` (had Claude as contributor), renamed new repo to `0xKudoSec-releases`
- Bumped to v1.0.5 to avoid version conflict with old repo
- Updated `DESKTOP_DOWNLOAD_URL` in `LandingPage.jsx` and `TopNav.jsx` to v1.0.5
- Current version: **v1.0.5**
- Releases repo is now clean -- no Claude contributor history

### Recently Completed (2026-04-05, session 2)

**Download button + landing page CTA polish:**
- `DESKTOP_DOWNLOAD_URL` constant added near top of both `LandingPage.jsx` and `TopNav.jsx` -- update this with every Electron release
- Landing page hero: "↓ Download for Windows" button added to CTA row, amber color + border, matches primary button weight/size
- TopNav: "↓ Desktop App" link added to right section, amber color + border like auth buttons, hidden in Electron (`!isElectron` guard)
- Hover effects on all three landing page CTA buttons: primary inverts (light fill → dark fill, border stays light), secondary inverts (transparent → text-muted fill), download inverts (transparent → amber fill)
- Primary CTA button now has explicit border matching fill color so outline is visible against dark background
- Electron release skill updated: Step 2b added -- update `DESKTOP_DOWNLOAD_URL` in both files on every release

### Recently Completed (2026-04-05)

**Electron release pipeline + UX fixes:**
- Branded icon replaced in `platform\electron\assets\icon.ico` -- convert PNGs at convertico.com, drop in place, rebuild
- Version display: `__APP_VERSION__` and `__BUILD_DATE__` injected via Vite define in `vite.config.js`, shown in both Sidebar and SiemSidebar footers below laynekudo.com link
- Update banner restyled with `--accent-amber` color (text, border, button, progress bar) -- much more visible
- Auto-updater race condition fixed: `pendingUpdateInfo` cached in main process, `update:check-pending` IPC handler lets renderer poll on mount so banner shows even if event fired before React mounted
- Fluent Bit start/stop elevated via `Start-Process ... -Verb RunAs` in both tray.js and main.js `runSc()` -- fixes silent failure when stopping service without admin
- Release process: bump BOTH `platform/electron/package.json` AND `platform/shell/package.json` to same version before every publish
- Current version: **v1.0.4**
- Electron release skill at `C:\Users\lsgra\.claude\skills\electron-release\SKILL.md`

**Layout scroll fix:**
- Root cause: `styles.layout` used `height: 100vh` but `#root` has `zoom: 1.15` -- inside a zoomed element `100vh` equals unzoomed viewport height, making layout 15% taller than root
- Fix: changed to `height: 100%` in `App.jsx` `styles.layout`
- Also made `main` a flex column with `overflow: hidden`, gave each SIEM view container `flex: 1, minHeight: 0, overflow: auto`

### Recently Completed (2026-04-04)

**Electron desktop wrapper (`platform/electron/`):**
- Frameless BrowserWindow with custom drag region on TopNav, window controls (minimize/maximize/close)
- Splash screen while Express boots, polls `/health` before showing main window
- In dev mode: detects already-running Express server instead of forking a second one
- System tray: left-click opens window, right-click shows menu (Fluent Bit status, Configure Agent, Quit)
- Fluent Bit IPC: status/start/stop/restart via `sc.exe`, write-config via IPC
- Tray-on-close behavior: hide to tray on close (configurable in SiemConfiguration Account tab)
- `_forceClose` flag allows tray Quit to bypass hide-on-close
- Auth0 login: `will-navigate` intercepts redirect to system browser, localhost:8765 callback server catches code, `executeJavaScript` dispatches `auth0-callback` event to renderer, Auth0 SDK completes token exchange
- Auth0 CORS fix: `http://localhost:5173` added to Auth0 Allowed Origins (CORS) and Allowed Web Origins
- Agent Status panel in SiemConfiguration Connect a Source tab (Electron-only, `isElectron` gated)
- Desktop App settings in SiemConfiguration Account tab (tray-on-close toggle)
- `electron-builder.yml` for Windows NSIS installer
- Placeholder `icon.ico` in `platform/electron/assets/`

**Key gotchas:**
- Production mode: `$env:NODE_ENV="production"; npx electron platform/electron/main.js` -- loads `tools.laynekudo.com` directly, no local server needed
- Dev mode: `npx electron platform/electron/main.js` with `npm run dev` already running
- Auth0 requires `http://localhost:5173` in both Allowed Web Origins AND Allowed Origins (CORS)
- Auth0 Non-Verifiable Callback URI End-User Confirmation should be enabled (security)
- `window-all-closed` must not call `app.quit()` -- tray keeps app alive
- `webSecurity: true` -- CORS fix belongs in Auth0 dashboard, not Electron
- `isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged` -- must use `!== 'production'` not `=== 'development'`
- Preload injects CSS to remove outer scrollbars (`overflow: hidden` on html/body/#root), thin styled inner scrollbars via `::-webkit-scrollbar`
- Preload works on remote URLs (tools.laynekudo.com) -- `window.electron` is available in production mode
- After any shell changes: push to GitHub, then on VPS: `cd /var/www/cybertools && npm install --include=dev --workspace=platform/shell && npm run build --workspace=platform/shell && pm2 restart all`

**Electron installer (2026-04-04):**
- `electron-builder.yml` updated -- only bundles `main.js`, `preload.js`, `tray.js`, `splash.html`, `assets/`, `node_modules/`, `package.json` (no server/shell dist -- production loads remote VPS)
- `platform/electron/package.json` updated: added `description`, `author`, pinned `electron` to `29.4.6` (not `^29.4.6` -- electron-builder requires fixed version), added `app-builder-bin` dependency
- Build must be run from an **Administrator terminal** -- winCodeSign extraction requires symlink privileges
- Build command: `cd platform/electron && npx electron-builder --win --x64`
- Output: `dist-electron/0xKudo Security Toolkit Setup 1.0.0.exe` (NSIS installer) + `dist-electron/win-unpacked/` (portable)
- Installer contains zero credentials -- no `.env`, no API keys, no Auth0 secrets, no ingest keys
- Placeholder `icon.ico` is 256x256 (minimum required). Replace with proper multi-size ICO (256/128/64/48/32/16px) -- create 1024x1024 PNG, convert at icoconvert.com, drop into `platform/electron/assets/icon.ico`, rebuild

**Electron UI fixes + auto-update (2026-04-04):**
- Web double scrollbar fixed: `theme.css` -- `html/body` now `height:100% overflow:hidden`, removed `min-height:100vh`
- Electron unauthenticated launch: shows `ElectronHome` (4 no-auth tool cards + login button) instead of LandingPage
- Auth0 loading flash fixed: blank nav shown during `isLoading` state in Electron instead of SIEM shell
- F12 opens DevTools in Electron for debugging
- Auto-update system: `electron-updater` checks GitHub Releases on launch + every 4h, shows banner in TopNav with Download/progress/Install states, clears cache on install
- Publish config: `0xKudoX/0xKudoSec-releases` (public repo, separate from private source repo)
- `GH_TOKEN` saved in `.env` (never committed)
- v1.0.0 published to `github.com/0xKudoX/0xKudoSec-releases`

**Release process for future versions:**
1. Bump version in `platform/electron/package.json`
2. From Admin PowerShell: `$env:GH_TOKEN="..."; cd platform/electron; npx electron-builder --win --x64 --publish always`
3. Go to `github.com/0xKudoX/0xKudoSec-releases/releases`, edit the draft, add title, click Publish release
4. Installed apps will show update banner within 5 seconds of next launch

**Branding + UI polish (2026-04-04):**
- Brand title changed to `[ 0xKudoSec ]` across all platforms (TopNav, LandingPage, ElectronHome)
- Brand font size 16px everywhere
- Electron logout: `logout({ openUrl: false })` -- instant, no browser redirect
- ElectronHome Tools tab correctly highlighted as active when unauthenticated
- Auth0 loading state in Electron shows blank nav instead of SIEM shell

**Repo cleanup (2026-04-04):**
- `.gitignore` updated: ignores `*.md`, `docs/`, `*.csv`, `dist-electron/`, `detection-rules.json`
- Untracked from repo: `HANDOFF.md`, `CLAUDE.md`, `.env.example`, `docs/`, `detection-rules.json`, loose spec files
- Added `detection-rules-example.json` -- shows alert/suppress rule format for new users
- Only app source code is committed going forward -- no docs, no Claude files, no env templates
- `0xKudoSec-releases` repo cleaned -- orphan branch with only README, release assets attached to tags
- `GH_TOKEN` in `.env` only -- never committed

**VPS security hardening (2026-04-04):**
- fail2ban installed, active, auto-starts on boot -- bans IPs after 10 failed SSH attempts for 10 minutes
- `/etc/fail2ban/jail.local` configured with maxretry=10, bantime=10m
- SSH password authentication disabled -- key-only login
- Root login disabled -- only `layne` user can SSH in
- `layne` user created with sudo access, SSH key copied from root
- PM2 auto-start configured under `layne` user (`pm2-layne.service`)
- App starts with: `cd /var/www/cybertools && pm2 start ecosystem.config.cjs`
- Security updates applied (`apt upgrade -y`)
- PostgreSQL confirmed localhost-only, not publicly exposed
- Firewall active: ports 22/80/443 only

**VPS access going forward:**
- SSH: `ssh layne@tools.laynekudo.com`
- If locked out by fail2ban: use Hetzner console, login as `layne`, run `sudo fail2ban-client unban --all`
- Deploy: `ssh layne@tools.laynekudo.com` then `cd /var/www/cybertools && git pull && npm run build --workspace=platform/shell && pm2 restart all`

**Next:** Replace icon.ico with real branded icon, privacy/data policy page, then Proxy tool Phase 2.

**Enterprise Security Hardening (2026-04-05):**
- Full 14-item hardening backlog, spec at `docs/specs/security-hardening.md`
- Compliance targets: PCI DSS v4.0, SOC 2 Type II, ISO 27001, NIST SP 800-53
- Items 1-6 complete:
  1. Audit log 1-year retention — retentionCron.js, per-user toggle + days in SiemConfiguration
  2. Expanded audit coverage — 18 action types across siem.js + ingest.js, AuditLog.jsx updated
  3. Rate limiting — ingestBeatsLimiter (300/min), ingestKeyLimiter (5/min), ruleImportLimiter (10/min), apiRateLimiter now covers /api/siem + /api/ingest
  4. JWT query param removed — dead SSE code eliminated from requireAuth.js
  5. GDPR account deletion — DELETE /api/siem/account, transactional delete across 7 tables, audit log anonymization, Auth0 user delete, danger zone UI in Account tab
  6. Ingest key expiry + last_used_at — user_ingest_keys: expiry_days/expires_at/last_used_at columns, expiry check in requireIngestKey, per-user expiry selector in UI, expiry warnings
     - Migration 004: docs/migrations/004-ingest-key-expiry.sql (applied to VPS)
     - Root cause of last_used_at not showing: Fluent Bit was using INGEST_API_KEY env fallback, not per-user key. Fixed by updating Fluent Bit conf with per-user key and removing INGEST_API_KEY from ecosystem.config.cjs
     - UI fix: SiemConfiguration API Key tab now refreshes keyMeta on tab focus so last_used_at stays current
     - INGEST_API_KEY must be removed from ecosystem.config.cjs on VPS (do this if not done yet)
- Remaining: items 7-11, 14 (items 12-13 deferred)
- Next: item 7 — sanitize error responses in production

**Electron UX fixes (2026-04-05, session 2):**
- Collapse button: `position: fixed`, `left: 0` when collapsed / `left: 240px` when open, `bottom: calc(80px / 1.15)` — bypasses zoom entirely, always visible in viewport regardless of window size.
- Collapse button always `borderRadius: '0 4px 4px 0'` (rounded right only), only the arrow character flips direction.
- SiemSidebar: `configuration` and `dashboard` both unlocked when unauthenticated — `dashboard` allows returning from configuration view after tray "Configure Agent" nav.
- SiemConfiguration: `width: 100%` on container — fills the full content area regardless of which navigation path was used (tray nav vs sidebar nav).
- **Key insight:** Electron installer does NOT need rebuilding for shell/server changes — production .exe loads `tools.laynekudo.com` directly. Only rebuild for `main.js`, `preload.js`, or tray changes.

**Electron UX fixes (2026-04-05):**
- Collapsible sidebar on unauth SIEM + Tools views. Both use identical `ElectronCollapsibleSiemSidebar` / `ElectronCollapsibleToolsSidebar` pattern: `display: flex` wrapper, sidebar child, then amber toggle button as flex sibling with `alignSelf: flex-start, marginTop: 8px`.
- RequireAuth card: `position: fixed, top: 44px, pointerEvents: none` on wrap, `pointerEvents: auto` on card — bypasses zoom, always centered, never blocks sidebar clicks.
- **Root cause of collapse button not working in SIEM:** `RequireAuth` wrap used `position: fixed` covering the full viewport including the collapse button area, swallowing all clicks. Fixed with `pointerEvents: none` on wrap.
- Configuration accessible without auth in Electron — `isElectron && siemView === 'configuration'` renders `SiemConfiguration` outside `RequireAuth` in both early-return and main render paths.
- SiemConfiguration: `Desktop App` tab added (Electron-only, index 5). When unauthenticated in Electron, only Desktop App tab shown, defaults to it. Tray-on-close toggle moved from Account tab to Desktop App tab.
- Sidebar `height: 100%` + `boxSizing: border-box` on both SiemSidebar and Sidebar — footer link pinned to bottom.
- ElectronHome: `minHeight: calc(100vh / 1.15 - 44px)` for zoom-correct vertical centering.
- Decoder desktop: flat chip button row replaces vertical side panel. Hover effect matches active button color. Mobile untouched.

**Layout scroll fix (2026-04-04, session 3):**
- Connect a Source tab content was overflowing the viewport with no way to scroll to steps 4 and 5.
- Root cause: `styles.layout` used `height: 100vh` but `#root` has `zoom: 1.15`. Inside a zoomed element, `100vh` still equals the unzoomed viewport height, making the layout div 15% taller than `#root` can contain. The browser scrollbar was on the page itself, not inside the content area.
- Fix: changed `styles.layout` in `App.jsx` from `height: 100vh` to `height: 100%` so it fills `#root` instead of the raw viewport.
- Also made `main` a flex column with `overflow: hidden` and gave each SIEM view container `flex: 1, minHeight: 0, overflow: auto` so each view handles its own internal scroll.
- **Key lesson:** Always use DevTools `getBoundingClientRect()` to measure actual element heights before guessing at CSS causes. `zoom` on a parent makes `100vh` descendants overflow.

---

### Recently Completed (2026-04-04, session 2)

**Phase 1 enterprise security hardening:**
- **Ingest API key hashing**: already done (SHA-256, plaintext never stored, one-time reveal on generation)
- **npm audit**: all high/critical CVEs fixed in server + shell workspaces. Remaining 4 moderate are vite/vitest dev-only
- **Audit log**: new `audit_log` table (append-only, never update/delete). New `platform/server/services/audit.js` service — fire-and-forget writes, never blocks requests. Logs: `ingest_key.rotate`, `rule.create`, `rule.delete`, `rules.import`, `alerts.bulk_delete`, `alerts.bulk_status`, `case.create`, `case.delete`
- **PostgreSQL RLS**: `ENABLE ROW LEVEL SECURITY` on all 7 user-data tables (`logs`, `ingest_sources`, `user_settings`, `user_ingest_keys`, `detection_rules`, `alerts`, `cases`). Policy: `user_id = current_setting('app.user_id', true)`. Background services (detection.js, retentionCron.js) connect as superuser and bypass RLS — they already include explicit `WHERE user_id = $1`. Migration applied to VPS via psql
- **db.withUser()** helper added to `platform/server/services/db.js` — sets `SET LOCAL app.user_id` for future non-superuser app roles
- **Audit Log UI**: `platform/shell/src/components/AuditLog.jsx` — SIEM page under System section. Filter by action type + limit (50/100/250/500), color-coded action badges, refresh button. Server: `GET /api/siem/audit-log`
- **Schema**: `docs/schema.sql` updated with audit_log table. Migration at `docs/migrations/002-rls-audit.sql` (gitignored, paste manually)

**Electron UX fixes (session 2):**
- **Loading screen**: animated connecting dots (1→2→3→1 at 500ms), `position: fixed` to bypass zoom scaling, centered over full window
- **ElectronHome**: restored TopNav, uses `minHeight: 100%` centering
- **Electron defaults to Tools tab** when unauthenticated (was defaulting to SIEM)
- **SIEM from unauth state**: clicking SIEM tab now shows full SiemSidebar + Authentication Required card. Collapsible sidebar (defaults collapsed, `›`/`‹` toggle) on unauth SIEM view
- **RequireAuth card**: centered via parent flex container (`alignItems/justifyContent: center`), no longer uses `position: fixed` (which was blocking sidebar clicks and window controls)
- **Landing page scroll**: `useEffect` in `LandingPage` sets `document.documentElement/body.style.overflow = 'auto'` on mount, restores on unmount — bypasses `overflow: hidden` from theme.css

### Recently Completed
- Fluent Bit migration complete -- replaced node-shipper with Fluent Bit `winevtlog` input
  - Config: `C:\Program Files\fluent-bit\conf\cybertools.conf` -- two winevtlog inputs (Security + Sysmon/Operational)
  - Key: must use `winevtlog` not `winlog` -- winlog leaves Sysmon Message empty (provider DLL issue)
  - Fluent Bit runs as LocalSystem Windows service, auto-starts on boot
  - normalizeEvent.js detects winevtlog format by raw.EventID, extracts fields from StringInserts by position
  - Sysmon Event ID 1: process_name, username, domain, parent_process_name working
  - Sysmon Event ID 3: src/dst IP, port, protocol working
  - Sysmon Event ID 11: process_name, file_path, username working
  - Sysmon Event ID 13: process_name, registry_key, username working (positions confirmed from live sample)
  - Security 5156/5157/5158: network fields working
  - `fluent-bit` added to validSources and FIELD_ALIASES in siem.js
  - node-shipper moved to `_deprecated/node-shipper/`

### Recently Completed (2026-04-03, session 2)

**SIEM UI overhaul — multi-term search, alert tuning, detection rules search, Configuration page, sidebar fixes:**

- **Multi-term log search**: LogSearch and server `buildSearchConditions` rewritten to support space-separated AND terms, `field:value` syntax, comma-separated OR within a field (`event_id:4625,4688`). Parameterized queries throughout -- no SQL injection surface. Import endpoint (`/rules/import`) now enforces `Content-Type: application/json` to block multipart attacks.
- **35 new detection alert rules** added to `detection-rules.json` covering MITRE ATT&CK: Execution, PrivEsc, Persistence, DefenseEvasion, CredAccess, LateralMovement, Discovery. Total: 101 rules (52 alerts, 49 suppressions).
- **6 new suppressions** from CSV8 log analysis: Sendevsvc, sihost, sdbinst, rs2client, SYSTEM 4624, SYSTEM 4672.
- **False positive fixes**:
  - arp rule: added `match_process: 'arp'` so only arp.exe triggers (was firing on CefSharp paths containing "arp")
  - net user/localgroup rules: split into targeted rules with `match_process: 'net'`; bash running Claude shell scripts was triggering message-text match
  - rundll32 Defender false positive: added `match_message: 'Startupscan.dll'` suppression
  - RtkAud (Realtek audio driver): suppression added
  - jcmd: suppression added
  - Network Logon Type 3 alert: removed entirely -- message text matching too imprecise, was catching all SYSTEM service logons
- **Alert queue checkbox bug fixed**: `toggleOne` was firing from both `<td onClick>` and `<input onChange>`. Fixed by removing `onChange`, making input `readOnly`.
- **Alert queue resizable columns**: matches dashboard recent events pattern -- `colgroup` + `tableLayout: fixed`, `mousedown/mousemove/mouseup` on window, `DEFAULT_WIDTHS` per column, `resizeHandle` div with `borderRight: 2px solid var(--border)`. th padding `8px 18px 8px 14px`, td `maxWidth: 0, overflow: hidden, textOverflow: ellipsis`.
- **Dashboard severity filter**: changed from single-select string to multi-select Set (`sevFilters`). Persisted as array, initialized as `new Set()`. Colored chip buttons -- filled solid when active, colored border+text when inactive. Multi-select supported. `toggleSevFilter()` toggles Set membership. "All" clears Set. API passes single severity param when size===1, client-side filters when size>1.
- **Detection Rules search bar**: multi-term AND search with term chips (click to remove), severity filter chips (multi-select Set), shows "X of Y rules" count. Chips styled same as alert queue severity chips.
- **SiemConfiguration** (`platform/shell/src/components/SiemConfiguration.jsx`): new component merging SiemSettings + LogSources into a single tabbed page.
  - 5 tabs: API Key | Connect a Source | Log Retention | Active Sources | Account
  - API Key: ingest key generate/regenerate/copy, one-time display warning
  - Connect a Source: Fluent Bit / Winlogbeat 7 / Manual API sub-tabs, pre-filled configs with actual key, download + copy buttons, setup instructions
  - Log Retention: retention days setting + Download Log Data (custom DateTimePicker)
  - Active Sources: sources table + Upload Log File + Refresh button
  - Account: signed-in email display + password reset (email users get reset link, social users see provider message)
  - Fluent Bit config: all 10 channels, `Flush 2`, individual `.db` files at `C:\Program Files\fluent-bit\conf\`
  - Mobile: tabs wrap to two rows using `flex-wrap`, each tab `flex: 0 0 33.333%` so second row centers
  - Long code blocks (`sc.exe create`, `reg add` registry command): `whiteSpace: pre-wrap, wordBreak: break-all`
  - Tab hover effect matches sidebar (onMouseEnter/Leave color change)
- **App.jsx + SiemSidebar.jsx wired**: replaced `LogSources` + `SiemSettings` with `SiemConfiguration`. Sidebar "Settings" renamed to "Configuration", "Log Sources" nav item removed.
- **Tools sidebar**: "Configuration ↗" link added above "SIEM ↗". Clicking switches to SIEM app and navigates directly to configuration view. `onSwitchToSiemView` prop added to `Sidebar`.
- **Mobile sidebar drawer gap fix**: `overlay` div resized to match inner `<aside>` width (240px), removed double `borderRight`.

### Recently Completed (2026-04-03, session 2, continued)
- **Subdomain Enumerator WorkspaceContext crash fix**: when restored from workspace context, the saved data shape is `{ domain, subdomains }` but the component expected the full result shape with `sources`, `totalUnique`, `allSubdomains`, `analysis`. Two fixes:
  1. Normalize restored data in `useEffect`: set `allSubdomains: restore.allSubdomains || restore.subdomains || []`, `totalUnique`, `sources: restore.sources || {}`, `analysis: restore.analysis || null`
  2. Source cards: added `if (!src) return null` guard -- when `sources` is `{}`, any key lookup returns `undefined` and `src.count` was throwing

### Recently Completed (2026-04-04)
- Detection Rules UI overhaul:
  - Alert / Suppression tabs — each tab shows only its rule type with count badge
  - New Rule defaults to whichever tab is active
  - Export JSON button — downloads all rules as `detection-rules.json`
  - Import JSON button — bulk inserts rules from file, skips duplicates by name, shows toast with result count
  - Server: `GET /api/siem/rules/export` and `POST /api/siem/rules/import` (max 500 rules, validates all fields)
- CSV export fix: LogSearch export was breaking on messages containing newlines -- now always quotes all fields and collapses newlines to space
- LogSearch endpoint fix: was calling `/api/siem/events/recent` (correct) but had briefly been changed to `/api/siem/logs` (404) -- reverted
- Suppress filter NULL bug: `applySuppressFilters` in siem.js was silently dropping events with NULL nullable fields (process_name, source_ip, dest_ip) because PostgreSQL `NOT (NULL ILIKE '%x%')` = NULL. Fixed with `IS NOT NULL AND` guard on all ILIKE conditions. This was hiding all PowerShell, WMI, Defender, System, Application events.
- Fluent Bit expanded to 10 channels -- added System, Application, PowerShell/Operational, WMI-Activity/Operational, TaskScheduler/Operational, Windows Defender/Operational, Firewall, TerminalServices-RemoteConnectionManager/Operational
- PowerShell Script Block Logging enabled via registry (Event ID 4104 now fires)
- normalizeEvent.js: new HIGH_SEVERITY_EVENT_IDS, EVENT_ID_CATEGORY entries (powershell, wmi, scheduled-task, defender, rdp), `fluentBitSecurityUserFields()` for logon/account event user extraction
- Detection rules built up via CSV log analysis -- `detection-rules.json` in repo root is the master file
  - Suppress rules: jcmd.exe, Sophos, Claude, postgres, svchost, reg.exe, VS Code, Zoom, Discord, WUDFHost, EdgeUpdate, git.exe, bash.exe, BraveUpdate, BraveCrashHandler, OneDrive, AnthropicClaude updater, dllhost.exe, GoogleUpdater, node.exe, ossdbtoolsservice, AppInstallerPythonRedirector
  - Suppress EIDs: 4798, 4799, 5061, 5154, 5157, 5158, 5379, 5382, 5857, 5858, 7040, 16384, 16394
  - Alert rules: timestomping (EID 2) via powershell/cmd/wscript/rundll32/regsvr32 -- all critical severity
  - Import via Detection Rules > Import JSON. Duplicates skipped by name.

### Recently Completed (2026-04-03)
- Landing page complete: `platform/shell/src/pages/LandingPage.jsx`
  - Centered hero, stat bar, SIEM editorial + real dashboard preview, How it works (3 cards), tools by SOC phase, free strip, footer
  - LandingNav matches TopNav.jsx exactly (brand, SIEM/Tools tabs, login button, theme toggle)
  - Mobile branch: stacked sections, no dashboard preview, isMobile per ui-desktop-mobile.md spec
  - Browse Tools scrolls to tools section via ref
  - App.jsx shows LandingPage when `!isAuthenticated && !isLoading`
- Mobile layout pass started:
  - Root cause: `#root { zoom: 1.15 }` inflated everything on mobile causing horizontal overflow
  - Fix: `@media (max-width: 767px)` disables zoom, adds `overflow-x: hidden` — committed and deployed

### Recently Completed (2026-04-03, continued)
- Fluent Bit expanded to 10 channels (was 2):
  - Added: System, Application, PowerShell/Operational, WMI-Activity/Operational, TaskScheduler/Operational, Windows Defender/Operational, Firewall, TerminalServices-RemoteConnectionManager/Operational
  - Config: `C:\Program Files\fluent-bit\conf\cybertools.conf` -- each channel has its own .db file for position tracking
  - PowerShell Script Block Logging enabled via registry (Event ID 4104 now fires)
  - normalizeEvent.js: added HIGH_SEVERITY_EVENT_IDS for 4104, 5857/5858/5861 (WMI), 4698/4702 (task scheduler), 1116-1120 (Defender), 7045/4697 (service install), 4778/4779/1149 (RDP)
  - EVENT_ID_CATEGORY extended: powershell, wmi, scheduled-task, defender, rdp categories added
  - Added `fluentBitSecurityUserFields()` extractor for Security channel logon/account events (4624/4625/4648/4720/4726/4738) -- merges into fields alongside network fields
  - Server-side only change -- no rebuild needed on VPS, pull + pm2 restart sufficient

- Bug fixes (2026-04-03):
  - LogSearch was calling `/api/siem/events/recent` instead of the correct endpoint (reverted -- events/recent is correct, it does support q= search)
  - **Critical suppress filter bug**: `applySuppressFilters` was dropping all events with NULL nullable fields (process_name, source_ip, dest_ip, etc.) because PostgreSQL `NOT (NULL ILIKE '%x%')` evaluates to NULL not TRUE, filtering the row. Fixed by adding `IS NOT NULL AND` guard before each ILIKE condition in siem.js. This was silently suppressing all PowerShell, WMI, Defender, System, and Application events (any event without a process_name).
- Landing page copy updates:
  - Removed all "Free to use" text, kept only "No credit card required"
  - Hero description updated: "response" replaced with "reporting, compliance" to match actual tool categories

- Tool category reorganization:
  - Network Scanner moved from Respond → Investigate
  - Respond renamed to Report (Incident Report Generator only)
  - Security Policy Translator moved to new Compliance category
  - Updated: Sidebar.jsx, Dashboard.jsx, DashboardMobile.jsx, LandingPage.jsx
- Landing page Tools nav + no-auth tool access:
  - Tools button in header/footer now scrolls to tools section
  - 4 no-auth tools (Decoder, Reverse Shell Generator, Wordlist Generator, Payload Generator) shown as clickable `↗` links on landing page
  - App.jsx: `NO_AUTH_ROUTES` array — unauthenticated users on these routes bypass landing page gate
  - All other routes still redirect unauthenticated users to landing page

### Mobile Fix Queue — COMPLETE (2026-04-03)

All components done:
- theme.css zoom fix, App.jsx scroll/sticky TopNav
- Intruder, HTTP Repeater, Decoder
- AlertQueue, DetectionRules, Cases, LogSearch, LogSources (all SIEM tables -> cards)
- OSINT Recon, Threat Intel, Wordlist Generator
- Reverse Shell, CVE Mapper, Incident Report, Log Anomaly, Network Threat, Phishing Analyzer, Scanner, Security Policy Translator, Payload Obfuscation Explainer
- Network Scanner + Subdomain Enumerator were already done

Pattern used: `isMobile ? <mobile JSX> : <desktop JSX>`, never media queries in tool components. Tables replaced with card rows on SIEM components.

### Recently Completed (2026-04-01, continued)
- Log retention cron: `platform/server/services/retentionCron.js`, node-cron, runs daily at 02:00 VPS time
- Detection rules / alert queue fixed: `alerts` table was missing `count`, `last_seen`, and `alerts_dedup` unique constraint -- added via ALTER TABLE on VPS and updated schema.sql
- VPS build fix: `platform/shell` dev dependencies (vite) must be installed directly with `npm install --include=dev` inside `platform/shell/`, not from workspace root

### Recently Completed (2026-04-01, continued)
- Process tree + CVE lookup in alert detail modal
  - `logs` table: added `parent_process_id`, `process_guid`, `parent_process_guid` columns + indexes
  - `normalizeEvent.js`: Sysmon EID 1 now extracts `process_guid` (inserts[2]), `parent_process_guid` (inserts[18]), `parent_process_id` (inserts[19]); winlogbeat normalizer extracts same from `proc.entity_id` / `ed.ProcessGuid`
  - `ingest.js`: INSERT updated to include all three new fields
  - `siem.js`: two new endpoints:
    - `GET /api/siem/events/:id` -- fetch a single log row (used to get process_guid from alert's log_id)
    - `GET /api/siem/events/process-tree?process_guid=...` -- recursive CTE walking ancestors (depth < 0) and descendants (depth > 0); falls back to name+host match if no GUID
  - `AlertQueue.jsx`: alert detail modal now shows process tree panel -- indented by depth, ancestor/root/child markers, timestamp, PID, username; each node has "CVE Lookup" button that writes process name to localStorage and navigates to `/cve-exploit-mapper`
  - **VPS migration required**: run ALTER TABLE on VPS before deploying (see below)

### VPS Migration — Process Tree Columns
```sql
ALTER TABLE logs
  ADD COLUMN IF NOT EXISTS parent_process_id   INTEGER,
  ADD COLUMN IF NOT EXISTS process_guid        VARCHAR(64),
  ADD COLUMN IF NOT EXISTS parent_process_guid VARCHAR(64);
CREATE INDEX IF NOT EXISTS logs_process_guid_idx ON logs (process_guid);
CREATE INDEX IF NOT EXISTS logs_parent_guid_idx  ON logs (parent_process_guid);
```

### Recently Completed (2026-04-02)
- **Process tree panel** — shared `ProcessTreePanel` component in all event/alert detail modals; recursive CTE walks ancestors + descendants via process_guid linkage; fallback to process name + host; CVE Lookup button per node
- **Real-time detection** — detection rules now run at ingest time against newly inserted log IDs (`platform/server/services/detection.js`); manual "Run Rules" still available for historical scan
- **Alert/suppress ordering fixed** — alert rules run before suppress rules so broad suppressions (e.g. suppress all EID 5156) never swallow matching alert rules
- **Suppression applied to event feed** — recent events, stats counters, and top event IDs all exclude suppressed events; "Show suppressed events" toggle in filter panel
- **Detection rule dest port** — added `match_dest_port` field to detection rules (schema, server INSERT/PATCH, UI form); VPS migration: `ALTER TABLE detection_rules ADD COLUMN IF NOT EXISTS match_dest_port INTEGER;`
- **WFP alert rules** — EID 5156/5157/5158 suppress rules created with specific alert rules for C2 ports (4444/1337/9001), suspicious processes (powershell/cmd/wscript/mshta), reverse shell listener binds, DNS tunneling
- **Dashboard stability** — overlapping poll guard (`loadingRef`), poll interval increased to 60s, suppress filter uses inline NOT conditions (2 DB queries total, not N+1)
- **ingest_sources cleanup** — deleted stale node-shipper row from `ingest_sources` table on VPS; fluent-bit and winlogbeat are now the only active sources
- **AlertQueue blank screen fix** — removed stray `useNavigate()` call left over from process tree refactor

### Recently Completed (2026-04-02, continued)
- **CVE Lookup from process tree** — navigates to CVE Exploit Mapper, switches app to tools mode, auto-triggers search; fix required path-based `activeApp` init in App.jsx (tools registry not available at init time)
- **Tools dashboard equal panels** — fixed height 320px + `overflow: hidden` on panel; content scrolls inside, panels never grow unequally
- **Dashboard panel key** — `overflow: hidden` is what enforces the height; `height` alone is not enough in flex children

### Recently Completed (2026-04-02, continued)
- **Severity donut single-slice fix** — SVG arc can't draw a full circle (0-degree arc); when only one severity exists, render two concentric circles instead
- **by-severity suppress filter** — `/events/by-severity` now applies suppress rules so donut reflects suppressed event exclusions; passes `showSuppressed` param from dashboard

### Recently Completed (2026-04-02, continued)
- **Fluent Bit config fix** — in-app config was using `winlog` input; fixed to `winevtlog` (two separate INPUT blocks for Security and Sysmon, each with own DB file). External doc `docs/log-shipping-setup.md` rewritten to reflect Fluent Bit as primary shipper (node-shipper deprecated).
- **Change password in Settings** — `SiemSettings.jsx` detects `auth0|` vs social login from JWT sub; email/password users get a "Send Password Reset Email" button that calls `POST /api/siem/change-password`; social users see a message directing them to their provider.
  - Server endpoint gets M2M token using `AUTH0_MGMT_CLIENT_ID` + `AUTH0_MGMT_CLIENT_SECRET`, looks up user email via Management API, sends reset via `/dbconnections/change_password`
  - M2M app: "0xKudo API (Test Application)" in Auth0, needs `read:users` + `update:users` permissions on Auth0 Management API
  - Audience for M2M token must use raw tenant domain (`AUTH0_TENANT_DOMAIN=dev-dk318hthn8qe0k7s.us.auth0.com`), not custom domain -- added to ecosystem.config.cjs on VPS
  - `.gitignore` updated: `.claude/`, `mockups/`, `_deprecated/`, `docs/`, `platform/server/tests/` all excluded

### Next
- Phase 4: Electron + Proxy tool

---

## Tools (All Complete)

1. Alert Triage Assistant
2. Incident Report Generator
3. Phishing Email Analyzer
4. OSINT Recon Dashboard
5. Threat Intelligence Aggregator
6. Network Threat Analyzer
7. Network Scanner (nmap)
8. Log Anomaly Explainer
9. CVE Exploit Mapper
10. Payload Obfuscation Explainer
11. Security Policy Translator
12. Reverse Shell Generator
13. Wordlist / Password Generator
14. Subdomain Enumerator
15. HTTP Repeater
16. Proxy — deferred to Electron phase
17. Intruder
18. Vulnerability Scanner
19. Decoder
20. Payload Generator

---

## Auth (Complete)

- Auth0 — Google + GitHub social login + email/password
- `platform/server/middleware/requireAuth.js` — lazy-init to avoid ESM hoisting issue (reads `AUTH0_DOMAIN` at request time, not import time)
- 15 tools protected, 4 public (decoder, reverse-shell-generator, wordlist-generator, payload-generator)
- Auth0 custom domain: `auth.laynekudo.com` (CNAME on Hostinger)
- App defaults to SIEM when authenticated, tools when not

**Critical:** `req.auth.sub` — express-jwt v8 uses `req.auth`, not `req.user`.

---

## SIEM Phase 2 (Complete)

### Database Schema
- PostgreSQL 18, `cybertools` database
- `logs` table — 24 columns + `user_id VARCHAR(255)` for per-user data scoping
- `ingest_sources` table — unique on `(name, user_id)` composite key
- `user_ingest_keys` table — maps `user_id` to `api_key`, generated per user from Log Sources page
- All SIEM queries scoped to `req.auth.sub` (user_id)
- Schema: `docs/schema.sql`

### Ingest Pipeline
- `platform/server/routes/ingest.js` — `POST /api/ingest/beats`
  - Looks up `user_id` from `user_ingest_keys` table by Bearer token
  - Falls back to env `INGEST_API_KEY` for dev (no user scoping)
  - Tags all events with `user_id`
- `platform/server/services/ingest/normalizeEvent.js`
  - `event_category` from event ID lookup table (not Windows Keywords bitmask)
  - Sysmon field names: `SourceIp`, `DestinationIp`, `DestinationPort`, `Image` in `event_data`
  - Network fields: `ed.SourceIp || ed.SourceAddress` etc.

### SIEM API Routes (`platform/server/routes/siem.js`)
- All 11 endpoints scoped to `req.auth.sub`
- `GET /api/siem/ingest-key` — fetch user's current key
- `POST /api/siem/ingest-key` — generate/regenerate key
- Mounted before global rate limiter to avoid 429s from WebSocket-triggered refreshes

### Frontend
- `SiemDashboard.jsx` — live data, WebSocket real-time updates (1s debounce), 30s polling fallback, time range selector, severity + category filters, clickable event rows open detail modal with scroll
- `LogSources.jsx` — ingest key generation, key hidden by default (reveal toggle), shipper config block, active sources table
- `App.jsx` — defaults to SIEM on login via `useEffect` on `isAuthenticated`

### Node.js Shipper (`shipper/`)
- Reads Windows Event Log via PowerShell `-File` (temp file at `%TEMP%/cybertools-query.ps1`)
- **Must run as Administrator** — Security and Sysmon channels require elevated privileges
- Channel order: Sysmon first, Security last (Security is slowest)
- Security channel capped at `-MaxEvents 200` to prevent timeout
- Batch size: 50, Poll interval: 60s, Hours back: 24
- Survives network errors (try/catch in `ship()`, `safePoll()` wrapper)
- Registered as Windows scheduled task "CybertoolsShipper" — runs at login, restarts on crash
- Uses per-user API key from Log Sources page (not the env fallback key)

### Log Sources (Windows)
- Sysmon v15.20 at `C:\Sysmon\` — SwiftOnSecurity config + custom network exclude rule
- Windows Firewall auditing enabled (`auditpol` — events 5156/5157)
- Network events (Sysmon event 3) require admin to read

### Key Decisions
- Winlogbeat can't POST to custom HTTP — Node.js shipper is lightweight agent path; Logstash is enterprise path
- WebSocket server attached to Express HTTP server at `/ws` path, broadcasts `new_events` on ingest
- SIEM routes exempted from rate limiter by mounting before `app.use('/api', apiRateLimiter)`

---

## VPS Deployment (Live at tools.laynekudo.com)

- **Provider:** Hetzner CPX22 — 4GB RAM, 80GB SSD, Nuremberg
- **OS:** Ubuntu 24.04 LTS
- **Stack:** Node.js 22, PostgreSQL 16, Nginx, PM2, Let's Encrypt (Certbot)
- **Repo:** `github.com:0xKudoX/0xKudoSec.git` (private) — SSH deploy key on VPS (read-only)
- **App dir:** `/var/www/cybertools`
- **PM2 config:** `/var/www/cybertools/ecosystem.config.cjs` — injects all env vars directly (bypasses dotenv ESM hoisting issue)
- **Frontend build:** `platform/shell/dist/` — served by Nginx as static files
- **WebSocket:** proxied through Nginx at `/ws` — frontend uses `window.location.host` (no hardcoded port)

### Deploy workflow
```bash
# On local machine
git push

# On VPS
cd /var/www/cybertools && git pull && cd platform/shell && npm run build
# Server picks up JS changes automatically via PM2 watch (or pm2 restart cybertools)
```

### Key VPS fixes applied
- `logs.user_id`, `ingest_sources.user_id` added via ALTER TABLE (schema.sql updated)
- `user_ingest_keys` table created for per-user ingest key management
- `ingest_sources` unique constraint changed from `(name)` to `(name, user_id)`
- CORS: no-origin requests (same-origin browser) always allowed regardless of NODE_ENV
- WebSocket URL: `window.location.host` not `hostname:4000`

---

## How to Run

```bash
# Must be admin PowerShell for Security + Sysmon channels
cd "Desktop\claude projects\cybertools"
npm run dev   # server :4000 + shell :5173 + shipper
```

---

## Key Architecture

- Backend: Node/Express port 4000
- Frontend: React/Vite port 5173, proxies `/api` to Express
- Auth: Auth0 (`auth.laynekudo.com`), JWT verified server-side
- Claude API: singleton in `platform/server/services/claude.js` — never in client
- Inter-tool data: WorkspaceContext (React context + localStorage)
- Tests: Vitest, mock Claude with `vi.mock`, use `createApp()` not `app` directly

## Environment Variables

```
ANTHROPIC_API_KEY=
ALLOWED_ORIGIN=http://localhost:5173
PORT=4000
NODE_ENV=development
AUTH0_DOMAIN=auth.laynekudo.com
AUTH0_CLIENT_ID=TzIyCNnyNhhlKpm0W7uAhPKgcEnv1Cda
AUTH0_AUDIENCE=https://tools.laynekudo.com/api
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/cybertools
INGEST_API_KEY=<dev fallback key — users should use per-user keys from Log Sources page>
DB_ENCRYPTION_KEY=    # 32-byte hex
SHODAN_API_KEY=
VIRUSTOTAL_API_KEY=
HUNTER_API_KEY=
IPINFO_TOKEN=
ABUSEIPDB_API_KEY=
OTX_API_KEY=
ABUSECH_API_KEY=
```

Frontend (`platform/shell/.env.local`):
```
VITE_AUTH0_DOMAIN=auth.laynekudo.com
VITE_AUTH0_CLIENT_ID=TzIyCNnyNhhlKpm0W7uAhPKgcEnv1Cda
VITE_AUTH0_AUDIENCE=https://tools.laynekudo.com/api
```

Shipper (`shipper/.env`):
```
INGEST_URL=https://tools.laynekudo.com/api/ingest/beats
INGEST_API_KEY=<per-user key from Log Sources page>
POLL_INTERVAL_MS=60000
BATCH_SIZE=50
HOURS_BACK=24
```

---

## Domain Migration

Full spec at `docs/specs/domain-migration.md`. Summary of what needs to change:
- **Epik DNS:** A record for new domain → VPS IP; CNAME `auth.newdomain.com` → `dev-dk318hthn8qe0k7s.us.auth0.com`
- **Auth0 dashboard:** API audience identifier, SPA callback/logout/origin URLs, custom domain verification, Post Login Action roles claim namespace
- **Code:** `ROLES_CLAIM` in `requireAuth.js` + `SiemConfiguration.jsx`; ingest URLs in `LogSources.jsx`, `SiemConfiguration.jsx`, `siem.js`; `PRODUCTION_URL` in `electron/main.js`
- **VPS `.env`:** `ALLOWED_ORIGIN`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` — then `pm2 restart all --update-env`
- **SSL:** new Let's Encrypt cert for new domain via Certbot
- **Electron rebuild:** after cutover, rebuild and publish new installer with updated `PRODUCTION_URL`
