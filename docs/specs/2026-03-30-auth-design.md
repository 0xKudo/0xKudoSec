# Auth Design — 0xKudo Security Toolkit

**Date:** 2026-03-30
**Status:** Approved

---

## Overview

Authentication for the 0xKudo platform uses Auth0 as the single auth hub, supporting both social login (Google, GitHub) and self-hosted email/password via Auth0's Database Connection. The platform is multi-user, with SIEM data and future org/team sharing scoped per user.

---

## Architecture

Auth0 handles all authentication. The React shell redirects unauthenticated users to Auth0's hosted Universal Login page. After login, Auth0 redirects back with an authorization code, which the shell exchanges for a JWT access token. That token is stored in memory (never localStorage) and sent as a `Bearer` header on all protected API calls.

The Express server has one auth middleware — `requireAuth.js` — that verifies the JWT against Auth0's JWKS endpoint. It attaches the decoded user identity (`req.user`) to the request. Tools are gated individually via a `requiresAuth` flag in their manifest.

---

## Protected vs Public Routes

**Rule: if it calls Claude or persists data, it requires login. Pure client-side static tools are public.**

**Public (no login required):**
- Decoder, Reverse Shell Generator, Wordlist Generator, Payload Generator
- All "coming soon" tools
- `GET /api/health`, `GET /api/tools`

**Protected (login required):**
- SIEM and all future data-persisting tools
- Alert Triage, Incident Report, Phishing Analyzer, OSINT Recon, Threat Intel, Network Threat Analyzer, Network Scanner, Log Anomaly Explainer, CVE Exploit Mapper, Payload Obfuscation Explainer, Security Policy Translator, HTTP Repeater, Intruder, Subdomain Enumerator
- All tools that call Claude

**Manifest flag:** Each tool's `manifest.json` gets a `"requiresAuth": true` field. The tool loader in `loader.js` reads this and applies `requireAuth` middleware automatically when mounting that tool's routes.

---

## User Identity & Data Model

Auth0 issues a JWT with a `sub` claim as the canonical user identifier (e.g. `auth0|abc123`, `google-oauth2|abc123`). On first login, the server auto-provisions a row in the `users` table (just-in-time provisioning).

### `users` table (PostgreSQL)

| Column | Type | Notes |
|--------|------|-------|
| `id` | text (PK) | Auth0 `sub` claim |
| `email` | text | AES-256-GCM encrypted at rest |
| `name` | text | AES-256-GCM encrypted at rest |
| `created_at` | timestamptz | |
| `last_seen_at` | timestamptz | |

### Encryption at rest

`email` and `name` are encrypted with AES-256-GCM using a `DB_ENCRYPTION_KEY` environment variable. The key is never stored in the database. Parameterized queries (`$1` placeholders via `pg`) prevent SQL injection. Encryption is a defense-in-depth layer on top of that.

A server-side utility (`platform/server/services/encryption.js`) exposes `encrypt(plaintext)` and `decrypt(ciphertext)` — used exclusively by the user provisioning service.

### Future org/team sharing

Auth0 Organizations maps onto a `teams` table (Phase 3). Each team has members, and SIEM data is scoped to a `team_id`. The auth foundation built here supports this without changes.

---

## Frontend Auth Flow

**Packages:** `@auth0/auth0-react`

- `Auth0Provider` wraps the entire app at the root level in `main.jsx`
- `useAuth0()` hook exposes `isAuthenticated`, `user`, `loginWithRedirect()`, `logout()`
- `TopNav` gains a login/logout button and displays the logged-in user's name/avatar when authenticated
- `RequireAuth` wrapper component protects routes — unauthenticated users are redirected to Auth0 Universal Login automatically
- Public tool routes render without the wrapper; protected tool routes are wrapped
- Access token fetched with `getAccessTokenSilently()` before every protected API call — never stored in localStorage
- Token refresh handled automatically by the Auth0 SDK
- On logout, Auth0 session is cleared and user is redirected to home

**Login UI:** Auth0's hosted Universal Login page handles all UI for Google, GitHub, and email/password. Branding (logo, colors) can be customized in the Auth0 dashboard.

---

## Server-Side Auth Middleware

**File:** `platform/server/middleware/requireAuth.js`

**Packages:** `jwks-rsa`, `jsonwebtoken`

**Behavior:**
1. Extract `Bearer <token>` from `Authorization` header — return `401` if missing
2. Verify JWT signature against `https://<AUTH0_DOMAIN>/.well-known/jwks.json`
3. Validate `aud` claim matches `AUTH0_AUDIENCE`
4. Validate `iss` claim matches `AUTH0_DOMAIN`
5. On success, attach decoded payload to `req.user`
6. On any failure, return `401 Unauthorized` — no fallthrough

**Route mounting:** Applied per-router via the manifest `requiresAuth` flag, not globally. Public routes never touch it.

---

## Email Verification & Password Reset

Both handled entirely by Auth0 — no code required on the platform side.

- **Email verification:** Auth0 sends verification email on registration. Unverified users are blocked via "Require Email Verification" setting in Auth0 dashboard.
- **Password reset:** Auth0 hosted login page includes "Forgot Password" link. Auth0 handles the reset flow end-to-end.
- **Email sending:** Auth0 built-in provider for low volume. Connect SendGrid in Auth0 dashboard for production.
- **Policy:** Users must verify email before accessing protected tools.

---

## Environment Variables

```
AUTH0_DOMAIN=          # e.g. your-tenant.us.auth0.com
AUTH0_CLIENT_ID=       # React SDK (public, safe in client env)
AUTH0_AUDIENCE=        # e.g. https://tools.laynekudo.com/api
DB_ENCRYPTION_KEY=     # 32-byte hex key for AES-256-GCM
```

Note: Auth0 SPA applications use PKCE (not a client secret) — no `AUTH0_CLIENT_SECRET` is needed or safe in a browser-based app.

`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE` already in `.env.example`. Add `DB_ENCRYPTION_KEY`.

Auth0 tenant setup (creating tenant, application, API, enabling Google/GitHub social connections, enabling Database Connection, enabling email verification) is done in the Auth0 dashboard during implementation — approximately 10 minutes.

---

## Testing Strategy

**Server-side:**
- `platform/server/tests/requireAuth.test.js` — valid token passes, expired token 401, missing token 401, wrong audience 401
- All protected tool tests inject fake `req.user` via `vi.mock` (existing pattern, no change)
- `platform/server/tests/encryption.test.js` — encrypt/decrypt round-trip, different IVs per call

**Frontend:** Not in scope — Auth0 React SDK is maintained by Auth0.

**Manual verification checklist:**
- [ ] Register with email/password, verify email, access protected tool
- [ ] Register with Google, access protected tool
- [ ] Attempt to access protected tool without login, confirm redirect to Auth0
- [ ] Attempt API call without token, confirm 401
- [ ] Confirm public tools (Decoder, Reverse Shell Generator, etc.) work without login
- [ ] Confirm unverified email user is blocked from protected tools

---

## Files Changed / Created

| File | Action |
|------|--------|
| `platform/server/middleware/requireAuth.js` | Create |
| `platform/server/services/encryption.js` | Create |
| `platform/server/services/userProvisioning.js` | Create |
| `platform/server/tests/requireAuth.test.js` | Create |
| `platform/server/tests/encryption.test.js` | Create |
| `platform/shell/src/components/RequireAuth.jsx` | Create |
| `platform/shell/src/main.jsx` | Update — add `Auth0Provider` |
| `platform/shell/src/components/TopNav.jsx` | Update — login/logout button, user display |
| `platform/shell/src/App.jsx` | Update — wrap protected routes with `RequireAuth` |
| `platform/server/loader.js` | Update — read `requiresAuth` from manifest, apply middleware |
| `tools/*/manifest.json` | Update — add `requiresAuth` flag to all 19 tools |
| `.env.example` | Update — add `DB_ENCRYPTION_KEY` |
| `package.json` (server) | Update — add `jwks-rsa`, `jsonwebtoken` |
| `package.json` (shell) | Update — add `@auth0/auth0-react` |
