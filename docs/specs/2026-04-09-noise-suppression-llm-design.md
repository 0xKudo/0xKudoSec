# Noise Suppression Engine + Embedded LLM Design

**Created:** 2026-04-09
**Feature:** Adaptive noise suppression with embedded Phi-3.5 Mini LLM, CVE safety checking, and vulnerability knowledge base

---

## Overview

The platform learns from ingested SIEM events over time, identifies repetitive noise patterns, and suggests or auto-creates suppression rules. An embedded LLM (Phi-3.5 Mini via llama.cpp) runs locally inside the Electron app to analyze patterns, check against known CVEs, and generate human-readable explanations. A lightweight vulnerability knowledge base supplements the model's training cutoff with recent CVEs pulled from public feeds.

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│ Electron App                                                     │
│                                                                  │
│  ┌──────────────────┐    IPC     ┌──────────────────────────┐   │
│  │  Noise Advisor   │◄──────────►│  LLM Worker (llama.cpp)  │   │
│  │  UI Panel        │            │  Phi-3.5 Mini Q4 (~2.2GB)│   │
│  └──────────────────┘            └──────────────────────────┘   │
│           │                                  │                   │
│           │ API calls                        │ reads             │
│           ▼                                  ▼                   │
│  ┌──────────────────┐            ┌──────────────────────────┐   │
│  │  VPS Server      │            │  Vuln KB (SQLite)        │   │
│  │  /api/siem/noise │            │  CVEs + patterns         │   │
│  └──────────────────┘            └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ VPS Server                                                       │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │  Noise Analyzer  │    │  PostgreSQL                      │   │
│  │  (scheduled job) │───►│  siem_events, alerts,            │   │
│  └──────────────────┘    │  detection_rules,                │   │
│           │              │  noise_candidates (new)          │   │
│           │              └──────────────────────────────────┘   │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │  /api/siem/noise │                                           │
│  │  routes          │                                           │
│  └──────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Server-Side Noise Analysis (no LLM)

### Trigger Conditions

Noise candidates are generated when **either** condition is met:
- 7 days of events have been ingested, OR
- 10,000 events have been ingested

Checked by a daily scheduled job (`noiseCron.js`) alongside the existing retention cron.

### Candidate Scoring Algorithm

For each unique `(source, event_type, field_signature)` combination in the past 7 days:

| Signal | Weight |
|--------|--------|
| Fires > 50 times/day on average | +30 |
| Fires at consistent time intervals (±5 min) | +25 |
| Zero analyst actions taken (no case, no alert acknowledgement) | +20 |
| Same host/process/user every time | +15 |
| No severity escalation in past 30 days | +10 |

**Score 70+** = high confidence candidate
**Score 40-69** = medium confidence candidate
**Score < 40** = not surfaced

### noise_candidates Table (new)

```sql
CREATE TABLE noise_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  field_signature JSONB NOT NULL,      -- the pattern: source, event_type, key fields
  score INTEGER NOT NULL,
  confidence TEXT NOT NULL,            -- 'high' | 'medium'
  daily_avg NUMERIC,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  event_count INTEGER,
  llm_explanation TEXT,                -- populated by LLM in Phase 2
  llm_cve_safe BOOLEAN,               -- populated by LLM in Phase 2
  llm_checked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'auto_created'
  suppression_rule_id UUID,            -- FK to detection_rules if created
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Auto-Suppression Behavior

Controlled by user preference stored in `user_settings` (new key `noise_auto_suppress`):

- `off` — suggest only, analyst approves each rule
- `high_only` — auto-create rules for high confidence candidates only
- `all` — auto-create for all candidates above score threshold

Every auto-created rule is written to the audit log with `noise.auto_suppress` action and includes the candidate score, field signature, and a one-click undo link in the Noise Advisor UI.

---

## Phase 2 — Embedded LLM (Electron only)

### Model

Default: **Phi-3.5 Mini Instruct (Q4_K_M quantization)**
- Size: ~2.2GB
- RAM required: ~3GB during inference
- Inference time: 3-8 seconds on modern CPU, 1-3 seconds with GPU offload
- Source: Hugging Face `microsoft/Phi-3.5-mini-instruct` GGUF

### Supported Models

| Model | Size | Notes |
|-------|------|-------|
| Phi-3.5 Mini Q4 | ~2.2GB | **Default — recommended** |
| Qwen2.5 1.5B Q4 | ~1GB | Faster, lighter, weaker CVE knowledge |
| Llama 3.2 3B Q4 | ~2GB | Good general reasoning |
| Custom GGUF | user-provided | Any llama.cpp-compatible GGUF file |

The active model is selected in Configuration > Noise Advisor. Switching models unloads the current model and loads the new one on next analysis run.

**Custom GGUF:** User browses to a local `.gguf` file via a file picker dialog. The app does not validate model quality — the user is responsible for selecting a compatible model. Path is stored in `user_settings` as `llm_custom_model_path`. SHA-256 is computed on first use and stored to detect if the file changes.

### LLM Run Trigger

Controlled by user toggle `noise_llm_trigger`:

- `auto` — LLM runs automatically when Noise Advisor tab is opened and unanalyzed candidates exist
- `manual` — LLM only runs when user clicks "Run Analysis" button

Default: `manual` — avoids unexpected memory usage on first open.

### llama.cpp Integration

The LLM runs as a child process inside Electron, managed by a dedicated `llmWorker.js` IPC handler. It is **never** loaded on startup — only triggered by the above conditions.

After analysis completes the worker process exits and memory is freed. The ~3GB RAM spike is temporary.

**IPC channels:**
- `llm:analyze` — send candidates for analysis, returns explanation + CVE safety verdict
- `llm:status` — returns `idle | loading | running | unavailable`
- `llm:download-model` — triggers model download with progress events
- `llm:check-update` — checks GitHub releases for newer model version
- `llm:cancel` — cancel in-progress analysis

### Model Distribution

Managed models (Phi-3.5 Mini, Qwen2.5, Llama 3.2) are **not bundled** in the installer. On first use of a managed model:
1. Noise Advisor detects model is not present
2. Shows download prompt with size warning
3. Downloads from a pinned GitHub release URL in `0xKudoSec-releases`
4. Verifies SHA-256 checksum before use
5. Stores in `%APPDATA%\0xKudo\models\<model-name>.gguf`

### Custom Model UI

A dedicated panel in Configuration > Noise Advisor > Model Library. Custom models are never blocked — all warnings are informational only. The user decides.

**Adding a model — two methods:**

1. **Browse local file** — file picker filtered to `.gguf` files, selects a file already on disk
2. **Download by URL** — paste a Hugging Face model URL or direct download URL, app fetches the file into `%APPDATA%\0xKudo\models\` with a progress bar

**Compatibility check** — runs automatically after file is selected or download completes. Reads the GGUF file header to determine:

| Check | Pass | Warning (not a block) |
|-------|------|-----------------------|
| Valid GGUF format | Header magic bytes match | "Not a valid GGUF file" |
| Quantization type | Q4, Q5, Q6, Q8, F16, F32 | "Q2/Q3 quantization may produce poor reasoning quality" |
| Model type | instruct/chat model | "This may be an embedding model. It may not produce useful analysis." |
| RAM estimate | File size x 1.05 fits in available RAM | "This model requires approximately XGB of RAM. Your system has YGB available. You can still use it." |

**Model library table** — lists all added models (managed + custom):

| Column | Description |
|--------|-------------|
| Name | Model filename or user-assigned name |
| Type | Managed / Custom |
| Size | File size on disk |
| RAM Est. | Estimated RAM during inference |
| Quantization | Q4, F32, etc. |
| Status | Ready / Downloading / Incompatible / Update available |
| Actions | Set as active, Remove |

Multiple models can be saved. Only one is active at a time. Removing a managed model deletes the `.gguf` file from AppData. Removing a custom model removes it from the library only — the original file is not deleted.

**IPC additions:**
- `llm:add-custom` — validate and register a custom GGUF path
- `llm:download-url` — download a model from a URL with progress events
- `llm:remove-model` — remove a model from the library

### Model Update Check

On Electron startup (non-blocking, background), for managed models only:
1. Fetch `models/manifest.json` from GitHub releases API
2. Compare SHA-256 of installed model against manifest
3. If mismatch: show unobtrusive badge on Noise Advisor — "Model update available"
4. User clicks to update — same download flow as initial install
5. Custom models: never checked for updates (user manages their own file)

### LLM Prompt Design

Each candidate is analyzed with a structured prompt:

```
You are a security analyst assistant. Analyze this SIEM event pattern and answer two questions:

Pattern: {field_signature as JSON}
Frequency: {daily_avg} events/day over {days} days
No analyst action taken in this period.

1. Is this likely noise? Give a one-sentence explanation.
2. Does this pattern match any known CVE or active attack technique?
   If yes, name the CVE or technique and explain why suppression would be dangerous.
   If no, say "No known CVE match — safe to suppress."

Respond in JSON: { "explanation": "...", "cve_safe": true/false, "cve_note": "..." }
```

Candidates flagged as `cve_safe: false` are **never** auto-suppressed regardless of user setting, and are highlighted in red in the Noise Advisor UI with the LLM's explanation.

---

## Phase 3 — Vulnerability Knowledge Base

### Purpose

Supplement the LLM's training cutoff with recent CVEs and attack patterns. The KB is used as context injected into the LLM prompt, not as a fine-tuning dataset (fine-tuning a 3.8B model locally is not practical).

### Storage

SQLite database at `%APPDATA%\0xKudo\vuln-kb\kb.db` — local to the Electron app, not on the VPS.

```sql
CREATE TABLE vulnerabilities (
  id TEXT PRIMARY KEY,          -- CVE-YYYY-NNNNN or custom pattern ID
  source TEXT NOT NULL,         -- 'nvd' | 'mitre' | 'manual'
  title TEXT,
  description TEXT,
  severity TEXT,
  affected_products TEXT,       -- JSON array
  attack_patterns TEXT,         -- JSON array of field signatures to watch for
  published_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Data Sources (free, no API key required)

| Source | Feed | Update frequency |
|--------|------|-----------------|
| NVD | `https://services.nvd.nist.gov/rest/json/cves/2.0` | Daily |
| MITRE ATT&CK | STIX JSON bundle on GitHub | Weekly |
| CISA KEV | `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` | Daily |

### KB Update Schedule

- Background sync daily at 03:00 (after retention cron)
- Pulls only CVEs published in the last 90 days on each run
- Full resync available manually from Configuration
- KB size stays small: 90-day rolling window, ~5-15MB

### KB → LLM Context Injection

Before each LLM analysis run, query the KB for CVEs matching the candidate's source type and event fields. Inject top 5 matches as additional context in the prompt:

```
Recent vulnerabilities relevant to this pattern:
- CVE-2025-XXXX: [title] — [affected products]
- ...
```

This keeps the model's CVE knowledge current without retraining.

---

## Noise Advisor UI

### Location

New tab in the SIEM navigation bar: **SIEM > Noise Advisor**

### Views

**1. Candidates list** — table of pending noise candidates
- Columns: Pattern, Source, Daily Avg, Confidence (HIGH/MEDIUM badge), CVE Safe (green check / red warning), LLM Explanation, Action buttons
- Filter by: confidence, CVE safety, status
- Bulk approve / bulk reject

**2. Auto-suppression settings** — inline panel at top
- Toggle: Suggest only / Auto-create (high confidence) / Auto-create (all)
- "LLM Analysis" toggle — enable/disable LLM checking
- "LLM Run Trigger" toggle — Auto / Manual
- Model selector: dropdown with Phi-3.5 Mini (default), Qwen2.5 1.5B, Llama 3.2 3B, Custom GGUF
- Custom GGUF: file picker button, shows selected path
- Model status: installed version, update available badge, download button
- "Run Analysis" button — visible always, primary action when trigger is set to Manual

**3. Activity log** — list of auto-created and manually approved suppressions with undo button (30-day window)

### States

- **Not enough data yet** — shows progress bar toward 7-day / 10,000-event threshold, whichever is closer
- **Candidates ready, LLM not installed** — shows candidates with "Download model to enable CVE safety check" prompt
- **LLM analyzing** — spinner per candidate row, non-blocking
- **LLM unavailable** (low memory / error) — candidates shown without LLM column, warning banner

---

## Configuration

New keys in `user_settings`:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `noise_auto_suppress` | enum | `off` | Auto-suppress behavior |
| `noise_llm_enabled` | boolean | `true` | Enable LLM analysis |
| `noise_llm_trigger` | enum | `manual` | `auto` or `manual` — when LLM runs |
| `llm_model` | enum | `phi-3.5-mini-q4` | Active managed model |
| `llm_custom_model_path` | string | `null` | Path to custom GGUF file (overrides `llm_model` if set) |
| `noise_min_score` | integer | `40` | Minimum score to surface candidates |
| `noise_learning_days` | integer | `7` | Learning period in days |
| `noise_learning_events` | integer | `10000` | Learning period in events |
| `kb_auto_update` | boolean | `true` | Auto-update vulnerability KB |

---

## Security Considerations

- LLM runs entirely locally — no event data leaves the machine for LLM analysis
- KB sync uses HTTPS to public feeds only — no authentication required, no sensitive data sent
- Auto-created suppression rules are audit logged — same trail as manually created rules
- CVE-flagged candidates cannot be auto-suppressed — hard block regardless of user settings
- Model integrity verified by SHA-256 before first use and after updates
- KB database is read-only during LLM inference — no write access from LLM process

---

## What Does NOT Change

- Existing detection_rules table schema — suppression rules created by this system use the same table
- Existing Detection Rules UI — auto-created rules appear there like any other rule, labeled `[Auto]`
- Existing alert pipeline — noise analysis is a background process, never touches the hot ingest path
- Web app users — Noise Advisor panel is available in the web app but LLM features show "Desktop app required" (LLM only runs in Electron)

---

## Build Phases

### Phase 1 — Noise analysis + suggestions UI (no LLM)
- `noiseCron.js` scheduled job
- `noise_candidates` table
- `/api/siem/noise` routes (GET candidates, PATCH status, POST approve-bulk)
- Noise Advisor UI — candidates list, settings, activity log
- Auto-suppress logic + audit log entries

### Phase 2 — LLM integration
- `llmWorker.js` IPC handler in Electron
- Model download + update flow
- LLM prompt + response parsing
- CVE safety flag in UI

### Phase 3 — Vulnerability KB
- SQLite KB schema
- NVD + MITRE + CISA feed sync
- KB → prompt context injection
- Manual resync in Configuration

---

## Out of Scope

- Fine-tuning or retraining the model locally
- Sending event data to any external LLM API for noise analysis
- Mobile/web LLM features (desktop only)
- Real-time noise detection (batch analysis only, daily cadence)
