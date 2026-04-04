# 0xKudo Security Toolkit — Handoff

## What This Is

Unified cybersecurity tools platform at `tools.laynekudo.com`. Monorepo — shared Express/React platform, 19+ isolated tool modules.

**Spec:** `docs/specs/2026-03-26-cybertools-platform-design.md`
**Plan:** `docs/plans/2026-03-26-cybertools-platform.md`

---

## Current Status

**All 19 tools complete. Auth complete. SIEM complete. Electron wrapper complete.**

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

**Next:** Proxy tool Phase 2 (Electron intercepting proxy) or packaging/installer.

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
