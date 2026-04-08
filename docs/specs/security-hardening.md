# Security Hardening Spec — 0xKudoSec Enterprise SIEM

**Standard:** PCI DSS v4.0 / SOC 2 Type II / ISO 27001 / NIST SP 800-53  
**Status:** In progress  
**Last updated:** 2026-04-05

---

## Overview

This spec defines all required security hardening work for the 0xKudoSec platform to meet enterprise SIEM compliance standards. Items are ordered by priority. Each item includes the compliance requirement it satisfies, the current gap, and the implementation target.

---

## Build Order

### 1. Audit Log Retention (1 year) ✓ COMPLETE

**Compliance:** PCI DSS 10.7, SOC 2 CC7, CIS Controls 8.3  
**Gap:** `audit_log` table has no auto-purge. Records including user IDs and IP addresses accumulate indefinitely.  
**Target:** Daily cron purges `audit_log` entries older than 1 year (365 days). Configurable via `AUDIT_LOG_RETENTION_DAYS` env var. Mirrors the existing `retentionCron.js` pattern.  
**File:** `platform/server/services/retentionCron.js`

---

### 2. Expand Audit Log Coverage ✓ COMPLETE

**Compliance:** PCI DSS 10.2.1, SOC 2 CC7.2, NIST AU-2  
**Gap:** Currently only 8 actions are logged (ingest key rotate, rule CRUD, bulk alert ops, case create/delete). Missing:
- User login (Auth0 login event forwarded to audit log)
- User logout
- Log data export (CSV download)
- Case status changes
- Alert status changes (individual + bulk)
- Detection rule enable/disable toggle
- User settings changes (retention days)
- Ingest key generation (first create, not just rotate)
- File upload events (count accepted, user, timestamp)

**Target:** Add `audit()` calls at each of the above touch points. Standardize action names:
```
auth.login
auth.logout
export.logs
case.status_change
alert.status_change
rule.toggle
settings.update
ingest_key.create
ingest.file_upload
```
**Files:** `platform/server/routes/siem.js`, `platform/server/routes/ingest.js`

---

### 3. Rate Limit Ingest Endpoint + Tighten Sensitive Routes ✓ COMPLETE

**Compliance:** PCI DSS 6.4, SOC 2 CC6.6, NIST SC-5  
**Gap:** `POST /api/ingest/beats` and `POST /api/ingest/upload` have no rate limiting. A single compromised ingest key could DDoS the database. The global 60 req/min limiter only covers `/api` tool routes, not `/api/ingest` or `/api/siem`.  
**Target:**
- Ingest endpoint: 300 events/min per IP (bursting allowed for batch shippers)
- Ingest key rotation: 5 req/min per user
- Rule import: 10 req/min per user
- Auth endpoints: already handled by Auth0, no change needed
- Apply `apiRateLimiter` to `/api/siem` and `/api/ingest` in `index.js`

**File:** `platform/server/index.js`, `platform/server/middleware/rateLimiter.js`

---

### 4. Fix JWT in Query Parameter (SSE Credential Leak) ✓ COMPLETE

**Compliance:** PCI DSS 4.2, SOC 2 CC6.1, OWASP API2  
**Gap:** `requireAuth.js:9` promotes `?token=` query param to `Authorization` header for SSE streams. The full JWT appears in:
- Nginx access logs
- Browser history
- HTTP referrer headers
- Proxy logs

**Target:** Replace with a short-lived (60s) signed SSE token exchange:
1. Client calls `POST /api/siem/sse-token` (authenticated via JWT) — server generates a random 32-byte token, stores it in memory (Map) with user_id and 60s TTL
2. Client opens SSE stream with `?token=<short-lived-token>`
3. SSE middleware validates the short-lived token, resolves user_id, discards token after use (one-time)
4. Cron or lazy cleanup removes expired tokens from the Map

**Files:** `platform/server/middleware/requireAuth.js`, `platform/server/routes/siem.js`, `platform/shell/src/` (SSE client calls)

---

### 5. Account and Data Deletion (GDPR Right to Erasure) ✓ COMPLETE

**Compliance:** GDPR Article 17, SOC 2 Privacy P4  
**Gap:** No endpoint or UI to delete a user account and all associated data. If any EU users exist, this is a legal requirement.  
**Target:**
- `DELETE /api/account` (authenticated) — deletes all rows for `req.auth.sub` across: `logs`, `ingest_sources`, `user_settings`, `user_ingest_keys`, `detection_rules`, `alerts`, `cases`, `case_alerts`
- Audit log entries are retained (append-only, legal obligation) but user_id is anonymized (set to `[deleted]`)
- UI: danger zone section in SiemConfiguration Account tab, two-step confirm modal
- On success: Auth0 Management API call to delete the Auth0 user (requires `AUTH0_MGMT_TOKEN` env var)

**Files:** New `platform/server/routes/account.js`, `platform/shell/src/components/SiemConfiguration.jsx`

---

### 6. Ingest Key Expiry and Last-Used Tracking ✓ COMPLETE (last_used_at bug pending)

**Compliance:** PCI DSS 8.3.9, NIST IA-5  
**Gap:** `user_ingest_keys` has no `expires_at`, no `last_used_at`. Keys never expire. A leaked key is valid forever.  
**Target:**
- Add `expires_at TIMESTAMPTZ` and `last_used_at TIMESTAMPTZ` columns to `user_ingest_keys`
- Default expiry: 365 days from creation/rotation (configurable per user)
- `requireIngestKey` middleware updates `last_used_at` on every successful auth
- Retention cron flags keys expiring within 7 days (stored in `user_settings` or returned via API)
- UI warning in SiemConfiguration API Key tab when key is within 7 days of expiry or already expired
- Expired keys return 401 with `{ error: 'Ingest key expired. Rotate your key in Configuration.' }`

**Files:** `platform/server/routes/ingest.js`, `platform/server/routes/siem.js`, `docs/schema.sql`, `platform/shell/src/components/SiemConfiguration.jsx`

---

### 7. Sanitize Error Responses in Production ✓ COMPLETE

**Compliance:** PCI DSS 6.2.4, OWASP A05, SOC 2 CC6  
**Gap:** `index.js:36` returns `err.message` directly to clients in all environments. In production, this leaks internal file paths, query structure, PostgreSQL error details, and service internals.  
**Target:**
- In production (`NODE_ENV === 'production'`): return `{ error: 'Internal server error' }` with a correlation ID
- In development: return `err.message` as today (debug convenience)
- Always log full error + stack server-side with correlation ID

**File:** `platform/server/index.js`

---

### 8. Request Correlation IDs ✓ COMPLETE

**Compliance:** SOC 2 CC7, NIST AU-3, enterprise ops standard  
**Gap:** No `X-Request-ID` is generated or propagated. Impossible to correlate a user complaint, audit log entry, or alert to a specific request in server logs.  
**Target:**
- Middleware generates `crypto.randomUUID()` per request, attaches to `req.id`
- Sets `X-Request-ID` response header
- All `console.error` / `console.log` calls in error handler include `req.id`
- Audit log entries include request ID in `meta`

**File:** `platform/server/index.js`, `platform/server/services/audit.js`

---

### 9. Content Security Policy (Tuned) ✓ COMPLETE

**Compliance:** PCI DSS 6.4.2, OWASP A05, SOC 2 CC6  
**Gap:** Helmet ships with a default CSP that is too broad and likely causing violations with Auth0, Anthropic API calls from the client (none — good), and self-hosted fonts. No `report-uri` directive means violations are silent.  
**Target:** Explicit CSP directives:
```
default-src 'self'
script-src 'self'
style-src 'self' 'unsafe-inline'   (needed for inline styles in React)
font-src 'self'
img-src 'self' data:
connect-src 'self' https://<AUTH0_DOMAIN> wss://<server>
frame-ancestors 'none'
report-uri /api/csp-report         (new endpoint, logs violations to console)
```
**File:** `platform/server/index.js` (helmet config)

---

### 10. PostgreSQL SSL Enforcement ✓ COMPLETE

**Compliance:** PCI DSS 4.2, SOC 2 CC6, NIST SC-8  
**Gap:** `db.js` constructs a Pool from `DATABASE_URL` with no explicit SSL config. If the connection string doesn't include `?sslmode=require`, the PostgreSQL connection is unencrypted in transit.  
**Target:**
- In production: pass `ssl: { rejectUnauthorized: true }` to Pool config
- In development: allow unencrypted (`ssl: false`) for local Postgres
- Log SSL mode on startup

**File:** `platform/server/services/db.js`

---

### 11. logs Table — Remove Default Empty user_id ✓ COMPLETE

**Compliance:** Data integrity, SOC 2 CC6  
**Gap:** `logs.user_id VARCHAR(255) NOT NULL DEFAULT ''` — a misconfigured or anonymous ingest source inserts events with `user_id = ''`, orphaning them from RLS, retention cron, and all user-scoped queries.  
**Target:**
- Remove `DEFAULT ''` from `user_id` on `logs` and `ingest_sources`
- Application-layer: reject ingest events where `userId` resolves to null/empty before INSERT
- Migration: `ALTER TABLE logs ALTER COLUMN user_id DROP DEFAULT;` + same for ingest_sources

**Files:** `docs/schema.sql`, `platform/server/routes/ingest.js`

---

### 12. At-Rest Encryption for Sensitive Fields

**Compliance:** PCI DSS 3.5, SOC 2 CC6.1  
**Gap:** `encryption.js` (AES-256-GCM) exists but is wired to nothing. `logs.raw` stores raw Windows event JSON including usernames, process trees, and network connections. `cases.description` stores analyst investigation notes.  
**Scope decision needed:** Full column encryption has significant query performance implications (no indexing on encrypted fields). Options:
- Encrypt only `logs.raw` and `cases.description` (narrative fields not used in WHERE clauses)
- Rely on PostgreSQL-level encryption (pgcrypto / Transparent Data Encryption) instead
- Defer: document that PostgreSQL volume is encrypted at the OS level (Hetzner disk encryption)

**Recommendation:** Defer full column encryption pending a performance test. Document Hetzner volume encryption status for the privacy page. Revisit when multi-tenant load is known.

---

### 13. Webhook / SIEM Export with HMAC Signing

**Compliance:** PCI DSS 6.4, SOC 2 CC6  
**Gap:** No outbound webhook or SIEM forwarding (Splunk, Elastic, QRadar) yet. When built, payloads must be HMAC-SHA256 signed so receiving systems can verify origin.  
**Target:** Design with signing from the start when Proxy tool / export features are built. Not a blocking item today.

---

### 14. Session Invalidation on Key Rotation Notification ✓ COMPLETE

**Compliance:** PCI DSS 8.3, operational best practice  
**Gap:** When a user rotates their ingest key, the old key immediately stops working but no notification is sent to the user's connected Fluent Bit agents.  
**Target:** On key rotation, broadcast a WebSocket message to all connected sessions for that user: `{ type: 'ingest_key_rotated' }`. UI shows a banner instructing the user to update their shipper config.

**File:** `platform/server/routes/siem.js`, `platform/shell/src/components/SiemConfiguration.jsx`

---

---

## Phase 2 — User Data Protection & Log Security

Items 1-14 establish baseline enterprise compliance. Phase 2 focuses on deeper protection of user data, log integrity, and multi-tenant isolation.

---

### 15. Row-Level Security Audit and Tightening ✓ COMPLETE

**Compliance:** SOC 2 CC6.1, NIST AC-3  
**Gap:** `cybertools` role has `BYPASSRLS` granted as a workaround for the ingest key lookup (item 6). This means RLS is not enforced for any query the app role runs, reducing defense-in-depth. All user isolation currently relies entirely on application-layer `WHERE user_id = $userId` clauses.  
**Target:**
- Create a dedicated `ingest_auth` role with `BYPASSRLS` used only for ingest key lookups (separate connection pool or SET ROLE per request)
- Revoke `BYPASSRLS` from `cybertools` role — restore RLS as a second layer of defense
- Audit all queries that use `pool.query()` directly (not `db.withUser()`) to confirm they include explicit `user_id` filters

**Files:** `platform/server/routes/ingest.js`, `platform/server/services/db.js`

---

### 16. Log Integrity — Tamper Detection

**Compliance:** PCI DSS 10.3, SOC 2 CC7.2, NIST AU-9  
**Gap:** `logs` and `audit_log` tables have no write protection. A compromised app account could modify or delete log records, destroying forensic evidence.  
**Target:**
- Add a `row_hash` column to `audit_log` — SHA-256 of `(user_id, action, meta, ip, created_at)` computed at insert time
- PostgreSQL trigger prevents UPDATE/DELETE on `audit_log` (append-only enforcement at DB level, not just app level)
- Periodic integrity check: cron job verifies `row_hash` matches recomputed hash for recent rows, logs discrepancies

**Files:** `docs/schema.sql`, `platform/server/services/audit.js`

---

### 17. PostgreSQL SSL with Trusted Certificate ✓ COMPLETE

**Compliance:** PCI DSS 4.2, SOC 2 CC6  
**Gap:** Item 10 enabled SSL but with `rejectUnauthorized: false` because the VPS uses a self-signed PostgreSQL certificate. This encrypts the connection but does not verify server identity — vulnerable to MITM on the local network.  
**Target:**
- Generate a proper CA-signed certificate for PostgreSQL on the VPS (Let's Encrypt or self-CA with cert pinned in app)
- Switch `db.js` to `rejectUnauthorized: true` with the CA cert loaded from `DATABASE_CA_CERT` env var

**Files:** `platform/server/services/db.js`, VPS PostgreSQL config

---

### 18. Secrets Management — Move Away from Ecosystem Config ✓ COMPLETE

**Compliance:** SOC 2 CC6.1, NIST SC-28  
**Gap:** All secrets (API keys, Auth0 credentials, DB password) are stored in plaintext in `ecosystem.config.cjs` on the VPS filesystem. Anyone with filesystem read access can extract all credentials.  
**Target:**
- Create `/var/www/cybertools/.env` on VPS with all secrets, permissions `600` owned by `layne`
- Load `.env` via PM2's `env_file` option in `ecosystem.config.cjs` (requires PM2 v5.3+)
- If PM2 version is too old, load dotenv manually at the top of `platform/server/index.js` instead
- Remove all plaintext secrets from `ecosystem.config.cjs`
- Verify `.env` is in `.gitignore` before starting
- Rotate all credentials after migration: DB passwords for `cybertools`, `ingest_auth`, `cybertools_ops` + Auth0 secret + all API keys

**Implementation steps:**
1. Check PM2 version on VPS (`pm2 --version`)
2. Verify `.env` is in `.gitignore`
3. Create `.env` on VPS with all secrets copied from `ecosystem.config.cjs`
4. Set `chmod 600 .env`
5. Update `ecosystem.config.cjs` to use `env_file` (or add dotenv to `index.js`)
6. Remove secrets from `ecosystem.config.cjs`
7. `pm2 restart all` and verify app starts
8. Rotate credentials one at a time: update in `.env`, update in PostgreSQL/Auth0/provider, restart, verify

**What could break:**
- PM2 version below 5.3 doesn't support `env_file` — app won't load any env vars and will crash on missing `DATABASE_URL`. Fallback: load dotenv in `index.js`
- Credential rotation window — if PostgreSQL role password is changed before `.env` is updated (or vice versa), DB connections fail and app goes down. Always update `.env` first, then change the credential, then restart
- All three DB connection strings (`DATABASE_URL`, `INGEST_AUTH_DB_URL`, `OPS_DB_URL`) must be migrated together
- `.env` must not be committed — verify gitignore before creating the file

**Files:** `ecosystem.config.cjs`, VPS `.env`, optionally `platform/server/index.js`

---

### 19. Subresource Integrity for Third-Party Assets

**Compliance:** PCI DSS 6.4.3, SOC 2 CC6  
**Gap:** If any third-party scripts or stylesheets are ever added (CDN fonts, analytics), they would load without integrity checks. Currently no third-party assets are used, but this should be enforced as a policy.  
**Target:**
- Document policy: no third-party CDN assets without SRI hash in the CSP
- Add `require-sri-for script style` to CSP directives if any external assets are introduced

**Files:** `platform/server/index.js` (helmet CSP config)

---

### 20. Account Lockout / Brute Force Protection on Auth Endpoints

**Compliance:** PCI DSS 8.3.4, NIST IA-5  
**Gap:** Auth0 handles login brute force, but the ingest key endpoint and API key rotation endpoint have per-IP rate limiting only. A distributed attack from multiple IPs could still hammer these endpoints.  
**Target:**
- Add per-user rate limiting on `POST /api/siem/ingest-key` (key rotation) — max 5 rotations/hour per user
- Log excessive rotation attempts to audit log with `ingest_key.rotation_blocked` action
- Auth0 anomaly detection should be enabled in the Auth0 dashboard (Attack Protection settings)

**Files:** `platform/server/middleware/rateLimiter.js`, `platform/server/routes/siem.js`

---

---

## Phase 3 — SQL Hardening & Schema Accuracy

Items identified during privacy/security audit (2026-04-06).

---

### 21. Parameterize All Interval Expressions (SQL Injection Risk) ✅ Complete

**Compliance:** PCI DSS 6.2.4, OWASP A03  
**Gap:** `siem.js` had 15 occurrences of `INTERVAL '${hours} hours'` template literal interpolation where `hours` comes from `req.query.hours`. While `parseInt` provided partial protection, this bypassed parameterization and is not compliant with safe query practices.  
**Implemented:**
- All 15 interpolations replaced with `make_interval(hours := $N)` parameterized form
- `hours` passed as a bound parameter in every case — no user input reaches SQL string

**Files:** `platform/server/routes/siem.js`

---

### 22. Privacy Policy Page ✅ Complete

**Compliance:** GDPR Art. 13/14, SOC 2 P1  
**Gap:** No privacy policy existed explaining what data is collected, how it is used, retained, and how users can exercise rights.  
**Implemented:**
- `/privacy` route added, accessible pre-login, post-login, and in Electron
- Documents: what is collected (Auth0 user ID, event logs, rules/alerts/cases, ingest key hash, audit log entries, retention settings), what is not collected (payment info, analytics, passwords), third-party services (Auth0, Anthropic, threat intel APIs), retention defaults and configurability, security controls, user rights (export, delete, configure retention)
- Links in both `Sidebar.jsx` and `SiemSidebar.jsx` footers using `navigate()` for Electron compatibility
- Page uses flex-column layout with scrollable content area — compatible with Electron preload `overflow:hidden` on `#root`

**Files:** `platform/shell/src/pages/PrivacyPage.jsx`, `platform/shell/src/components/Sidebar.jsx`, `platform/shell/src/components/SiemSidebar.jsx`, `platform/shell/src/App.jsx`

---

---

## Phase 4 — Electron App Hardening

Items identified during Electron security audit (2026-04-06 through 2026-04-07).

---

### 23. scrypt PIN Input Length Cap

**Compliance:** NIST SP 800-53 SI-10, SOC 2 CC6  
**Gap:** `settings:verifyPin` and `settings:setPin` IPC handlers pass the raw PIN string to `scryptSync` with no length cap. An extremely long input (e.g. 100MB) would spike CPU and memory during hashing, causing a denial of service on the main process.  
**Target:**
- Reject any PIN input exceeding 256 characters before calling `scryptSync`
- Return `{ ok: false, err: 'PIN too long' }` immediately

**File:** `platform/electron/main.js`

---

### 24. scrypt Hash Length Guard (Crash Prevention)

**Compliance:** Defensive programming, SOC 2 CC7  
**Gap:** `timingSafeEqual` requires both buffers to be the same length. If the `pinHash` stored in electron-store is corrupted or truncated (e.g. partial write, store migration), `timingSafeEqual` throws instead of returning false, crashing the IPC handler with an unhandled exception.  
**Target:**
- Before calling `timingSafeEqual`, verify `storedHash.length === attemptHash.length`
- If lengths differ, return `{ ok: false, err: 'PIN verification failed' }` and log a warning

**File:** `platform/electron/main.js`

---

---

## Phase 5 — Full Security Review Pass (2026-04-07)

Findings from a comprehensive review of the Electron app, web application, and mobile UI surfaces.

---

### 25. PIN Brute Force — No Attempt Limit (Electron)

**Compliance:** PCI DSS 8.3.4, NIST IA-5  
**Gap:** `settings:verifyPin` has no rate limiting or lockout. An attacker with access to the running app (e.g. via a compromised Windows session) could call the IPC handler in a tight loop and brute force a short numeric PIN without any throttle.  
**Target:**
- Track failed attempts in memory (not store, so it resets on app restart)
- After 5 consecutive failures, lock for 60 seconds before allowing further attempts
- Return `{ ok: false, err: 'Too many attempts. Try again in 60 seconds.' }` during lockout
- Reset counter on success

**File:** `platform/electron/main.js`

---

### 26. executeJavaScript Still Used in Auth0 Callback Server (Electron)

**Compliance:** Electron security best practice, SOC 2 CC6  
**Gap:** `main.js:89` uses `mainWindow.webContents.executeJavaScript(...)` to dispatch the `auth0-callback` event to the renderer. This is the same pattern replaced elsewhere (tray navigation) with typed IPC. While the payload is JSON-serialized via `JSON.stringify`, `executeJavaScript` is a high-privilege API that bypasses contextIsolation for that call.  
**Target:**
- Replace `executeJavaScript` with `mainWindow.webContents.send('auth0:callback', fullUrl)`
- In preload, expose `onAuth0Callback: (cb) => ipcRenderer.on('auth0:callback', (_e, url) => cb(url))`
- In the React app, listen via `window.electron.onAuth0Callback(...)` instead of `window.addEventListener('auth0-callback', ...)`

**Files:** `platform/electron/main.js`, `platform/electron/preload.js`, `platform/shell/src/App.jsx`

---

### 27. Callback Server Accepts Any Local Connection (Electron)

**Compliance:** NIST SP 800-53 SC-7, defensive design  
**Gap:** The Auth0 callback HTTP server on `127.0.0.1:8765` validates `code`, `state`, and `/callback` path, but any process running on the same machine can make a request to it. A local malicious process could send a crafted request with a fake `code`/`state` to trigger the callback flow. The PKCE exchange would fail at Auth0's end, but the callback event would still be dispatched to the renderer.  
**Target:**
- Add a random per-session nonce to the callback URL registered with Auth0 (appended as a custom query param)
- Verify the nonce in the callback server before dispatching
- This ensures only the browser tab opened by the app can trigger the callback

**Files:** `platform/electron/main.js`

---

### 28. No PIN Reset Path (Electron)

**Compliance:** Operational security, usability  
**Gap:** If a user forgets their config editor PIN, there is no recovery path. The PIN hash is stored in the encrypted electron-store. The only way to reset it is to manually delete the store or reinstall the app, both of which destroy all settings.  
**Target:**
- Add a "Reset PIN" option accessible only to users with the `config-editor` Auth0 role (already enforced by the tab gate)
- Reset should: clear `pinHash` and `pinSalt` from the store, set `pinState` back to `'unset'`
- Document that PIN reset does not require the old PIN — Auth0 role gate is the second factor

**Files:** `platform/electron/main.js`, `platform/shell/src/components/SiemConfiguration.jsx`

---

### 29. WorkspaceContext Data Stored Unencrypted in localStorage (Web/Mobile)

**Compliance:** SOC 2 CC6.1, NIST SC-28  
**Gap:** `WorkspaceContext.jsx` stores inter-tool data (alert triage results, incident report inputs, phishing analysis output) in `localStorage` as plaintext JSON. On a shared or compromised browser, this data is readable by any script on the same origin, or physically by anyone with access to the browser profile.  
**Severity:** Low — same-origin scripts are already trusted, and the data is transient (used to pass context between tools). No long-term PII is intended to be stored here.  
**Target:**
- Document the limitation in a code comment: localStorage data is not encrypted and should not persist sensitive data beyond the session
- Consider using `sessionStorage` instead of `localStorage` so data clears when the browser tab is closed
- Evaluate whether WorkspaceContext data should have a TTL (e.g. auto-clear after 24h)

**Files:** `platform/shell/src/context/WorkspaceContext.jsx`

---

### 30. CORS Allows Requests With No Origin (Web)

**Compliance:** OWASP A05, defensive design  
**Gap:** `cors.js:8` — requests with no `Origin` header are unconditionally allowed. This is intended for same-origin browser requests and curl, but it also allows server-side requests (e.g. from scripts running on the VPS itself or internal network) to bypass origin checking entirely.  
**Severity:** Low in the current single-server deployment since all API endpoints still require JWT auth. But in a multi-tenant or multi-server setup this would be a meaningful gap.  
**Target:**
- Document the intent of the `!origin` allowance in a comment
- When multi-tenant deployment is planned, revisit whether server-to-server calls should use a separate auth mechanism rather than relying on the CORS no-origin bypass

**Files:** `platform/server/middleware/cors.js`

---

### 31. No Subresource Integrity on Vite Build Output (Web)

**Compliance:** PCI DSS 6.4.3  
**Gap:** Vite bundles all JS/CSS into hashed filenames but does not inject `integrity` attributes into the generated `<script>` and `<link>` tags in `index.html`. If the VPS web server or CDN were compromised and served a modified bundle, the browser would load it without any tamper detection.  
**Target:**
- Add `vite-plugin-subresource-integrity` to the Vite build config
- This automatically computes and injects `integrity="sha384-..."` on all generated script/link tags in `index.html`
- No runtime changes needed

**Files:** `platform/shell/vite.config.js`, `package.json`

---

### 32. Auth Tokens Stored in Browser Memory Only — Confirm No localStorage Persistence (Web/Mobile)

**Compliance:** OWASP A02, SOC 2 CC6.1  
**Gap:** Auth0 React SDK defaults to storing tokens in memory (not localStorage), which is correct — tokens in localStorage are vulnerable to XSS. However, this should be explicitly verified and locked in, not left to SDK defaults.  
**Target:**
- Confirm `Auth0Provider` is initialized without `cacheLocation: 'localstorage'` — if it is, remove it
- Add a comment in `App.jsx` at the `Auth0Provider` declaration noting that in-memory token storage is intentional
- Verify no `getAccessTokenSilently` result is written to localStorage anywhere in the codebase

**Files:** `platform/shell/src/App.jsx`

---

### 33. HTTP Repeater and Intruder — No Server-Side Proxy Validation (Web/Purple)

**Compliance:** OWASP A10 (SSRF), SOC 2 CC6  
**Gap:** HTTP Repeater and Intruder tools allow users to specify arbitrary URLs and send requests through the client browser directly (not via the server). If these tools are ever moved server-side (proxied through the Express backend), any URL the user provides would be fetched by the server, creating a Server-Side Request Forgery (SSRF) risk — allowing users to reach internal network resources, cloud metadata endpoints (169.254.169.254), or localhost services.  
**Severity:** Not currently exploitable since requests are made client-side. But this is a design constraint that must be enforced if the architecture changes.  
**Target:**
- Document the SSRF constraint in the tool's server route (if one exists) or in this spec
- If a server-side proxy is ever added: blocklist `169.254.0.0/16` (AWS/GCP metadata), `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, and `localhost`/`127.0.0.1`
- Require the "I have authorization" checkbox (already present on the scanner) on any tool that sends requests to user-specified URLs via the server

**Files:** `tools/http-repeater/`, `tools/intruder/` (future server routes)

---

### 34. No Security Headers on Electron IPC Error Responses

**Compliance:** Defensive design  
**Gap:** When IPC handlers return `{ ok: false, err: e.message }` from caught exceptions (e.g. `fluent-bit:read-config`, `fluent-bit:write-config`), the raw system error message is returned to the renderer. On Windows, `fs` errors include full file paths (e.g. `ENOENT: no such file or directory, open 'C:\Program Files\...'`). This leaks internal path structure to the renderer, which displays it to the user.  
**Severity:** Low — the renderer is trusted and the user is authenticated. But if CSP is later tightened and XSS becomes truly impossible, this is acceptable. For now it's worth sanitizing.  
**Target:**
- Map known error codes (`ENOENT`, `EACCES`, `EPERM`) to user-friendly messages in IPC handlers
- Only return `e.message` in dev mode; return sanitized messages in packaged app

**Files:** `platform/electron/main.js`

---

### 35. Electron Version Upgrade

**Compliance:** PCI DSS 6.3.3, SOC 2 CC7, NIST SI-2 (flaw remediation)  
**Gap:** The app currently runs Electron <=39.x, which has 17+ published CVEs including use-after-free bugs, renderer command-line switch injection, HTTP response header injection in custom protocol handlers, and an ASAR integrity bypass. Most are not directly exploitable given the current security posture (`contextIsolation: true`, `nodeIntegration: false`, no `executeJavaScript`, typed IPC only), but they remain unpatched known vulnerabilities. The fix requires upgrading to Electron 41+, which is a major version jump and may include breaking API changes.

**Target:**
- Upgrade `electron` and `electron-builder` to their latest stable versions in `platform/electron/package.json`
- Run the app in dev mode and verify all IPC handlers, tray, auto-updater, safeStorage, and Auth0 callback flow still work
- Rebuild and test the packaged installer end-to-end before publishing
- Check Electron 40/41 release notes for any breaking changes affecting: `BrowserWindow`, `ipcMain`, `safeStorage`, `autoUpdater`, `Menu`, `Tray`

**Priority:** Medium — not urgently exploitable but should be done before any public or enterprise rollout.

**Files:** `platform/electron/package.json`

---

## Compliance Coverage Summary

| Requirement | Standard | Item # |
|---|---|---|
| Audit log retention 12 months | PCI DSS 10.7 | 1 |
| Log all privileged actions | PCI DSS 10.2.1 | 2 |
| Rate limiting / DoS protection | PCI DSS 6.4 | 3 |
| No credentials in URLs | PCI DSS 4.2 | 4 |
| Right to erasure | GDPR Art. 17 | 5 |
| Credential rotation policy | PCI DSS 8.3.9 | 6 |
| No internal error disclosure | PCI DSS 6.2.4 | 7 |
| Request traceability | SOC 2 CC7 | 8 |
| Content Security Policy | PCI DSS 6.4.2 | 9 |
| Encrypted DB connections | PCI DSS 4.2 | 10 |
| Data integrity / no orphaned records | SOC 2 CC6 | 11 |
| Data at rest encryption | PCI DSS 3.5 | 12 |
| Outbound payload signing | PCI DSS 6.4 | 13 |
| Credential rotation notifications | PCI DSS 8.3 | 14 |
