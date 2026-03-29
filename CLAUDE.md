# CLAUDE.md — 0xKudo Security Toolkit

This file is automatically read by Claude Code at the start of every session in this directory. It contains everything needed to pick up where we left off.

---

## What This Project Is

A unified cybersecurity tools platform hosted at `tools.laynekudo.com`. 19 planned tool modules covering blue team, red team, and purple team workflows. Built as a monorepo — one git repo, shared platform frame, each tool is a self-contained isolated module.

This is Layne Kudo's project. Layne is self-taught, building this as a portfolio to pursue SOC analyst, IT support, and penetration testing roles. He is also a soon-to-be father returning to job searching in mid-2025. Background includes 20+ years of hands-on tech, litigation paralegal work, and active TryHackMe study (SOC Level 1, Jr Penetration Tester, and others). CompTIA A+ in progress.

---

## Current Build Status

**Platform tasks 1–9: ALL COMPLETE**

**Tools built:**
| # | Tool | Status |
|---|------|--------|
| 1 | Alert Triage Assistant | Complete — pushes results to WorkspaceContext |
| 2 | Incident Report Generator | Complete — imports from Alert Triage via WorkspaceContext |
| 3 | Phishing Email Analyzer | Complete — paste text or upload .eml file |
| 4+ | All remaining tools | Backlog |

**Next: Tool 4 — OSINT Recon Dashboard**

**Full context:** `HANDOFF.md` (in this folder)
**Full design spec:** `2026-03-26-cybertools-platform-design.md` (in this folder)
**Full implementation plan:** `2026-03-26-cybertools-platform.md` (in this folder)

---

## How to Run

```bash
cd "Desktop\claude projects\cybertools"
npm run dev        # starts both server (port 4000) and shell (port 5173)
```

Open http://localhost:5173

---

## Architecture (All Decisions Settled)

- **Monorepo** — npm workspaces, `platform/server` + `platform/shell` + `platform/shared` + `tools/*`
- **Backend** — Node.js + Express, port 4000
- **Frontend** — React 18 + Vite 5 + React Router 6, port 5173
- **Auth** — Auth0, multi-user, Google + GitHub social login, JWT verified server-side
- **Claude API** — Anthropic SDK singleton in `platform/server/services/claude.js`, key from env, never in client
- **Inter-tool data sharing** — `WorkspaceContext` (React context + localStorage). Upgrades to server-side `/api/workspace` later without changing tool code.
- **Domain-portable** — `ALLOWED_ORIGIN` env var drives CORS, no hardcoded URLs anywhere

## Theme & Design (All Decisions Settled)

- **Font** — Source Code Pro Medium (weight 500), self-hosted in `platform/shell/src/fonts/`, used for ALL text without exception. CSS variable: `--font` (not `--font-mono` or `--font-sans`)
- **Dark mode (default)** — Warm Dark: `#111110` bg, `#e8e6e3` text, `#0e0d0c` sidebar, `#1f1e1c` border
- **Light mode** — Warm Light: `#faf8f5` bg, `#1a1714` text, `#f0ece6` sidebar, `#e0d8cc` border
- **No color accents** — severity colors only: critical `#ef4444`, high `#d97706`, medium `#ca8a04`, low `#16a34a`, info `#60a5fa`
- **Toggle** — sun/moon icon in top nav, swaps `data-theme` on `<html>`, saved to localStorage
- **Buttons** — `--btn-primary-bg: #e8e6e3`, `--btn-primary-text: #111110` (inverts in light mode)

---

## Tool Module Contract

Every tool in `tools/` must follow this contract exactly:

1. `manifest.json` — `id`, `name`, `description`, `route`, `icon`, `tags[]`, `status` (`active` or `coming-soon`)
2. `client/index.jsx` — default export React component, renders in the shell content area
3. `server/routes.js` — default export Express router, auto-mounted at `/api/tools/[id]/` by loader
4. Never import from another tool's `client/` or `server/` directory
5. Never instantiate own Anthropic client — always import from `platform/server/services/claude.js`
6. Validate all inputs before calling any external service
7. Tests go in `platform/server/tests/[tool-id].test.js` — mock Claude with `vi.mock`, use `createApp()` not `app` directly

---

## Security Posture (Non-Negotiable)

**Always evaluate security on every code change, feature, and architectural decision.**

Every endpoint, every tool, no exceptions:
- Claude API key and all secrets stay server-side — never referenced in any client file
- Input validation before any external API call
- Rate limiting on all `/api/*` routes — 60 req/min per IP via shared middleware
- CORS locked to `ALLOWED_ORIGIN` env var — no wildcard origins
- Helmet HTTP security headers on all responses
- JWT auth required on all `/api/tools/*` routes — verified against Auth0 public key
- Tool routes isolated — `/api/tools/alert-triage/*` only executes that tool's routes.js
- No tool imports another tool's internals
- Inter-tool data sharing only through `WorkspaceContext` — never direct tool-to-tool calls
- Input payload size capped at 50kb (JSON endpoints)
- File uploads: multer memory storage only (no disk writes), type + extension validated, size limited
- nmap (Network Scanner) runs as sandboxed subprocess with strict argument whitelist — user input never passes raw to shell

Flag any security concern before proceeding, even if it slows implementation down.

---

## File Upload Pattern (Phishing Analyzer)

- Separate endpoint `POST /analyze-file` using multer memory storage
- `.eml` only — validated by MIME type AND file extension
- 100kb max file size, 100k char text limit (paste endpoint uses 20k char limit)
- Buffer decoded as UTF-8, passed to shared analysis function
- `.msg` support deferred to future iteration
- Use this same pattern for any future tool needing file input

---

## Collaboration Style

- **Brief summaries only** — no step-by-step explanations unless asked
- Update `HANDOFF.md`, `CLAUDE.md`, and memory files after every task completes
- No em dashes — use commas or restructure
- Direct and confident tone — no AI filler phrases

---

## 19 Planned Tool Modules

| # | Tool | Team | Status |
|---|------|------|--------|
| 1 | Alert Triage Assistant | Blue | Complete |
| 2 | Incident Report Generator | Blue | Complete |
| 3 | Phishing Email Analyzer | Blue | Complete |
| 4 | OSINT Recon Dashboard | Purple | Next |
| 5 | Threat Intelligence Aggregator | Blue | Backlog |
| 6 | Network Threat Analyzer | Blue | Backlog |
| 7 | Network Scanner (nmap wrapper) | Purple | Backlog |
| 8 | Log Anomaly Explainer | Blue | Backlog |
| 9 | CVE Exploit Mapper | Purple | Backlog |
| 10 | Payload Obfuscation Explainer | Purple | Backlog |
| 11 | Security Policy Translator | Blue | Backlog |
| 12 | Reverse Shell Generator | Red | Backlog |
| 13 | Wordlist / Password Generator | Red | Backlog |
| 14 | Subdomain Enumerator | Red | Backlog |
| 15 | HTTP Repeater (Burp-style, full save/replay) | Purple | Backlog |
| 16 | Proxy (capture/replay now, full intercept in Electron) | Purple | Backlog |
| 17 | Intruder (automated attack automation) | Red | Backlog |
| 18 | Scanner (passive + active XSS/SQLi, auth checkbox) | Purple | Backlog |
| 19 | Decoder (URL, HTML, Base64, hex) | Purple | Backlog |

**Special notes:**
- Proxy: built with `ProxyService` interface so Electron version swaps to full intercepting proxy without changing UI
- Scanner: active mode requires explicit "I have authorization" checkbox before any scan fires
- Network Scanner: server-side nmap subprocess, strict argument whitelist

---

## Environment Variables

Copy `.env.example` to `.env` and fill in real values before running:

```
ANTHROPIC_API_KEY=        # from console.anthropic.com
ALLOWED_ORIGIN=http://localhost:5173
PORT=4000
NODE_ENV=development
AUTH0_DOMAIN=             # from Auth0 dashboard
AUTH0_CLIENT_ID=          # from Auth0 dashboard
AUTH0_AUDIENCE=https://tools.laynekudo.com/api
```

---

## Related Files

| File | Purpose |
|------|---------|
| `HANDOFF.md` | Full context summary, task log, and decision history |
| `2026-03-26-cybertools-platform-design.md` | Complete design spec |
| `2026-03-26-cybertools-platform.md` | Step-by-step implementation plan |
| `platform/shared/constants.js` | Severity levels, tag colors — shared by server and shell |
| `.env.example` | Template for required environment variables |
