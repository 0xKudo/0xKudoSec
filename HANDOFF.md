# 0xKudo Security Toolkit — Handoff

## What This Is

Unified cybersecurity tools platform at `tools.laynekudo.com`. Monorepo — shared Express/React platform, 19+ isolated tool modules.

**Spec:** `docs/specs/2026-03-26-cybertools-platform-design.md`
**Plan:** `docs/plans/2026-03-26-cybertools-platform.md`

---

## Current Status

**All 19 tools complete. Auth complete. SIEM Phase 2 complete.**

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
