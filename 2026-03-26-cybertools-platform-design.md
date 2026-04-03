# 0xKudo Security Platform — Platform Design Spec

## Overview

A full cybersecurity operations platform hosted at `tools.laynekudo.com`. The platform has two primary sections accessible via a top nav app switcher: **SIEM** (log ingestion, alert queue, dashboards, case management) and **Tools** (19+ security tool modules). Built as a monorepo with a shared shell and isolated tool modules. Each tool is a self-contained module (React views + Express routes + manifest) that plugs into the platform without requiring changes to any other tool or the shell itself.

## Goals

- One-stop shop for a complete cybersecurity operations team
- SIEM section: real log ingestion, automated alert detection, case management with timelines/evidence/playbooks, live dashboards
- Tools section: 19+ security tools organized by SOC phase (Detect / Investigate / Respond / Simulate/Test)
- Build platform frame before individual tools — every tool slots in cleanly from day one
- Tool boundaries enforced — one tool cannot reach into another tool's code, data, or routes
- Security posture is non-negotiable: every endpoint has input validation, rate limiting, and CORS locking; the Claude API key never leaves the server
- Domain-portable: no hardcoded URLs, all origins and base paths driven by environment config
- Light/dark mode: CSS variables from day one, toggle button in top nav, preference persisted to localStorage
- Multi-user accounts with social login via Auth0

## Platform Sections

### SIEM (primary — loads by default)
- **Dashboard:** KPI cards (open alerts, active cases, log sources, events/min), events-over-time chart, severity breakdown, top sources
- **Alert Queue:** auto-generated from log analysis + manual creation, filterable by severity and status
- **Case Management:** ticket-style with timeline, linked alerts, evidence attachments, playbook checklists
- **Log Sources:** agent/forwarder-based ingestion, source status, events/hr, uptime, lag
- **Detection Rules, Log Search, Timeline:** planned

### Tools (secondary)
Organized by SOC phase, not team type:
| Phase | Tools |
|---|---|
| Detect | Alert Triage, Threat Intel Aggregator, Log Anomaly Explainer, Network Threat Analyzer, Phishing Analyzer |
| Investigate | OSINT Recon, CVE Exploit Mapper, Payload Obfuscation Explainer, Decoder, Subdomain Enumerator |
| Respond | Incident Report Generator, Security Policy Translator, Network Scanner |
| Simulate / Test | Reverse Shell, Intruder, Vulnerability Scanner, Wordlist Generator, HTTP Repeater, Payload Generator, Proxy |

## Data Layer (phased)
- **Phase 1 (complete):** localStorage for preferences and WorkspaceContext. Static/mock data in SIEM.
- **Phase 2 (next):** PostgreSQL — logs table (JSONB raw + tsvector full-text search), alerts, cases, detection rules, users, playbooks. Single database, no Elasticsearch needed at home network data volumes.
- **Phase 3:** VPS deployment — Nginx + Let's Encrypt, PM2, PostgreSQL on VPS, Winlogbeat + syslog forwarding from home network
- **Phase 4:** Electron wrapper + Proxy tool full interception mode

## Tech Stack

- **Frontend:** React (Vite), React Router
- **Backend:** Node.js + Express
- **Auth:** Auth0 (multi-user accounts, Google and GitHub social login, JWT verification server-side)
- **Claude API:** Anthropic SDK, server-side only
- **Font:** Source Code Pro Medium, self-hosted — used for all text throughout the UI
- **Styling:** CSS variables for theming. Default: Warm Dark (black/charcoal, off-white text). Toggle: Warm Light (creamy off-white, near-black text). No color accent — severity colors only.
- **Persistence:** localStorage for user preferences (favorites, filter state, theme) and workspace data — no database required at this stage
- **Process management:** PM2 (production)

---

## Repository Structure

```
cybertools/                         # monorepo root
├── platform/
│   ├── shell/                      # React app — nav, routing, theme, tool registry
│   ├── server/                     # Node/Express — API gateway, Claude proxy, tool loader
│   └── shared/                     # Types, constants, utilities shared across tools
└── tools/
    ├── alert-triage/               # First tool module
    │   ├── manifest.json
    │   ├── client/                 # React views
    │   └── server/                 # Express routes
    ├── incident-report/            # Second tool module (future)
    └── ...                         # One folder per tool
```

### Shared Package (`platform/shared`)

Utility functions and constants used by both the shell and tool modules: severity level definitions, tag color mappings, common TypeScript-style JSDoc types (e.g., tool manifest shape). Nothing that imports React or Express lives here — pure JS only so it can be used on either side.

---

## Tool Manifest

Every tool has a `manifest.json` at its root. The shell reads all manifests at startup to build the sidebar, routing, and tag filter. No manual registration required — dropping a folder with a valid manifest is sufficient.

```json
{
  "id": "alert-triage",
  "name": "Alert Triage Assistant",
  "description": "Paste a SIEM alert. Get severity assessment, likely attack vector, and recommended next steps.",
  "route": "/alert-triage",
  "icon": "shield",
  "tags": ["blue-team", "ai-assisted", "soc"],
  "status": "active"
}
```

**Fields:**
- `id` — unique slug, matches the folder name and API route prefix
- `name` — display name in sidebar and page header
- `description` — shown in sidebar tooltip and tool landing area
- `route` — React Router path for this tool
- `icon` — icon name from the shared icon set
- `tags` — array of strings used by the sidebar filter; no fixed taxonomy, tools define their own tags
- `status` — `"active"` renders the tool normally; `"coming-soon"` renders it greyed out in the sidebar with no route

---

## Shell (`platform/shell`)

### Responsibilities
- Top navigation bar: branding ("// 0xKudo Security Platform"), SIEM/Tools app switcher (SIEM first), light/dark toggle, Auth0 login/logout, link back to laynekudo.com
- SIEM section: own sidebar with Detection/Response/Investigate nav, dashboard, alert queue, case management, log sources
- Tools section: collapsible sidebar grouped by SOC phase, dashboard home with card grid
- React Router: one route per tool, matched from manifest `route` field
- Global theme: CSS variables for all colors, fonts, spacing — light/dark toggle in top nav, preference saved to localStorage
- Tool registry: reads all manifests at app startup, makes the list available via React context
- Auth context: wraps Auth0 provider, exposes `useAuth()` hook to tools and shell components
- Error boundary: catches tool-level crashes and shows a fallback without breaking the shell

### Navigation
- **App switcher:** SIEM tab always first, Tools tab second. SIEM is the default view on load.
- **Active/hover accent color:** warm amber `#d97706` — used uniformly across all active tabs, sidebar items, filter chips. No blue accents in navigation.
- **SIEM sidebar:** sections for Overview, Detection, Response, Investigate, with badge counts on alert queue and cases
- **Tools sidebar:** collapsible sections per SOC phase (Detect / Investigate / Respond / Simulate/Test), starts collapsed, amber left border on active item

### Tools Sidebar Behavior
- Matches SIEM sidebar style exactly: flat section labels, same padding/font/border treatment
- Sections are collapsible with a chevron indicator, start collapsed by default
- Tools with `status: "active"` are clickable and route to the tool
- Tools with `status: "coming-soon"` appear greyed out (opacity 0.5), no route
- "SIEM ↗" link at bottom under Platform section to switch back
- No tag filter chips — organization is by SOC phase

### Tools Dashboard Home
The dashboard home is a workspace/recent activity view, not a tool list:
- **Recently Used** panel: last 6 tools launched, tracked in localStorage (`cybertools_recent_tools`), recorded via `trackToolVisit()` in ToolLoader on first load
- **Workspace** panel: last 10 WorkspaceContext items, shows type badge (color-coded), label, source tool, time ago. Clear button to wipe all items. Items with a known source tool are **clickable** — clicking navigates to that tool and restores the saved result.
- **Quick Launch** panel: 8 pinned tools in a 4-column grid for fast access

### Light/Dark Mode
- Default: dark (Cyber Blue palette)
- Toggle button in top nav — sun/moon icon
- Toggling swaps a `data-theme="light"` attribute on `<html>` — light mode CSS variables override the dark defaults
- Preference saved to localStorage, reapplied on page load before React renders (prevents flash of wrong theme)

### WorkspaceContext (Inter-Tool Data Sharing)

A React context provided by the shell alongside `ToolRegistry`. Acts as a session-level shared clipboard — any tool can write data to it and any other tool can read from it. Tools never communicate directly; all sharing goes through this controlled layer.

**Backed by localStorage** so data survives page refreshes within the same browser session.

**Data structure:**
```js
{
  items: [
    {
      id: "uuid",
      type: "alert" | "domain" | "ip" | "payload" | "report" | "raw",
      label: "human-readable description",
      data: "the actual content string",
      source: "alert-triage",        // which tool wrote it
      timestamp: 1711500000000
    }
  ]
}
```

**API exposed to tools via `useWorkspace()` hook:**
- `workspace.items` — array of all items currently in the workspace
- `workspace.push(type, label, data, source)` — add an item
- `workspace.clear()` — remove all items

**Designed for Option 2 upgrade:** When a server-side `/api/workspace` is added later, only `WorkspaceContext.jsx` changes — its internal `push`/`clear` calls the API instead of localStorage. No tool code changes required.

**Result restore pattern:** When a workspace item is clicked in the Dashboard, `item.data` is written to `workspace-restore-{tool-id}` in localStorage and the user is navigated to that tool. Each tool reads and clears this key on mount to restore its prior result. Implemented in all 11 tools that push results.

**Cross-tool send pattern:** Payload Generator writes `{ payload, target }` to `payload-generator-import` in localStorage and navigates to the target tool. Intruder (pre-fills payload list), HTTP Repeater (pre-fills body, sets method to POST), and Scanner (pre-fills URL) each read and clear this key on mount.

### Typography

- **Font:** Source Code Pro Medium (weight 500) — used for all text throughout the UI without exception. Body text, labels, nav items, buttons, code, badges, headings — everything.
- **Self-hosted:** Font files served from `platform/shell/src/fonts/` — no Google Fonts CDN dependency, no external requests, works offline.
- **Fallback stack:** `'Source Code Pro', 'Consolas', 'Monaco', monospace`

### Theme

**Warm Dark (default):**
```css
:root {
  --bg-primary: #111110;
  --bg-surface: #1a1917;
  --bg-sidebar: #0e0d0c;
  --border: #1f1e1c;
  --text-primary: #e8e6e3;
  --text-muted: #4a4845;
  --text-subtle: #333330;
  --severity-critical: #ef4444;
  --severity-high: #d97706;
  --severity-medium: #ca8a04;
  --severity-low: #16a34a;
  --severity-info: #60a5fa;
  --accent-amber: #d97706;   /* navigation active/hover — uniform across all nav elements */
  --btn-primary-bg: #e8e6e3;
  --btn-primary-text: #111110;
}
```

**Warm Light (light mode toggle):**
```css
[data-theme="light"] {
  --bg-primary: #faf8f5;
  --bg-surface: #ffffff;
  --bg-sidebar: #f0ece6;
  --border: #e0d8cc;
  --text-primary: #1a1714;
  --text-muted: #8a8078;
  --text-subtle: #c0b8b0;
  --btn-primary-bg: #1a1714;
  --btn-primary-text: #faf8f5;
}
```

Severity colors remain identical in both modes — they are vivid enough to read against both warm dark and warm light backgrounds.

---

## Authentication (Auth0)

### Overview
Multi-user accounts via Auth0. Auth0 handles account creation, login, password management, and social login (Google, GitHub). The platform never stores passwords — Auth0 owns that entirely.

### How it works
1. User clicks "Login" in the top nav
2. Auth0 Universal Login page opens (hosted by Auth0, not by the platform)
3. User logs in via email/password, Google, or GitHub
4. Auth0 returns a JWT (JSON Web Token) to the shell
5. Shell stores the JWT and attaches it to all API requests as a Bearer token
6. Express server verifies the JWT on protected routes using Auth0's public key — no database lookup required

### What requires auth
- All tool API routes (`/api/tools/*`) require a valid JWT
- `/api/health` and `/api/tools` (manifest list) are public — no auth required
- The shell itself is publicly viewable; tools show a "Login to use this tool" prompt if not authenticated

### Shell changes
- `Auth0Provider` wraps the React app
- `useAuth0()` hook available to all components
- Top nav shows Login button when logged out, user avatar + Logout when logged in
- Protected tool routes redirect to login if no valid session

### Server changes
- Auth0 middleware added: `platform/server/middleware/auth.js`
- Verifies JWT on every `/api/tools/*` request
- Rejects with 401 if token missing or invalid

### Environment Variables (additions)
```
AUTH0_DOMAIN=           # e.g. your-tenant.us.auth0.com
AUTH0_CLIENT_ID=        # from Auth0 dashboard
AUTH0_AUDIENCE=         # API identifier set in Auth0 dashboard
```

---

## Server (`platform/server`)

### Responsibilities
- Express app entry point: loads middleware, auto-discovers and mounts tool routes, starts server
- All secrets via environment variables — never hardcoded

### Middleware (applied to all `/api/*` routes)
- **Rate limiting:** `express-rate-limit`, 60 requests per minute per IP
- **CORS:** locked to `ALLOWED_ORIGIN` env var — rejects requests from other origins
- **Helmet:** sets secure HTTP headers
- **Input size limit:** `express.json({ limit: '50kb' })` — prevents oversized payloads
- **Auth:** JWT verification via Auth0 on all `/api/tools/*` routes

### Tool Route Loader (`loader.js`)
Auto-discovers all `tools/*/server/routes.js` files and mounts each at `/api/tools/[id]/`. Each `routes.js` exports a standard Express router. The loader never executes tool code directly — it only mounts routers.

### Shared Routes
- `GET /api/health` — returns `{ status: "ok", uptime }` — public, no auth
- `GET /api/tools` — returns array of all tool manifests — public, no auth

### Claude API Service (`services/claude.js`)
Single Anthropic SDK instance, initialized with `ANTHROPIC_API_KEY` from env. Exported as a singleton. All tools import this service — they never instantiate their own client or reference the API key directly.

### Environment Variables
```
ANTHROPIC_API_KEY=       # Anthropic API key — never commit
ALLOWED_ORIGIN=          # e.g. https://tools.laynekudo.com
PORT=4000
NODE_ENV=development|production
AUTH0_DOMAIN=            # e.g. your-tenant.us.auth0.com
AUTH0_AUDIENCE=          # API identifier from Auth0 dashboard
```

---

## Tool Module Contract

Every tool must:
1. Have a valid `manifest.json` at its root
2. Export a React component as default from `client/index.jsx` — this is what the shell renders in the content area
3. Export an Express router as default from `server/routes.js` — this is what the loader mounts at `/api/tools/[id]/`
4. Never import from another tool's `client/` or `server/` directory
5. Never instantiate its own Anthropic client — use `services/claude.js`
6. Validate all inputs before calling any external service
7. Never bypass auth middleware — all tool routes are protected by default via the loader

---

## Security Requirements

These apply to every endpoint and every tool, without exception:

- Claude API key stays server-side — never referenced in any client file
- All inputs validated and sanitized before use
- Rate limiting on all `/api/*` routes (shared middleware, not per-tool)
- CORS locked to `ALLOWED_ORIGIN` — no wildcard origins
- HTTP security headers via Helmet
- JWT auth required on all `/api/tools/*` routes — verified against Auth0 public key
- Tool routes isolated — `/api/tools/alert-triage/*` only executes `tools/alert-triage/server/routes.js`
- No tool imports another tool's internals
- Inter-tool data sharing happens only through `WorkspaceContext` — never by direct tool-to-tool imports or API calls
- Input payload size capped at 50kb (JSON endpoints)
- File uploads (Phishing Email Analyzer): multer, memory storage only (no disk writes), .eml only, 100kb max file size, 100k char text limit (paste endpoint capped at 20k chars), MIME type + extension validated. `.msg` support deferred to a future iteration.
- nmap (Network Scanner) runs as a sandboxed subprocess with a strict argument whitelist — no user input passes directly to the shell

---

## Domain Portability

No URLs are hardcoded in the codebase. Migration from `tools.laynekudo.com` to a new domain requires only:
1. Update `ALLOWED_ORIGIN` in the server `.env`
2. Update the Vite dev proxy origin in `platform/shell/vite.config.js`
3. Update Auth0 dashboard callback URLs
4. Update DNS

No code changes required.

---

## Build Order (active — agreed 2026-03-29)

All 19 active tools are complete. Remaining work in this order:

**Phase 2 — SIEM backend + real data**
1. PostgreSQL schema — `logs`, `alerts`, `cases`, `case_events`, `evidence`, `detection_rules`, `playbooks` tables
2. Ingest endpoints — `POST /api/ingest/beats` (Winlogbeat JSON batches), `POST /api/ingest/syslog` (forwarded syslog), `POST /api/ingest/raw` (manual/custom)
3. Ingest auth — static bearer token (`INGEST_API_KEY` env var) verified server-side; separate from Auth0 (agents can't do OAuth flows)
4. Winlogbeat on home machines → local Express server (validate real event flow before VPS)
5. Replace mock SiemDashboard data with live PostgreSQL queries
6. Alert Queue — detection rules run on ingest, write to `alerts` table, React view
7. Log Search — full-text search via `tsvector` GIN index on `message` column, React UI
8. Cases — CRUD endpoints + React split panel (timeline, linked alerts, evidence, playbook checklist)
9. Detection Rules — rule builder UI + rule engine (field match + keyword rules stored in DB)

**Phase 3 — VPS deployment**
10. Provision VPS (Ubuntu 22.04, 2 vCPU / 2–4 GB RAM — Hetzner or DigitalOcean)
11. Install Node, PostgreSQL, Nginx, Certbot on VPS
12. Nginx config — SSL termination, serve React `dist/`, proxy `/api` to Express on port 4000
13. Let's Encrypt cert for `tools.laynekudo.com`
14. Deploy platform — PM2, env vars, DB schema migration
15. Switch Winlogbeat + syslog forwarder config from `localhost:4000` to `tools.laynekudo.com`
16. UFW firewall — expose only 80, 443, 22; PostgreSQL localhost only

**Phase 4 — Electron + Proxy**
17. Electron wrapper — `BrowserWindow` wrapping built React `dist/`, Express as in-process or child process
18. Proxy tool — `ProxyService` in Electron main process, local port `127.0.0.1:8080`, HTTPS MITM via `node-http-mitm-proxy`, intercept queue UI

## Deferred

- Server-side workspace API (`/api/workspace`) for cross-session/cross-device data sharing — `WorkspaceContext` is designed so this slots in without changing tool code
- Per-tool usage analytics
- Per-user workspace persistence (already covered by Auth0 + PostgreSQL in Phase 2)
- Live network capture (tshark subprocess) — Electron phase, scoped alongside Proxy tool

---

## SIEM Architecture

### Log Ingestion

Sources ship to the VPS (or local Express server in dev) over HTTPS with a bearer token:

| Source | Method | Endpoint |
|--------|--------|----------|
| Winlogbeat (Windows Event Log + Sysmon) | HTTP POST (JSON batch) | `POST /api/ingest/beats` |
| Router syslog (via LAN forwarder) | HTTP POST | `POST /api/ingest/syslog` |
| Manual / custom | HTTP POST | `POST /api/ingest/raw` |

**Auth:** Static `INGEST_API_KEY` env var. Agents send `Authorization: Bearer <key>`. Separate from Auth0 — agents cannot do OAuth flows. Payload size cap raised to 5 MB for ingest routes (Winlogbeat batches many events per request).

**Router syslog workaround:** Consumer routers send syslog over UDP to a LAN IP only. A lightweight forwarder runs on a home machine — receives UDP syslog from the router on the LAN, forwards to the VPS over HTTPS.

### Database Schema (PostgreSQL)

```sql
-- Core log storage
CREATE TABLE logs (
  id          BIGSERIAL PRIMARY KEY,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  source_type TEXT,        -- 'winlogbeat', 'syslog', 'raw'
  source_host TEXT,        -- hostname or IP of the sending agent
  event_time  TIMESTAMPTZ, -- timestamp from the event itself
  severity    TEXT,        -- normalized: info/low/medium/high/critical
  message     TEXT,        -- normalized human-readable message
  raw         JSONB,       -- full original event
  search_vec  TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', message)) STORED
);
CREATE INDEX logs_search ON logs USING GIN(search_vec);
CREATE INDEX logs_event_time ON logs(event_time DESC);
CREATE INDEX logs_source_host ON logs(source_host);

-- Alerts (generated by detection rules or manual)
CREATE TABLE alerts (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  rule_id      BIGINT REFERENCES detection_rules(id),
  severity     TEXT,
  title        TEXT,
  description  TEXT,
  status       TEXT DEFAULT 'open',  -- open/investigating/resolved/false-positive
  log_ids      BIGINT[]              -- which log rows triggered this
);

-- Detection rules
CREATE TABLE detection_rules (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT,
  description TEXT,
  enabled     BOOLEAN DEFAULT TRUE,
  conditions  JSONB,   -- field match + keyword conditions
  severity    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Cases
CREATE TABLE cases (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  title       TEXT,
  status      TEXT DEFAULT 'open',  -- open/investigating/resolved/closed
  severity    TEXT,
  assignee    TEXT,
  summary     TEXT
);

CREATE TABLE case_events (
  id         BIGSERIAL PRIMARY KEY,
  case_id    BIGINT REFERENCES cases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  type       TEXT,   -- 'note', 'alert_linked', 'evidence_added', 'status_change'
  content    TEXT
);

CREATE TABLE evidence (
  id         BIGSERIAL PRIMARY KEY,
  case_id    BIGINT REFERENCES cases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  label      TEXT,
  type       TEXT,   -- 'log', 'file', 'note', 'screenshot'
  data       JSONB
);

-- Playbooks (checklist templates attached to cases)
CREATE TABLE playbooks (
  id      BIGSERIAL PRIMARY KEY,
  name    TEXT,
  steps   JSONB   -- [{label, description, completed}]
);
```

### VPS Infrastructure

- **OS:** Ubuntu 22.04 LTS
- **Spec:** 2 vCPU / 2–4 GB RAM (Hetzner or DigitalOcean, ~$6–12/mo)
- **Nginx:** SSL termination, serves React `dist/`, proxies `/api` to Express port 4000
- **SSL:** Let's Encrypt via Certbot, auto-renew
- **Process manager:** PM2 (already configured)
- **Firewall:** UFW — expose only 80, 443, 22. PostgreSQL bound to localhost only, never externally accessible.
- **Log retention:** Cron job deletes `logs` rows older than 90 days to prevent unbounded disk growth

### Security additions for VPS

- `INGEST_API_KEY` env var — all ingest routes verify this before parsing any body
- IP allowlist in Nginx for ingest endpoints (home IP as extra layer, optional if IP changes)
- Ingest payload cap: 5 MB (raised from 50 KB default for Winlogbeat batches)
- All existing security middleware (Helmet, CORS, rate limiting, JWT) unchanged

---

## Planned Tool Modules

Listed for reference. Only the platform frame and Alert Triage Assistant are in scope for the first implementation plan.

| Priority | Tool | Tags | Status |
|----------|------|------|--------|
| 1 | Alert Triage Assistant | blue-team, ai-assisted, soc | First build |
| 2 | Incident Report Generator | blue-team, ai-assisted, soc | Next |
| 3 | Phishing Email Analyzer | blue-team, ai-assisted | Built — supports paste and .eml file upload |
| 4 | OSINT Reconnaissance Dashboard | red-team, blue-team, recon | Backlog |
| 5 | Threat Intelligence Aggregator | blue-team, threat-intel | Backlog |
| 6 | Network Threat Analyzer | blue-team, ai-assisted, soc, network | Backlog |
| 7 | Network Scanner (nmap wrapper) | red-team, blue-team, network | Backlog |
| 8 | Log Anomaly Explainer | blue-team, ai-assisted, soc | Backlog |
| 9 | CVE Exploit Mapper | blue-team, red-team, ai-assisted | Backlog |
| 10 | Payload Obfuscation Explainer | red-team, blue-team, ai-assisted | Backlog |
| 11 | Security Policy Translator | blue-team, compliance, ai-assisted | Backlog |
| 12 | Reverse Shell Generator | red-team | Backlog |
| 13 | Wordlist / Password Pattern Generator | red-team | Backlog |
| 14 | Subdomain Enumerator | red-team, recon | Backlog |
| 15 | HTTP Repeater (Burp-style) | red-team, blue-team | Backlog |
| 16 | Proxy (request capture + replay, Electron-upgradeable) | red-team, blue-team | Backlog |
| 17 | Intruder (automated customized attack automation) | red-team | Backlog |
| 18 | Scanner (passive + active web vuln detection — XSS, SQLi, etc.) | red-team, blue-team | Backlog |
| 19 | Decoder (URL, HTML, Base64, hex, etc.) | red-team, blue-team | Backlog |

---

## Proxy Tool Design Notes

The Proxy tool is built in two phases intentionally:

**Phase 1 (web platform — current spec):** Request capture and replay. The user pastes or imports an HTTP request, inspects and modifies it, and sends it. The tool UI communicates with a `ProxyService` interface that handles request execution. No browser proxy configuration required.

**Phase 2 (Electron wrapper — future):** Full intercepting proxy. Electron spawns a local proxy server process. Browser traffic routes through it. Requests are intercepted, held in a queue, and forwarded/dropped/modified by the user. HTTPS requires a generated root CA certificate installed in the browser.

The `ProxyService` interface is the seam between these two phases. Phase 1 implements it as a simple HTTP request executor. Phase 2 swaps that implementation for one that manages the proxy process. The UI — request editor, history, response viewer — is identical in both phases and requires no changes.

## Scanner Tool Design Notes

The Scanner operates in two modes:

**Passive mode (default):** Analyzes requests and responses you feed it — from the Proxy history, the Repeater, or manual paste. Flags suspicious patterns (reflected input, missing security headers, error messages that leak stack traces, etc.) without sending anything to the target.

**Active mode:** Sends real payloads to a target URL to confirm vulnerabilities (XSS, SQLi, open redirects, etc.). Requires the user to check an explicit authorization box: "I confirm I have legal authorization to test this target." No active scan starts without this confirmation. Standard responsible disclosure practice.

## Network Threat Analyzer (Tool 6) Design Notes

Tool 6 is a **log analyzer**, not a live capture tool. Web apps cannot access the user's network interface — that is an intentional OS/browser security boundary. The tool accepts pasted or uploaded firewall logs, NetFlow exports, Zeek/Suricata logs, or pcap summaries. Claude analyzes the input for threats, anomalies, suspicious IPs, unusual ports, lateral movement, and exfiltration patterns.

## Live Network Capture — Electron Phase (Future)

When the platform is wrapped in Electron, a live network capture tool can be added that uses tshark (bundled with Wireshark) as a subprocess to capture traffic on the user's local network interface. This is only possible as a native desktop app with elevated privileges — not achievable in a web browser. The Electron wrapper is already planned for the Proxy tool upgrade; the network capture tool should be scoped into that same phase.

Design notes for the Electron network capture tool:
- Requires tshark installed or bundled
- Runs as a privileged subprocess, strictly sandboxed — user input never passed raw to shell
- Start/stop controls in UI, real-time packet summary stream via WebSocket or SSE
- Claude analyzes captured sessions for threats on demand
- Logs saved to session history, exportable
