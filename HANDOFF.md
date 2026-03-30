# 0xKudo Security Toolkit — Project Handoff

This file contains everything needed to resume this project in a new conversation without losing context.

---

## What This Project Is

A unified cybersecurity tools platform at `tools.laynekudo.com`. 19 planned tool modules covering blue team, red team, and purple team workflows. Built as a monorepo — one repo, shared platform frame, each tool is an isolated module.

**Spec:** `docs/specs/2026-03-26-cybertools-platform-design.md`
**Plan:** `docs/plans/2026-03-26-cybertools-platform.md`

---

## Current Status

**Task 1 (Monorepo Scaffold) — COMPLETE**
- Folder structure, root `package.json` with npm workspaces, `.gitignore`, `.env.example`
- `platform/server/package.json`, `platform/shell/package.json`, `platform/shared/package.json` + `constants.js`
- `npm install` completed — 279 packages installed

**Task 2 (Express Server) — COMPLETE**
- `platform/server/middleware/cors.js` — CORS locked to `ALLOWED_ORIGIN` env var
- `platform/server/middleware/rateLimiter.js` — 60 req/min per IP
- `platform/server/middleware/validate.js` — `requireFields()` factory for input validation
- `platform/server/routes/tools.js` — `GET /api/health` and `GET /api/tools`
- `platform/server/loader.js` — dynamically discovers and mounts tool routes from `tools/` dir
- `platform/server/index.js` — Express entry point with all middleware wired up
- `platform/server/vitest.config.js` — loads `.env` from repo root for tests
- Health test passing

**Task 3 (Claude API Service) — COMPLETE**
- `platform/server/services/claude.js` — singleton Anthropic SDK client + `askClaude()` helper
- `.env` created and populated with real `ANTHROPIC_API_KEY`
- Claude client test passing

**Task 4 (React Shell) — COMPLETE**
- `platform/shell/index.html`, `vite.config.js` — Vite entry, proxies `/api` to Express on port 4000
- `platform/shell/src/styles/theme.css` — Warm Dark theme (CSS variables), light mode toggle via `[data-theme="light"]`
- `platform/shell/src/components/TopNav.jsx` — branding + back link
- `platform/shell/src/components/ErrorBoundary.jsx` — catches tool crashes
- `platform/shell/src/App.jsx` — layout skeleton
- `platform/shell/src/main.jsx` — React root
- Theme corrected from old cyber blue palette to Warm Dark per spec

**Task 5 (Tool Registry + Sidebar) — COMPLETE**
- `platform/shell/src/context/ToolRegistry.jsx` — fetches `/api/tools`, exposes via `useTools()` hook
- `platform/shell/src/components/Sidebar.jsx` — tag filter chips, favorites (★), active route highlight
- `platform/shell/src/App.jsx` — updated with `ToolRegistryProvider`, `Sidebar`, dynamic `ToolLoader`, `ToolRoutes`
- Sidebar shows empty state correctly (no tools registered yet)

**Task 6 (WorkspaceContext) — COMPLETE**
- `platform/shell/src/context/WorkspaceContext.jsx` — `push(type, label, data, source)` + `clear()`, localStorage backed
- `App.jsx` updated — `WorkspaceProvider` wraps layout inside `ToolRegistryProvider`

**Task 7 (Alert Triage — Manifest + Server Route) — COMPLETE**
- `tools/alert-triage/manifest.json` — id, name, description, route, tags, status
- `tools/alert-triage/server/routes.js` — `POST /analyze` with Claude integration, input validation, JSON parsing + severity validation
- `platform/server/tests/alert-triage.test.js` — 2 tests passing (400 on missing field, 200 on valid input), Claude mocked

**Task 8 (Alert Triage — React UI) — COMPLETE**
- `tools/alert-triage/client/index.jsx` — textarea input, Analyze button, severity badge, summary/attack vector/actions result panel
- Uses Warm Dark CSS variables (corrected from plan's old cyber blue references)

**Task 9 (Production Readiness) — COMPLETE**
- `platform/server/ecosystem.config.js` — PM2 config for production deployment
- `platform/shell/vite.config.js` — `VITE_BASE_URL` env support for domain-portable builds
- All 4 tests passing, production build clean (`platform/shell/dist/`)

**Tool 2 (Incident Report Generator) — COMPLETE**
- `tools/incident-report/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /analyze` — accepts incidentText + optional severity hint, returns structured 10-field report
- UI has "Import from Alert Triage" banner (WorkspaceContext integration), severity dropdown, plain-text export
- Alert Triage now pushes results to WorkspaceContext after each analysis
- 5 new tests passing (9 total)

**Tool 3 (Phishing Email Analyzer) — COMPLETE**
- `tools/phishing-analyzer/` — manifest, server route, React UI
- `POST /analyze` — verdict (phishing/suspicious/legitimate/unknown), confidence, indicators with types, suspicious URLs, sender, recommended actions
- 4 new tests passing (13 total)

- Added .eml file upload (`POST /analyze-file`) via multer — memory storage only, 100kb max, extension + MIME validated. `.msg` support deferred.

**Tool 4 (OSINT Recon Dashboard) — COMPLETE**
- `tools/osint-recon/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /analyze` — auto-detects domain/IP/email, runs parallel lookups: Shodan, VirusTotal, Hunter.io, IPInfo, WHOIS
- Each source returns gracefully with `{error}` or `{skipped}` if unavailable (no API key configured)
- Claude synthesizes all results into summary/riskLevel/flags/recommendations
- UI: target input + auto-detect type selector, AI summary card with risk badge, per-source SourceCard grid
- WorkspaceContext push on successful analysis
- 4 new tests passing (17 total)
- Required env vars: `SHODAN_API_KEY`, `VIRUSTOTAL_API_KEY`, `HUNTER_API_KEY`, `IPINFO_TOKEN` (WHOIS uses free public API)
- **Known issues (deferred):** WHOIS returns 404 from both rdap.org and rdap.iana.org for tested domains — need alternate source or paid whoisjsonapi plan. Shodan free tier blocks host data; card shows resolved IP only.

**Tool 5 (Threat Intelligence Aggregator) — COMPLETE**
- `tools/threat-intel/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /analyze` — accepts IP, domain, URL, or file hash (auto-detected), runs parallel lookups
- Sources: AbuseIPDB, VirusTotal, Shodan, IPInfo, ThreatFox, URLhaus, MalwareBazaar
- Keyless sources: ThreatFox, URLhaus, MalwareBazaar (abuse.ch public APIs)
- Claude synthesizes into threatLevel/flags/recommendations, WorkspaceContext push on success
- 4 new tests passing (21 total)
- New env var: `ABUSEIPDB_API_KEY`

**Tool 6 (Network Threat Analyzer) — COMPLETE**
- `tools/network-threat-analyzer/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /analyze` (paste) + `POST /analyze-file` (upload) — firewall, NetFlow, Zeek, Suricata, syslog, pcap-summary
- Auto-detects log type, Claude identifies threats, anomalies, suspicious IPs, recommendations
- Paste tab + upload tab UI, per-threat severity cards, suspicious IP chips
- 4 new tests passing (25 total)
- Note: live network capture deferred to Electron phase (documented in spec)

**Tool 7 (Network Scanner) — COMPLETE**
- `tools/network-scanner/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /scan` — 6 whitelisted scan profiles (ping, quick, full, service, OS, vuln)
- Target validated by regex — no shell metacharacters, user input never interpolated into nmap args
- Claude analyzes raw nmap output into riskLevel/findings/recommendations
- Raw nmap output toggle in UI, authorization warning banner
- 4 new tests passing (29 total), child_process mocked in tests

**Tool 8 (Log Anomaly Explainer) — COMPLETE**
- `tools/log-anomaly-explainer/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /analyze` (paste) + `POST /analyze-file` (upload) — syslog, auth, Apache/Nginx, Windows Event, Docker, Kubernetes, database
- Auto-detects log source, Claude identifies anomalies with plain-English explanations, severity, line refs
- Paste + upload tabs, per-anomaly cards, clean banner when nothing found
- 4 new tests passing (33 total)

**Tool 9 (CVE Exploit Mapper) — COMPLETE**
- `tools/cve-exploit-mapper/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /lookup` — CVE ID or keyword search, parallel lookups: NVD, EPSS, Exploit-DB, CIRCL
- All sources free with no API keys required
- Claude synthesizes riskLevel + exploitabilityLevel (actively-exploited/poc-available/theoretical/none)
- EPSS score bar, Exploit-DB links, CVSS scores, CWE/CAPEC mappings
- 4 new tests passing (37 total)

**Tool 10 (Payload Obfuscation Explainer) — COMPLETE**
- `tools/payload-obfuscation-explainer/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /analyze` — Claude-only, no external APIs
- Supports base64, hex, URL, HTML, unicode, ROT13, PowerShell, JavaScript, Python, bash
- Returns decoded payload, encoding layers, IOCs, threat level, malicious flag, plain-English explanation
- Optional context field, encoding hint selector
- 4 new tests passing (41 total)

**Tool 11 (Security Policy Translator) — COMPLETE**
- `tools/security-policy-translator/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /translate` — Claude-only, no external APIs
- Supports NIST, ISO 27001, CIS, SOC 2, HIPAA, PCI-DSS, GDPR, CMMC, internal policy
- Extracts controls with IDs, plain-English explanations, owner teams, action items, compliance gaps
- 4 new tests passing (45 total)

**Fix applied to Tool 10 and shared Claude service:**
- Claude was wrapping JSON responses in markdown code fences — fixed globally in `platform/server/services/claude.js`
- `max_tokens` raised from 1024 to 4096 — improves response completeness across all tools

**Tool 12 (Reverse Shell Generator) — COMPLETE**
- `tools/reverse-shell-generator/manifest.json`, `server/routes.js`, `client/index.jsx`
- `GET /shell-types` + `POST /generate` — lhost/lport/shellType inputs, strict validation
- 20 shell types: bash (3 variants), sh, python/python3, php/php-exec, perl, ruby, netcat/netcat-e/ncat, socat, powershell/powershell-b64 (b64 encoded server-side), golang, java, awk, nodejs
- Each response includes payloads[], listenerCommand (nc), msfListener (multi/handler commands)
- No Claude API — pure static template generation
- WorkspaceContext push on generate
- Authorization warning banner
- 7 new tests passing (52 total)
- Fix applied: PowerShell payload wrapped in outer double quotes with inner single quotes so `-Command` parses correctly from CMD
- Fix applied: replaced `iex` with `[scriptblock]::Create()` — Windows Defender was pattern-matching `iex` in HTTP response body and returning 403
- Fix applied: helmet `crossOriginResourcePolicy` set to `cross-origin` in dev, `same-origin` in production

**Tool 13 (Wordlist / Password Generator) — COMPLETE**
- `tools/wordlist-generator/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /charset` — generate from character sets (lowercase/uppercase/digits/symbols/custom) + length range
- `POST /pattern` — generate from base words with mutation rules (base variants, leet, digits, years, symbols)
- Max 10,000 entries, preview first 500 in UI, download full list as .txt, copy all button
- No Claude, no external APIs. WorkspaceContext push on generate.
- 7 new tests passing (59 total)
- Fix applied: charset tab now streams download directly (no memory buffering) — words written in batches of 1,000
- Fix applied: preview endpoint returns first 100 entries + estimated total count; download is separate streamed endpoint
- Fix applied: `NODE_ENV=development` removes all entry limits (Infinity) and raises max length to 32; production caps at 1,000,000 entries and max length 16
- UI shows "no limit — local mode" in dev, cap warning in production

**Tool 14 (Subdomain Enumerator) — COMPLETE**
- `tools/subdomain-enumerator/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /enumerate` — domain input, source checkboxes (crt.sh, HackerTarget, SecurityTrails, brute-force)
- crt.sh and HackerTarget are free with no API key; SecurityTrails requires `SECURITYTRAILS_API_KEY`
- Brute-force: DNS resolution against built-in ~70 prefix wordlist or custom wordlist (one per line)
- All sources run in parallel, dedup into sorted unique subdomain list
- Claude synthesizes: riskLevel, summary, flags, notable subdomains, recommendations
- UI: source checkboxes, custom brute wordlist textarea, AI analysis card, per-source result cards, full subdomain list with copy/download
- WorkspaceContext push on successful enumeration
- 4 new tests passing (63 total)

**Tool 15 (HTTP Repeater) — COMPLETE**
- `tools/http-repeater/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /send` — proxies request to target URL, returns status, headers, body, durationMs, byteLength
- Validates method (7 allowed), URL format, blocks localhost/loopback/RFC-1918 ranges
- Redirects not auto-followed — shown raw (manual redirect)
- Response body capped at 2MB, binary responses show byte count instead of raw bytes
- UI: method dropdown, URL input, headers textarea, body textarea (hidden for GET/HEAD), response panel with Body/Headers tabs
- Request history: last 20 saved to localStorage, click to reload any entry
- 4 new tests passing (67 total)

**Tool 17 (Intruder) — COMPLETE**
- `tools/intruder/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /attack` — method, urlTemplate, headers, body, payloads array (max 500)
- Injection points marked with §placeholders§ — substituted in URL, headers, and body
- Concurrency: 5 parallel requests per batch
- Anomaly detection: flags responses where status != baseline or length deviates >20% from median
- Built-in payload lists: Common Passwords, SQL Injection, XSS Payloads, Path Traversal, Common Usernames
- UI: request template panel + payload panel side by side, results table with status colors, click row to expand response body
- SSRF protections same as HTTP Repeater
- WorkspaceContext push when anomalies found
- 4 new tests passing (71 total)

**Deferred: Tool 16 — Proxy (skipped for now, returning later)**
**Tool 18 (Scanner) — COMPLETE**
- `tools/scanner/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /scan` — passive mode (default) + active mode (requires authorized: true)
- Passive checks: security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), cookie flags (HttpOnly, Secure, SameSite), form analysis (GET method, missing CSRF tokens), info leakage (Server header, X-Powered-By, sensitive HTML comments)
- Active checks: XSS reflection probes + SQLi error probes on discovered query params (up to 5 URLs, 4 probes each)
- Claude synthesizes riskLevel, summary, top priorities
- UI: passive/active mode cards, authorization checkbox (active only), findings grouped by severity
- SSRF protections same as other tools
- 4 new tests passing (75 total)

**Tool 19 (Decoder) — COMPLETE**
- `tools/decoder/manifest.json`, `server/routes.js`, `client/index.jsx`
- `POST /transform` — input + operation, returns output
- `GET /operations` — lists all available operations
- Supported formats: URL (decode/encode/encode-all), HTML (decode/encode), Base64 (decode/encode/url-safe variants), Hex (decode/encode), Binary (decode/encode), ROT13, Unicode (\\uXXXX decode/encode), JWT inspect (header + payload, no verify)
- No Claude, no external APIs — pure server-side transforms
- UI: grouped operation sidebar, input textarea, Transform button, output box with "Use as input" swap and copy buttons
- 4 new tests passing (79 total)

**Tool 20 (Payload Generator) — COMPLETE**
- `tools/payload-generator/manifest.json`, `server/routes.js`, `client/index.jsx`
- Two tabs: msfvenom and Web Payloads
- `GET /msf-payloads` — 23 payloads across Linux/Windows/macOS/Android/PHP/Python/Java/Shellcode, 6 encoders
- `POST /msf-generate` — builds msfvenom command + multi/handler listener block; validates lhost, lport, encoder, badchars, outputFile
- `GET /web-categories` — 7 categories: XSS (13), SQLi (14), CMDi (12), SSTI (10), Path Traversal (10), XXE (5), Open Redirect (10)
- `GET /web-payloads/:category` — returns full payload list for category
- No Claude, no external APIs — pure static templates
- WorkspaceContext push on msfvenom generate
- Authorization warning banners on both tabs
- 8 new tests passing (87 total)
- Sidebar updated: Payload Generator moved from comingSoon to active routes in Simulate/Test section

**Next: SIEM Phase 2 — PostgreSQL schema + ingest layer**

## Remaining Build Order (agreed 2026-03-29)

**Phase 2 — SIEM backend + real data (build + test locally first)**
1. PostgreSQL schema — logs, alerts, cases, case_events, evidence, detection_rules, playbooks
2. Ingest endpoints — POST /api/ingest/beats (Winlogbeat), POST /api/ingest/syslog, POST /api/ingest/raw
3. Ingest auth — INGEST_API_KEY bearer token (separate from Auth0, agents can't do OAuth)
4. Winlogbeat on home machines → local server (validate real event flow)
5. Replace mock SiemDashboard data with live PostgreSQL queries
6. Alert Queue — detection rules run on ingest, write to alerts table, React view
7. Log Search — tsvector GIN index on message column, React UI
8. Cases — CRUD + React split panel (timeline, linked alerts, evidence, playbook checklist)
9. Detection Rules — rule builder UI + rule engine

**Phase 3 — VPS deployment**
10. Provision VPS (Ubuntu 22.04, 2 vCPU / 2–4 GB RAM, Hetzner or DigitalOcean ~$6–12/mo)
11. Install Node, PostgreSQL, Nginx, Certbot
12. Nginx — SSL termination, serve React dist/, proxy /api → Express port 4000
13. Let's Encrypt cert for tools.laynekudo.com
14. Deploy — PM2, env vars, DB schema migration
15. Switch Winlogbeat + syslog forwarder to tools.laynekudo.com
16. UFW — expose only 80, 443, 22; PostgreSQL localhost only; log retention cron (90 days)

**Phase 4 — Electron + Proxy**
17. Electron wrapper — BrowserWindow wrapping built React dist/, Express in-process or child
18. Proxy tool — ProxyService in Electron main, 127.0.0.1:8080, node-http-mitm-proxy, intercept queue UI
19. Live network capture (tshark subprocess) — scoped into Electron phase alongside Proxy

**Post-build improvements (2026-03-29):**
- Payload Generator: fixed import path (../../../../ → ../../../); removed redundant subtitle from header
- Payload Generator: "Send to" dropdown added to msfvenom result panel and every web payload row — writes payload to `payload-generator-import` localStorage key and navigates to Intruder, HTTP Repeater, or Scanner on click
- Intruder, HTTP Repeater, Scanner: read `payload-generator-import` on mount, pre-fill relevant field (payloads list / body / URL), then clear key
- Dashboard workspace panel: items with a known source tool are now clickable — writes `item.data` to `workspace-restore-{tool-id}` localStorage key and navigates to that tool
- All 11 tools that push to workspace now restore prior results on mount via `workspace-restore-{id}` key: Alert Triage, Threat Intel, OSINT Recon, CVE Exploit Mapper, Log Anomaly Explainer, Network Threat Analyzer, Network Scanner, Payload Obfuscation Explainer, Security Policy Translator, Subdomain Enumerator, Scanner

---

## How to Run

```bash
cd "Desktop\claude projects\cybertools"
npm run dev        # starts both server (port 4000) and shell (port 5173) concurrently
```

Then open http://localhost:5173

---

## Architecture Decisions (All Settled)

- **Monorepo** with npm workspaces — one repo, `platform/` + `tools/`
- **Node/Express** backend — Claude API key server-side only
- **React/Vite** frontend shell
- **Auth0** — multi-user accounts, Google + GitHub social login, JWT verified server-side
- **WorkspaceContext** — React context + localStorage for inter-tool data sharing. Designed to upgrade to server-side `/api/workspace` later without changing tool code.
- **Proxy tool** — request capture/replay now (web); upgrades to full intercepting proxy in Electron via `ProxyService` interface swap
- **Scanner** — passive mode default, active mode behind explicit authorization checkbox
- **Network Scanner** — server-side nmap subprocess with strict argument whitelist
- **Domain-portable** — no hardcoded URLs, `ALLOWED_ORIGIN` env var drives CORS

---

## Theme & Design (Settled)

- **Font:** Source Code Pro Medium (weight 500), self-hosted in `platform/shell/src/fonts/`, used for ALL text
- **Dark mode (default):** Warm Dark — `#111110` bg, `#e8e6e3` text, `#0e0d0c` sidebar, `#1f1e1c` border
- **Light mode (toggle):** Warm Light — `#faf8f5` bg, `#1a1714` text, `#f0ece6` sidebar, `#e0d8cc` border
- **No color accent** — severity colors only (critical red, high orange, medium yellow, low green, info blue)
- **Toggle:** Sun/moon in top nav, `data-theme` attribute on `<html>`, saved to localStorage
- **CSS variable:** `--font` (not `--font-mono` or `--font-sans`) — single font stack for everything

---

## Tool Manifest Contract

Every tool needs:
1. `manifest.json` — id, name, description, route, icon, tags, status
2. `client/index.jsx` — default export React component (renders in content area)
3. `server/routes.js` — default export Express router (mounted at `/api/tools/[id]/`)
4. Never import from another tool's files
5. Never instantiate own Anthropic client — use `platform/server/services/claude.js`
6. Validate all inputs before calling external services

---

## 19 Planned Tools

| # | Tool | Team |
|---|------|------|
| 1 | Alert Triage Assistant | Blue — **first build** |
| 2 | Incident Report Generator | Blue |
| 3 | Phishing Email Analyzer | Blue |
| 4 | OSINT Recon Dashboard | Purple |
| 5 | Threat Intelligence Aggregator | Blue |
| 6 | Network Threat Analyzer | Blue |
| 7 | Network Scanner (nmap) | Purple |
| 8 | Log Anomaly Explainer | Blue |
| 9 | CVE Exploit Mapper | Purple |
| 10 | Payload Obfuscation Explainer | Purple |
| 11 | Security Policy Translator | Blue |
| 12 | Reverse Shell Generator | Red |
| 13 | Wordlist / Password Generator | Red |
| 14 | Subdomain Enumerator | Red |
| 15 | HTTP Repeater (Burp-style) | Purple |
| 16 | Proxy (capture/replay → full intercept in Electron) | Purple |
| 17 | Intruder (automated attack automation) | Red |
| 18 | Scanner (passive + active, XSS/SQLi) | Purple |
| 19 | Decoder (URL, HTML, Base64, hex) | Purple |
| 20 | Payload Generator (msfvenom builder + web payloads) | Red |

---

## Security Baseline (Non-Negotiable)

Every endpoint, every tool, no exceptions:
- Claude API key server-side only — never in client
- Input validation before any external call
- Rate limiting: 60 req/min per IP on all `/api/*`
- CORS locked to `ALLOWED_ORIGIN` env var
- Helmet HTTP security headers
- JWT auth on all `/api/tools/*` routes
- Tool routes isolated — no cross-tool imports
- Payload cap: 50kb
- nmap: strict argument whitelist, no raw user input to shell

---

## Environment Variables Needed

Copy `.env.example` to `.env` and fill in:
```
ANTHROPIC_API_KEY=        # from console.anthropic.com
ALLOWED_ORIGIN=http://localhost:5173
PORT=4000
NODE_ENV=development
AUTH0_DOMAIN=             # from Auth0 dashboard
AUTH0_CLIENT_ID=          # from Auth0 dashboard
AUTH0_AUDIENCE=https://tools.laynekudo.com/api
SHODAN_API_KEY=           # https://account.shodan.io
VIRUSTOTAL_API_KEY=       # https://www.virustotal.com/gui/join-us
HUNTER_API_KEY=           # https://hunter.io
IPINFO_TOKEN=             # https://ipinfo.io/signup
# WHOIS — no key needed, uses public whoisjsonapi.com endpoint
ABUSEIPDB_API_KEY=        # https://www.abuseipdb.com/register
# ThreatFox, URLhaus, MalwareBazaar — no key needed (abuse.ch public APIs)
```

---

## Teaching Style Preference

Brief summaries only — no step-by-step explanations. Keep prose minimal.
