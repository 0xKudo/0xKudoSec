# 0xKudo Security Toolkit — Handoff

## What This Is

Unified cybersecurity tools platform at `tools.laynekudo.com`. Monorepo — shared Express/React platform, 19+ isolated tool modules.

**Spec:** `docs/specs/2026-03-26-cybertools-platform-design.md`
**Plan:** `docs/plans/2026-03-26-cybertools-platform.md`

---

## Current Status

**All 19 tools complete. Auth complete. SIEM Phase 2 complete.**

### Recently Completed
- Fluent Bit migration: replaced node-shipper scheduled task with Fluent Bit Windows service
  - Config at `C:\Program Files\fluent-bit\conf\cybertools.conf` -- Security + Sysmon channels, HTTP output to ingest endpoint
  - `normalizeEvent.js` updated to detect and handle both Fluent Bit flat PascalCase format and Winlogbeat ECS format
  - Sysmon field extraction placeholder added -- needs confirmation with live Sysmon event sample
  - Source filter on dashboard now shows `fluent-bit` vs `node-shipper` as distinct sources
  - Nginx `client_max_body_size 10m` added to handle large flush batches
  - CybertoolsShipper scheduled task disabled
  - Fluent Bit registered as Windows service (auto-start on boot)
  - node-shipper moved to `_deprecated/node-shipper/` (kept for reference, not deleted)

### Next
- Capture a live Sysmon event from Fluent Bit to confirm field names in normalizeEvent.js Sysmon placeholder
- Log retention cron on VPS (UI + API done, cron not yet implemented)
- Continue mobile layout fixes for remaining tools
- Then Phase 4: Electron + Proxy tool

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
