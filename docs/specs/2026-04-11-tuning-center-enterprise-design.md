# Tuning Center — Enterprise Feature Spec

**Created:** 2026-04-11
**Status:** Draft
**Builds on:** `docs/specs/2026-04-09-noise-suppression-llm-design.md`

---

## Overview

The Tuning Center (formerly Noise Advisor) currently handles candidate scoring, LLM analysis, CVE safety checking, and analyst approval/rejection. This spec covers the additional features required to bring it to enterprise SOC and compliance standards:

1. Rule expiry with TTL and re-approval workflow
2. MITRE ATT&CK mapping on suppression rules
3. Per-rule owner assignment and transfer
4. Tuning metrics dashboard with compliance export

---

## 1. Rule Expiry + Re-approval Workflow

### Behavior

- **Default TTL:** 90 days from approval date
- **Warning at 30 days before expiry:** rule shows amber "Review Soon" badge in Tuning Center
- **Warning at 7 days before expiry:** rule shows red "Expiring Soon" badge, daily in-app notification to rule owner
- **On expiry:** rule auto-disables (`enabled = false`), never deleted. Audit log entry written: `tuning.rule_expired`
- **Re-approval:** owner clicks "Re-approve" in the UI, optionally updates justification, TTL resets to 90 days from re-approval date. Audit log entry: `tuning.rule_reapproved`

### Schema Changes

```sql
-- Add to detection_rules table
ALTER TABLE detection_rules
  ADD COLUMN approved_at       TIMESTAMPTZ,
  ADD COLUMN expires_at        TIMESTAMPTZ,  -- approved_at + 90 days
  ADD COLUMN reapproval_count  INTEGER DEFAULT 0,
  ADD COLUMN owner_id          VARCHAR(255),  -- Auth0 user_id
  ADD COLUMN owner_display     VARCHAR(255);  -- display name at time of assignment
```

For existing rules: `approved_at = created_at`, `expires_at = created_at + 90 days`, `owner_id = user_id`.

Migration: `006_tuning_center_enterprise.sql`

### Server

- **Daily cron at 03:00** (after noise scoring at 02:30): query rules where `expires_at <= NOW()` and `enabled = true`, auto-disable, write audit log
- **Warning query**: expose `GET /api/siem/noise/expiring` — returns rules expiring in <=30 days, grouped by urgency (7-day and 30-day buckets)
- **Re-approve endpoint**: `POST /api/siem/noise/rules/:id/reapprove` — resets `expires_at`, increments `reapproval_count`, audit logs

### UI

- Detection Rules table: add "Expires" column with color-coded badge (green/amber/red)
- Tuning Center: "Expiring Soon" section at top — rules needing review, sorted by urgency
- Re-approve button on each expiring rule — opens confirmation modal, optional justification update
- In-app notification banner (TopNav) when any rule expires within 7 days — similar to LLM analysis banner

---

## 2. MITRE ATT&CK Mapping

### Behavior

- Mapping is **optional** for all suppression rules
- **Required** for rules suppressing high-risk categories: `execution`, `persistence`, `privilege-escalation`, `lateral-movement`, `exfiltration`, `command-and-control`
- When a candidate is approved from Tuning Center, if its `event_category` falls in a high-risk category, the analyst is prompted to select a MITRE tactic + technique before saving
- If analyst skips on a high-risk rule, it saves with a `mitre_required` flag and shows a warning badge

### Schema Changes

```sql
ALTER TABLE detection_rules
  ADD COLUMN mitre_tactic     VARCHAR(64),   -- e.g. 'Defense Evasion'
  ADD COLUMN mitre_technique  VARCHAR(32),   -- e.g. 'T1562.001'
  ADD COLUMN mitre_required   BOOLEAN DEFAULT false;
```

### MITRE Data

- Store MITRE ATT&CK tactic/technique list as a static JSON file in `platform/shared/mitre-attack.json`
- Source: MITRE ATT&CK Enterprise matrix (current version at spec time: v15)
- Structure: `[{ tactic: 'Defense Evasion', techniques: [{ id: 'T1562', name: 'Impair Defenses', subtechniques: [...] }] }]`
- No live sync needed — update the JSON file on major MITRE version releases

### UI

- Approve modal in Tuning Center: add optional "MITRE Mapping" section — tactic dropdown, then technique dropdown filtered by tactic
- For high-risk categories: mapping section marked required, cannot confirm without selecting
- Detection Rules table: add "MITRE" column showing tactic + technique badge where mapped
- Tuning metrics dashboard: suppression coverage by MITRE tactic (see Section 4)

---

## 3. Per-Rule Owner Assignment

### Behavior

- **On creation/approval:** `owner_id` auto-set to the approving analyst's Auth0 user ID
- **Reassignable:** any authenticated user can transfer ownership via "Assign Owner" action
- **Owner responsibilities:** receives expiry warnings, appears in audit log, listed on compliance export
- **Multi-user context:** currently single-user platform — owner fields are stored and displayed but reassignment UI can be deferred until multi-user is needed. The schema and server logic should be complete now.

### Schema

Already covered in Section 1 (`owner_id`, `owner_display`).

### Server

- `PATCH /api/siem/noise/rules/:id/owner` — updates `owner_id` + `owner_display`, audit logs `tuning.owner_changed`
- Owner display name pulled from Auth0 token claims (`name` or `email`) at time of assignment — stored denormalized so it survives user account changes

### UI

- Detection Rules table: "Owner" column
- Rule detail/edit modal: "Assign Owner" input (text field for now, user picker when multi-user lands)
- Tuning metrics: analyst activity breakdown by owner (Section 4)

---

## 4. Tuning Metrics Dashboard + Compliance Export

### Dashboard Location

New tab in Tuning Center: **Metrics** (alongside Candidates and Activity Log).

### Metrics Panels

**Panel 1 — Volume Impact**
- Total events suppressed per day (last 30 days) — line chart
- Alert volume before vs. after top suppression rules — bar chart
- Data source: `logs` table aggregated by suppression rule match

**Panel 2 — False Positive Rate**
- FP rate = (suppressed events / total events) over time — line chart
- Calculated daily, stored in a `tuning_metrics` table for fast retrieval
- Trend indicator: improving / stable / worsening

**Panel 3 — MITRE Coverage**
- Suppression rules grouped by MITRE tactic — horizontal bar chart
- Color-coded: green = mapped, amber = high-risk unmapped (requires attention)
- Helps identify blind spots: if Lateral Movement has no mapped suppressions, tuning may be missing relevant context

**Panel 4 — Rule Health**
- Active rules: total, expiring within 30 days, expiring within 7 days, expired (disabled)
- Re-approval rate: how often rules are renewed vs. lapsing
- Oldest active rule (potential staleness indicator)

**Panel 5 — Analyst Activity**
- Approvals, rejections, overrides, re-approvals per analyst (owner) over last 90 days
- Single-user for now — shows Layne's activity. Expands automatically when multi-user lands.

### Schema

```sql
CREATE TABLE tuning_metrics (
  id           BIGSERIAL PRIMARY KEY,
  user_id      VARCHAR(255) NOT NULL,
  metric_date  DATE NOT NULL,
  total_events BIGINT,
  suppressed_events BIGINT,
  fp_rate      NUMERIC(5,4),
  active_rules INTEGER,
  expiring_30  INTEGER,
  expiring_7   INTEGER,
  expired      INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, metric_date)
);
```

- Populated daily by cron at 03:15 (after expiry check at 03:00)
- `fp_rate = suppressed_events / total_events`

### Compliance Export

Export button on Metrics tab: **Export Compliance Report**

Generates a PDF and/or CSV containing:
- Report period (selectable: last 30 / 90 / 180 days)
- All active suppression rules: name, description, owner, approved_at, expires_at, reapproval_count, MITRE mapping, justification
- All expired/disabled rules in period: same fields + disabled_at reason
- Audit log entries for the period filtered to tuning actions: `tuning.*`, `noise.*`
- Summary metrics: FP rate trend, total events suppressed, rule count over time

**Format:** PDF (primary) via server-side HTML-to-PDF rendering (`puppeteer` or `html-pdf-node`), CSV secondary.

**Endpoint:** `POST /api/siem/noise/export` — accepts `{ format, period_days }`, returns file download.

**Compliance mapping:**
- PCI DSS 10.6: review logs for anomalies — export satisfies audit evidence requirement
- SOC 2 CC7.2: monitor system components — suppression audit trail satisfies this
- NIST 800-53 SI-4: information system monitoring — rule expiry + re-approval workflow satisfies continuous monitoring requirement

---

## 5. Rename: Noise Advisor → Tuning Center

All user-facing references to "Noise Advisor" should be updated to "Tuning Center":

- `TopNav.jsx` — tab label
- `SiemSidebar.jsx` — sidebar item
- `App.jsx` — route and page title
- `NoiseAdvisor.jsx` — rename file to `TuningCenter.jsx`
- Server audit log action prefixes: `noise.*` → keep as-is for backward compatibility, add `tuning.*` for new actions
- API routes: keep `/api/siem/noise/*` as-is — no breaking change, just a UI rename

---

## 6. Implementation Order

1. **Migration 006** — schema changes (approved_at, expires_at, owner_id, mitre columns, tuning_metrics table)
2. **Rule expiry cron + re-approve endpoint** — server-side, no UI yet
3. **Expiry UI** — badges, expiring section, re-approve modal, TopNav warning banner
4. **MITRE mapping** — static JSON, approve modal update, Detection Rules table column
5. **Owner assignment** — server endpoint, table column, assign modal
6. **Tuning metrics cron** — daily metric collection
7. **Metrics dashboard tab** — all 5 panels
8. **Compliance export** — PDF/CSV generation endpoint + export button
9. **Rename Noise Advisor → Tuning Center** — UI strings and file rename

---

## 7. Out of Scope

- Live MITRE ATT&CK feed sync (static JSON is sufficient)
- Multi-user owner picker UI (schema supports it, UI deferred)
- Email/push notifications for expiry (in-app banner is sufficient for now)
- Automatic suppression rule generation from metrics (Phase 5 / future)
