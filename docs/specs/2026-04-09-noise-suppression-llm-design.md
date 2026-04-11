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

For each unique `(source, event_category, event_id, process_name, username, host)` combination in the past 7 days (having > 10 events/day average):

| Signal | Weight |
|--------|--------|
| Fires > 50 times/day on average | +30 |
| Fires > 20 times/day on average | +15 |
| Fires at consistent time intervals (stddev < 5 min within hour) | +25 |
| Zero analyst actions taken (no case, no alert acknowledgement) | +20 |
| Grouped by host (consistent host) | +15 |
| No high/critical severity events in 30 days for this category | +10 |

`field_signature` JSONB stores: `source`, `event_category`, `event_id`, `process_name`, `username`, `dominant_severity` (computed via `MAX(CASE severity...)` array lookup — avoids slow ordered-set aggregates).

Suppression rules created from candidates use `match_category + match_event_id + match_process + match_username` — intentionally excludes `match_host` so rules target the specific process/event pattern rather than a host-scoped blanket suppression.

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
  suppression_rule_id INTEGER,         -- FK to detection_rules (SERIAL id) if created
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

| Model | Key | Size | Template | Download URL |
|-------|-----|------|----------|--------------|
| Phi-3.5 Mini Q4 | `phi-3.5-mini-q4` | ~2.2GB | phi | `0xKudoX/noise-advisor-models` HuggingFace |
| Qwen2.5 1.5B Q4 | `qwen2.5-1.5b-q4` | ~1GB | qwen | `0xKudoX/noise-advisor-models` HuggingFace |
| Llama 3.2 3B Q4 | `llama-3.2-3b-q4` | ~2GB | llama | `0xKudoX/noise-advisor-models` HuggingFace |
| Custom GGUF | filename | user-provided | user-selected | Browse local or paste URL |

All three managed models confirmed working in v1.2.45-beta.4. Managed models hosted at `https://huggingface.co/0xKudoX/noise-advisor-models`.

The active model is selected in Configuration > Tuning Center Models. Switching models unloads the current model and loads the new one on next analysis run.

**Custom GGUF (v1.2.45-beta.4):** User selects a template family (Phi / Qwen / Llama) from a dropdown before browsing or downloading. Template family is stored in the model library entry and passed to `llmProcess.js` at inference time. The browse dialog uses `dialog.showOpenDialog` via `llm:browse-gguf` IPC -- file input `.path` does not work in packaged Electron.

### Chat Template Families (v1.2.45-beta.4)

Each model family uses a different chat template format. `llmProcess.js` selects the correct template and stop triggers based on `templateFamily` (explicit, from library) or `modelKey` prefix (managed models):

| Family | System token | User token | End token | Stop triggers |
|--------|-------------|-----------|-----------|---------------|
| phi | `<\|system\|>` | `<\|user\|>` | `<\|end\|>` | `['<\|end\|>', '<\|user\|>', '<\|system\|>']` |
| qwen | `<\|im_start\|>system` | `<\|im_start\|>user` | `<\|im_end\|>` | `['<\|im_end\|>']` |
| llama | `<\|start_header_id\|>system` | `<\|start_header_id\|>user` | `<\|eot_id\|>` | `['<\|eot_id\|>']` |

### LLM Run Trigger

Controlled by user toggle `noise_llm_trigger`:

- `auto` — LLM runs automatically when Noise Advisor tab is opened and unanalyzed candidates exist
- `manual` — LLM only runs when user clicks "Run Analysis" button

Default: `manual` — avoids unexpected memory usage on first open.

### llama.cpp Integration

The LLM runs in a **fully isolated Node.js child process** (`llmProcess.js`) forked from `llmWorker.js` via `child_process.fork()`. It is **never** loaded on startup — only triggered by the above conditions.

After analysis completes the child process exits and memory is freed. The ~3GB RAM spike is temporary. If the child crashes, the Electron app is unaffected.

**Why isolated child process:** node-llama-cpp's native CUDA/Vulkan binaries crash when loaded in the Electron main process on some systems. Running in a separate Node.js process completely isolates native failures. The child communicates via IPC messages (`process.send` / `process.on('message')`).

**GPU:** Currently forced CPU-only (`NODE_LLAMA_CPP_GPU=false`) because the prebuilt CUDA binary was incompatible with this system's configuration and Vulkan failed with `ErrorOutOfHostMemory` on the D3D12 adapter. CUDA support is planned once the native binary issue is resolved.

**Inference approach:** Uses `LlamaCompletion.generateCompletion()` (not `LlamaChatSession`) with a pre-formatted Phi-3.5 chat template embedded in the prompt string. `LlamaChatSession` triggers Jinja template token resolution which crashes on this environment. Stop triggers `['<|end|>', '<|user|>', '<|system|>']` prevent the model from generating past the JSON response.

**Per-candidate write-back:** Each result is written to the server immediately via `PATCH /candidates/:id/llm-result` as soon as it arrives in `onCandidateResult`, not in a batch at the end. This means results survive navigation away from Noise Advisor mid-run.

**Global progress banner:** A `LlmAnalysisBanner` component in `TopNav.jsx` listens for `llm:status-change`, `llm:analysis-started`, and `llm:candidate-result` events. It shows an amber progress bar with percentage complete and a Cancel button, visible on all SIEM views while analysis runs. Cancel kills the child process immediately.

**All node_modules unpacked from asar:** `electron-builder.yml` uses `asarUnpack: ["node_modules/**", "llmProcess.js"]` so the forked child process can resolve ESM imports from the filesystem (required by node-llama-cpp v3).

**IPC channels:**
- `llm:analyze` — send candidates for analysis, returns explanation + CVE safety verdict
- `llm:status` — returns `idle | loading | running | unavailable`
- `llm:download-model` — triggers model download with progress events
- `llm:check-update` — checks GitHub releases for newer model version
- `llm:cancel` — cancel in-progress analysis, kills child process

**Push events:**
- `llm:status-change` — emitted on every status transition
- `llm:candidate-result` — emitted per candidate as results arrive
- `llm:analysis-started` — emitted when run begins, carries `{ total }` count
- `llm:download-progress` — emitted during model download
- `llm:update-available` — emitted on startup if managed model has newer version

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

## Phase 4 — Vulnerability Knowledge Base

### Purpose

Supplement the LLM's training cutoff with recent CVEs and attack patterns. The KB is used as context injected into the LLM prompt, not as a fine-tuning dataset (fine-tuning a 3.8B model locally is not practical).

### Storage

PostgreSQL table on the VPS — same database as all other SIEM data. This allows all users (web and Electron) to benefit from the KB, and positions the server to query it directly for Phase 5 real-time analysis without needing to push KB data to Electron.

```sql
CREATE TABLE vuln_kb (
  id TEXT PRIMARY KEY,               -- CVE-YYYY-NNNNN or MITRE technique ID (e.g. T1059)
  source TEXT NOT NULL,              -- 'nvd' | 'mitre' | 'cisa'
  title TEXT,
  description TEXT,
  severity TEXT,                     -- 'critical' | 'high' | 'medium' | 'low' | 'none'
  cvss_score NUMERIC(4,1),
  affected_products JSONB,           -- array of product/vendor strings
  attack_patterns JSONB,             -- array of process names, event IDs, categories to watch for
  published_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX vuln_kb_source_idx ON vuln_kb(source);
CREATE INDEX vuln_kb_published_idx ON vuln_kb(published_at);
```

**No per-user isolation** -- the KB is global, shared across all users on the platform. CVEs are public data.

### Data Sources (free, no API key required)

| Source | Feed | Update frequency | Notes |
|--------|------|-----------------|-------|
| NVD | `https://services.nvd.nist.gov/rest/json/cves/2.0` | Daily | 90-day rolling window, ~3,000-5,000 entries |
| MITRE ATT&CK | STIX JSON bundle on GitHub | Weekly | Filtered to relevant fields, ~2-5MB |
| CISA KEV | `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` | Daily | Full catalog ~1,200 entries, ~1MB |

**Estimated total DB size: 10-20MB** -- trivial for PostgreSQL.

### KB Sync

A `kbCron.js` module runs on the VPS server alongside `noiseCron.js`:

- Daily sync at 03:30 (after noise cron at 02:30, after retention cron)
- NVD + CISA: pulls only entries published/updated in the last 90 days per run
- MITRE: full bundle re-sync weekly (Tuesdays), incremental update check daily
- Upserts on `id` -- re-syncing an existing entry updates `updated_at` but does not duplicate
- Old NVD/CISA entries outside the 90-day window are purged on each run
- MITRE entries are never purged (techniques don't expire)
- Manual full resync available via `POST /api/siem/kb/sync` (admin only)

### KB → LLM Context Injection

The existing `/api/siem/noise/context` endpoint (used by `llmProcess.js` before each candidate analysis) is extended to also query `vuln_kb` for relevant entries:

```
GET /api/siem/noise/context?event_category=X&source=Y&process_name=Z
```

Returns both analyst decision context (existing) and KB matches (new). The `llmProcess.js` child injects both into the system prompt:

```
Recent vulnerabilities relevant to this pattern:
- CVE-2025-XXXX (Critical, CVSS 9.8): [title] — affects [products]
- T1059.001 (MITRE): PowerShell execution — commonly used for lateral movement
```

**Matching logic:**
- Match `attack_patterns` JSONB against candidate `event_category`, `process_name`, `event_id`
- Prefer CISA KEV matches (actively exploited) over NVD-only matches
- Limit to 5 most relevant entries to stay within context window
- If no KB matches, omit the section entirely (don't inject empty context)

### Configuration UI

New section in Configuration > Tuning Center:

- KB status: last sync time, entry counts per source, total entries
- "Sync Now" button -- triggers manual resync
- KB entry count and last updated shown per source

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

### Phase 3 — Analyst Decision Learning — v1.2.45-beta.2 (CONFIRMED WORKING 2026-04-11)

The LLM currently makes decisions in isolation with no awareness of past analyst judgements. This phase feeds analyst decisions back into the prompt as context so the model improves over time without retraining.

**Approach — RAG-style prompt injection:**

Before analyzing a candidate, query the DB for past decisions that are similar in pattern (same `event_category`, `source`, or `process_name`). Inject them into the system prompt as examples:

```
Past analyst decisions for similar patterns:
- fluent-bit / Event ID 5158 / nvcontainer.exe → APPROVED (safe to suppress)
  Analyst note: "Known NVIDIA overlay network activity, not a threat"
- fluent-bit / Event ID 1 / process → REJECTED
  Analyst note: "Too broad, keep monitoring"
- fluent-bit / Event ID 5158 / tailscaled.exe → APPROVED (safe to suppress)
  [Override] Analyst note: "Tailscale VPN keepalive traffic, safe"
```

The model uses these as few-shot examples to calibrate its verdict for the current candidate.

**Data sources for learning:**
1. **Approved noise candidates** — `noise_candidates` where `status = 'approved'`, including `field_signature`, `llm_explanation`, `llm_cve_note`
2. **Rejected noise candidates** — `status = 'rejected'`, same fields
3. **LLM override decisions** — `llm_cve_note LIKE '[Analyst override]%'` — analyst explicitly disagreed with the LLM verdict and provided a reason
4. **Active suppression rules** — `detection_rules` with `action = 'suppress'` and `description LIKE 'Approved from Noise Advisor%'` — these represent patterns the analyst has definitively classified as safe

**Similarity matching:**
- Exact match on `event_category` + `source` is most relevant
- Partial match on `process_name` if present
- Limit to 5-10 most recent/relevant examples to stay within context window
- Prefer override decisions — they carry explicit analyst reasoning

**Implementation:**
- New server endpoint `GET /api/siem/noise/context?event_category=X&source=Y&process_name=Z` — returns matching past decisions
- `llmProcess.js` fetches context before each candidate analysis (requires server URL passed via fork env)
- Context injected into system prompt before the candidate data
- Override notes (prefixed `[Analyst override]`) shown verbatim — they are the highest-signal examples

**Why this works without retraining:**
The model's base knowledge doesn't change, but it sees analyst-validated examples at inference time. A pattern that was previously flagged as unsafe but overridden by the analyst will be correctly identified as safe the next time it appears because the override note is in the prompt.

**Bugs fixed during implementation (v1.2.45-beta.1/beta.2):**
- `getAccessTokenSilently()` was throwing silently — wrapped in try/catch, defaults to empty string
- `/context` endpoint crashed with `could not determine data type of parameter $4` — fixed by casting `$4::text` in candidates query
- `/context` endpoint crashed with `could not determine data type of parameter $3` — fixed by casting `$3::text` in suppression rules query
- `fetchContext` timeout increased from 5s to 15s
- Token presence now logged in `llmWorker.js` at IPC call time for debugging

**Confirmed working log output:**
```
[child] Injecting analyst context: Past analyst decisions for similar patterns:
- file / fluent-bit / Event ID 11 / ... → APPROVED (safe to suppress)
[child] Injecting analyst context: Past analyst decisions for similar patterns:
- process / fluent-bit / Event ID 1 / ... → APPROVED (safe to suppress)
  [Analyst override] "fluent-bi...
```

### Phase 4 — Vulnerability KB — SHIPPED v1.2.46-beta.2+ (2026-04-11)
- `vuln_kb` PostgreSQL table + indexes (migration 006)
- `kbCron.js` — NVD (daily, 90-day window, 16,906 entries) + CISA KEV via NVD `?hasKev` (daily, 1,559 entries) + MITRE ATT&CK (weekly Tuesdays, 691 entries)
- `/api/siem/noise/context` extended to return `vulnKb` matches alongside analyst decisions
- `llmProcess.js` injects KB context into prompt, passes `kb_matches` array in IPC result
- Configuration UI: KB status table, Sync Now, amber banner during sync
- **Candidate detail modal** — click any candidate row to see full details, KB matches with NVD links, CVSS scores, `[KEV]` badge, Approve/Reject/Rescan actions
- **Rescan feature** — `POST /candidates/rescan` resets LLM fields to pending; Activity Log has checkboxes + bulk Rescan
- **Cancel download** — red Cancel button during any download, `llm:cancel-download` IPC
- **Remove deletes file** — Remove now deletes `.gguf` for all model types if file is in models directory
- **Key gotcha:** cisa.gov blocks VPS IPs — use NVD `?hasKev` flag (not `?hasKev=true`) to get KEV entries

### Phase 5 — Real-Time Event Analysis

Analyze incoming events as they are ingested and surface results in a dedicated Tuning Center dashboard tab. Distinct from batch noise candidate analysis — this runs on individual events as they arrive, not on patterns that have already been scored over 7 days.

**Trigger:**
- Events are analyzed as they arrive via the ingest pipeline
- `info` severity events are skipped entirely — they are noise by definition and not worth inference time
- `low`, `medium`, `high`, `critical` severity events are queued for LLM analysis

**Queue architecture:**
- A lightweight in-memory queue in `llmWorker.js` buffers incoming events
- Events are dequeued and analyzed one at a time (serial, same child process model as batch analysis)
- Queue drains in the background — does not block ingest
- If the LLM is already running a batch analysis, real-time events are held in queue until it completes
- Queue is capped at 100 pending events — oldest entries dropped if cap exceeded (prevents memory growth during high-volume bursts)

**IPC flow:**
- New server-side webhook or polling mechanism pushes new events to the Electron app
- `llm:realtime-event` IPC channel receives individual event objects
- `llmWorker.js` enqueues the event and processes when the child is free
- Results emitted via `llm:realtime-result` push event to the renderer

**Storage:**
- Results stored in a new `realtime_analysis` table on the VPS (not in `noise_candidates`)
- Schema: `id, user_id, event_id (FK siem_events), explanation, cve_safe, cve_note, analyzed_at`
- Rolling 7-day retention — old results purged by noiseCron
- `cve_safe: false` results are never auto-suppressed and are highlighted in the UI

**Tuning Center dashboard tab:**
- New "Live Analysis" tab in the Tuning Center navigation (alongside the existing candidates tab)
- Shows a live-updating table of recent analysis results: event time, source, category, process, severity, LLM verdict, CVE safe flag, explanation
- Auto-refreshes every 30 seconds
- Filter by: severity, cve_safe, time range
- `cve_safe: false` rows highlighted in red with the CVE note visible
- Events flagged as `cve_safe: false` offer a one-click "Create Alert Rule" shortcut

**Resource considerations:**
- Real-time mode recommended for smaller models (Qwen2.5 1.5B, Llama 3.2 3B) to avoid sustained GPU load
- A warning is shown in Configuration when real-time mode is enabled with a 7B+ model
- User can disable real-time analysis per-session from the Tuning Center or from Configuration

**Configuration:**
- New `user_settings` key: `noise_realtime_enabled` (boolean, default `false`)
- Toggle in Configuration > Tuning Center settings
- Only available in the Electron app (same restriction as batch LLM analysis)

### GPU Acceleration (NVIDIA CUDA) — v1.2.43

**Status:** CUDA binary compiled and bundled. `llmProcess.js` uses `gpu: 'cuda'`. Shipped in v1.2.43.

**System tested:** RTX 4060 Laptop, driver 595.79, CUDA 13.2, MSVC 19.44.35225.0, VS 2022 Community.

**Why the prebuilt binary fails:** node-llama-cpp ships prebuilt CUDA binaries compiled against older CUDA versions. CUDA 13.2 uses CCCL headers that require the MSVC standard conforming preprocessor (`/Zc:preprocessor`). The prebuilt cmake config does not pass this flag. `NoBinaryFoundError` is the symptom — node-llama-cpp cannot find a compatible prebuilt and reports failure. Vulkan fallback also fails with `ErrorOutOfHostMemory` on D3D12 adapter.

**Why env vars and cmake flags don't work:** `CXXFLAGS`, `CUDAFLAGS`, and `-DCMAKE_CUDA_FLAGS` do not reliably propagate into the nvcc `-Xcompiler` chain in the generated vcxproj. The only reliable fix is to set `$env:CUDAFLAGS="-Xcompiler=/Zc:preprocessor"` before the node-llama-cpp CLI build — this is what the working build used.

**Correct build procedure (must run in Developer PowerShell for VS 2022, Admin):**

```powershell
# 1. From cybertools root — download llama.cpp source
cd "C:\Users\lsgra\Desktop\claude projects\cybertools"
node node_modules/node-llama-cpp/dist/cli/cli.js source download --skipBuild

# 2. Set the preprocessor flag so nvcc accepts CCCL headers
$env:CUDAFLAGS="-Xcompiler=/Zc:preprocessor"

# 3. Build with CUDA via the node-llama-cpp CLI (handles Node headers automatically)
node node_modules/node-llama-cpp/dist/cli/cli.js source build --gpu cuda
```

**Why to use the node-llama-cpp CLI (not raw cmake):**
- Raw `cmake --build` fails on `llama-addon.vcxproj` with `node_api.h: No such file or directory` — Node.js headers are not on the cmake include path
- The node-llama-cpp CLI (`source build`) passes the correct Node headers automatically via `cmake-js`
- `source download --skipBuild` then `source build --gpu cuda` is the correct two-step sequence

**What NOT to do:**
- Do not use raw `cmake .. -DGGML_CUDA=ON` + `cmake --build` for the full build — Node headers missing
- Do not manually patch vcxproj before running `source build` — the CLI regenerates it and wipes patches
- Do not run in regular PowerShell — VS compiler not on PATH, cmake not found
- Do not run without Admin — symlink privileges required during build

**Output binaries** (in `node_modules/node-llama-cpp/llama/localBuilds/win-x64-cuda/Release/`):
- `llama-addon.node` — Node.js native addon (274KB)
- `ggml-cuda.dll`, `ggml-base.dll`, `ggml-cpu.dll`, `ggml.dll`, `llama.dll`

These are picked up automatically by node-llama-cpp and bundled into the installer via `asarUnpack: ["node_modules/**"]` in `electron-builder.yml`.

**Code changes (v1.2.42→v1.2.43):**
- `llmProcess.js`: `getLlama({ gpu: 'cuda' })` (was `gpu: false`)
- `llmWorker.js`: removed `NODE_LLAMA_CPP_GPU: 'false'` from fork env (now just `NODE_PATH`)

**Next steps for multi-arch / user distribution:**
- Rebuild with `-arch=sm_75;sm_80;sm_86;sm_89;sm_90` instead of `-arch=native` for wider GPU compatibility
- NSIS optional section checkbox for GPU component at install time
- CPU fallback detection at runtime if CUDA binary absent

### Future — Optional LLM Component Installer (NSIS)

The current build bundles `node-llama-cpp` and its native binaries unconditionally in `asarUnpack`. A future improvement would make the LLM runtime an optional install component using a custom NSIS section in `electron-builder.yml`:

- Single installer with a checkbox during setup: "Include LLM Noise Advisor (~500MB)"
- If unchecked, the `node-llama-cpp` native binaries are not extracted to disk
- If the user skips it at install time, a prompt in Configuration > Noise Advisor offers to install the component on demand (downloads and extracts the binaries at runtime)
- The rest of the app (SIEM, tools, all other Noise Advisor features) works normally without it
- LLM features show "LLM component not installed — Install now" instead of "Desktop app required"

This keeps the base installer lean for users who don't need LLM analysis while preserving full functionality for those who do. Implementation requires a custom NSIS script and a runtime extraction mechanism for the native binaries.

### Future — Automatic LLM Analysis on Schedule

Currently the user must manually click "Run LLM Analysis" after candidates are scored. A future improvement would run LLM analysis automatically as part of the nightly cycle so candidates are pre-analyzed by morning.

**Approach:** Add a `node-cron` job in Electron's `main.js` that triggers after the server-side scoring cron completes (e.g. 02:45). It calls `llmWorker.js` directly — no user action required. By the time the user opens Noise Advisor, every candidate already has an LLM verdict and explanation.

**Why Electron-side, not server-side:** `node-llama-cpp` is already wired into the Electron layer. Moving it to the server would require bundling the native binaries server-side and changing the inference architecture. Electron-side cron is the path of least resistance.

**UX change:** The manual "Run LLM Analysis" button becomes "Re-analyze" — useful when new candidates appear mid-day or after a manual scoring run. The default state is that analysis is already done.

**Dependency:** App must be running at 02:45. Could add a "Last auto-analyzed" timestamp to the Noise Advisor header so users know when it last ran.

---

## Out of Scope

- Fine-tuning or retraining the model locally
- Sending event data to any external LLM API for noise analysis
- Mobile/web LLM features (desktop only)
- Real-time noise detection (batch analysis only, daily cadence)
