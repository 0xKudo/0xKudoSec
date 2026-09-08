# 0xKudo Security Toolkit — Handoff

## What This Is

Unified cybersecurity tools platform at `0xkudo.com`. Monorepo — shared Express/React platform, 19+ isolated tool modules.

**Spec:** `docs/specs/2026-03-26-cybertools-platform-design.md`
**Plan:** `docs/plans/2026-03-26-cybertools-platform.md`

---

## Current Status

**All 19 tools complete. Auth complete. SIEM complete. Electron wrapper complete. Noise Advisor Phase 1 + Phase 2 + Phase 3 complete. Multi-model support complete. Vulnerability KB built and confirmed working in v1.2.46-beta.2+.**

---

### 2026-09-07 — DONE (local, UNDEPLOYED) — Dashboard rebuilt from legacy cards (Layne's 2nd review)

Layne's follow-up: restore the PRE-redesign dashboard layout (ref `public_html/portfolio-src/src/assets/siem-dashboard.png`),
kill duplicate widget headers, and port the legacy cards the first widget pass had stubbed. Built on `main`, shell builds clean, grid 9/9. NOT committed/deployed.
- **Duplicate headers:** `Widget.jsx` now renders its chrome bar (grip/title/remove) ONLY in customize mode; in view mode each panel owns its section label. No more doubled titles.
- **KPI combined + reflowing:** new `panels/KpiRow.jsx` = one widget (`kpi-row`) with `grid-template-columns: repeat(auto-fit, minmax(150px,1fr))` → 4-across / 2×2 / 1-col by width. Removed the 4 separate `kpi-*` widgets + `KpiStat.jsx`.
- **Alert Trend restored:** `panels/AlertTrend.jsx` rewritten with the legacy SparklineChart + 1h/6h/24h/48h/7d window pills (fed by `/api/siem/alerts/hourly?hours=`).
- **Event Insights re-added:** new `panels/EventInsights.jsx` = tabbed Top Event IDs / Failed Logins / Top Usernames / Rule Hits; row clicks broadcast `window` CustomEvent `siem-events-search`; `EventsExplorer` listens and sets its search (cross-widget drill-down).
- **Active Alerts list:** new `panels/AlertsList.jsx` = legacy left-panel mini-list (status chips, View All → alerts, click → ack modal).
- **AI Alert Analysis (Electron):** new `panels/AiAlertAnalysis.jsx` fed by `/api/siem/realtime/results`; empty-state until local AI analysis runs. In DEFAULT_LAYOUT only when `window.electron?.isElectron`.
- **Default layout** (`DashboardGrid.jsx`, electron-aware): kpi-row(w12) / alerts-list(left) + alert-trend+top-sources over event-insights(right) / recent-events(w12). +ai-alert-analysis under alerts-list on Electron.
- `TopSources` gained its "Top Sources" label. Deploy: shell-only, no migration.

### 2026-09-07 — DONE (local, UNDEPLOYED) — Customizable dashboard refinements (Layne's review)

All fixes below BUILT on `main`, shell builds clean, grid tests green (9/9). NOT committed, NOT deployed.
Deploy: shell-only → `git pull` + `npm run build --workspace platform/shell` + `pm2 restart cybertools-server`. No migration.
- **Item 1 DONE:** collapsed to ONE dashboard. `siemView === 'dashboard'` now renders `<DashboardGrid>`;
  removed the always-mounted legacy `SiemDashboard` wrapper + the `my-dashboard` branch/whitelist entry in
  App.jsx, `'/siem/my-dashboard'` from SIEM_VIEW_PATHS, the `my-dashboard` nav rows in SiemSidebar.jsx +
  TopNav.jsx, and the `SiemDashboard`/`SiemDashboardMobile` imports. `SiemDashboard.jsx` file kept but now unused.
- **Item 2 DONE:** severity-donut removed from dashboardWidgets.js, widgetRegistry, DEFAULT_LAYOUT; `SeverityDonut.jsx` deleted.
- **Item 3 DONE:** "(KPI)" stripped from the 4 KPI titles; `alert-queue` title → "Alert Queue".
- **Item 4 DONE:** DEFAULT_LAYOUT rebuilt — KPIs / alert-queue+top-sources / alert-trend (w12) / recent-events (w12 h8). Packs with no gaps.
- **Filter port (Layne asked for full):** new `dashboard/panels/EventsExplorer.jsx` — full slide-in FilterPanel
  (time/severity/category/source/columns/suppressed) + field-aware search + resizable-column table +
  event-detail modal w/ ProcessTreePanel + right-click ContextMenu + case create/add. Registered as the
  `recent-events` renderer (replaced the compact `RecentEvents.jsx`, which was deleted). recent-events
  min bumped to 6×6, def 12×8. Persists filters to the legacy `siem_filter_state` LS key.
- **Min-size clip fix:** DashboardGrid resize DRAG now floors at each widget's real minW/minH px (was flat 60px),
  so contents no longer clip mid-resize before snapping back. (clampToGrid already enforced mins on commit.)
- **ATT&CK widget technique click:** the `attack-coverage` widget rendered `<AttackCoverage />` with no
  `onSelectTechnique`, so cells were dead. Now it writes the clicked id to `localStorage['siem-restore-technique']`
  and calls `ctx.onNavigate('rules')`; DetectionRules reads+clears that key on mount → opens Sigma Rules filtered
  to the technique (same effect as the standalone ATT&CK sub-tab, which can't be reached from a widget).

<!-- ORIGINAL REVIEW NOTES (kept for reference) -->
Deployed dashboard reviewed live by Layne. All in the
`platform/shell/src/components/dashboard/` files + App/nav. Verify LIVE (no local test server).

**1. Collapse to a SINGLE dashboard — the customizable grid IS the "Dashboard" tab.**
- Problem: there are now two tabs, "Dashboard" (legacy `SiemDashboard`) and "My Dashboard"
  (the new `DashboardGrid`). Layne wants only ONE: the Dashboard tab should be the customizable grid.
- Remove the "My Dashboard" nav entry from BOTH `SiemSidebar.jsx` (the `{ id: 'my-dashboard' }` line
  in the VIEWS array ~L67) and `TopNav.jsx` SIEM_TABS (~L421). Remove `'/siem/my-dashboard'` from
  `App.jsx` `SIEM_VIEW_PATHS` (~L74).
- In `App.jsx` (~L487): make `siemView === 'dashboard'` render `<DashboardGrid onNavigate=… />` instead
  of `SiemDashboard`/`SiemDashboardMobile`. Drop the separate `siemView === 'my-dashboard'` branch and
  the `'my-dashboard'` entry from the fallback whitelist (~L498). `/siem` → 'dashboard' now shows the grid.
- **DECISION/RISK to confirm with Layne:** the legacy `SiemDashboard.jsx` has features the widget
  version does NOT yet have — the slide-in Filter panel (time range/severity/category/source/columns),
  the event-detail modal + Process Tree, column resize, and the alert sparkline drill-down. Replacing the
  Dashboard tab wholesale LOSES those unless ported. Options: (a) accept the loss for v1; (b) add a
  "recent events" widget with the filter/modal ported in; (c) keep legacy SiemDashboard reachable
  elsewhere. Recommend (a) for now, revisit in Phase 4/5. The old `dashboard` branch is currently
  "always mounted (hidden via CSS) so WS/intervals stay alive" — the grid's widgets self-poll, so that
  always-mounted wrapper can be dropped when swapping.

**2. Remove the Severity Breakdown donut widget entirely** (not used).
- Delete `severity-donut` from: `platform/shared/dashboardWidgets.js` WIDGETS, `dashboard/widgetRegistry.jsx`
  RENDERERS, and `dashboard/DashboardGrid.jsx` DEFAULT_LAYOUT (the `w6` entry). Optionally delete
  `dashboard/panels/SeverityDonut.jsx`. Server `sanitizeLayout` already drops unknown ids, so any saved
  layout still referencing it self-heals.

**3. Remove the "(KPI)" language from the KPI stat tiles.**
- In `platform/shared/dashboardWidgets.js`, the four KPI widget titles read "Active Alerts (KPI)",
  "Critical (KPI)", "High (KPI)", "Total Events (KPI)". Change to plain "Active Alerts", "Critical",
  "High", "Total Events". NOTE the resulting "Active Alerts" title collides with the `alert-queue`
  widget's title (also "Active Alerts") — rename `alert-queue` title to "Alert Queue" to disambiguate.

**4. Add Alert Trend + Top Sources to the DEFAULT layout** (widgets exist but aren't placed by default).
- In `dashboard/DashboardGrid.jsx` DEFAULT_LAYOUT, add entries for `alert-trend` and `top-sources`
  (both already in the registry). Suggested: after removing the donut, place `top-sources` where it was
  (x:6-ish) and `alert-trend` in a wide row under the KPIs. Re-check the whole default grid packs without
  gaps (or just call the layout through `resolve` mentally). Confirm with Layne this is "add", not "the
  default is fine and these should be optional-only".

**Deploy after fixing:** shell-only (unless registry/server sanitize changes need nothing new) →
`git pull` + `npm run build --workspace platform/shell` + `pm2 restart cybertools-server`. No new migration.

### 2026-09-08 — DONE + DEPLOYED: Customizable dashboard widgets (Phases 1-3)

**DEPLOYED to VPS 2026-09-08** (HEAD `0c8ef39`): migration ran as superuser (`sudo -u postgres psql -d
cybertools -f db/migrations/2026-09-08-dashboard-layouts.sql` → table owned by cybertools_app, RLS
enabled+forced, user_isolation policy), `npm install` (animejs), shell rebuilt, pm2 restarted, health 200,
`/api/siem/dashboards/default` returns 401 unauth (mounted). See "TO FIX" block ABOVE for Layne's review notes.

Executed `docs/plans/2026-09-08-customizable-dashboard-impl.md` inline on `main` (7 tasks).
Decisions: anime.js v4 (per spec), single default layout but tool widgets IN v1, first pass = Phases 1-3.
Checkpoint after each task = commit + HANDOFF/memory update. Verify LIVE (no local test server).

- **Task 1 DONE (`7a722f9`, not deployed):** `npm i animejs@^4.5.0` in `platform/shell` (exports
  `createDraggable`/`createScope` confirmed) + `platform/shared/dashboardWidgets.js` (shared widget
  metadata: `GRID{cols12,rowH46,gap10}`, `MAX_WIDGETS=24`, `WIDGETS[]` incl. `tool-panel`, `isKnownWidget`).
- **Task 2 DONE (`b02ae50`, not deployed):** `platform/shell/src/components/dashboard/grid.js` — pure
  geometry (`cellRect`/`pxToCell`/`cellW`) + reflow (`overlaps`/`clampToGrid`/`pushDown`/`compactUp`/
  `resolve`/`stackForMobile`), 9 unit tests green (`grid.test.js`). No React, runs in node.
- **Task 3 DONE (`a1a3dfd`, not deployed):** 5 self-fetching panels in
  `dashboard/panels/` — `KpiStat` (metric prop: active→alerts/counts status new, else stats
  critical/high/total), `SeverityDonut` (by-severity + copied SVG donut), `TopSources`
  (by-source {host,count}), `RecentEvents` (recent, compact Time/Sev/Host/Message, read-only),
  `AlertTrend` (alerts/trend {day,count} → daily bars). Each polls on its own interval. No jsdom in
  shell so no unit test — build-clean + live check. Field names: COL_FIELDS timestamp/severity/host/message.
- **Task 4 DONE (`1e79a94`, not deployed):** `dashboard/widgetRegistry.jsx` — `renderWidget(entry, ctx)`
  maps 13 widgetIds to live components (KPIs, donut, sources, recent, trend, AlertQueue, Cases, LogSearch,
  AttackCoverage, tool-panel). Unknown id → "Unavailable widget" placeholder. `tool-panel` replicates
  App.jsx's dynamic `import(../../../../tools/${toolId}/client/index.jsx)` loader (local, avoids circular
  import); toolId picker deferred to Phase 5. NOTE: AlertQueue/Cases/LogSearch have NO `embedded` prop —
  rendered as-is (their own header shows under the widget title bar); trimming = Phase-5 polish.
- **Task 5 DONE (`941c3be`, not deployed):** static widget grid in VIEW MODE. `dashboard/Widget.jsx`
  (positioned frame, title bar, `data-widget-id`, drag-grip/resize-handle/× hidden until edit mode,
  reduced-motion aware) + `dashboard/DashboardGrid.jsx` (owns layout, `ResizeObserver` → boardW,
  `cellRect` positioning, `stackForMobile` under 720px, exports `DEFAULT_LAYOUT`). Wired as ADDITIVE
  SIEM view `my-dashboard` — App.jsx branch + `SIEM_VIEW_PATHS['/siem/my-dashboard']` + nav entries in
  BOTH `SiemSidebar.jsx` and `TopNav.jsx` SIEM_TABS. Existing `dashboard` view untouched. LIVE-CHECK:
  open SIEM → My Dashboard, widgets render live data; resize window; shrink <720px = single column.
- **Task 6 DONE (`e5c241d`, not deployed):** customize mode in `DashboardGrid.jsx`. Customize/Done toggle
  + Add-widget select (disabled at MAX 24) + Reset layout + Saving/Saved indicator. **MOVE = anime.js**
  `createScope`+`createDraggable` (trigger=drag grip, container=board, `onSettle`→commit by reading real
  rect → `pxToCell` → `resolve` → setLayout + clear transform). **RESIZE = native pointer** on the corner
  handle (anime translates, can't resize a parent — flagged deviation): live px width/height, commit
  rounds to grid units. Scope rebuilt on `editing`/`boardW`/idsKey change; `scope.revert()` on cleanup.
  DashboardGrid now optionally takes `layout`/`setLayout`/`saving` props (Task 7 wires the hook; falls
  back to local state). anime.js v4 API confirmed: options trigger/container/containerPadding/snap,
  callbacks onRelease/onSettle. NOT drag-tested live yet — the release-commit + transform-clear + scope
  rebuild interplay is the risk area; eyeball drag/resize/reflow in the running app.
- **Task 7 DONE (`99671ca`, not deployed) — ALL PHASES 1-3 COMPLETE:** `db/migrations/2026-09-08-dashboard-layouts.sql`
  (table + `user_isolation` RLS + owner/grant guards) + folded into `db/schema.sql`. Endpoints in `siem.js`:
  GET/PUT/DELETE `/api/siem/dashboards/:name` with server-side `sanitizeLayout` (drops unknown widgetIds,
  clamps geometry, MAX 24). `useDashboardLayout` hook (localStorage-first, server-hydrate, debounced 800ms
  PUT) wired into DashboardGrid (replaces local state; shows Saving/Saved). 2 endpoint tests pass.
  ⚠️ `platform/server/tests/` is GITIGNORED — `dashboards.test.js` exists locally but is NOT committed.

**DEPLOY (whole feature, server + shell + MIGRATION):** on VPS as superuser, run the migration BEFORE restart:
`psql "$DATABASE_URL" -f db/migrations/2026-09-08-dashboard-layouts.sql` → `git pull` → `npm run build --workspace platform/shell` → `pm2 restart cybertools-server`. Commits to push: `7a722f9,b02ae50,a1a3dfd,1e79a94,941c3be,e5c241d,99671ca`.

**RUN SERVER TESTS CORRECTLY:** `npm run test --workspace=platform/server -- <name>` (NOT `npx vitest` from
root — that skips `platform/server/vitest.config.js`+`setup.js` and every db-mocked test spuriously fails).
Correcting an earlier note: siem-routes has **1** real pre-existing failure (`/api/siem/stats` "returns stats
shape" — mock response consumed before the stats query), not 4; unrelated to this work.

**LIVE-TEST CHECKLIST (My Dashboard):** widgets render live data; Customize → drag (anime.js) with
push-down/compact-up reflow; corner resize (native pointer); add/remove/reset; reload persists (localStorage
+ server); <720px stacks read-only. Drag-commit + transform-clear + scope-rebuild is the untested risk area.
  static grid as additive "My Dashboard" SIEM view → anime.js customize mode → `dashboard_layouts` table
  (RLS) + endpoints + debounced persistence. Task 7 needs a VPS migration run BEFORE server restart.

### 2026-09-08 — DONE: Alerts/Suppression pagination + ATT&CK matrix click fix (deployed thru e652cb4)

- **Alerts & Suppression rows-per-page + paginator** (`DetectionRules.jsx`, commit `3e67de3`, NOT yet
  deployed): client-side pagination over the in-memory `filteredRules` list (these tabs load all rules
  from `/api/siem/rules` and filter locally, unlike Sigma Rules which pages server-side). Rows selector
  10/25/50/100 (default 10) + numbered paginator via a shared `pageWindow` helper (mirrors RuleLibrary).
  `renderPager()` is reused in both the desktop table and mobile card layouts. Page resets to 1 on
  tab/search/severity/pageSize change (`useEffect`). Build compiles clean.
- **ATT&CK coverage matrix click fix** (`platform/server/routes/siem.js` catalog technique filter,
  commit `e652cb4`, DEPLOYED — VPS `main` at `e652cb4`, pm2 restarted, health 200): the technique
  filter was an exact array match, so clicking a parent technique (T1059) in the matrix missed all its
  sub-technique rules (T1059.001) and vice versa — rules are tagged at mixed granularity. Now
  hierarchical: `EXISTS (unnest(attack_techniques) tt WHERE tt = $p OR tt LIKE $p||'.%' OR $p LIKE tt||'.%')`.
  Verified live: T1059 91→338, T1021.001 15→25 matching rules.
- **Known pre-existing failure (NOT mine):** `platform/server/tests/siem-routes.test.js` has 4 tests
  failing with `vi.mocked(pool.query).mockResolvedValueOnce is not a function` (e.g. events/by-severity,
  sources). Fails identically on baseline; a test-setup/isolation issue in the shared db mock
  (`tests/setup.js` mocks `services/db.js` via `vi.hoisted`), not a product bug. Fix separately.

### 2026-09-08 — DONE: Sigma Rules reorg + ATT&CK tab + rows-per-page + download icon (items 1 & 2)

Built this session and DEPLOYED (commit `2ca6077`, VPS `main`, shell rebuilt, pm2 restarted, health 200).
Item 3 (dashboard widgets) still TO PLAN — see block below.

- **Item 1 — Detection Rules reorg (`DetectionRules.jsx`, `RuleLibrary.jsx`):**
  - Sub-tab "Rule Library" → **"Sigma Rules"**; panel header `SIEM / Rule Library` → `SIEM / Sigma Rules`.
    Legal/prose copy left as-is (kept "Sigma Rule Library").
  - **Rows-per-page selector** added to the paginator row in `RuleLibrary` (10/25/50/100, **default 10**).
    `limit` now lives in `filters` state; `loadCatalog` sends `filters.limit` instead of hardcoded `50`;
    changing it auto-reloads to page 1 (existing filters→loadCatalog effect) and the server recomputes
    `total_pages` from the new limit, so page numbers stay correct.
  - **ATT&CK Coverage moved to its own sibling sub-tab** after Sigma Rules. `AttackCoverage` was extracted
    from inside `RuleLibrary` (its `#attack-coverage` section removed) and is now rendered directly in
    `DetectionRules` under `tab === 'attack'`. Tabs are now: Alerts | Suppression | Sigma Rules | ATT&CK Coverage.
  - **Technique-click wiring preserved cross-tab:** clicking a technique in the ATT&CK tab sets
    `sigmaTechnique = { id, nonce }` in `DetectionRules` and switches to the Sigma Rules tab; `RuleLibrary`
    takes a new `techniqueFilter` prop and a `useEffect` on its `nonce`/`id` sets `filters.technique`,
    which auto-reloads the catalog filtered to that technique.
- **Item 2 — Download icon:** replaced the literal `↓` glyph with Lucide `<Download>` in
  `TopNav.jsx` (`↓ Desktop App` → icon + "Desktop App", anchor made inline-flex) and
  `LandingPage.jsx` hero CTA (`↓ Download for Windows` → icon + label). Icon uses `currentColor`
  so it follows the existing hover color-swap.
- **NOT verified in the running authenticated app** (SIEM is behind Auth0; preview drops the session).
  Landing icon is public. Eyeball both in a normal browser after deploy.

### 2026-09-08 — TO PLAN (next account) — dashboard widgets (item 3)

Requested by Layne; NOT yet built. Plan + implement. (Items 1 & 2 above are now DONE.)

**1. Detection Rules → "Sigma Rules" reorg + pagination — ✅ DONE (see block above)**
- Problem: the Detection Rules view's Rule Library sub-tab shows a very long rule list, and the
  ATT&CK coverage matrix is buried at the very bottom of that same list.
- **Rename "Rule Library" → "Sigma Rules"** in the UI: the sub-tab label
  (`DetectionRules.jsx:329`) and the panel header (`RuleLibrary.jsx:348`, currently
  `SIEM / Rule Library`). Leave legal/prose copy (PrivacyPage, SecurityPage, LandingPage) as a
  judgment call — probably keep "Sigma Rule Library" there.
- **Page-size filter on Sigma Rules:** `RuleLibrary.jsx` paginates server-side with a hardcoded
  `limit: '50'` (`loadCatalog`, ~line 244) and a `page` state (line 214); paginator window is
  `getPageWindow` (~line 68), Prev/Next at ~line 518. Add a rows-per-page selector
  (e.g. 10/25/50/100), **default 10**, wired into the fetch limit, and make the paginator recompute
  total pages from `total`/`limit` so page numbers stay correct when the size changes.
- **Move the MITRE ATT&CK coverage matrix to its own SIEM sub-tab AFTER "Sigma Rules".** Today
  `AttackCoverage` is rendered *inside* `RuleLibrary` (`RuleLibrary.jsx:543`), which is why it sits
  below the list. Extract it: add a new sub-tab in `DetectionRules.jsx` (the `tab` state +
  `tab === 'library'` switch at line 333) — e.g. tabs become Detection Rules | Sigma Rules |
  ATT&CK Coverage — and render `<AttackCoverage />` in the new tab instead of nested in RuleLibrary.
  Confirm the technique-click → CVE/rule wiring (`RuleLibrary.jsx:543` onSelectTechnique) still works
  once it's a sibling, not a child.

**2. Desktop-app download button icon — ✅ DONE (see block above)**
- The "↓ Desktop App" button uses a literal `↓` glyph that looks bad. Replace with a proper icon
  (Lucide `Download` is already the icon set in use — see `lucide-react` imports in `TopNav.jsx`).
  Spots: `TopNav.jsx` (~line 335, the `↓ Desktop App` link) and `LandingPage.jsx` (the
  `↓ Download for Windows` hero CTA). Keep it a clean single icon + label.

**3. Customizable dashboard (widgets) — already spec'd, still unbuilt**
- The Field plan's remaining feature: make the SIEM dashboard elements user-composable widgets
  (add/move/resize on a grid, saved per user). Full spec exists at
  `docs/specs/2026-09-08-customizable-dashboard.md` (anime.js Draggable, push-down/compact-up reflow,
  `dashboard_layouts` table with RLS-at-creation). This is the big remaining piece and where anime.js
  finally gets pulled in (deliberately deferred from Phase 7).

### 2026-09-08 — Field redesign: Phase 4 display-face (kept + extended) + amber-cleanup

Commit `7a16032` (local main). Deploy pending. `b9cc1f8` (SIEM view titles, deployed) signed
off by user → extended + amber hardcodes converted.

- **Display face extended to all 19 tool page titles** (`tools/*/client/index.jsx`
  `title` style → `fontFamily: 'var(--font-display)'`). SIEM view titles already done in
  `b9cc1f8`. Archivo Expanded @import loads 600/700/800, so `fontWeight:normal` titles render at
  the nearest loaded weight (600) — intentional, reads as display-grade.
- **ATT&CK coverage heat ramp** (`AttackCoverage.jsx`): was hardcoded amber `rgb(217,119,6)`; now
  `color-mix(in srgb, var(--accent-amber) N%, transparent)` → petrol AND theme-aware (accent
  differs light/dark). This was the user-reported "matrix cards not updated" issue.
- **Amber → token cleanup** (fixes light mode; all were dark-correct hardcodes):
  - `App.jsx` Electron loading splash → Field tokens + `[ 0xKudo ]` Archivo wordmark, Fira Code labels.
  - `SiemDashboard` `SEV_COLOR_HEX` map + alert-trend "recent" bar fill → tokens/accent (SVG fill
    accepts var() in Chromium).
  - `SiemDashboardMobile` `sevColor()` + `SEV_COLOR_HEX` maps → tokens; active pill text `#111110`
    → `var(--bg-primary)`.
  - `Sidebar`/`SiemSidebar` `STOPPED` status, `SiemConfiguration` agent-status colors + warning box,
    `LogSources` warning box → `var(--severity-*)` / color-mix.
  - `theme.css` `.kudo-table tr.flagged` tint → `color-mix(var(--severity-high) 6%)`.
- Shell build compiles clean. Not screenshot-verified in the authenticated app (preview auth drops).

### 2026-09-08 — Field redesign: Phase 6 (badges) + Phase 7 (motion, CSS) + payload-gen button fix

Commit `496213f` (local main). Deploy pending.

- **Payload Generator Generate button** (`tools/payload-generator/client/index.jsx`): was
  full-width — it's a `<Button>` that's a stretching flex child. Added
  `style={{ alignSelf: 'flex-start' }}` so it hugs content, matching the reverse-shell tool.
  No max-width was involved.
- **Phase 6 — Badge centering** (`ui/Badge.jsx` + `theme.css`): `BASE` switched from inline-flex
  to **inline-block** + `text-align:center` + biased padding (`3px 7px 2px`) as the all-engines
  fallback; the `Badge` component now carries `className="kudo-badge"`. `.kudo-badge` in theme.css
  gained the root-cause fix under `@supports (text-box-trim: trim-both)`
  (`text-box-trim:trim-both; text-box-edge:cap alphabetic` + symmetric padding with `!important`
  to beat the component's inline biased padding on supporting engines). Standalone `badgeStyle()`
  users (SIEM `sevBadge`) get the biased-padding fallback (no class) — acceptable; full
  single-source-of-truth would mean adding the class at every badge site (deferred).
- **Phase 7 — motion, CSS-only (anime.js deliberately NOT used** — user chose CSS to avoid the
  planned theme-toggle stale-inline-color footgun; anime.js reserved for the dashboard drag
  feature): (1) `.kudo-btn--primary:hover` now **inverts solid→outline** (was `filter:brightness`),
  `--btn-primary-bg` border added so the rest state has a visible edge; (2) `.kudo-table tbody
  tr:hover .kudo-badge` **soft-fills** via `color-mix(in srgb, currentColor 14%, transparent)` —
  low-opacity severity tint, no strobing; (3) nav tabs (`TopNav` `appTab` + `rowStyles.tab`, both
  main nav and category/tool bars) get a **smooth underline-in on hover** (transition on
  border-color + `borderBottomColor` set in the existing mouseEnter/Leave handlers). All
  token/currentColor based — theme-toggle safe.
- **Verification:** shell build compiles clean; landing renders. Authenticated app (TopNav +
  in-context badges) NOT screenshot-verified — preview kept dropping the Auth0 session this
  session; eyeball in a normal browser.

### 2026-09-08 — Field redesign: WHOLE-APP THEME (Phases 2-3) committed `e8c9922`

**Promotes the Field identity from landing-only to the entire app.** Commit `e8c9922`
(local main, pushed by user; VPS deploy pending/in-progress).

- **theme.css (Phase 2):** global `:root` (dark) and `[data-theme="light"]` tokens swapped
  to Field (warm ink-night / warm paper); light severity + accent retuned. `--accent-amber`
  name kept, revalued to petrol; focus ring → accent. `--font` → Archivo, added
  `--font-display` (Archivo Expanded) + `--font-mono` (Fira Code); `.kudo-table` → mono.
  The `.field-scope` landing block still exists but is now redundant (identical to global) —
  harmless, left in place.
- **Mono-for-data sweep (Phase 3):** data surfaces repointed to `var(--font-mono)` so machine
  data stays monospace while UI chrome is Archivo — event/log/alert/rule tables, KPI values,
  search inputs, event-detail `fieldValue`s, ATT&CK `cellId`/`cellCount`, process trees.
  Files: SiemDashboard, SiemDashboardMobile, AlertQueue, LogSearch, LogSources, Cases,
  AuditLog, DetectionRules, RuleLibrary, TuningCenter, AttackCoverage, ProcessTreePanel,
  Dashboard, DashboardMobile.
- **NOT done — Phase 4** (display-face `--font-display` on SIEM view titles / page H1s):
  deliberately deferred; those titles are small 13px breadcrumbs and Archivo Expanded may look
  heavy — decide visually first.
- **Verification caveat:** the mono sweep was NOT visually confirmed against populated data this
  session (local DB/auth/preview-port friction). theme.css Phase 2 was seen rendering on the
  authenticated dashboard; the per-component mono cells still want an eyeball in a running app.
- **Sweep pattern (for future components):** set `fontFamily: 'var(--font-mono)'` on the data
  `table`/value/search-input style object; leave labels, buttons, titles, `fieldLabel` on Archivo.

### 2026-09-08 — Field redesign: LANDING PAGE DEPLOYED ✅

**VPS now on `c2c6cdd` (main), shell-only deploy, health 200, served bundle `index-BwFrASeO.js` confirmed live.** The landing-first Field rework (Phase 5) is in production at `0xkudo.com`. `theme.css` gained the font `@import` (Archivo / Archivo Expanded / Fira Code) + the scoped `.field-scope` token block (light+dark, petrol accent, neutral primary) — global `:root` and the 19 tools / SIEM are UNTOUCHED. `LandingPage.jsx` restyled to Field via the scope: Archivo Expanded hero + "Enterprise security operations, built for everyone." tagline, functional insight tabs + Alert Trend bars in the SIEM preview. Cleanup: hardcoded severity hex in `SiemPreview` → `var(--severity-*)` (so the preview follows the retuned light-mode palette), dead `phaseDot`/per-phase `color` and the unused hero eyebrow style removed. Verified in-browser light + dark before commit. Deploy: `git pull --ff-only` (0d8efbc→c2c6cdd) + `npm run build --workspace platform/shell` + plain `pm2 restart cybertools-server` (id 6, catalog env preserved). Commit `c2c6cdd`.

**Remaining Field phases (NOT started):** global `theme.css` token swap + mono-for-data sweep across the 19 tools / SIEM (Phases 2–4, 6–8 of the plan), then the composable dashboard (`docs/specs/2026-09-08-customizable-dashboard.md`).

### 2026-09-08 — Field redesign: gallery signed off, Phase 2 = landing page only (LANDING DONE, whole-app pending)

Approved design direction **Field** (warm paper light / warm ink-night dark, single **petrol**
accent, Archivo + Archivo Expanded + Fira Code-for-data). Full decisions + token table:
`docs/plans/2026-09-08-field-redesign.md` and memory [[project_field_redesign]]. The **element
gallery** (session artifact) is signed off — neutral primary buttons (petrol reserved for
links/active/focus, never a fill), badge centering via `text-box-trim` on inline-block +
`justify-self:start`, uniform-width severity chips, pill filters, functional insight tabs
(hoverable/filterable), real Alert Trend bar chart, faithful ATT&CK technique-cell matrix, NO
severity donut/bar chart, NO color-coded phase squares. Also spec'd (build later, after Field):
composable dashboard (`docs/specs/2026-09-08-customizable-dashboard.md`, anime.js Draggable +
push-down/compact-up reflow, POC done). **Rollout: LANDING PAGE FIRST** — restyle
`LandingPage.jsx` to Field via a scoped `.field-scope` class (Field tokens light+dark + fonts for
the landing subtree only), WITHOUT touching `theme.css` globally or the 19 tools / SIEM. Landing
elements are NOT resizable. No anime.js on the landing (CSS hover/underline). Whole-app theme
migration is a later phase.

### 2026-09-08 — Landing page copy/design pass DEPLOYED

**VPS now on `0d8efbc` (main), shell-only deploy, health 200.** Landing page (`platform/shell/src/pages/LandingPage.jsx`): removed the "Open Security Operations Platform" hero eyebrow (desktop + mobile), removed the SIEM/19/Windows/Auth0 stats bar and its now-unused styles, hero subtext now leads with ease of use for the target roles, and the "How it works" intro corrected from "Three capabilities that set it apart from a basic log viewer" to the honest "Four capabilities, from real-time ingestion to case management". Reviewed the rest of the page against the XDR/SOAR roadmap: copy correctly stops at "SIEM + 19 tools" and already surfaces the live Sigma Rule Library + MITRE ATT&CK mapping; nothing overclaims correlation/entities/incidents/response (built-but-not-GA), left as-is. Deploy: `git pull --ff-only` (f00b8d1→0d8efbc) + `npm run build --workspace platform/shell` + plain `pm2 restart cybertools-server` (id 6, catalog env preserved = still live). Verified old strings gone / new copy present in the built bundle.

### 2026-09-06 — PICK-UP BLOCK (READ FIRST — supersedes all earlier blocks below)

**⚠️ HANDING OFF TO A DIFFERENT ACCOUNT:** `docs/` is gitignored and HANDOFF.md + memory files are NOT committed to git — they do NOT travel via git. Copy this file, `docs/specs/2026-09-05-sigma-rule-library.md`, and `docs/plans/2026-09-07-sigma-catalog-phase-d-matcher.md` to the other account manually. Test files are gitignored too (commit with `git add -f`). This machine's git remote push FAILS, so `origin/main` tracking is STALE here — do not trust `git log origin/main..main`. The user pushes from elsewhere.

**LOCAL COMMITS TO PUSH (local `main`, newest last):** `682ee5f` (D3 matcher-on-ingest + D4 re2) → `883678b` (audit false-alarm fix) → `1104495` (noise field_signature → jsonb). All THREE are already applied/deployed live on the VPS, but still need `git push` so GitHub matches prod. Earlier already-pushed: `ac3d174` (Phase C) and predecessors.

**VPS RUNTIME STATE RIGHT NOW (`root@92.112.181.219`, `ssh -i ~/.ssh/vps_cybertools`, `/var/www/cybertools`, pm2 `cybertools-server` id 6, PORT 4001, Node v24, HEAD `c2c6cdd` as of 2026-09-08; catalog runtime notes below still current):**
- **Sigma catalog matcher is LIVE (2026-09-06, later session — went out of shadow).** pm2 env: `CATALOG_MATCHER_SHADOW=` (empty), `CATALOG_DISABLED=` (empty). The matcher runs on every ingest batch and **INSERTS real alerts** into `alerts` (`sigma_identity` set), deduped on `alerts_sigma_dedup (user_id, sigma_identity, group_key)`. Confirmed working: 0 → 11 sigma alerts, a 104-row batch produced `110 hits → 10 new, 100 deduped` (no flood, thanks to the 5-rule noise trim). Rendered in the Alerts view with the neutral "Sigma" badge. Threshold-only catalog cron still scheduled (every 3 min).
- **CPU-throttle mitigation (2026-09-06):** `catalogCron` was firing every 3 min doing scans that hit the statement timeout + spawned Postgres parallel workers = a top CPU consumer per Hostinger's hPanel (which showed the box is throttled for exceeding its CPU quota — "Maximum CPU resets reached"). Slowed to **every 20 min** via `CATALOG_EVAL_INTERVAL_MIN=20` + `CATALOG_LOOKBACK_SECONDS=1500`, **now IN `.env`** (persistent). Full root-cause + the dedicated-host migration plan: see memory [[project-cybertools-status]] 2026-09-06 block and `docs/plans/2026-09-06-cybertools-dedicated-migration.md`.
- **🚨 THE KILL-SWITCH FLAGS ARE RUNTIME-ONLY, NOT IN .env OR GIT.** `CATALOG_DISABLED` + `CATALOG_MATCHER_SHADOW` are both empty now (= live). A plain `pm2 restart` keeps that. Emergency kill-switch: `CATALOG_DISABLED=1 pm2 restart cybertools-server --update-env` stops all catalog inserts instantly. To go back to measure-only: `CATALOG_MATCHER_SHADOW=1 pm2 restart … --update-env`. There is NO `CATALOG_*` var in `.env`, so a `pm2 delete`+start keeps it live (both unset = live) — set the kill-switch first if recreating the process during an incident.
- Health local+public 200. `unstable restarts: 0`.

**SHADOW MEASUREMENT SO FAR (2026-09-06):** matcher works end-to-end, no build/run errors. Sample batches: `1 row → 2 hits (90-177ms)`, `143 rows → 626 hits (2547ms)`. **The raw catalog is far too noisy to go live: ~4.4 rules match per event → hundreds of alerts/min if inserts were on.** Per-batch cost ~2.5s node CPU for a 143-row batch (once/min at Flush 60). VPS load ~5.3 during shadow (up ~1 from ~4.3 before; box is 2 shared cores + ~9% CPU steal + 0 swap, 9 pm2 apps + Postgres).

**NOISE ATTRIBUTION DONE + TOP 5 DISABLED (2026-09-06, later session).** Ran a read-only attribution pass (compiled matcher over the last 4000 logs, tally by identity). Result: **94% of all hits came from just 5 overly-broad rules**, each firing on 44-100% of every event (pure false positives against this telemetry): `Failed Authentications From Countries You Do Not Operate Out Of` (100%), `Publicly Accessible RDP Service` (100%), `Cisco File Deletion` (77%), `Cisco Discovery` (56%), `Cloudflared Portable Execution` (44%). Disabled all 5 via `sigma_rule_overrides` (enabled=false) for user `google-oauth2|109931966907939664825` — reversible, delete the rows to restore. **Re-measured: 4.01 → 0.28 hits/event (93% drop).** Shadow log confirms it live (post-override batches e.g. `595 rows → 14 hits`). Overrides are in the DB (survive restarts), NOT env-dependent.

**NEXT STEPS to take Sigma live (do NOT just flip inserts on yet):**
1. **Optional second-tier trim.** Next noisiest after the 5: `Suspicious SQL Query` (9%), `Cisco Local Accounts` (7%), `Potential Executable Run Itself As Sacrificial Process` (4%), `Potential CommandLine Obfuscation Using Unicode Characters` (4%). Left ENABLED pending user call (4-9% may carry real signal). Disable via the same override pattern if still too noisy. To re-attribute, re-create the read-only script (build `getMatcher(db)`, run `matcher.match(row)` over recent logs, tally intersect with the enabled set; needs `NODE_ENV=production` + `DATABASE_URL` from `/var/www/cybertools/.env`).
2. Run the env-gated live parity sample against the synced DB: `SIGMA_MATCHER_PARITY=1 npx vitest run tests/catalogMatcherParity.test.js`.
3. Go live: `CATALOG_DISABLED= CATALOG_MATCHER_SHADOW= pm2 restart cybertools-server --update-env` (both empty → matcher inserts real-time). At 0.28 hits/event with per-identity+group_key dedup, live volume is now manageable. Re-run the four-category live test. Keep `CATALOG_DISABLED=1` as the emergency kill-switch.

**OTHER FIXES SHIPPED THIS SESSION (all deployed to VPS):**
- **Bulk "Mark Ack" / "Mark Resolved" fixed (LOCAL edit, NOT yet on VPS — `platform/server/routes/siem.js` `POST /alerts/bulk`).** Bug: the id placeholders were computed as `$${i+2}` (correct for the delete branch `[uid, ...ids]`) but the status branch passes `[uid, status, ...ids]`, so `status` took `$2` and the id list collided with it — the query became `id IN ($2)` = `id IN ('acknowledged')`, which Postgres tries to cast to integer and throws `invalid input syntax for type integer: "acknowledged"` → 500. The client (`AlertQueue.jsx bulkAction`) doesn't check the response, so it optimistically flips the badge, then the next `loadAlerts()` reverts it to `new`. That's why the row-dropdown and modal ack (single `PATCH /alerts/:id`, offsets aligned) worked but the bulk button didn't. Fix: per-branch id offset via `idPlaceholders(start)` — delete uses `(2)`, status uses `(3)`; also added `updated_at = NOW()` to the bulk status UPDATE for parity with the single PATCH. **Deploy: server-only change, `git pull` + `pm2 restart cybertools-server` (no migration, no shell rebuild).**
- **Severity + Sigma filters (LOCAL, uncommitted).** Alerts tab (`AlertQueue.jsx` + `siem.js GET /alerts`): multi-select severity buttons + Sigma toggle + Clear-filters, server-backed (`?severity=a,b`, `?source=sigma`) so correct under `LIMIT 200`. Rule Library (`RuleLibrary.jsx` + `siem.js GET /rules/sigma/catalog`): severity buttons (`?severity=a,b` → `s.severity = ANY`). Shell rebuilt clean.
- **Electron clipping / no-horizontal-scrollbar (LOCAL, uncommitted; "fit first, scroll fallback" — user picked this).** `theme.css` `#root` zoom `1.15 → 1` (the 1.15 inflated the app ~15% and, with `html,body{overflow:hidden}`, clipped with no scrollbar; see [[feedback_zoom_layout_debugging]]). AlertQueue table wrapper `overflowX hidden → auto` + `kudo-scroll`, table `width auto; minWidth 100%` (the far-right status `<select>` column was clipping off-window). RuleLibrary table already scrolled. **NEEDS a visual pass in the Electron window + screenshot** to confirm other views (Detection Rules, Tuning Center, Log Search, Cases, Config) don't still clip after the zoom change, and to judge the native select-popup-off-edge case. Detail: `docs/specs/ui-improvements.md`.
- **DEPLOYED `be6bbd0` (2026-09-06).** The bulk-ack fix + severity/Sigma filters + Electron zoom/overflow shipped as one commit, pushed to GitHub by the user, then VPS `git pull --ff-only` (883678b→be6bbd0, clean FF; also carried the already-applied noise-candidates jsonb migration file — no DB action) + shell rebuild + `pm2 restart --update-env` (Sigma env preserved: both `CATALOG_*` empty = still live), health 200. Corrected bulk-status query verified against real rows (no cast error). **User still to visually verify the Electron overflow fix** in a non-maximized window + screenshot any view that still clips.
- **DEPLOYED `8fb8a40` (2026-09-06).** Severity filters on Alerts + Rule Library restyled to the SIEM dashboard's canonical pill (shared `sevPillStyle`: colored border, filled when active); Alerts keeps the Sigma toggle in pill form; Rule Library omits a Sigma toggle (whole catalog is Sigma) and the SIEM dashboard event filter got none (raw events have no Sigma attribute — Sigma yields alerts, not events; a Sigma toggle there would bind to nothing; offered the dashboard Active-Alerts list as the alternative, not yet built). Landing page gained a Sigma Rule Library capability + deep section; Security Practices reframes Sigma as a live ATT&CK-mapped tunable feature; Privacy Policy notes the one-way public SigmaHQ download (no user data sent). VPS FF be6bbd0→8fb8a40 + shell rebuild + restart (env preserved), health 200.
- **🩹 nginx SPA cache fix (VPS infra, 2026-09-06 — root cause of "my deploy isn't showing").** The cybertools nginx site (`/etc/nginx/sites-available/cybertools`) served `index.html` with NO `Cache-Control`, so Electron/Chromium heuristically cached the SPA entry file and kept referencing the OLD hashed JS bundle after every shell deploy → new UI invisible until a manual hard-refresh. Fixed: added `location = /index.html { Cache-Control "no-cache, must-revalidate" }` + `location /assets/ { Cache-Control "public, max-age=31536000, immutable" }` before `location /`. `nginx -t` clean, reloaded. Backup at `/etc/nginx/sites-available/cybertools.bak-20260906`. Verified live: index.html now `no-cache`, assets `immutable`. **Future shell deploys now appear without a hard-refresh; users on the OLD cached index.html still need ONE Ctrl+Shift+R (or app reopen) to cross over.** See [[project_local_dev_env]].
- **Fluent Bit added to Security Practices (LOCAL `SecurityPage.jsx`, uncommitted).** New "Log Collection and Ingestion" section (Fluent Bit CNCF, per-user hashed ingest keys, HTTPS, RLS scoping, client-side drop, local-only desktop mode). User flagged it was missing from the new page.
- **ATT&CK COVERAGE HEAT MAP — BUILT (LOCAL, uncommitted→committed this session; needs deploy). Placement: BOTH (user's call).** Read-only `GET /api/siem/attack/coverage?window_days=` in `siem.js` → `{ rules:{tech:count}, alerts:{tech:count}, window_days }` (rule coverage = UNNEST over enabled detection+correlation+Sigma-catalog rules using the catalog enablement predicate; alert activity = UNNEST over alerts joined to all three rule sources, last N days). New `platform/shell/src/components/AttackCoverage.jsx` exports `AttackCoverage` (full matrix: 14 tactics × union technique set, amber heat by count, Rule-coverage/Alert-activity toggle + window pills, click-a-cell→sets the catalog technique filter, mobile = per-tactic list) and `AttackCoverageTile` (dashboard summary: covered count + per-tactic mini-bars). Wired into `RuleLibrary.jsx` (Coverage section `#attack-coverage` after catalog `#rule-catalog`). **The dashboard tile (`AttackCoverageTile`) was built + deployed in `656e7dd`, then REMOVED at the user's request (looked bad on the dense dashboard) — reverted from `SiemDashboard.jsx`, the `AttackCoverageTile` export, and the `DetectionRules.jsx` session-hint deep-link. Matrix stays in the Rule Library only.** Tests: `platform/server/tests/attackCoverage.test.js` (5 green, `git add -f`). Data verified on VPS: 52 techniques covered, T1059.001 leads (217 rules). Plan: `docs/plans/2026-09-06-attack-coverage-heatmap.md`. **Deploy: server+shell, `git pull` + shell rebuild + restart, no migration.** (superseded the "PLAN WRITTEN" note below)
- **(superseded) ATT&CK coverage was PLAN-ONLY (`docs/plans/2026-09-06-attack-coverage-heatmap.md`).** The Phase 1.6 map it was meant to reuse never existed; this plan builds it directly on the existing `attack_techniques[]` field: one read-only `GET /api/siem/attack/coverage` endpoint (rule-coverage + alert-activity counts via UNNEST over the enabled set incl. the catalog enablement predicate) + an `AttackCoverage.jsx` matrix in the Rule Library tab (14 tactics × union technique set, shaded by count, metric toggle, click→technique filter). No migration (unless `correlation_rules` lacks `attack_techniques`). **User's decision: build this BEFORE XDR Phase 2.**
- **NEXT IN THE SPECS (told the user 2026-09-06):** immediate = the **ATT&CK coverage heat map** (plan above). Then the roadmap's next milestone is **Phase 2 — Entity graph + incidents** (`entities`/`entity_edges`, risk scoring, `incidents` auto-clustering, entity/incident UI; "the point where it is genuinely XDR"). See [[project_xdr_soar_roadmap]].
- **Deploy for `SecurityPage.jsx` (Fluent Bit):** shell-only, batch with the next commit → push → VPS `git pull` + shell rebuild + restart. Plan + spec doc edits are records only.
- **Tuning Center fixed (`1104495`).** `noise_candidates.field_signature` was `text`; every consumer treats it as `jsonb`, so node-pg returned a raw JSON *string* → `field_signature.event_category` `undefined` everywhere → blank/"0" patterns, approvals made "[Auto] Suppress undefined from undefined" rules with NO conditions, and `->>` queries in `scoreSuppressConflicts`/LLM `/context` errored (`text ->> key` doesn't exist). Only Electron LLM worked (it JSON.parses the string). Fixed via `ALTER COLUMN field_signature TYPE jsonb` (migration `2026-09-06-noise-candidates-field-signature-jsonb.sql`, applied on VPS as owner `cybertools_app` — the ops role is BYPASSRLS but NOT owner; schema.sql updated). No app code change. Deleted junk catch-all rule id 104 + reset its candidate to pending. See [[project_tuning_center_jsonb]].
- **Fluent Bit throttle — THE VPS-load fix.** `C:\Program Files\fluent-bit\conf\cybertools.conf` `[SERVICE] Flush` was `2` (batch every 2s → ~30 detection/correlation passes/min). Changed to `Flush 60`. Keep it at 60. GOTCHAs: needs admin + `net stop/start fluent-bit`; NEVER write the conf with PS 5.1 `Set-Content -Encoding utf8` (adds a BOM → fluent-bit error 1067) — use `[System.IO.File]::WriteAllText($conf,$text,(New-Object System.Text.UTF8Encoding($false)))`. See [[project_fluent_bit_flush]]. "Suppressed logs don't hit the VPS" = these client-side grep filters, NOT server-side SIEM suppress (which only *counts*, never drops).
- **Audit-log false alarm fixed (`883678b`).** Nightly `runIntegrityCheck` cried `AUDIT LOG INTEGRITY FAILURE` every run: it JSON.stringify'd the already-serialized `meta` text column again (double-encode). NOT tampering — all 98 rows verify. Shared `auditRowHash()` helper now used by both writer + verifier; `tests/audit.test.js` (4 green). No migration.

**D3 as built (2026-09-05).** Wired the compiled matcher into the ingest path. `run.js` new `runCatalogMatcher(userId, logIds, deps)`: `getMatcher(deps)` (global cache) → one RLS txn → read user's enabled single_event identities into a Map → fetch batch rows ONCE (`id` + all `LOG_FIELDS` + `raw_json` + `search_text`) → `matcher.match(row)` per row, filter to enabled Map, `upsertSigmaAlert`. Called from `runCorrelation` AFTER the correlation txn, in a SEPARATE txn, only when `logIds` set AND `CATALOG_DISABLED!=='1'`; `CATALOG_MATCHER_SHADOW=1` computes+logs but inserts nothing. `runCatalogRules` (cron) lost its single_event branch — the scheduled cron now runs ONLY threshold catalog rules. Tests: replaced the Phase C single_event `evaluateCatalog` block in `correlation.test.js` with a `runCorrelation — catalog matcher (Phase D)` block (real-time fire, non-match, regex-now-fires, disabled-category, shadow, kill-switch) + a `evaluateCatalog — cron keeps threshold only` block. **93 correlation/sigma tests green on Docker 5433.** Files to commit: `platform/server/services/correlation/run.js` and (`-f`) `platform/server/tests/correlation.test.js`. Plan: `docs/plans/2026-09-07-sigma-catalog-phase-d-matcher.md` §10 (D3 as built).

**D4 as built (2026-09-05, `682ee5f`).** `re2` (linear-time regex) added to `platform/server` deps — installed with a prebuilt binary (no gyp compile), verified loading on VPS Linux Node v24. `evalRule.js` compiles `re` leaves through re2 via an optional require (falls back to JS `RegExp` where re2 is absent), cached per pattern — removes the main-thread ReDoS risk. `correlationEval.test.js` gained regex-safety tests (a `(a+)+$` ReDoS pattern completes <1s). Electron/local path: verify re2 loads there before the local catalog matcher is used, else it falls back to JS RegExp (ReDoS-exposed).

---

### 2026-09-07 — earlier PICK-UP BLOCK (superseded by the D3 block above; kept for D1/D2 context)

**Where we are:** re-enabling the community Sigma catalog on the 2-core VPS. Phase C (field prefilter) is shipped + live but measured insufficient; Phase D (in-memory compiled matcher) is the fix, D1 + D2 are built/committed locally, D3 + D4 remain. Catalog stays `CATALOG_DISABLED=1` in prod the whole time.

**Git state (local `main`):** `ac3d174` (Phase C, already pushed + deployed to VPS) → `0cec4e9` (D1) → `d3e8dd8` (D2). **D1/D2 are new local commits still to push** (`git push` from wherever you normally push — this machine's remote fetch/push fails, so its `origin/main` tracking ref is STALE and `git log origin/main..main` is misleading here; don't trust it). **CRITICAL for another machine:** `docs/` is gitignored and HANDOFF.md + memory are not committed, so the specs/plans/this file do NOT travel via git — copy them manually, or work on the same machine. Test files are gitignored too (committed with `git add -f`).

**What's DONE (all local, matcher NOT wired to runtime yet → zero production behavior change):**
- Phase C: `sigmaCron.extractFieldSignature` + `sig_terms`/`has_regex` columns (migration `2026-09-07-sigma-field-prefilter.sql`, applied to VPS + Docker) + window-pass skip in `run.js`.
- D1: `platform/server/services/correlation/evalRule.js` (`matchesWhere`).
- D2: `platform/server/services/correlation/ahoCorasick.js` + `catalogMatcher.js` (`compileMatcher`, `getMatcher`).

**What's NEXT — D3 then D4** (plan: `docs/plans/2026-09-07-sigma-catalog-phase-d-matcher.md` §4/§8/§10):
- **D3 integration:** in `run.js` `runCorrelation`, when `logIds` set, fetch the batch rows ONCE (all LOG_FIELDS columns + `raw_json` + `search_text`), call `getMatcher(deps)`, `matcher.match(row)` per row, filter hits to the user's enabled set (reuse the enablement query in `runCatalogRules`), `upsertSigmaAlert`. Remove single_event from `catalogCron`/`runCatalogRules` (keep threshold + stateful). Ship behind a `CATALOG_MATCHER_SHADOW=1` flag (compute + log, don't insert).
- **D4:** add `re2` for the ~117 regex rules (main-thread RegExp ReDoS risk), deploy, run shadow mode on the VPS a day, run the env-gated live parity sample (`SIGMA_MATCHER_PARITY=1 npx vitest run tests/catalogMatcherParity.test.js`), then flip `CATALOG_DISABLED` off and re-run the four-category live test.

**Run the tests (from `platform/server`, Docker DB on 5433 up):**
`DATABASE_URL='postgresql://postgres:postgres@localhost:5433/cybertools' npx vitest run tests/correlationEval.test.js tests/ahoCorasick.test.js tests/catalogMatcher.test.js tests/catalogMatcherCache.test.js tests/catalogMatcherParity.test.js tests/correlation.test.js tests/sigmaCron.test.js` → 88 green.

**Deploy note:** D1/D2 add no DB migration and no runtime wiring, so deploying them changes nothing in prod until D3 wires the matcher. The Phase C migration is already on the VPS. Keep `CATALOG_DISABLED=1` on every restart (`CATALOG_DISABLED=1 pm2 restart cybertools-server --update-env`, id 6, never `sudo pm2`).

---

### 2026-09-07 — Sigma catalog Phase C: high-selectivity field prefilter + pure-regex deferral (LOCAL-ONLY, uncommitted)

**What/why.** Built the window-mode prefilter that the 2026-09-06 work named as the prerequisite to re-enabling the catalog. The scheduled pass now runs only the catalog rules whose fields actually appear in recent telemetry, instead of all ~3,622. This is the user's "only run rules relevant to what the logs touched" idea. Plan of record: `docs/plans/2026-09-06-sigma-catalog-performance.md` Phase C (marked BUILT there with full detail).

**Changes (all LOCAL, uncommitted; Docker 5433 only, NOT on the VPS):**
- `platform/server/services/sigmaCron.js`: new `extractFieldSignature(doc)` → `{ sig_terms, has_regex }` (high-selectivity pins on `process_name`/`parent_process_name`/`file_path`/`registry_key`, ops eq/contains/startswith/endswith, same AND-guaranteed tree walk as `extractSignature` so no false skips; `has_regex` = any `re` leaf). Exported `catalogRuleMatchesProfile`, `ruleIsPrefilterable`, `PREFILTER_FIELDS`. `entryToRow` spreads it; `upsertRows` now 17 params/row.
- `db/migrations/2026-09-07-sigma-field-prefilter.sql`: `sigma_rules.sig_terms jsonb '{}'` + `has_regex boolean false` + btree on has_regex. Mirrored in `db/schema.sql`. **Applied to Docker only.** Populated on the NEXT sync (existing rows keep defaults).
- `platform/server/services/correlation/run.js`: window pass (`runCatalogRules`, `logIds===null`) builds ONE `buildWindowProfile` aggregation over the look-back, then filters in Node — skips pure-regex-unprefilterable rules (**user chose: defer to Phase D, do not run on a slower cadence**), coarse-dim misses, and field-term misses.
- Tests: +14 pure-core (`sigmaCron.test.js`), +3 DB-integration window-pass (`correlation.test.js`). **119 sigma/correlation tests green** on Docker 5433.

**Consequence / not done.** Pure-regex rules (~200) still won't fire until Phase D. Still needs: commit + push (test files are gitignored — `git add -f` them), apply the migration on the VPS, trigger a re-sync to populate `sig_terms`/`has_regex`, then measure a `catalogCron` pass + re-run the four-category live test BEFORE turning `CATALOG_DISABLED` off. The catalog remains DISABLED in prod until that measurement is clean.

**Files to commit:** `platform/server/services/sigmaCron.js`, `platform/server/services/correlation/run.js`, `db/migrations/2026-09-07-sigma-field-prefilter.sql`, `db/schema.sql`, and (with `-f`) `platform/server/tests/sigmaCron.test.js`, `platform/server/tests/correlation.test.js`.

**COMMITTED + DEPLOYED (2026-09-07).** Commit `ac3d174` on `main`; user pushed. VPS deploy done: reconciled the 4f747b4 git drift (backed up to `/root/vps-drift-backup-20260906-040345.patch`, discarded the pure-ancestor scp'd run.js/compile.js/catalogCron.js/package-lock, `git pull --ff-only` → `ac3d174`, tree clean), applied `2026-09-07-sigma-field-prefilter.sql` (columns live), no new deps, no shell rebuild (server-only), `CATALOG_DISABLED=1 pm2 restart cybertools-server --update-env` (id 6) with the kill-switch preserved (verified `CATALOG_DISABLED: 1`), health 200, logs show `[catalogCron] DISABLED`. This also finally landed `6bd480c` (kill-switch) + `4e4d279` (compiler) properly in the VPS git tree.

**MEASURED: Phase C is NOT sufficient to re-enable on 2 cores.** User triggered a manual sync (3,622 converted, tag r2026-07-01). Signature coverage: 1,604 have field terms, 372 coarse, 117 has_regex (61 pure-regex now skipped), **1,627 unprefilterable non-regex still always-run** (mostly CommandLine/message-contains + keyword → `message`/`search_text`). A single manual pass (`runCatalogForUser`, 1200s window, ~20k logs) **still drove VPS load to ~6.3 on 2 cores and did not finish in 120s**, with many `statement timeout` cancels. Killed it; load recovered; prod stayed safe (`CATALOG_DISABLED=1`, health 200). Root cause is now rule-COUNT × per-query cost, not the regex seq-scans — exactly what spec §16 predicted. **Do NOT re-enable the catalog until Phase D lands.**

**Phase D — D1 DONE (2026-09-07, LOCAL-ONLY, uncommitted).** In-memory rule evaluator `platform/server/services/correlation/evalRule.js` (`matchesWhere(node, event)`), pure/no-DB, mirroring `compile.js` op-semantics exactly incl. Postgres LIKE `%`/`_`/`\`-escape via `likeToRegExp`, ci vs cs per op, int coercion, `re`/`cidr`/raw/keyword, SQL-NULL three-valued collapse. Tests `platform/server/tests/correlationEval.test.js` (19 green): per-op units + a **SQL-parity spot-check** that runs each tricky leaf through BOTH the real compiler-against-Postgres and the JS evaluator and asserts agreement. Nothing imports evalRule.js yet (D2 wires it) — zero production change. Next: D2 (compiled matcher: Aho-Corasick per field + mandatory-leaf dispatch + full-catalog parity harness).

**Phase D — D2 DONE (2026-09-07, LOCAL-ONLY, uncommitted).** Residual reduction + parity harness finished. `message`/`keyword` rules now route through a `search_text` Aho-Corasick channel (`triggerGroup` necessary-OR-set; raw leaves stay residual by design — JSON-escaping). New `catalogMatcherParity.test.js` (SQL-vs-memory harness) proves the matcher and `compileMatch` SQL flag identical per-rule hits over a shared corpus of real converted rules; env-gated `SIGMA_MATCHER_PARITY=1` samples the live catalog (run before re-enable). Full D2 suite (evalRule+ahoCorasick+catalogMatcher+cache+parity+correlation+sigmaCron) = 88 green. Only optional non-blocking item left: ci/cs-split automata. **Details below (D2 core entry).**

**Phase D — D2 core DONE (2026-09-07, LOCAL-ONLY, uncommitted).** The compiled in-memory matcher. `ahoCorasick.js` (multi-substring search, 6 tests). `catalogMatcher.js`: `compileMatcher(rules)` (per-field Aho-Corasick dispatch over Phase-C mandatory pins + residual full-eval, every candidate confirmed by D1 `matchesWhere` so pruning is exact) and `getMatcher(deps)` (process-global cache over the live single_event catalog, version = count:max(updated_at), build lock). Tests: `catalogMatcher.test.js` (9, incl. 324-combo randomized parity vs naive + prune stats), `catalogMatcherCache.test.js` (4, DB-gated). **117 correlation/sigma tests green.** D1 (`0cec4e9`) committed; D2 not yet committed. **D2 remaining:** message/keyword AC to shrink the ~1,627 residual, ci/cs-split automata, and the full-catalog SQL-vs-memory parity harness (the D4 re-enable gate). Next after D2: D3 integration (wire `getMatcher` into `runCorrelation` on the ingest batch, per-user enablement filter, `upsertSigmaAlert`; drop single_event from `catalogCron`), then D4 (re2 + VPS shadow measure + re-enable).

**Phase D plan written:** `docs/plans/2026-09-07-sigma-catalog-phase-d-matcher.md` — in-memory compiled matcher (parse-once global catalog, per-field Aho-Corasick ci/cs, mandatory-leaf dispatch pruning, boolean-tree eval in memory), integrated on the ingest batch in `runCorrelation` (single_event only; stateful stays on `catalogCron`), per-user enablement filter, `re2` for regex safety, shadow mode + a full-catalog SQL-vs-memory parity harness as the acceptance gate. Reuses Phase C `sig_terms`/`has_regex`. Phases D1 evaluator+op-parity, D2 matcher+parity harness, D3 integration+shadow, D4 regex safety+VPS measure+re-enable.

---

### 2026-09-06 — Catalog correctness + perf fixes, then catalog eval DISABLED for CPU safety (READ FIRST)

**TL;DR of production state right now:** the community Sigma catalog evaluator is **OFF** in production (`CATALOG_DISABLED=1`), deliberately, because the full-catalog scheduled pass pegs the 2-core VPS. The user's own `detection_rules` + `correlation_rules` + suppression still run real-time on ingest and are unaffected. Do **NOT** re-enable the catalog until Phase C/D lands (below) or you risk a multi-day Hostinger rate-limit. Load after disabling dropped from ~7 to ~1.5 on 2 cores.

**What was investigated.** The four-category live trigger test (generic `BitLockerToGo`, threat-hunting `ScreenConnect`, emerging-threats `APT29`, compliance `Default Credentials`) never fired. Root causes found, in order:
1. **Transaction-abort cascade (the real bug).** `runCatalogRules` evaluated all ~3,600 rules on one client in one transaction. A single rule raising a Postgres error (an invalid `re` regex — `invalid repetition count(s)`, ~6k/pass) aborted the whole transaction, so every rule after it failed with "current transaction is aborted" and was skipped. Only the couple of rules before the first poison rule could ever alert. **This is why catalog rules effectively never fired.**
2. **Raw/text rules could not use existing indexes.** The compiler emitted `raw_json ->> $field ILIKE/=`, which neither the GIN `raw_json` index (serves `@>`/`?`) nor the `search_text` trigram index accelerates; first-class text columns had only btree. So ~200 rules per pass seq-scanned the look-back window until the timeout.
3. **A full pass overruns its window.** Even after 1+2, ~200 `re` regex rules (no index possible) make a pass take ~7-8 min. With a 240s look-back, events aged out mid-pass; with the pass this slow, Postgres load hits ~7 / 0% idle on 2 cores. **This is the CPU risk and the reason we stopped and disabled.**

**Commits (all on local `main`; user pushed `817e2a7`..`1059e2e`; `6bd480c` NOT yet pushed as of writing):**
- `817e2a7` fix: SAVEPOINT-isolate each catalog rule (recover the transaction on a per-rule error). **Correctness fix — this is what actually made catalog rules capable of firing.** Verified: aborted-cascade errors went from millions to zero new.
- `f19dbf3` perf: per-rule `statement_timeout` 20s → 2s in `evaluateCatalog`.
- `4e4d279` perf: compiler emits index-usable SQL for raw/text ops (`compileRawLeaf` AND-prefixes a `search_text ILIKE %v%` trigram conjunct for ≥3-char literals; exact `->>`/`=` still runs) **+ migration `db/migrations/2026-09-06-logs-text-trgm-indexes.sql`** (pg_trgm GIN on `process_name`, `parent_process_name`, `file_path`, `registry_key`, `message`) + `db/schema.sql` sync. Verified via `EXPLAIN`: compliance `eq` and `BitLockerToGo` `endswith` now Bitmap Index Scan, not Seq Scan.
- `1059e2e` perf: widen catalog look-back to `max(interval+60s, CATALOG_LOOKBACK_SECONDS default 1200s)` so a slow pass does not age out recent events. **NOTE: this increases per-pass DB load (5× more rows scanned) — a bridge, not a fix.**
- `6bd480c` feat: **`CATALOG_DISABLED=1` kill-switch** in `scheduleCatalogCron()`. **Currently the safety mechanism keeping prod healthy.**

**DB migration `2026-09-06-logs-text-trgm-indexes.sql` is ALREADY APPLIED to the prod DB** (5 trigram GIN indexes built on the partitioned `logs` parent, `ANALYZE` run). A fresh `git pull` will NOT re-run it (migrations are manual); it is live.

**⚠️ VPS git drift — reconcile carefully (I used scp this session, against the stated git-pull method).** VPS `cd /var/www/cybertools`: HEAD is still `4f747b4`, working tree has uncommitted `M` on `run.js`, `compile.js`, `catalogCron.js` (my scp'd content = the pushed commits' content, and catalogCron.js = `6bd480c`). origin/main is 4 ahead (through `1059e2e`). **The RUNNING code is correct + safe (kill-switch present, `CATALOG_DISABLED=1` in the pm2 env).** To reconcile WITHOUT re-enabling the catalog:
1. User pushes `6bd480c` to origin/main first (so the kill-switch is in git history).
2. On VPS: `git checkout -- platform/server/services/correlation/run.js platform/server/services/correlation/compile.js platform/server/services/correlation/catalogCron.js` then `git pull --ff-only` (lands on `6bd480c`).
3. `CATALOG_DISABLED=1 pm2 restart cybertools-server --update-env` (the env is NOT in git; it must be re-set whenever the process env is recreated — a plain `pm2 restart` keeps it, `pm2 delete`+start loses it).
**Do not `git checkout -- . && git pull` before `6bd480c` is pushed** — you would land on `1059e2e`, which has no kill-switch, and the next restart would re-enable the catalog and re-peg the box.

**NEXT WORK (required before re-enabling the catalog) — see `docs/plans/2026-09-06-sigma-catalog-performance.md`:**
- **Phase C — window-mode prefilter.** Extend the `sigma_rules` signature (currently only `event_id`/`category`/`source`, empty for ~3,250 of 3,622 rules) to the fields rules actually pin — `process_name`/`Image`/`file_path` — and skip, in the window pass, rules whose pinned values are absent from recent telemetry. This is the user's "only run rules relevant to what the logs touch" idea and the real load reducer.
- **Phase D — in-memory compiled matcher.** Group predicates by field, Aho-Corasick multi-pattern per field, evaluate boolean trees in memory, hit the DB only to insert. O(events) not O(rules). The durable endgame; also the only good answer for the ~200 `re` regex rules that no SQL index can serve.
- When re-enabling: keep look-back modest (≤360s) again, and measure `load average` on the 2-core box before leaving it on.

**Verification status of the 4-category test: INCONCLUSIVE.** The fixes are correct (cascade gone, EXPLAIN shows index scans, all four events normalize correctly in the DB with the exact columns/raw their rules match), but a full pass is too expensive to safely leave running on this VPS, so the end-to-end "four Sigma alerts fire" was never confirmed green. Re-run it only after Phase C/D, on a fast pass.

---

### DONE (2026-09-05, later session) — Full lineage DEPLOYED to prod + Rule Library detail modal + SIEM UI copy pass + CPU incident fixed

All work below is COMMITTED, PUSHED, and LIVE on the VPS (`root@92.112.181.219`, `/var/www/cybertools`, pm2 `cybertools-server` id 6, **port 4001**). SSH `ssh -i ~/.ssh/vps_cybertools root@92.112.181.219`.

**1. Deployed `9ca34ac` (the whole Sigma correlation + full-coverage lineage) to production.** VPS was 6 commits behind at `4776361`. Applied all 8 migrations in FK-correct order (correlation-rules → correlation-state → alerts-correlation → sigma-catalog → sigma-enablement → sigma-prefilter → sigma-fidelity → **logs-raw-jsonb**). **`logs-raw-jsonb` took ~15 min** (STORED generated cols `raw_json`/`search_text` rewrite + trigram GIN on the 3.2 GB partitioned `logs`; run it in a maintenance window). Schema backup at `/root/cybertools-schema-predeploy-20260905-171831.sql`. The HANDOFF line-44 migration order is WRONG (puts alerts-correlation before correlation-rules — FK fails); use the order above. Sigma sync ran: **3,769 rules, 3,622 converted (669 exact + 2,953 approx), 147 rejected** at tag `r2026-07-01`.

**2. Rule Library detail modal (`e9c07b2`).** Clicking a catalog rule title opens an info-card-style modal (mirrors the SiemDashboard event card) showing description, detection type, fidelity, ATT&CK, Sigma source, a plain-English render of the boolean condition tree ("How it's detected"), and "How the SIEM triggers it" (fields evaluated, prefilter, enablement). New backend `GET /api/siem/rules/sigma/catalog/:identity`. Rows use the DetectionRules hover pattern (no underline).

**3. SIEM UI copy pass (`b29a392`, `74804a5`, `958d80e`).** User feedback: **no em dashes, no middle-dot (·) separators, no `/` separators** in card copy or the footer. Removed all `·`/`—`/`/`-as-separator across every SIEM info card, modal header, list-row meta, the app footer (App.jsx), sidebars, mobile SIEM, dashboard cards (verified zero `·` in the built bundle). SigmaHQ rule titles/descriptions get em/en dashes stripped at display (`cleanCopy`). **ATT&CK techniques are now accent-orange dotted-underline links to attack.mitre.org everywhere** (Alerts queue, Detection Rules table+mobile, Rule Library table+modal), each with `stopPropagation` inside clickable rows. Standing rule reinforced: **match the existing design system, do not invent patterns** ([[feedback_tool_font_weight]] + design memories).

**4. CPU INCIDENT + FIX (`4f747b4`).** All 5 Sigma categories enabled made the engine evaluate the full catalog **on every ingest batch** → thousands of SQL queries per ~2s flush → VPS CPU pegged at 100%, Hostinger throttled. Root cause: **3,250 of 3,622 converted rules have an empty prefilter signature** (match on process_name/CommandLine/file_path/raw, not event_id/category/source), so the prefilter can't skip them. **Immediate mitigation:** set the user's `sigma_enabled_categories='{}'` (node CPU 29.7%→1.3%). **Temporary fix (shipped):** moved catalog evaluation OFF the ingest hot path onto a **scheduled evaluator** — `services/correlation/catalogCron.js`, `node-cron` every `CATALOG_EVAL_INTERVAL_MIN` (default 3) min over a ~240s look-back; the user's own detection_rules + correlation_rules stay real-time on ingest; idempotent via `alerts_sigma_dedup`. `run.js` gained `evaluateCatalog()`/`runCatalogForUser()`, catalog call removed from `runCorrelation`, `scheduleCatalogCron()` wired in index.js. **18 correlation tests green.** This mirrors Sentinel/Splunk/Elastic scheduled analytics rules. **DURABLE fix (not built):** an in-memory compiled matcher (Aho-Corasick per field, one pass per event) for single_event rules — see spec `docs/specs/2026-09-05-sigma-rule-library.md` §15.

**Deploy method settled:** commit locally → **user pushes** (`git push https://github.com/0xKudo/0xKudoSec.git main`; SSH remote fails on this machine) → VPS `git pull --ff-only` + rebuild shell (only if shell changed) + `pm2 restart cybertools-server` (id 6 only, never `sudo pm2`). Do NOT scp source to the VPS (creates drift). Session attribution: commits carry `Co-Authored-By: Claude Opus 4.8` (per session system-reminder, which overrides the older no-coauthor memory).

**Catalog currently DISABLED for the user** (`sigma_enabled_categories='{}'`, set during mitigation). To use the library again, re-enable categories in the Rule Library — the cron now handles them safely every 3 min. The staged per-category live alert test (generic/emerging_threats/threat_hunting/compliance, one reliably-firing rule each; payload at scratchpad `sigma-test-events.json`, marker `SIGMATESTMARK7X`) still awaits a fresh ingest key.

**Prod deploy state:** VPS HEAD = `4f747b4` on `main`. Health 200, load recovered (~1.3 one-min avg). Fluent Bit filters extended to drop `docker.exe` Event 1/3 noise (VS Code Docker polling), in `C:\Program Files\fluent-bit\conf\cybertools.conf` (needs admin + service restart to edit).

---

### DONE (2026-09-05) — Sigma FULL COVERAGE: all 6 phases + Rule Library UI (LOCAL-ONLY, UNCOMMITTED)

Inline execution of `docs/plans/2026-09-05-sigma-full-coverage.md` (from spec `docs/specs/2026-09-05-sigma-full-coverage.md`). **Measured convert rate on tag r2026-07-01: 8.3% → 96.1%** (3,622/3,769; 669 exact, 2,953 approximate, 147 rejected). 172 correlation/sigma tests green.

- **Boolean condition tree** — `platform/shared/correlationRule.js` gains a `where` node (all/any/not/leaf/keyword), recursive `validateWhere`, `normalizeToWhere`, caps (MAX_DEPTH 12 / MAX_LEAVES 256), and ops re/cidr/exists/fieldref/contains_cs/startswith_cs/endswith_cs. Flat `selection` stays valid (desugars to `{all}`).
- **Converter** — new `services/correlation/sigmaCondition.js` (Sigma condition-grammar parser: and/or/not/1 of/all of/N of/them/glob/parens) and `sigmaModifiers.js` (re, cidr, lt/lte/gt/gte + gtr/lss, windash, base64/base64offset/wide/utf16, cased, exists, fieldref, |all). `sigma.js` emits `where` trees, keyword lists, raw-field fallback, multi-document files, and Sigma `correlation:` docs (event_count→threshold, temporal_ordered→sequence). Emits per-rule `fidelity` (exact | approximate).
- **Compiler** — `compile.js` `compileNode` (parenthesized, params-only boolean SQL) + `compileRawLeaf` (`raw_json ->> $n`, field name bound). `KEYWORD_COL='search_text'`.
- **Cron/engine** — `sigmaCron.js` `extractSignature` walks the tree (no false negatives); `fidelity` persisted + summarized. `run.js` passes `doc.where ?? doc.selection`.
- **Migrations (applied to Docker on 5433 + mirrored in `db/schema.sql`, NOT on VPS):** `db/migrations/2026-09-05-logs-raw-jsonb.sql` (generated `raw_json jsonb` + `search_text`, GIN + pg_trgm, propagates to all logs partitions) and `2026-09-05-sigma-fidelity.sql` (`sigma_rules.fidelity`). raw `->> ILIKE` is a seq scan — mitigated: ingest single_event/keyword rules are batch-scoped by `l.id = ANY(logIds)`. Re-measure EXPLAIN at VPS volume before enabling low-selectivity raw categories by default.
- **UI** — `RuleLibrary.jsx` aligned to the sibling `DetectionRules.jsx` styling (row padding/border/valign, neutral reject color) plus a fidelity `approx` badge and an Exact/Approximate filter (catalog route returns `s.fidelity`, accepts `?fidelity=`; status endpoint counts per fidelity). Shell builds clean.
- **Coverage harness** — `tests/sigmaCoverage.test.js` (env-gated: `SIGMA_COVERAGE=1 SIGMA_ARCHIVE=<tar.gz>`).
- **Known gap:** catalog `sequence` rules convert + enable but `runCatalogRules` still evaluates only single_event/threshold at ingest (event_count fires; sequence does not yet). `N of them` (N>1), `temporal`, `value_count`, `expand` are named-rejected on purpose.
- **Ship:** commit engine files + 2 migrations (raw-jsonb → fidelity, after the 3 existing sigma migrations) + shell rebuild + pm2 restart; run the raw-jsonb EXPLAIN at VPS scale first.

#### DEPLOYED TO PRODUCTION (2026-09-05) — `9ca34ac` is now LIVE on the VPS

Executed the full deploy sequence below on `root@92.112.181.219` (`/var/www/cybertools`). Result: VPS fast-forwarded `4776361 → 9ca34ac`; all 8 migrations applied; shell rebuilt; `cybertools-server` (pm2 id 6, port 4001) restarted clean.

- **Migration order used (FK-correct — the line-44 list below is WRONG, it puts alerts-correlation before correlation-rules):** correlation-rules → correlation-state → alerts-correlation → sigma-catalog → sigma-enablement → sigma-prefilter → sigma-fidelity → **logs-raw-jsonb** (ran last; harmless — its only cross-dep is none). All 7 additive migrations applied in seconds. `logs-raw-jsonb` (the STORED-generated-column rewrite + 2 GIN indexes on the 3.2 GB partitioned `logs`) took **~15 min** (real 14m57s); column rewrites finished first, the trigram GIN build was the long tail (~10 min). No writer pileup observed; Fluent Bit buffered/retried. Ran it as postgres superuser via `-f`.
- **Verified:** `logs.raw_json`/`search_text` present + `raw_json` 100% populated (current month); `idx_logs_raw_json` + `idx_logs_search_text_trgm` built; tables correlation_rules/correlation_state/sigma_rules/sigma_sync_state/sigma_rule_overrides exist; sigma_rules has fidelity/sig_* cols; `alerts` has alerts_dedup + alerts_corr_dedup + alerts_sigma_dedup + correlation_rule_id FK. Server boot clean (crons scheduled incl. `[sigmaCron] daily 04:15 ref latest`), local health 200, `/api/siem/rules/sigma/status` 401 unauth (correct). Public `https://0xkudo.com/api/health` 200; served index references the freshly-built `index-Dakse8qm.js`. The `alerts_dedup does not exist` lines in the error log are STALE (predate the restart; constraint exists now).
- **Schema backup:** `/root/cybertools-schema-predeploy-20260905-171831.sql` on the VPS.
- **NOT done (optional):** Sigma catalog is empty until a sync runs — the **04:15 daily cron** will populate it at the new ~96% fidelity rate, or trigger `POST /api/siem/rules/sigma/sync` from the logged-in app now. No shell/Electron rebuild needed beyond what was done.
- **npm audit:** `npm install` suggested `npm audit fix` (not run — no breaking changes forced).

#### DEPLOY STATE / RUNBOOK (as of 2026-09-05, for continuation on another account)

- **GitHub:** commit `9ca34ac` pushed to `main` at `github.com/0xKudo/0xKudoSec.git` (all engine + migrations + tests; docs/ are gitignored so spec/plan are NOT on GitHub — they live only in the working tree).
- **Shell:** built locally to `platform/shell/dist/` (includes the fidelity badge/filter). Not yet deployed.
- **Electron:** NO rebuild needed — the packaged app loads `https://0xkudo.com` at runtime (`main.js:140-144`), so the new Rule Library appears once the shell is deployed. Rebuild is only for main.js/preload.js/tray.js/icon changes.
- **VPS:** `root@92.112.181.219` (SSH key `~/.ssh/vps_cybertools`, config Host already set, User root). App at **`/var/www/cybertools`**, branch `main`, currently at **`4776361`** — i.e. the VPS has NEVER received the Sigma Rule Library, the correlation engine, OR this work. pm2 process is **`cybertools-server`** (id 6), app runs on **PORT 4001**. Node v24, npm 11. VPS `db/migrations/` only has: attack-techniques, logs-partitioning, rls-strict, alerts-dedup-constraint.
- **Because the VPS is that far behind, deploying `9ca34ac` lands the WHOLE lineage** (sigma library + enablement + prefilter + correlation engine + full coverage). The server code references DB objects that must exist first, so migrations MUST run before `pm2 restart` or the Rule Library catalog endpoint (`s.fidelity`), the sync (`fidelity` upsert), and keyword/raw rules (`search_text`/`raw_json`) will error.

**Deploy sequence (run on the VPS as root, migrations as the table owner / OPS_DB_URL):**
1. `cd /var/www/cybertools && git pull` (fast-forward 4776361 → 9ca34ac)
2. `cd platform/server && npm install` (new deps: `tar-stream`, `js-yaml`; `node-cron` already present)
3. Run migrations IN THIS ORDER against the VPS DB (find the owner URL in `platform/server/.env`; RLS-global tables like sigma_rules run as the owner, per [[project_vps_db_no_rls]]):
   `2026-09-05-alerts-correlation.sql` → `correlation-rules.sql` → `correlation-state.sql` → `sigma-catalog.sql` → `sigma-enablement.sql` → `sigma-prefilter.sql` → `logs-raw-jsonb.sql` → `sigma-fidelity.sql`
   **Before applying `logs-raw-jsonb.sql` at production volume**, run its `EXPLAIN ANALYZE` note (raw `->> ILIKE` is a seq scan; adding a generated STORED column to the partitioned `logs` REWRITES every partition — do it in a maintenance window; verify it does not lock ingest unacceptably).
4. Build + deploy the shell: `cd platform/shell && npx vite build` then publish `dist/` to whatever serves `0xkudo.com`.
5. `pm2 restart cybertools-server` (NEVER `sudo pm2` per [[feedback_never_sudo_pm2]]).
6. Optional: trigger a Sigma sync (`POST /api/siem/rules/sigma/sync`) or wait for the 04:15 cron so the catalog re-converts at the new ~96% rate and populates `fidelity`.
- **NOT executed this session** (user switched accounts before deploy). SSH access from this machine is confirmed working via the `vps_cybertools` key.

---

### DONE (2026-09-05) — XDR/SOAR roadmap: design spec + Phase 0/1/2 plans (docs only, no code)

Planning work to take 0xKudoSec from detect-and-log into detect, correlate, contain, eradicate. Targets capability parity with Sentinel / Falcon NG-SIEM / ConnectWise / Splunk ES / Cortex XSIAM **for a small-to-mid environment**, not feature parity.

**Design spec:** `docs/specs/2026-09-04-xdr-soar-design.md` — 10 ranked structural gaps, 6 new subsystems (entity resolver, correlation engine, incident builder, playbook engine, connector bus, response fabric), 7 phases, commercial tier shape, compliance notes, 5 open questions.

**Plans written:**
- `docs/plans/2026-09-05-xdr-phase0-foundations.md` — RLS close-out, `logs` partitioning, ATT&CK field, tier-gating *design only*, code signing deferred
- `docs/plans/2026-09-05-xdr-phase1-correlation.md` — rule document schema, SQL compiler, correlation state, engine runner, Sigma import, rule tester + ATT&CK coverage UI
- `docs/plans/2026-09-05-xdr-phase2-entities-incidents.md` — entity graph, risk scoring, auto-incident clustering, entity/incident API + UI

**Key decisions:**
- **Correlation before response.** `detection.js` is a single-event flat ILIKE matcher — no windows, thresholds, sequences, or joins. Automating remediation on top of that automates false positives. That gap blocks everything else.
- **Adopt Sigma, do not invent a query language.** Converts "40 hand-written rules" into the SigmaHQ library.
- **Entity graph is what makes it XDR.** `logs.process_guid` / `parent_process_guid` are already collected and currently used only by `ProcessTreePanel.jsx`.
- **Electron response service is Phase 3, not the headline feature.** Privileged Windows service (not per-action UAC), signed typed-whitelist actions, TTL + rollback on every containment.
- **Tier gating is fully designed but deliberately NOT implemented.** Design lives in `docs/specs/tier-roadmap.md` (full per-module tier map, Free/Pro/Enterprise) and `docs/specs/billing-spine.md` (Stripe + Auth0 loop). Enforcement model **decided: `requireCapability(name)`**, not binary `requirePaid` — a shared `platform/shared/capabilities.js` maps capability name → min tier (free < pro < enterprise); routes reference capability names so re-tiering is a one-line table edit. Tier resolved from the existing `https://0xkudo.com/roles` claim (highest tier role wins); Auth0 assigns `pro`/`enterprise` roles. `requirePaid` kept only as a thin alias for the orphaned test. Phases 1-2 ship ungated for dogfooding; gate at Phase 3a. Standing rules: safety features (rollback, guardrails, break-glass, audit) and data export are never paid upsells, and no capability ever moves Free → paid.
- **Billing spine never built** (verified 2026-09-05): `requirePaid.js`, `db/index.js`, `services/auth0Mgmt.js`, `services/stripe.js`, `routes/billing.js` all missing; `billing.test.js` / `requirePaid.test.js` / `db.test.js` fail. `requireRole('paid')` at `index.js:28` is the existing primitive. Stripe↔Auth0 join = customer `metadata.auth0_sub` (no billing table). Webhook must use `express.raw` before global `express.json()`. Sketch only, not planned into tasks yet.
- **Code signing deferred on cost.** EV cert (~$300-600/yr + token) not affordable now. Zero impact on Phases 0-2 (all server-side). Consequence: **Phase 3 split into 3a (no-agent response: cloud connectors, VPS firewall, WP plugin — needs no signing, unblocked today) and 3b (Electron service — gated on signing).** Cheapest revisit option is Azure Trusted Signing (~$120/yr, verify eligibility). Fallback is shipping 3a only.
- Explicitly not competing on: kernel prevention, global threat telemetry, petabyte search, XSOAR's 900+ connector catalogue.

**Blocker (must clear before Phase 3a):**
- Conditional-RLS `withUser()` migration (`docs/plans/2026-07-20-rls-deployment.md`) — a cross-tenant leak on `response_actions` means one tenant isolating another tenant's machines. `db.withUser()` exists at `services/db.js:68` but zero routes use it.

No code changed. No deploy.

---

### IN PROGRESS (2026-09-05) — XDR Phase 0: Foundations

Branch `feat/xdr-phase0-foundations` (off `main`). Plan: `docs/plans/2026-09-05-xdr-phase0-foundations.md`.

Task order (code signing removed from phase, deferred on cost):

**DONE 0.4.3** — skipped the 3 orphaned billing/db tests (`billing.test.js`, `requirePaid.test.js`, `db.test.js`) with `describe.skip` + comment pointers to billing-spine.md. Suite no longer fails on them. No gating built.

**DONE 0.3 — ATT&CK technique field (full stack):**
- `db/schema.sql`: `detection_rules.attack_techniques text[] DEFAULT '{}' NOT NULL`
- `db/migrations/2026-09-05-attack-techniques.sql`: idempotent ALTER for the live VPS (run manually)
- `platform/shared/attack.js`: 14 tactics + ~55 curated techniques, `validateTechniqueIds`, `techniqueLabel`. Tested in `platform/server/tests/attack.test.js` (9 tests pass).
- `platform/server/routes/siem.js`: POST/PATCH `/rules` validate + store techniques (unknown IDs dropped, cap 50); GET `/alerts` now returns `r.attack_techniques` via the existing rule join.
- `platform/shell/src/components/DetectionRules.jsx`: tactic-grouped technique picker in rule form + removable chips + technique badges on rule rows (table + mobile card).
- `platform/shell/src/components/AlertQueue.jsx`: technique badges in the Rule column.
- `platform/shell/vite.config.js`: added `server.fs.allow: ['..']` so the shell can import `platform/shared/*` (first cross-package shell import; needed by attack.js).
- `detection-rules.json`: 51 alert rules tagged, 27 distinct techniques, all validated; suppress rules left empty.
- Shell builds clean; affected server tests green.

**DONE 0.1 — close RLS migration (code-complete + locally verified 2026-09-05).** Full detail in `docs/plans/2026-07-20-rls-deployment.md` (STATUS section). Summary:
- KEY DISCOVERY: RLS policies already existed but were **conditional** (`app.user_id IS NULL OR user_id = ...`) → a no-op because no route set the context. Fix: set context everywhere, then flip policies to strict.
- DONE (request path): `services/db.js` (added `withUserPool`; fixed latent `SET LOCAL $1` bug → `set_config`); NEW `middleware/dbContext.js` (`req.db`); converted `routes/siem.js` (63 queries + account-del txn→ops pool), `routes/ingest.js` (insertEvents→withUserPool), `services/detection.js`, `routes/noise.js` (14 routes, 25 queries); `tests/setup.js` mock extended.
- DONE (background/services): `services/audit.js` → `withUser` INSERT; `services/noiseCron.js` 3 per-user fns → `withUserPool`, cron enumerator → `getOpsPool`; `services/retentionCron.js` all cross-user maintenance → `getOpsPool` (removed dead `const pool = db`); `kbCron.js` unchanged (`vuln_kb` excluded from RLS). Straggler grep clean.
- DONE (strict flip): NEW `db/migrations/2026-09-05-rls-strict.sql` (11 `ALTER POLICY`, one txn, rollback in header) + `db/schema.sql` policy defs updated to strict. Applied to local Docker DB and verified fail-closed (no-context `count(*) FROM logs` → 0). `tests/rls.integration.test.js` **5/5** incl. new fail-closed assertion, as the `cybertools_app` NOBYPASSRLS role.
- Local DB prepped: `attack_techniques` applied; roles `cybertools_app`/`app` (NOBYPASSRLS), `ingest_auth`/`ingest` (BYPASSRLS) on Docker pg (port 5433, container `kudo-pg`). **No local `ops` BYPASSRLS role yet** — retention/account-delete smoke locally needs one (`OPS_DB_URL`); on VPS confirm `OPS_DB_URL` points at a BYPASSRLS role.
- **VPS-VERIFIED END-TO-END (2026-09-05):** deployed branch `feat/xdr-phase0-foundations` (commit `3d82334`, pushed to origin) to the VPS via `git checkout` of the branch (VPS still on this branch, NOT merged to main yet — user does the main merge later). Prereqs done on VPS: created role `cybertools_ops` (LOGIN, BYPASSRLS, GRANT ALL on tables/sequences) + set `OPS_DB_URL` in `.env` (was empty); applied `2026-09-05-attack-techniques.sql`; `npm run build --workspace platform/shell`; `pm2 restart cybertools-server --update-env` (id 6 only). Applied `2026-09-05-rls-strict.sql` (all 11 policies now strict). **Proven:** as `cybertools_app` no-context `count(logs)=0` (fail-closed), user-context returns full data (560460 logs, 94 rules). **Live pipeline test under strict RLS:** PowerShell 4104 (Script Block Logging on; Fluent Bit ships `Microsoft-Windows-PowerShell/Operational`) → ingest (`insertEvents`→`withUserPool` WRITE) → detection (`withUserPool` READ + alert INSERT) → **alert fired** (rule 95, sev high, count deduped). Note: app runs on **PORT 4001** on the VPS (not 4000; 4000 = dockit-server).
- **BUG FOUND + FIXED during the test — `alerts_dedup` constraint missing:** `detection.js` does `ON CONFLICT ON CONSTRAINT alerts_dedup` but the constraint existed only in `docs/schema.sql`, never in `db/schema.sql` or on the VPS → every rule match threw `constraint "alerts_dedup" ... does not exist` and **no alert had ever been created in production**. Fixed: `ALTER TABLE alerts ADD CONSTRAINT alerts_dedup UNIQUE (user_id, rule_id, event_id)` applied on the VPS (alerts was empty) + local Docker DB (after de-duping synthetic seed rows) + added to `db/schema.sql` + new `db/migrations/2026-09-05-alerts-dedup-constraint.sql` (idempotent). These schema/migration file changes + a DetectionRules.jsx copy tweak ("Drives the coverage view." removed) are **uncommitted locally** (post-`3d82334`) — commit + push + VPS pull + shell rebuild to ship the file changes (the DB constraint is already live on the VPS).
- **MERGED + FINALIZED (2026-09-05):** `feat/xdr-phase0-foundations` fast-forwarded into local `main`, reconciled with `origin/main`'s `5791b68` landing upload (the uncommitted local `LandingPage.jsx` was identical to `5791b68` modulo CRLF, so discarded then merged), pushed to `origin/main` → `9d25f53`. VPS moved back onto `main` @ `9d25f53`, shell rebuilt, `pm2 restart cybertools-server` (id 6). Verified: health 200, unauth 401, 11 strict policies, `alerts_dedup` present. **0.1 fully DONE, production, on main.** Never `sudo pm2`.

**DONE 0.2 (2026-09-05) — partition `logs` by month, SHIPPED TO PRODUCTION.** Committed `4776361` on `main`; migration applied on the VPS (838,493 rows backfilled in 29s), verified with live traffic (28k+ events/20min routing to `logs_y2026m09`, planner prunes old months), and `logs_old` dropped (reclaimed ~1.76 GB). Full detail below. Plan: `docs/plans/2026-09-05-xdr-phase0-foundations.md` Task 0.2.

**Design decision (settled):** partitioning forces PK → `(id, timestamp)`, which breaks the FKs `alerts.log_id`→logs and `realtime_analysis.log_id`→logs (a FK needs a UNIQUE target; `(id)` alone can't be unique on a partitioned table). **Chosen: DROP those FKs**, keep `log_id` as plain indexed columns, enforce integrity in-app. Ripples handled: (a) account-deletion in `siem.js` now DELETEs `realtime_analysis` explicitly (the ON DELETE CASCADE is gone); (b) retention cleans orphaned `realtime_analysis` rows.

**DONE + rehearsed on Docker (port 5433):**
- NEW `db/migrations/2026-09-05-logs-partitioning.sql` — RANGE-by-month migration: backfill NULL ts, rename OLD logs' pk/indexes aside (they'd squat the canonical names since `logs_old` is kept), create `logs_partitioned` (`LIKE logs INCLUDING DEFAULTS`, PK `(id,timestamp)`), monthly partitions (min→now+2mo) + `logs_default`, indexes (BRIN on timestamp + btree `(user_id,timestamp DESC)`/`(user_id,event_id)`/`(user_id,host)`/`(user_id,severity)`), owner `cybertools_app` + `GRANT ALL` to `cybertools_ops` + **`GRANT CREATE ON SCHEMA public TO cybertools_app`** (needed so the cron, running as the table owner, can create partitions), RLS policy re-created, backfill `INSERT SELECT`, DROP the 2 child FKs, swap names, 3-step sequence re-own (`OWNED BY NONE`→`OWNER TO cybertools_app`→`OWNED BY logs.id`), add `idx_alerts_log_id`/`idx_realtime_analysis_log_id`. Keeps `logs_old` for verification (DROP separately after).
- Verified on Docker: row counts match (180=180), rows routed to correct monthly partitions, `EXPLAIN` prunes to a single month, RLS still fail-closed (no-ctx 0 / with-ctx full), live insert routes to current month + draws from the sequence.
- `services/retentionCron.js` — added `ensureLogPartitions()` (pre-creates current+2 future months, as owner via `db.getPool()`), `dropOldLogPartitions(maxRetentionDays)` (drops months entirely older than the LONGEST per-user retention — global DROP PARTITION is only safe past the max; per-user row DELETE still trims live months), and orphaned-`realtime_analysis` cleanup; wired into `runRetention`; exported the helpers. **Tested end-to-end on Docker:** old Jan partition dropped, future Nov partition created.
- `routes/siem.js` — account-deletion now deletes `realtime_analysis` before `logs`.
- Local Docker roles: created `cybertools_ops`/`ops` (BYPASSRLS) locally too (was VPS-only); granted CREATE on schema to `cybertools_app`.

**REMAINING for 0.2 (next account picks up here):**
1. **DONE (2026-09-05) — `db/schema.sql` rewritten for partitioned fresh installs.** `logs` is now `CREATE TABLE ... PARTITION BY RANGE ("timestamp")` with `timestamp NOT NULL`; PK is `(id, "timestamp")` (no `ONLY`, so it propagates); added `logs_ts_brin`, `idx_alerts_log_id`, `idx_realtime_analysis_log_id`; the two child FKs (`alerts_log_id_fkey`, `realtime_analysis_log_id_fkey`) removed with explanatory NOTE comments; appended a DO-block bootstrap creating current+2 monthly partitions + `logs_default` at the end (after PK/defaults/indexes/RLS so each `PARTITION OF` inherits them). Role-agnostic like the rest of the dump — **no** `GRANT CREATE ON SCHEMA` line in schema.sql (that stays a VPS/migration-only concern; fresh `db:up` runs as the `postgres` superuser). **Verified**: loaded schema.sql into a throwaway `schema_smoke` DB with `ON_ERROR_STOP=1` (clean), `logs` relkind=`p`, PK=`(id,"timestamp")`, partitions Sep/Oct/Nov 2026 + `logs_default`, live insert routed to `logs_y2026m09`, child inherited 6 indexes, RLS enabled+forced, zero FKs referencing logs. Smoke DB dropped.
2. **DONE (2026-09-05) — local app smoke.** Ran `dev:server` against Docker 5433 and drove a real 4104 through `POST /api/ingest/beats` (Fluent Bit winlog shape: `EventID`/`ComputerName`/`Channel`/`Level`/`Message`; a temp known ingest key + a temp `match_event_id=4104` rule were used). Result: log routed to `logs_y2026m09` (current-month partition), event_id/host/category/severity normalized correctly, and detection fired an alert via the `alerts_dedup ON CONFLICT` path — proving `insertEvents`→`withUserPool` WRITE → partition routing → `detection.js` `withUserPool` READ + alert INSERT all work against the partitioned table. Smoke artifacts (temp rule, alert, 2 logs) deleted afterward; logs back to the 181-row rehearsal seed. NOTE: the temp ingest-key hash on `user_ingest_keys.id=4` was overwritten with a known dev value (original plaintext was unrecoverable anyway — it's hashed); regenerate the key in-app if needed, or it clears on `db:reset`.
3. **DONE — dropped `logs_old` on Docker** (`DROP TABLE logs_old;`); `logs` intact (181 rows), sequence still owned by `logs.id` (no cascade drop).
4. **DONE (2026-09-05) — VPS deploy + verified in production.** Commit `4776361` pushed to `origin/main`; VPS pulled to it. Ran `db/migrations/2026-09-05-logs-partitioning.sql` as the `postgres` superuser (pipe via stdin; superuser bypasses RLS for the backfill and can do the ownership/GRANT DDL). **838,493 rows backfilled in a single txn in 29s** (moderate size — single `INSERT SELECT` was fine, no batching needed; brief ACCESS EXCLUSIVE lock on `logs` during the window). Verified: `logs` relkind `p`, PK `(id,"timestamp")`, partitions Jul 338672 / Aug 166541 / Sep 333280 = 838493 (none in `logs_default`), `logs`==`logs_old` count, sequence owned by `logs.id`, RLS fail-closed as `cybertools_app` (no-ctx 0 / with-ctx 838493), `EXPLAIN` prunes to a single month. No shell changes in this commit, so **no shell rebuild** — just `pm2 restart cybertools-server --update-env` (id 6; health 200 on **PORT 4001**). Live app write-path proven: a controlled event POSTed to `:4001/api/ingest/beats` (temp key, non-matching event_id to avoid polluting real alerts) routed to `logs_y2026m09`, then cleaned up (temp key + row deleted, back to 838493). Partitions present: Jul/Aug/Sep/Oct + `logs_default` (cron `ensureLogPartitions` extends future months). **`logs_old` DROPPED on the VPS (2026-09-05)** after prod UI confirmed healthy — reclaimed ~1.76 GB; `logs` intact and growing, sequence still owned by `logs.id` (no cascade). **Task 0.2 fully complete in production.** Never `sudo pm2` / `pm2 restart all`.

**Docker DB state note:** the local `kudo-pg` DB is now in a REHEARSED-partitioned state (`logs` partitioned, `logs_old` present, test rows added). It is NOT pristine. `npm run db:reset` rebuilds from `schema.sql` which does NOT yet have partitioning (task 1 above), so a reset currently reverts to non-partitioned logs.

**Git state:** 0.1 + alerts_dedup are committed/pushed on `main` (`9d25f53`). The 0.2 work (migration file, `retentionCron.js`, `siem.js` account-del, **and now the `db/schema.sql` partitioning rewrite**) is **uncommitted** — a fresh clone/other account will NOT have it until committed+pushed. `db/schema.sql` now carries the full partitioned-`logs` definition (a fresh `db:up` creates the partitioned table). Note: `npm run db:reset` will now rebuild Docker as partitioned.

**TODO 0.2** partition `logs` by month (rehearse on Docker DB port 5433 first), retention → DROP PARTITION. Needs Docker DB.

**Test-run caveat:** `npx vitest run` with NO path is misleading — it globs test copies under `.claude/worktrees/cybertools-ui-c5-fixes-499600/` (a stale worktree with its own old `setup.js`) and reports ~100 failures that are NOT this work. Always run targeted paths. Pre-existing failures on the base commit (confirmed via `git stash`): `siem-routes.test.js` (vitest mock-version mismatch) and 3 in `ingest.test.js` (env-key/mock) — not caused by Phase 0.

Branch `feat/xdr-phase0-foundations` has uncommitted changes (not committed per workflow — user commits/pushes). Docker `kudo-pg` is running.

---

### IN PROGRESS (2026-09-05) — XDR Phase 1: Correlation Engine

Plan: `docs/plans/2026-09-05-xdr-phase1-correlation.md`. Ships multi-event detection + SigmaHQ import, ungated. Critical path 1.1→1.4 in order; 1.5 (Sigma) parallel after the doc shape freezes; 1.6 (UI) after 1.4.

> **PICK-UP SUMMARY (read first).** Phase 1 tasks **1.1–1.5 are code-complete and LOCAL-ONLY** (uncommitted, applied to Docker DB only, NOT on the VPS, NOT built into the shell). **79 Phase-1 tests pass** (run from `platform/server`: `npx vitest run tests/correlationRule.test.js tests/correlationCompile.test.js tests/correlationState.test.js tests/correlation.test.js tests/correlationSigma.test.js`). Remaining: **1.6 UI** (needs shell rebuild), then a single VPS deploy. A Sigma **rule-library** feature is spec'd separately (`docs/specs/2026-09-05-sigma-rule-library.md`) as Phase 1.5/2, not built.
>
> **FILES TO COMMIT (verified against `git status` 2026-09-05).** Modified (normal `git add`): `db/schema.sql`, `platform/server/package.json` (js-yaml dep), `platform/server/routes/ingest.js`, `platform/server/routes/siem.js`, `platform/server/services/retentionCron.js`. New untracked (normal `git add`): `platform/shared/correlationRule.js`, `platform/server/services/correlation/` (compile.js, state.js, run.js, sigma.js, sigmaFieldMap.js), `db/migrations/2026-09-05-correlation-rules.sql`, `db/migrations/2026-09-05-correlation-state.sql`, `db/migrations/2026-09-05-alerts-correlation.sql`, `docs/specs/2026-09-05-sigma-rule-library.md`.
> **GOTCHA — the 5 test files are gitignored** (`.gitignore` line 17 `platform/server/tests/`; older tests are tracked because they predate the rule). They will NOT commit without `-f`:
> ```
> git add -f platform/server/tests/correlationRule.test.js platform/server/tests/correlationCompile.test.js platform/server/tests/correlationState.test.js platform/server/tests/correlation.test.js platform/server/tests/correlationSigma.test.js
> ```
> **Do NOT commit** (pre-existing untracked, unrelated to Phase 1): `integrations/`, `platform/electron/assets/nmap-7.991-setup.exe`. HANDOFF.md + memory are not committed by policy.
>
> **LOCAL DOCKER DB (`kudo-pg`, port 5433) already has all Phase-1 objects applied** (correlation_rules, correlation_state, alerts.correlation_rule_id/group_key + dedup index). `npm run db:reset` rebuilds from `schema.sql`, which now includes them.
> **VPS: NONE of Phase 1 is applied.** At the 1.6 deploy, apply the 3 migrations **in this order** (FKs depend on it) as postgres superuser (`cat FILE | sudo -u postgres psql -d cybertools`): `2026-09-05-correlation-rules.sql` → `2026-09-05-correlation-state.sql` → `2026-09-05-alerts-correlation.sql`. Then `npm install` (js-yaml, if node_modules pruned), `npm run build --workspace platform/shell` (1.6 UI), `pm2 restart cybertools-server` (id 6 only; VPS on **port 4001**; never `sudo pm2`).

**DONE 1.1 — rule document schema (2026-09-05, on `main`, UNCOMMITTED):**
- `platform/shared/correlationRule.js` — the shared contract: 5 types (`single_event`/`threshold`/`sequence`/`join`/`absence`), `LOG_FIELDS` whitelist (selections/group_by/join_on may only reference these — unknown field is a validation error, never SQL passthrough), `CONDITION_OPS`, `parseWindowSeconds` (s/m/h/d), `WINDOW_CEILING_SECONDS`=24h, and `validateCorrelationRule(doc)` → `{valid, errors[]}` with explicit messages. Rejects: unbounded/invalid/over-ceiling windows, missing group_by on threshold, free-text group_by key, count<1, <2 sequence steps, `in` op value mismatches, unknown type/severity, etc.
- `platform/server/tests/correlationRule.test.js` — **27 tests, all green** (each type valid + every rejection). Run from `platform/server`: `npx vitest run tests/correlationRule.test.js`.
- `db/migrations/2026-09-05-correlation-rules.sql` — new `correlation_rules` table (`id,user_id,name,description,rule jsonb,severity,enabled,version,attack_techniques[],created_at,updated_at`), owner `cybertools_app` + ops grant (guarded so it no-ops where roles absent), strict RLS `user_isolation`. Idempotent. **Applied to local Docker `cybertools`** (owned by cybertools_app, RLS forced). **NOT applied to VPS yet** — apply during the 1.4 deploy, not now.
- `db/schema.sql` — same table appended (role-agnostic pg_dump style, RLS + policy) so fresh `db:up` gets it. Fresh-load verified clean in a throwaway DB.

**DONE 1.2 — compiler (2026-09-05, on `main`, UNCOMMITTED):**
- `platform/server/services/correlation/compile.js` — `compileRule(rule, userId, opts)` → `{sql, params, statementTimeoutMs}`. All 5 types: single_event (WHERE + logIds or lookback), threshold (GROUP BY … HAVING count>=N over `make_interval(secs=>$n)` window), sequence (LAG chain partitioned by join key, **no self-join**), join (CTE-per-selection joined on key with an epoch time-delta), absence (NOT EXISTS sentinel, or baseline-vs-recent anti-join when group_by set). **SECURITY: every user value is a bound param; field names resolved only through `LOG_FIELDS` (unknown field throws) — a `DROP TABLE` payload lands in params, never in SQL text (asserted).** Hard `LIMIT` on every query (`DEFAULT_ROW_LIMIT`/`DEFAULT_GROUP_LIMIT`); `STATEMENT_TIMEOUT_MS=5000` surfaced for the runner to apply per query. Integer columns cast `::text` for ILIKE ops.
- `platform/server/tests/correlationCompile.test.js` — **16 tests green**: 9 structural/security (params-only, no interpolation) + 7 integration executing compiled SQL against the Docker DB (single_event, threshold ×2, sequence, join, absence ×2). Run from `platform/server`.
- **KNOWN LIMITATIONS (honest, to relax in 1.3/1.4):** (a) sequence matches events ADJACENT on the join key (no interleaving matching events between steps); the stateful engine relaxes this — the compiled query is the fast candidate finder. (b) `not_followed_by` is NOT enforced in the compiled SQL — the runner handles it. (c) statement_timeout is applied by the runner (SET LOCAL), not baked into SQL text. (d) EXPLAIN ANALYZE at realistic volume still pending — do it against VPS-scale data during the 1.4 deploy (partition pruning already proven in 0.2).

**DONE 1.3 — correlation state (2026-09-05, on `main`, UNCOMMITTED):**
- `platform/server/services/correlation/state.js` — pure sliding-window logic (DB-free, restart-safe): `advanceThresholdState(prevTimes,eventTs,windowSecs,count)` (keeps only the most-recent N timestamps within the window — exact for the >=N decision and bounds payload) and `advanceSequenceState(prevProgress,matchedStep,eventTs,windowSecs,numSteps)` (per-key state machine: step-1 (re)starts, k+1 advances within window, final step fires + clears, expired window clears). DB helpers `recordThresholdEvent`/`recordSequenceEvent` wrap them in an atomic `db.withUser` txn (SELECT … FOR UPDATE + `ON CONFLICT DO UPDATE`). `pruneCorrelationState(maxAgeSecs)` on the ops pool; `STATE_MAX_AGE_SECONDS = ceiling + 1h`.
- `db/migrations/2026-09-05-correlation-state.sql` + `schema.sql` — `correlation_state` (`user_id,rule_id,state_key,window_start,counter,payload jsonb,updated_at`, PK `(user_id,rule_id,state_key)`, `updated_at` index, FK→`correlation_rules(id)` ON DELETE CASCADE, strict RLS). Applied to local Docker.
- `platform/server/services/retentionCron.js` — `pruneCorrelationState()` wired into `runRetention` (after the realtime_analysis orphan cleanup; try/caught so DBs predating Phase 1 don't error).
- `platform/server/tests/correlationState.test.js` — **11 tests green**: 9 pure (threshold sliding/expiry/cap, sequence advance/out-of-window/out-of-order/3-step/restart) + 2 integration incl. **restart-mid-window** (state reloaded from DB, threshold fires at N) and prune.
- **TEST GOTCHA (important):** `tests/setup.js` globally `vi.mock('../services/db.js')`, which silently breaks every real-DB integration test (this is why `rls.integration.test.js` shows failures under a plain run). Fix used here: get the real module via `await vi.importActual('../services/db.js')` in `beforeAll` and pass it explicitly as the `deps` arg. Use this pattern for any future real-DB test. (`rls.integration.test.js` could be fixed the same way — out of scope for 1.3.)

**DONE 1.4 — engine runner (2026-09-05, on `main`, UNCOMMITTED). Critical path 1.1–1.4 COMPLETE.**
- `platform/server/services/correlation/run.js` — `runCorrelation(userId, logIds, deps=db)` mirrors `runDetectionRules`. **detection_rules: delegated to the existing `runDetectionRules`** (this is the 1.4.4 shim — a DELIBERATE deviation from re-evaluating them as single_event docs: delegation is lower-risk and keeps `ingest.test.js`/`siem-routes.test.js` at their exact pre-existing failure baseline; detection_rules can migrate to correlation_rules later). **correlation_rules** run through the compiler + `state.js`: single_event (dedup by event_id), threshold (incremental via `recordThresholdEvent` per matching new log), sequence (all step-matches gathered, sorted by ts, fed to `recordSequenceEvent`), join (compiled candidate query over window), absence (full-pass only, skipped at ingest). All inside one `withUser` txn with `SET LOCAL statement_timeout='5000ms'`. One bad rule can't sink the batch (per-rule try/catch).
- `platform/server/services/correlation/compile.js` — added exported `compileMatch(selection, userId, {logIds,windowSecs,keyField,limit})` (rows + `_key`) used by the stateful engine.
- `alerts` table: NEW nullable `correlation_rule_id` + `group_key`, FK→`correlation_rules` ON DELETE SET NULL, partial unique index `alerts_corr_dedup (user_id, correlation_rule_id, group_key) WHERE correlation_rule_id IS NOT NULL` (correlation alerts' dedup path; the old `alerts_dedup` is rule_id-keyed and untouched). "Exactly one of rule_id/correlation_rule_id" enforced in app, NOT a CHECK (existing alerts can have rule_id NULL via ON DELETE SET NULL). Migration `db/migrations/2026-09-05-alerts-correlation.sql` + `schema.sql` (FK+index appended after correlation_rules; columns inline on the alerts table). Applied to local Docker.
- `platform/server/routes/ingest.js` — call site swapped `runDetectionRules` → `runCorrelation` (fire-and-forget, same broadcast). `runDetectionRules` still exported/used.
- `platform/server/tests/correlation.test.js` — **7 end-to-end tests green** (single_event dedup, threshold fires-at-N / not-below-N, sequence, join, absence full-pass, disabled-rule no-op). **VERIFIED zero regressions:** `ingest.test.js`+`siem-routes.test.js` = 4 fail/5 pass BOTH with and without the ingest swap (git-stash compared) — the 4 are the documented pre-existing mock failures. Fresh `schema.sql` load clean. **All 61 Phase 1 tests pass** (rule 27 + compile 16 + state 11 + e2e 7).

**VPS MIGRATIONS PENDING (apply in order during the 1.6 deploy, as postgres superuser via `sudo -u postgres psql`):** `2026-09-05-correlation-rules.sql`, then `2026-09-05-correlation-state.sql` (FK needs correlation_rules first), then `2026-09-05-alerts-correlation.sql` (FK needs correlation_rules). None applied to VPS yet. The ingest call-site swap ships with them (server-only, `pm2 restart cybertools-server`, no shell rebuild until 1.6 UI).

**DONE 1.5 — Sigma import (2026-09-05, on `main`, UNCOMMITTED):**
- `platform/server/services/correlation/sigmaFieldMap.js` — Sigma(Windows)→`logs` field map, its own reviewed file (Image→process_name, CommandLine→message [no cmdline col; lossy], ParentImage→parent_process_name, SourceIp→source_ip, EventID→event_id, etc). Unmapped field → reject naming it.
- `platform/server/services/correlation/sigma.js` — `sigmaToRule(yaml)` → `{rule, warnings}`; `SigmaUnsupportedError` names every rejected construct. SUPPORTED: named selections AND-combined (`sel1 and sel2`, `all of them`), field maps, list→`in`, `|contains|startswith|endswith`, bare leading/trailing `*` wildcards→text op, `count() by <field> > N`+`timeframe`→threshold, `level`→severity, `tags: attack.tXXXX`→attack_techniques (via `validateTechniqueIds`). REJECTED (named): or/not/1 of, `all of sel*`, keyword lists (OR), modifiers other than the three (re/cidr/base64/all/…), list+text-modifier (OR), interior `*` glob, multi-doc YAML, unmapped field. Output validated through `validateCorrelationRule`.
- `platform/server/routes/siem.js` — NEW routes (auth+dbContext, `ruleImportLimiter`): `GET/POST /rules/correlation` (list / create from a doc), `POST /rules/sigma` (paste `{yaml}`), `POST /rules/sigma-file` (multer memory, .yml/.yaml, 100kb, ext+MIME checked — Phishing pattern). `SigmaUnsupportedError`→400 `{error, unsupported:true}`; dup name→409. `insertCorrelationRule()` helper validates+persists with capped attack_techniques.
- `platform/server/package.json` — declared `js-yaml ^4.1.0` (already hoisted at 4.1.1; no npm install needed locally, but run it on the VPS deploy if node_modules is pruned).
- Tests: `correlationSigma.test.js` **17 green** (conversions + every named rejection); plus an e2e in `correlation.test.js` (Sigma YAML → convert → store → ingest → alert fires). **All 79 Phase 1 tests pass.** siem-routes/ingest still at pre-existing baseline (new siem.js imports load fine — 28/29 siem-routes pass, the 1 fail is the known `/stats` mock).
- **1.5.6 curated starter pack: DEFERRED pending the licensing call below.** The importer is fully functional for user-supplied Sigma; bundling a SigmaHQ pack is the only piece that touches redistribution.
- **1.5.1 LICENSING (DECISION IS LAYNE'S):** SigmaHQ rules are DRL 1.1 — permits use/modification/redistribution incl. commercial, IF notices/attribution are retained AND you don't sell the rules themselves as a standalone rule-feed product (using them as a feature inside the platform is fine). Recommendation: bundle a small curated, cleanly-mapping pack WITH a NOTICE/attribution + the DRL-1.1 text, as a value-add feature (not a sold feed); alternative is fetch-at-runtime from GitHub + cache (still attribute). Not implemented pending Layne's confirmation.

**Sigma Rule Library — SPEC WRITTEN (2026-09-05), not scheduled:** `docs/specs/2026-09-05-sigma-rule-library.md`. Scheduled tarball sync (NOT per-run; ~1-2 min daily via a `sigmaCron.js` like `kbCron.js`), a GLOBAL `sigma_rules` catalog (shared, no RLS, like `vuln_kb`) + per-user enablement (`user_settings.sigma_enabled_categories` + `sigma_rule_overrides`), category toggles mapped 1:1 to SigmaHQ folders (generic/threat-hunting/emerging/compliance/placeholder), an **engine prefilter** (match rules to a batch's event_id/category/source so thousands of rules don't all run per ingest — the real scaling risk), `alerts.sigma_identity` + Community badge, a new **Rule Library** tab after Suppression, DRL-1.1 attribution on Security Practices. 6-phase build. This is a Phase-1.5/2 feature, separate from and after 1.6.

### ============================================================================
### SIGMA RULE LIBRARY — HANDOFF PICKUP SUMMARY (read this first)
### ============================================================================

**Status: ALL 6 PHASES BUILT + verified live in the Electron dev app (2026-09-05). LOCAL-ONLY — uncommitted, NOT on the VPS.** Design spec `docs/specs/2026-09-05-sigma-rule-library.md` (now carries a "Deviations as built" list). Detailed per-phase notes are the sections below this summary.

**What it does:** a scheduled `sigmaCron.js` syncs the whole SigmaHQ catalog (one tarball, ~2s) into a GLOBAL `sigma_rules` table (no RLS, like `vuln_kb`); each user enables categories + per-rule overrides; the correlation engine evaluates each user's enabled catalog rules (stateless single_event/threshold), gated by a coarse per-rule prefilter; catalog alerts carry `alerts.sigma_identity` and show a plain **Sigma** badge; the **Rule Library** tab (inside Detection Rules) drives it all; the Security Practices page carries DRL-1.1 attribution.

**VERIFIED LIVE (elevated Electron dev app, local Docker DB):** synced 312/3,769 converted at tag `r2026-07-01`; a real catalog rule ("Potential Exploitation of CVE-2022-21919…") fired a Sigma-badged alert end-to-end; a detection-rule alert ("Failed logon burst") also fired. UI (sync panel, category toggles, catalog browser with numbered paginator, severity/enable overrides) confirmed by the user.

**FILES (all on disk locally; a same-machine account already has them). `git add -f` needed only when committing, because `.gitignore` has `docs/` `*.md` and `platform/server/tests/`:**
- Modified (normal add): `db/schema.sql`, `platform/server/index.js`, `platform/server/package.json` (tar-stream, js-yaml), `platform/server/routes/ingest.js`, `platform/server/routes/siem.js`, `platform/server/services/retentionCron.js`, `platform/shell/src/components/AlertQueue.jsx`, `platform/shell/src/components/DetectionRules.jsx`, `platform/shell/src/pages/SecurityPage.jsx`.
- New untracked (normal add): `platform/server/services/sigmaCron.js`, `platform/server/services/correlation/` (compile/state/run/sigma/sigmaFieldMap.js), `platform/shared/correlationRule.js`, `platform/shell/src/components/RuleLibrary.jsx`, `db/migrations/2026-09-05-{correlation-rules,correlation-state,alerts-correlation,sigma-catalog,sigma-enablement,sigma-prefilter}.sql`.
- Need `git add -f` (gitignored): `docs/specs/2026-09-05-sigma-rule-library.md`, `docs/specs/2026-09-05-sigma-full-coverage.md`, `platform/server/tests/{correlationRule,correlationCompile,correlationState,correlation,correlationSigma,sigmaCron,sigmaEnablement}.test.js`.
- **Do NOT commit** (pre-existing, unrelated): `integrations/`, `platform/electron/assets/nmap-7.991-setup.exe`. `App.jsx`/`SiemSidebar.jsx` show NO net diff (Rule Library standalone wiring was added then reverted when it became a tab).

**DEPLOY (VPS), in this order:** apply the 6 migrations — the 3 correlation first (`correlation-rules` → `correlation-state` → `alerts-correlation`), then the 3 sigma (`sigma-catalog` → `sigma-enablement` → `sigma-prefilter`) — as postgres superuser (`cat FILE | sudo -u postgres psql -d cybertools`). Then `npm install` (tar-stream/js-yaml if node_modules pruned), `npm run build --workspace platform/shell`, `pm2 restart cybertools-server` (id 6 only; VPS on **port 4001**; never `sudo pm2`). NOTE `2026-09-05-attack-techniques.sql` was already applied to LOCAL Docker this session to fix drift (detection_rules lacked the column); it's already on the VPS from Phase 0.

**TESTS:** run these files INDIVIDUALLY (they hit the real Docker DB on 5433) — `sigmaCron.test.js` (14) + `sigmaEnablement.test.js` (10) + `correlation*.test.js`. **CAVEAT:** `sigmaCron.test.js` and `sigmaEnablement.test.js` both mutate the GLOBAL catalog, so running them in the SAME parallel `vitest` invocation is flaky (one retires the other's rows). Each is green alone.

**NOT built / next:** (a) `docs/specs/2026-09-05-sigma-full-coverage.md` — make ALL ~3,769 rules supported (boolean tree + raw-field accessor + full modifiers); (b) coverage heat map (needs correlation Phase 1.6); (c) optional combined-query prefilter optimization for the unpinned residual.

### ============================================================================

### IN PROGRESS (2026-09-05) — Sigma Rule Library: Phase 1 (Catalog sync core) — CODE-COMPLETE, LOCAL-ONLY

Spec: `docs/specs/2026-09-05-sigma-rule-library.md`. Building the library BEFORE Phase 1.6 (user's call). **Phase 1 of the 6-phase build is done** (catalog sync core; no UI beyond a status endpoint). All 11 tests pass; a real end-to-end sync against live SigmaHQ verified.

**DONE — Phase 1 (catalog sync core):**
- `db/migrations/2026-09-05-sigma-catalog.sql` + `db/schema.sql` — GLOBAL `sigma_rules` catalog (id, sigma_id, identity UNIQUE, title, category, path, rule jsonb, severity, attack_techniques[], convert_status, reject_reason, retired, source_sha, updated_at) + `sigma_sync_state` (one row per sync: ref, source_sha, counts, category_counts/reject_reasons jsonb, duration_ms, error). **No RLS — excluded like `vuln_kb`** (public reference data); owner `cybertools_app`, ops grant guarded. Applied to local Docker; schema.sql appended for fresh `db:up`. **NOT on VPS.**
- `platform/server/services/sigmaCron.js` — modeled on `kbCron.js`. Pure testable core (`classifyEntry` path→category for the 5 SigmaHQ folders, `ruleIdentity` sigma UUID else `path:<sha1>`, `rejectBucket`, `entryToRow`, `buildCatalogRows` dedup-by-identity, `summarize`) + network (`fetchSigmaEntries`: single `github.com/SigmaHQ/sigma/archive/refs/heads/<ref>.tar.gz` download, redirect-following https → zlib gunzip → tar-stream extract, **streamed through memory, no disk writes**; `fetchSourceSha` one GitHub API call) + DB (`syncSigmaCatalog(deps=db,{fetchSha,fetchEntries,resolveRefFn})` — injectable for tests; resolves the ref, upsert batches ON CONFLICT(identity), retire by `source_sha IS DISTINCT FROM` current, write sync summary; concurrency-guarded via `isSigmaSyncRunning`). `getSigmaSyncStatus` returns latest sync + per-category converted/rejected counts. `scheduleSigmaCron` daily 04:15. **Ref: `SIGMA_REF` env default `latest` = newest tagged release** — `resolveRef()` hits `releases/latest`, then `/tags`, else falls back to `master`; an explicit `SIGMA_REF` (branch/tag/SHA) is used verbatim. Archive fetched via the generic `github.com/SigmaHQ/sigma/archive/<ref>.tar.gz` (handles branch/tag/SHA); resolved ref recorded per sync in `sigma_sync_state.ref`.
- `platform/server/routes/siem.js` — `GET /rules/sigma/status` + `POST /rules/sigma/sync` (ruleImportLimiter, audited, 202 fire-and-forget, 409 if already running).
- `platform/server/index.js` — `scheduleSigmaCron()` wired after `scheduleKbCron()`.
- `platform/server/package.json` — declared `tar-stream ^3.1.7` (already hoisted at 3.1.8).
- `platform/server/tests/sigmaCron.test.js` — **11 tests green** (10 pure + 1 DB integration proving upsert → retire-on-next-sync → status via injected fetchers, real Docker DB, `vi.importActual` pattern). **GITIGNORED** — commit with `-f`.

**REAL SYNC VERIFIED (2026-09-05, Docker):** default `latest` resolved to tag **`r2026-07-01`** (commit `552f3fee…`) — full library downloaded+converted in **~2s** (spec budgeted 1-2 min); `master` also verified (commit `272daf82…`, different SHA confirms tag-vs-branch is real). Clean-import rate **~9%** (312 converted of ~3600): generic 252/2892, emerging 48/425, threat-hunting 12/128, compliance 0/3, placeholder 0/23. Reject buckets: unmapped_field 984, condition_of 920, condition_not 776, modifier 464, keywords 177, condition_or 150. **This low rate is expected and honestly reported** — the converter is strict single-selection AND-only (OR/not/`1 of`/`all of sel*` all reject). Raising coverage = future converter work, not a Phase-1 bug. Smoke data cleaned from Docker afterward.

**Ref decision RESOLVED:** default `SIGMA_REF=latest` = newest tagged release (chose tagged over master for reproducibility/vetted content). DRL-1.1 attribution page still Phase 6.

**DONE — Phase 2 (per-user enablement), 2026-09-05, LOCAL-ONLY:**
- `db/migrations/2026-09-05-sigma-enablement.sql` + `db/schema.sql` — `user_settings.sigma_enabled_categories text[]` (default `{}`, opt-in) + `sigma_auto_update boolean` (default true); NEW `sigma_rule_overrides` (user_id, sigma_identity [logical ref, no FK], enabled, severity, PK(user_id,sigma_identity), **strict RLS**); **`alerts.sigma_identity text`** + partial unique index `alerts_sigma_dedup (user_id, sigma_identity, group_key)`. Applied to local Docker. **NOTE: `alerts.sigma_identity` is spec'd under Phase 4 but pulled forward — the Phase 2 engine can't fire catalog alerts without it. The Community/Sigma UI badge stays Phase 4/5.**
- `platform/server/services/correlation/run.js` — NEW `runCatalogRules(client,userId,logIds)` + `upsertSigmaAlert` (dedup on `alerts_sigma_dedup`). Loads the user's EFFECTIVE catalog rules — `(category enabled AND not override-disabled) OR override-enabled`, converted+non-retired only — and evaluates them **statelessly**: single_event via `compileMatch`, threshold via `compileRule`. **No `correlation_state`** (catalog rules from `sigmaToRule` are only single_event/threshold, both stateless), so the state FK to `correlation_rules` is never hit. Wired into `runCorrelation` inside the same RLS txn; return now has `catalog:{created,deduped}`. Per-rule try/catch; one bad rule can't sink the batch.
- `platform/server/routes/siem.js` — `GET/PUT /rules/sigma/settings` (category toggles + auto-update, validated against the 5 categories), `GET /rules/sigma/catalog` (paginated/filterable: category/status/technique/q; returns per-user override + `effective_enabled`), `PUT/DELETE /rules/sigma/overrides/:identity`. `SIGMA_CATEGORIES` exported from sigmaCron.js.
- `platform/server/tests/sigmaEnablement.test.js` — **8 tests green** (opt-in default no-fire, category-enabled fire+dedup, override-disable suppress, override-enable of non-enabled category, override-severity wins, rejected/retired never fire, threshold catalog rule). Run: `npx vitest run tests/sigmaEnablement.test.js`. **26 Sigma+correlation tests green together.** siem-routes at baseline (3/4, known /stats mock).
- **SCALING (Phase 3 dependency):** `runCatalogRules` issues one query per enabled rule against the batch — with a large category (~252 generic single_event rules) that's ~252 small batch-scoped queries per ingest. Correct but not yet fast; Phase 3 adds the prefilter (match rules to the batch's event_id/category/source). Documented in run.js.

**DONE — Phase 3 (engine prefilter), 2026-09-05, LOCAL-ONLY:**
- `db/migrations/2026-09-05-sigma-prefilter.sql` + `db/schema.sql` — `sigma_rules` gains `sig_event_ids integer[]`, `sig_categories text[]`, `sig_sources text[]` (default `{}`) + GIN indexes. Applied to Docker.
- `sigmaCron.js` — NEW `extractSignature(doc)`: pins event_id/event_category/source from **eq/in only** (non-exact ops like contains/endswith are NOT pinned → no false negatives). Populated per rule at sync time (converted rows) + persisted in the upsert. Rejected rows get empty signatures (never run).
- `run.js` — `runCatalogRules` now, at ingest, profiles the batch's distinct event_id/event_category/source and adds a prefilter to the effective-rules query: `(sig_x = '{}' OR sig_x && batch_x)` per dimension. A rule is skipped only when EVERY dimension it pins misses the batch; unpinned rules always run; a full pass (logIds null) skips the prefilter.
- Tests: `sigmaCron.test.js` +3 `extractSignature` unit; `sigmaEnablement.test.js` +3 prefilter (skips absent event_id, admits present, unpinned always runs). **Individual counts: sigmaCron 14, sigmaEnablement 10, correlation 8 — all green.**
- **MEASURED on the real catalog (312 converted):** 74 pin event_id, 20 pin source, **239 unpinned (residual)**. The residual is large because most Windows Sigma rules match `process_name`/`CommandLine` via endswith/contains, which can't be exact-prefiltered. HONEST LIMITATION: the prefilter cuts the ~94 eid/source-pinned rules from irrelevant batches but the 239 process-based rules still run each batch. The real lever for the residual is **combined-query compilation** (one UNION query testing many selections per batch — spec open-question #2, "decide after measuring"); deferred as a Phase-3 follow-up. GIN indexes are in place for catalog growth (at ~3800 rows the planner filters in memory, sub-ms).
- **TEST ISOLATION CAVEAT (like rls.integration):** `sigmaCron.test.js` and `sigmaEnablement.test.js` both mutate the GLOBAL `sigma_rules` catalog (sync does global upsert + `retireStale`), so running them in the SAME parallel vitest invocation is flaky (one retires the other's rows). **Run them in separate invocations** — each is green alone. sigmaCron's integration test is now identity-scoped + has afterAll cleanup.

**DONE — Phase 5 (Rule Library UI) + Sigma badge, 2026-09-05, LOCAL-ONLY (shell rebuild needed at deploy):**
- **Sigma badge on alerts** (user asked for a plain "Sigma" badge, NOT "Community"): `platform/server/routes/siem.js` `/alerts` query now `LEFT JOIN sigma_rules sr ON sr.identity = a.sigma_identity`, `COALESCE(r.name, sr.title) AS rule_name`, `COALESCE(r.attack_techniques, sr.attack_techniques)`. `AlertQueue.jsx`: neutral bordered `s.sigmaBadge` shown when `a.sigma_identity` is set — desktop Rule column + mobile meta line. (This is the whole of "Phase 4" we're doing; no separate Community framing.)
- **Rule Library view**: NEW `platform/shell/src/components/RuleLibrary.jsx`. Registered as SIEM view `rulelibrary` at `/siem/rule-library` (`App.jsx` SIEM_VIEW_PATHS + mount + fallback-list + import; `SiemSidebar.jsx` NAV entry after Detection Rules). Three sections per spec §9: (1) **Sources** — category toggles (5, amber when on, live rule counts), auto-update checkbox, last-sync time + ref + short SHA, "Sync now" button (202→polls status every 4s while `running`, refreshes catalog on settle), multi-category volume warning, DRL-1.1 attribution line linking SigmaHQ. (2) **Catalog browser** — search/category/status/technique filters, paginated table (title, category, severity-override select, ATT&CK chips, convert status, On/Off enable toggle + reset), rejected rules shown with their reason. Uses the Phase-2 endpoints. Mobile via `isMobile` + horizontal-scroll table wrapper. Coverage heat map (spec §9.3) deferred — it reuses the not-yet-built Phase 1.6 map.
- **Shell builds clean.** Build-verified + API/SQL-verified; NOT yet click-tested in a running browser (needs Auth0 login via `npm run dev`).
- **Local Docker drift fixed:** `detection_rules` was missing `attack_techniques` locally (the original `/alerts` query would fail on this Docker DB too — pre-existing drift, not this change). Applied idempotent `db/migrations/2026-09-05-attack-techniques.sql` to Docker so local matches schema.sql/VPS.

**DONE — Phase 6 (DRL-1.1 attribution), 2026-09-05, LOCAL-ONLY (shell rebuild needed):**
- `platform/shell/src/pages/SecurityPage.jsx` — NEW "Detection Content and Open Source" section (before Contact): SigmaHQ credit + link, DRL-1.1 licensing statement, "feature not a sold feed", release/commit transparency, honest unsupported-rule reporting. Bumped "Last updated" to September 5, 2026. This page is the SHARED `/security` route (no-auth) reached from the web footer, the LandingPage footer (both call `window.location.href='/security'`), and Electron (same SPA route) — so ONE edit covers all three surfaces the user asked for.
- `platform/shell/src/components/RuleLibrary.jsx` — the header attribution line now also links to "Security Practices" (`/security`), per spec §9.1/§11.
- Shell builds clean; no forbidden divider chars (·, em/en dash) in the new copy.

**SIGMA RULE LIBRARY SPEC COMPLETE** (all 6 phases: catalog sync → per-user enablement → prefilter → Sigma badge → Rule Library UI → attribution). Remaining before shipping: commit everything, apply the 3 sigma migrations on the VPS in order (catalog → enablement → prefilter; NOTE also the `2026-09-05-attack-techniques.sql` was applied to local Docker to fix drift), `npm install` (tar-stream/js-yaml if pruned), shell rebuild, `pm2 restart cybertools-server`. Optional Phase-3 follow-up: combined-query compilation for the unpinned residual. Coverage heat map waits on correlation Phase 1.6. **A separate spec exists to make ALL Sigma rules supported: `docs/specs/2026-09-05-sigma-full-coverage.md` (not built).**

**SPEC WRITTEN (2026-09-05), not scheduled — Sigma FULL COVERAGE:** `docs/specs/2026-09-05-sigma-full-coverage.md`. Goal: make every SigmaHQ rule supported (today only ~8% convert: 312 of 3,769; 3,457 Unsupported). Root causes: (1) the rule model has NO boolean structure — `correlationRule.js` `selection` is a flat AND array, so OR/NOT/`1 of`/`all of`/keyword-lists all reject (condition_or 151 + condition_not 760 + condition_of 919 + keywords 177); (2) matching is limited to ~30 mapped `logs` columns, so 986 `unmapped_field` reject. Fix pillars: a **boolean condition tree** (`where` node: all/any/not/leaf/keyword) across model+converter+compiler; a **raw-field accessor** reading `logs.raw` as jsonb (`raw_json ->> $n`, field name bound as a param) so any Sigma field works without a column-per-field explosion (needs `raw`→jsonb migration + GIN + pg_trgm); **full modifier set** (re/cidr/all/lt-gt/base64/windash/cased/exists/fieldref); multi-doc + Sigma `correlation:` docs → our threshold/sequence/join; a **fidelity model** (exact/approximate/rejected) stored on `sigma_rules` + surfaced in the Library. 6 phases ordered by impact (boolean tree first, unlocks ~1,800 rules with NO schema change; raw accessor is phase 4, the infra/measurement-heavy one). Prefilter signature extraction walks the tree conservatively (no false negatives). Converter/compiler work, NOT a Rule Library UI change. Not built.

**Sigma Library files to commit now also include (Phase 5):** `platform/shell/src/components/RuleLibrary.jsx` (new), `platform/shell/src/components/AlertQueue.jsx`, `platform/shell/src/components/SiemSidebar.jsx`, `platform/shell/src/App.jsx`, `platform/server/routes/siem.js` (alerts join). Deploy needs a **shell rebuild** (`npm run build --workspace platform/shell`).

**Uncommitted (Sigma Library Phase 1+2+3):** `db/migrations/2026-09-05-sigma-catalog.sql`, `db/migrations/2026-09-05-sigma-enablement.sql`, `db/migrations/2026-09-05-sigma-prefilter.sql`, `platform/server/services/sigmaCron.js`, `platform/server/services/correlation/run.js`, `platform/server/routes/siem.js`, `platform/server/index.js`, `platform/server/package.json`, `db/schema.sql`, and (with `git add -f`) `platform/server/tests/sigmaCron.test.js` + `platform/server/tests/sigmaEnablement.test.js`. **VPS: apply the three sigma migrations IN ORDER at the deploy — catalog → enablement → prefilter.**

---

**NEXT (correlation): 1.6 — UI** (rule editor per-type + rule tester [run a draft against last 24h, no alerts] + ATT&CK coverage heat map; `DetectionRules.jsx`, `ui-component-standards.md`, mobile via `isMobile`). Needs a shell rebuild. Then the VPS deploy of the 3 correlation migrations + the sigma-catalog migration + server + shell.

**Uncommitted for user to commit (Phase 1 to date):** `platform/shared/correlationRule.js`, `platform/server/services/correlation/{compile,state,run}.js`, `platform/server/tests/correlation{Rule,Compile,State,}.test.js` (incl. `correlation.test.js`), `platform/server/services/retentionCron.js`, `platform/server/routes/ingest.js`, `db/migrations/2026-09-05-correlation-rules.sql`, `db/migrations/2026-09-05-correlation-state.sql`, `db/migrations/2026-09-05-alerts-correlation.sql`, `db/schema.sql` (+ HANDOFF/memory, not committed by policy).

---

### DONE (2026-09-04) — Landing page copy/UX cleanup (VPS-deployed)

Edits to `platform/shell/src/pages/LandingPage.jsx` (desktop + mobile), no app/Electron change:
- "How it works" numbering `01/02/03` → `1/2/3` (no leading zeros).
- Footer **SIEM** link now scrolls to the SIEM & Log Management section (added `siemRef`; was a dead `null` handler).
- Removed the **"4 SOC Phases"** stat from both stat bars.
- Removed all **playbook/checklist** mentions (Case Management capability blurb + "Case management from alert to resolution" card) — those features don't exist yet.
- Tools intro "across four SOC phases" → "grouped by workflow stage" (the 5 groups aren't all SOC phases).

**Deploy:** user manually uploaded the file to GitHub `main` (`acdf043 → 5791b68`). VPS pulled, `npm run build --workspace platform/shell`, `pm2 restart cybertools-server` (id 6 only). Live on 0xkudo.com. No Electron rebuild.

---

### DONE (2026-09-05) — v1.2.51 packaging fix (desktop-only crash)

**Problem:** v1.2.50 crashed on launch — `Cannot find module './tools/network-scanner-core.js'`.
The 10 modules in `platform/electron/tools/*.js` were never packed into `app.asar` because
`electron-builder.yml` `files:` listed files individually and omitted the `tools/` dir.

**Fix + release (all complete):**
- `92911c4` added `- "tools/**/*"` to `files:` in `platform/electron/electron-builder.yml`.
- `acdf043` bumped both `package.json`s to **1.2.51** and updated `DESKTOP_DOWNLOAD_URL` in
  `LandingPage.jsx` + `TopNav.jsx` to the 1.2.51 (hyphenated) installer URL.
- Built with `electron-builder --win --x64 --publish never`. **Verified** all 10 `\tools\*.js`
  modules are inside `app.asar` (`asar list`). Benign `rcedit` "Unable to commit changes" warning
  retried, then NSIS installer built fine.
- Hand-built `latest.yml` (SHA512 + size of the real exe). **Asset name uses hyphens**
  (`0xKudo-Security-Toolkit-Setup-1.2.51.exe`) to match the shell download URLs and the historical
  manual-upload naming — NOT the dotted electron-builder auto-publish name.
- VPS deployed (pull `acdf043` → shell built as 1.2.51 → `pm2 restart cybertools-server` only).

**GitHub release published (user):** v1.2.51 release live on `0xKudoSec-releases` with all 3 assets
(hyphenated installer, `.blockmap`, `latest.yml`). Fix fully shipped — download button and
auto-updater both resolve to 1.2.51.

**Spec:** `docs/specs/2026-09-05-desktop-only-packaging-fix.md`

---

### IN PROGRESS (2026-09-04) — Desktop-only local tool execution — branch `feat/desktop-only-network-scanner`

**Why:** The packaged app loads the live VPS (`0xkudo.com`) and routes ALL `/api/*` calls there
(regression from commit `a204408`, which made the old local-server fork dead code). So Network
Scanner was running `nmap` on the VPS instead of the user's machine — it appeared broken. Five
origin-sensitive tools must run locally in the desktop app and show "Desktop only" on the web.

- **Spec:** `docs/specs/2026-09-04-desktop-only-local-execution.md`
- **Plan 1 (this branch):** `docs/plans/2026-09-04-desktop-only-plan1-network-scanner.md`
- **Decisions:** 5 tools are desktop-only (Network Scanner, HTTP Repeater, Intruder, Vulnerability
  Scanner, Subdomain Enumerator), all with **full local IPC execution, no Claude**. The three that
  used `askClaude` (Network Scanner, Vuln Scanner, Subdomain Enum) drop the AI analysis and return
  raw / rule-based output only. nmap is bundled as an installer mirroring Fluent Bit.

**Plan 1 — Network Scanner — DONE (9 commits on the branch, all tests green, NOT merged, NOT built):**
1. `599238d` fix: global error handler now returns **413** on oversized payload (was 500). Root
   cause was the GLOBAL `express.json({limit:'50kb'})` at `index.js:59`, not the tool route.
2. `5af9426` chore: deleted dead `forkServer` from `main.js` (unreachable since `a204408`).
3. `93b5076` feat: shared `platform/shell/src/components/DesktopOnly.jsx` (no render test — server
   vitest env has no jsdom).
4. `4467663` feat: `platform/electron/tools/network-scanner-core.js` (SCAN_PROFILES, validateTarget,
   buildNmapArgs, resolveNmapPath) + pure-validator tests.
5. `a20e4b2` feat: `platform/electron/tools/network-scanner.js` — IPC handler, streams nmap output by
   `runId`, cancel + 5-min timeout; registered in `main.js` whenReady.
6. `ef85164` feat: `tools/network-scanner/server/routes.js` now returns **410** on all paths
   (nmap + Claude removed). Old `network-scanner.test.js` deleted.
7. `90688c0` feat: preload `window.electron.networkScanner` + `window.electron.nmap`.
8. `1ff5681` feat: client branches on `window.electron?.isElectron` — IPC in app, `<DesktopOnly>` on
   web; Claude analysis panel removed; nmap-missing install prompt added.
9. `7703e93` feat: `nmap:status` / `nmap:install` IPC + `extraResources` bundling of
   `assets/nmap-7.991-setup.exe`.

**Local binary NOT in git** (gitignored like `fluent-bit-installer.exe`): the 36 MB
`platform/electron/assets/nmap-7.991-setup.exe` must exist locally for the build. On a second
account/machine, download the same Nmap Windows setup and drop it there before `electron:build`.
Confirm Nmap redistribution licensing (NPSL) before shipping.

**Plan 1 manual verification — DONE (2026-09-05, dev run):** launched via dev (see dev-env fixes
below), logged in, ran Network Scanner. Scans against `127.0.0.1` and `192.168.1.0/24` both work and
return raw nmap output with no Claude panel. nmap auto-detected at `D:\Program Files\Nmap\nmap.exe`
(the core resolver checks C/D/E `Program Files\Nmap`), so no install prompt fired.

**Known follow-up from that run — real-time streaming (spec'd, not yet built):** output only appears
after the scan finishes (behind "Show Raw nmap Output"), not live as nmap runs. Two fixes captured in
the spec's new "Enhancement: real-time streaming output" section: (1) the client hides the live panel
on completion (`!result` guard) — keep streamed lines visible during and after; (2) nmap block-buffers
stdout to a pipe — add `-v` + `--stats-every 1s` to the profile args so it reports incrementally.

**Dev-env fixes to run this branch locally (were broken, now fixed — not code, environment):**
- `.env` `DATABASE_URL` had drifted to `localhost:5432` (native Postgres, wrong password → SIEM
  "Stats 500"). Corrected to the documented Docker value `postgresql://postgres:postgres@localhost:5433/cybertools`.
- Docker `kudo-pg` container was stopped — `docker start kudo-pg` (schema present, 13 tables).
- `platform/shell/.env` was missing (dev Auth0 login broken). Recreated with the public SPA values
  from the live bundle: `VITE_AUTH0_DOMAIN=auth.0xkudo.com`,
  `VITE_AUTH0_CLIENT_ID=TzIyCNnyNhhlKpm0W7uAhPKgcEnv1Cda`, `VITE_AUTH0_AUDIENCE=https://tools.laynekudo.com/api`.
- `electron:dev` npm script is Unix-only (`NODE_ENV=development ... & sleep`) and fails on Windows.
  Run the pieces instead: `npm run dev:server`, `npm run dev:shell`, then `./node_modules/.bin/electron
  platform/electron/main.js` (isDev is true whenever not packaged, so no NODE_ENV needed).
- Symptom that started this: tools vanished from the dashboard because the backend on 4000 wasn't up,
  so the shell's one-shot `/api/tools` fetch failed and `ToolRegistry` fell back to `[]`.

**Plan 1 streaming enhancement — DONE + verified (2026-09-05, commit `5e67ebd`):** nmap args now
`-oN - -v --stats-every 1s …` (verbose = per-port lines stream; stats fill silent phases). Client keeps
the output panel visible during and after the scan (dropped the `!result` guard + post-scan raw toggle).
Confirmed live-streaming against a `/24`. Spec + HANDOFF updated in `b12c903`.

**Still TODO on Plan 1:**
- Test Stop mid-scan and the nmap-missing install prompt (nmap is installed here, so the prompt path
  is unverified); confirm the web fallback shows `<DesktopOnly>` and the server returns 410.
- Then Electron rebuild + release (this changes `main.js`/`preload.js`, so a rebuild IS required),
  and a VPS deploy of the 410 route + 413 fix. Use the `electron-release` skill.

### Plan 2 — HTTP Repeater + Intruder — DONE + dev-verified (2026-09-05)

Plans written at `docs/plans/2026-09-04-desktop-only-plan2-repeater-intruder.md` (and plan3). Commits:
- `b79cf1b` feat(http-repeater): local IPC `http-repeater:send` (core `http-repeater-core.js`
  `validateRequest`), client `isElectron` branch → IPC / `<DesktopOnly>`, server route → 410.
- `d67f688` feat(intruder): local IPC `intruder:start`/`:cancel` **streaming** per-request results
  (`intruder-core.js`: `parsePlaceholders`/`validateAttackConfig`/`computeSummary`); client renders
  rows live + Stop; server route → 410.
- `e23c444` fix: preload `on*` helpers return a disposer; network-scanner + intruder client effects
  clean up. Without it, StrictMode's double-invoke stacked listeners → every streamed row rendered
  twice (Intruder showed 6 rows for 3 payloads). Now correct.

**SSRF block DROPPED** in both (deliberate reversal of Finding 33): local pentest must reach
private/loopback targets; core tests assert `127.0.0.1`/`192.168.x`/`10.x` are accepted. **410 tests**
for both mount the tool router directly (no auth) so they pass — unlike the pre-existing
`network-scanner-410.test.js` which goes through `createApp` and gets 401 (see task chip).

**Verified in dev:** HTTP Repeater `GET http://127.0.0.1:4000/api/health` → 200 JSON (loopback works).
Intruder against `http://127.0.0.1:4000/api/tools/§x§` with 3 payloads → 3 rows streaming, all 404,
Stop works. All new tests green (repeater 10, intruder 11), shell builds clean.

**Still TODO on Plan 2:** confirm the web fallback shows `<DesktopOnly>` for both; folded into the
single Electron rebuild + VPS deploy at the end of Plan 3.

### Plan 3 — Vulnerability Scanner (`scanner`) + Subdomain Enumerator — CODE-COMPLETE (2026-09-05)

Plan doc: `docs/plans/2026-09-04-desktop-only-plan3-vulnscanner-subdomain.md`. **All three plan docs are
now tracked in git** (commit `<plans>`) so a fresh clone / different account has them. Commits:
- `2beae24` feat(scanner): local IPC `vuln-scanner:start`/`:cancel` streaming findings
  (`scanner-core.js`: `validateScanConfig` + passive checks + `computeRisk`); **Claude removed**
  (rule-based Risk Summary replaces the AI card); **`authorized:true` gate kept** for active mode;
  server route → 410.
- `968d9d9` feat(subdomain-enum): local IPC `subdomain-enum:start`/`:cancel` streaming found
  subdomains (`subdomain-enum-core.js`: `validateDomain`, `parseCrtShJson`, `parseHackerTargetText`,
  `DEFAULT_WORDLIST`); crt.sh + HackerTarget + local DNS brute; **Claude + SecurityTrails removed**;
  server route → 410.

**All 5 desktop-only tools now local:** Network Scanner, HTTP Repeater, Intruder, Vulnerability
Scanner, Subdomain Enumerator. 45 tests green across 13 files (all mounted-router 410 tests pass).

**Plan 3 dev-verified (2026-09-05):** Vulnerability Scanner (passive + active with the auth checkbox)
and Subdomain Enumerator (crt.sh + HackerTarget + brute) both work in the app exactly as intended —
findings/subdomains stream in live, no Claude panel. **All 5 tools are now built and dev-verified.**
Remaining: confirm web `<DesktopOnly>` fallback (minor), then the shared release below.

### Release v1.2.50 — Electron build DONE + PUBLISHED (2026-09-05)

- Version bumped to **1.2.50** in `platform/electron/package.json` + `platform/shell/package.json`;
  download URLs in `LandingPage.jsx` + `TopNav.jsx` updated to the v1.2.50 installer.
- Installer built: `C:\Users\lsgra\Desktop\claude projects\dist-electron\0xKudo Security Toolkit Setup 1.2.50.exe`
  (~361 MB). **Published** to `0xKudoX/0xKudoSec-releases` as `v1.2.50` (uploaded manually — the
  `electron-builder --publish` step 401'd because the `GH_TOKEN` in `.env` is expired; rotate it).
- Build notes: the skill's `better-sqlite3` ABI-rebuild step is **moot on this branch** (forkServer
  deleted; better-sqlite3 is not a dependency or referenced anywhere) — skipped it. winCodeSign was
  cached so no admin elevation was needed. A benign rcedit "Unable to commit changes" warning retried
  and the exe built fine.
- **Commit trailers:** all `Co-Authored-By: Claude` trailers stripped from the branch commits via
  `git filter-branch` (per user request — no AI attribution in commits/code). SHAs were rewritten;
  branch is unpushed so this is safe. Do NOT re-add them.

**ROLLOUT COMPLETE (2026-09-05):** branch merged → `main` (ff), pushed to GitHub, VPS deployed.
VPS pulled to `2b6461b`, shell rebuilt, `pm2 restart cybertools-server` (id 6, online). Verified:
home 200, `/api/tools` 200 (19 tools), tool routes 401 (auth-gated + mounted; the 410 sits behind
auth), no startup errors (the only log lines were UnauthorizedError from unauth smoke-test curls).
v1.2.50 exe published on 0xKudoSec-releases. **All 5 tools now run locally in the desktop app and show
DesktopOnly on the web.** (SSH from this machine works with `~/.ssh/vps_cybertools` once the repo is
public or an https credential exists; the repo was made public to allow the VPS https `git pull`.)

### POST-RELEASE ISSUES with v1.2.50 (2026-09-05) — fix in v1.2.51

1. **Packaged app crashes on launch:** `Cannot find module './tools/network-scanner-core.js'`.
   Root cause: `electron-builder.yml` `files:` never included the new `platform/electron/tools/`
   directory, so the 10 tool IPC modules were not packed into `app.asar`. **FIXED in repo** — added
   `- "tools/**/*"` to `files:`. Needs a rebuild + release (v1.2.51). Verify post-build with
   `npx asar list …/app.asar | grep tools/`.
2. **Update banner "Update check failed" (RESOLVED):** the v1.2.50 release had no valid `latest.yml`
   — the `electron-builder --publish` step 401'd (expired `GH_TOKEN`), so `latest.yml` was never
   uploaded. A `builder-debug.yml` got renamed to `latest.yml` by mistake (wrong format, 8.42 KB).
   Fixed by hand-building the correct `latest.yml` (version 1.2.50, real base64 sha512 + size,
   referencing the dots-named asset) and replacing it on the release. Banner then worked. **Root fix:
   rotate `GH_TOKEN` so publish uploads `latest.yml` automatically.**
3. **Owner redirect (not a bug):** the app's `app-update.yml` has `owner: 0xKudoX` but the release is
   under `0xKudo`. `0xKudoX` 301-redirects to `0xKudo` and electron-updater follows it, so updates
   resolve fine. Don't "fix" the owner.
4. **nmap (not a bug):** bundled via `extraResources`; the install prompt is IN-APP (Network Scanner
   checks `nmap:status`, shows Install only when missing) — not part of the NSIS installer. Test the
   prompt on a machine without nmap.

**Easy fix spec for a different account:** `docs/specs/2026-09-05-desktop-only-packaging-fix.md`.

Historical steps (now done):
1. Merge `feat/desktop-only-network-scanner` → `main`, push to GitHub.
2. VPS deploy (sequencing is now safe — the v1.2.50 exe is published so desktop users can update to
   the build that carries the `window.electron.*` IPC bridge):
   ```
   ssh root@92.112.181.219
   cd /var/www/cybertools && git pull
   npm install   # only if deps changed (none this release)
   npm run build --workspace platform/shell
   pm2 restart cybertools-server    # that process ONLY — never pm2 restart all / sudo pm2
   ```
   This deploys the new client (isElectron → IPC branch) + the five 410 routes + the 413 fix.

### Release — the remaining shared step for all 3 plans

One Electron rebuild + release (`electron-release` skill; `main.js`/`preload.js` changed) and one VPS
deploy of all five 410 routes + the 413 fix. Ship together so web users get `<DesktopOnly>` and desktop
users get local execution at once. Confirm nmap installer licensing before the build (Plan 1 open item).
Pre-existing failing tests unrelated to this work: `network-scanner-410.test.js` (401-vs-410 auth, task
chip filed), `siem-routes.test.js` + `ingest.test.js` (broken `vi.mocked` setup, noted 2026-07-24).

### MERGED TO MAIN (2026-07-24) — UI redesign Phase C.5 + D, commit `6bdcb04`

`ui-redesign` fast-forwarded into `main`, then reconciled with the VPS-only WordPress feature.
**DEPLOYED to the VPS 2026-07-24 at commit `606d31a`.** Version still v1.2.49.

### VPS deploy — DONE (2026-07-24)

Pushed to GitHub, VPS pulled to `606d31a`, migration applied, `npm install`, shell rebuilt,
`pm2 restart cybertools-server` (that process only — 7 other unrelated apps share root's PM2).
Verified: site 200, `/api/siem/alerts` + `/api/siem/ingest-key` 401 (not 500), `/api/ingest/ping`
401, 19 tools registered, 2201 WordPress/web events intact, no schema errors in logs.

**Backups left on the VPS in `/var/www/cybertools/`** (safe to delete once satisfied):
`vps-local-mods-20260724.patch` (the pre-deploy uncommitted WordPress work) and
`db-backup-predeploy-20260724.sql` (alerts, user_ingest_keys, wp_protection_rules).

Gotcha hit during migration: `ALTER SEQUENCE ... OWNED BY` fails with "sequence must have same
owner as table it is linked to" — the sequence must be `ALTER SEQUENCE ... OWNER TO cybertools_app`
first. The first attempt rolled back cleanly; no partial state.

The existing ingest key survived as `id=1` with `name = NULL`, so it displays as "Unnamed key".

Migration that was applied (kept for reference / other environments):
   ```sql
   ALTER TABLE alerts
     ADD COLUMN IF NOT EXISTS occurrence_times timestamptz[]
     DEFAULT ARRAY[]::timestamptz[] NOT NULL;

   CREATE SEQUENCE IF NOT EXISTS user_ingest_keys_id_seq;
   ALTER TABLE user_ingest_keys
     ADD COLUMN IF NOT EXISTS id bigint DEFAULT nextval('user_ingest_keys_id_seq') NOT NULL,
     ADD COLUMN IF NOT EXISTS name text;
   ALTER SEQUENCE user_ingest_keys_id_seq OWNED BY user_ingest_keys.id;
   ALTER TABLE user_ingest_keys DROP CONSTRAINT IF EXISTS user_ingest_keys_pkey;
   ALTER TABLE user_ingest_keys ADD CONSTRAINT user_ingest_keys_pkey PRIMARY KEY (id);
   CREATE INDEX IF NOT EXISTS idx_user_ingest_keys_user ON user_ingest_keys (user_id);
   ```
Also required (done): `npm install` for the new `lucide-react` dependency, then
`npm run build --workspace platform/shell`, then `pm2 restart cybertools-server`.
**Never `sudo pm2`**, and never `pm2 restart all` — root's PM2 also runs 7 unrelated apps.

**WordPress feature recovered into git.** It had been running in production as *uncommitted*
working-tree changes on the VPS (WP plugin read API, event normalizer for IDs 9000-9902,
`wp-rules` CRUD, WordPress shipper tab, HTTP/FIM/WP fields in event cards). Now committed as
`6f683dc` off the pre-redesign commit and merged in `606d31a`. Two silent-breakage bugs were
fixed during reconciliation: the WP rules loader gated on `tab !== 1` (Connect a Source is now
tab 0, so it would have loaded nothing), and two config-editor PIN hooks still checked `tab !== 7`
when Edit Config had been renumbered to 6.

**No Electron rebuild needed.** `electron-builder.yml` bundles only `main.js`/`preload.js`/`llmWorker.js`/
`llmProcess.js`/`tray.js`/`splash.html`/`assets`/`node_modules`; the app loads `https://0xkudo.com` at
runtime and no Electron file changed in this release. The redesign ships with the VPS deploy.

**Known pre-existing failure (not from this work):** `platform/server/tests/siem-routes.test.js` and
`ingest.test.js` fail with `vi.mocked(...).mockResolvedValueOnce is not a function` on this commit
**and on the previous main alike** — verified by stashing. Broken mock setup, worth fixing separately.

### Recently Completed (2026-07-23, UI redesign Phase D — IA polish, now merged via `6bdcb04`)
- New shared libs: `platform/shell/src/lib/phases.js` (SOC phase taxonomy + `ROUTE_TO_PHASE`/`PHASE_LABEL`) and `lib/toolIcons.js` (route → Lucide icon map + phase icons). Used by both sidebar and dashboard.
- **Dashboard** (desktop + mobile): status/metrics row — live SIEM counts when authed (`/api/siem/stats`, `/alerts/counts`, `/sources`), local fallback otherwise; tool catalog grouped by phase with Lucide icons, active/coming-soon affordance, staggered entrance.
- **Sidebar**: per-tool Lucide icons, hover/active token polish, active-phase auto-open, icon-rail collapse (persisted `cybertools_sidebar_collapsed`, desktop only). Removed `↗` glyphs.
- **Navigation**: `Breadcrumb.jsx` (Dashboard › Phase › Tool) above every tool on desktop; back-to-dashboard in one click.
- Build passes (`npm run build --workspace platform/shell`). Full detail: `docs/plans/ui-redesign-master-plan.md` (Phase D).

### Phase D review-refinements (2026-07-23, uncommitted)
- Removed the tool breadcrumb bar (deleted `Breadcrumb.jsx`).
- Tools primary button now matches SIEM filled button (subtle `--border`, `6px 14px`).
- Shared `AuthGate` restyled to exactly match the vuln-scanner box; network-scanner switched from modal to inline gate.
- Badge vertical centering: `lineHeight:1` + `+1px` top padding across all severity/status/type badges (Fira caps measured 1px high at 10px).
- API-key management merged into Connect-a-Source; standalone **API Key tab removed** and tab indices renumbered.
- Verified live (logged-out): button, auth gate, decoder/payload-generator/reverse-shell, zero console errors. SIEM badges + Connect-a-Source merge + authed dashboard/sidebar still need a logged-in visual pass.

### Recently Completed (2026-04-11, v1.2.46-beta.2 through beta.5)

- **KB injection confirmed working** — `llmProcess.js` correctly injects KB context into LLM prompts. Confirmed via llm.log: `CVE-2019-11708 (critical CVSS 10.0) [ACTIVELY EXPLOITED - CISA KEV]` injected for Firefox-related candidates.
- **Rescan feature** — `POST /candidates/rescan` resets LLM fields to null/pending. Activity Log tab now has checkboxes, Select All, bulk Rescan. Candidates tab has bulk Rescan alongside Approve/Reject.
- **Candidate detail modal** — click any candidate row in desktop table to open full detail modal: all field_signature fields, LLM explanation, KB matches with NVD links and CVSS scores, Approve/Reject/Rescan actions.
- **KB matches in candidate cards** — `llmProcess.js` now includes `kb_matches` in IPC result. `LlmExplanationCell` and mobile card both show matched CVEs with NVD links, CVSS, and `[KEV]` badge.
- **URL download progress bar** — fixed key mismatch so `onDownloadProgress` events update the URL download bar correctly.
- **Cancel download button** — red Cancel button appears next to Download during any active download (managed + URL). `llm:cancel-download` IPC handler sets `downloadCancelled` flag and destroys active request.
- **Remove deletes file** — Remove now deletes the `.gguf` file for all model types if the file is in the models directory. Custom models added via Browse (external path) are unregistered only.

**Current version: v1.2.47** — published and deployed (2026-04-11).

### Recently Completed (2026-04-11, v1.2.46-beta.1 — Vulnerability Knowledge Base)

- **`vuln_kb` PostgreSQL table** created on VPS — stores NVD CVEs, CISA KEV, and MITRE ATT&CK entries with indexes on `source` and `published_at`
- **`kbCron.js`** — NVD sync (daily, 90-day rolling window, paginates at 2000/page with 6.5s rate-limit delay), CISA KEV (daily, full catalog), MITRE ATT&CK (weekly Tuesdays, full STIX bundle). Scheduled at 03:30 daily. Manual trigger via `POST /api/siem/noise/kb/sync`.
- **`/api/siem/noise/kb/status`** — returns entry counts and last sync time per source, plus `syncing: true/false` flag used by UI polling
- **`/context` endpoint extended** — now also queries `vuln_kb` for matching entries (by `attack_patterns` JSONB and `affected_products`), returning up to 5 KB matches alongside analyst decisions
- **`llmProcess.js` updated** — `formatContext()` now injects KB matches into LLM prompt: CVE title, severity, CVSS score, description, CISA KEV flagged as `[ACTIVELY EXPLOITED]`
- **KB sync banner** in `TopNav.jsx` — amber indeterminate progress bar above nav, matches LLM analysis and update banner style. Triggered via `window.dispatchEvent(new Event('kb-sync-start/done'))` from `SiemConfiguration`. Polls `/kb/status` every 5 seconds until `syncing: false`.
- **KB status panel** in Configuration > Tuning Center Models — table showing entry counts + last sync per source, Sync Now button, Refresh Status button
- **v1.2.45-beta.5/6/7 fixes (same session):**
  - Auto-recover managed model from disk when library entry missing (crashed download)
  - Backfill missing `templateFamily` on existing managed model library entries (`llama-3.2-3b-q4` was defaulting to `phi`)
  - Disable all download buttons while any download in progress
  - Re-sync `llm_model` setting after library loads to prevent false "Download a model" banner on open
  - Qwen 1.5B stop trigger variants added (`{|im_end|}`, `|im_end|`) for token leak
- **All 4 models tested and confirmed working:**
  - Phi-3.5 Mini Q4 — phi template, confirmed previously
  - Qwen2.5.1 Coder 7B (custom) — qwen template, 78 candidates ~26s on RTX 4060
  - Llama 3.2 3B — llama template (after backfill fix), hallucinates CVEs without KB
  - Qwen2.5 1.5B — qwen template, fast, minor stop token variants (fixed)
- **Phase 5 real-time analysis** documented in spec (not yet built)
- **macOS spec** written at `docs/specs/2026-04-11-macos-build.md`

**Current version: v1.2.46-beta.1** — requires rebuild to ship `llmProcess.js` KB context injection. Server-side KB + UI confirmed fully operational on VPS.

**KB sync confirmed working (2026-04-11):** NVD 16,906 entries, CISA KEV 1,559 entries, MITRE ATT&CK 691 entries. All three sources clean (`{}`  errors object empty).

**kbCron.js fixes applied during beta.1 deployment:**
- NVD date format: `.toISOString().slice(0, 23)` for ISO 8601 with T separator (was space-separated, got 404)
- MITRE param index: `idx * 9` base with explicit `::numeric`, `::jsonb`, `::timestamptz` casts (was `idx * 10`, got param type error on $10)
- CISA KEV: cisa.gov blocks VPS IPs via Cloudflare — switched to NVD `hasKev` flag param (`?hasKev` not `?hasKev=true`) which returns all CVEs in the CISA KEV catalog with full CVSS data
- vuln_kb permissions: `GRANT ALL ON TABLE vuln_kb TO cybertools` required (table created as postgres superuser)

**Key files changed:**
- `platform/server/services/kbCron.js` (new)
- `platform/server/routes/noise.js` — `/kb/status`, `/kb/sync`, `/context` KB extension
- `platform/server/index.js` — `scheduleKbCron()` wired in
- `platform/electron/llmProcess.js` — `formatContext()` KB injection, Qwen stop triggers
- `platform/electron/llmWorker.js` — auto-recover disk/library mismatch, templateFamily backfill
- `platform/shell/src/components/TopNav.jsx` — `KbSyncBanner` component
- `platform/shell/src/components/SiemConfiguration.jsx` — KB status panel, polling, sync events
- `platform/shell/src/components/NoiseAdvisor.jsx` — library sync fix on load

**Next:**
- Test KB context injection in LLM analysis log — should see "Known vulnerabilities relevant to this pattern" in llm.log output
- Promote to stable v1.2.46 (rebuild Electron with llmProcess.js KB changes)
- Phase 5 — Real-time event analysis (spec written, not built)
- Rebuild CUDA binary with multi-arch flags for wider GPU compatibility
- macOS build (spec at `docs/specs/2026-04-11-macos-build.md`)
- Wireshark/tshark tool (spec at `docs/specs/wireshark-tshark-tool.md`)

### Recently Completed (2026-04-11, v1.2.41 stability fixes)

- **Stale child process kill:** `llmWorker.js` `runAnalysis` now kills any existing `activeChild` before spawning a new one. Prevents double model load (2x 2.2GB RAM spike) when app is closed mid-analysis and reopened. Previously caused full PC freeze.
- **LLM banner em dash removed:** `TopNav.jsx` banner text changed from "Analyzing noise candidates — X%" to "Analyzing noise candidates X%".
- **Table overflow resolved:** Noise Advisor candidates table no longer extends outside the window (resolved with v1.2.40 layout).
- **Cancel button confirmed working:** Both the banner Cancel and the in-page Cancel button kill the child process correctly.
- **Results persistence confirmed:** Per-candidate write-back survives navigation away and app restart.

### Recently Completed (2026-04-10, Noise Advisor LLM — production fixes v1.2.32–v1.2.40)

**LLM inference is now fully working end-to-end in the packaged Electron app.**

Core problem: node-llama-cpp's native binaries cannot run inside the Electron main process due to CUDA/Vulkan pipeline failures and token vocabulary lookup crashes (`invalid unordered_map<K, T> key`). The fix was to run all inference in an **isolated Node.js child process** (`llmProcess.js`) forked from `llmWorker.js` via `child_process.fork()`. This completely isolates native crashes from the Electron app.

**Key fixes applied (in order):**

- **v1.2.32:** Added `llmLog()` file logger to `llmWorker.js`. Logs written to `%APPDATA%\0xKudo\logs\llm.log`. All inference steps logged with timestamps.
- **v1.2.33–34:** Attempted single-sequence reuse and `LlamaCompletion` fallback — both failed with same native error.
- **v1.2.35:** Bypassed `LlamaChatSession` entirely, used `LlamaCompletion` with pre-formatted Phi-3.5 chat template (`<|system|>...<|end|><|user|>...<|end|><|assistant|>`). Still crashed.
- **v1.2.36:** Created `llmProcess.js` — all node-llama-cpp inference runs in isolated child process via `fork()`. App no longer crashes when inference fails. `electron-builder.yml` updated: `asarUnpack: ["node_modules/**", "llmProcess.js"]` to unpack all deps for child process ESM resolution.
- **v1.2.37:** Added `NODE_PATH` env var pointing to unpacked `node_modules` so child process resolves all ESM imports correctly.
- **v1.2.38:** Identified root cause from logs: CUDA binary incompatible with system, falls back to Vulkan, Vulkan fails with `ErrorOutOfHostMemory` on D3D12 adapter. Fixed by adding `NODE_LLAMA_CPP_GPU: 'false'` env var to child process fork. CPU inference works correctly. Set `gpu: false` in `llmProcess.js`.
- **v1.2.39:** Added `customStopTriggers: ['<|end|>', '<|user|>', '<|system|>']` to `generateCompletion` to stop model from continuing past JSON. Fixed JSON parser to use non-greedy `\{[^{}]*\}` regex first, greedy as fallback. Output now parses correctly.
- **v1.2.40:** Per-candidate server write-back in `onCandidateResult` handler — each result is persisted immediately, surviving navigation away from Noise Advisor. Removed batch write-back at end of run. Cancel now kills the child process (`activeChild.kill()`). Global `LlmAnalysisBanner` added to TopNav showing amber progress bar + `X%` complete + Cancel button — visible on all SIEM views while analysis runs. `llm:analysis-started` IPC event carries total candidate count. `onAnalysisStarted` exposed in preload.

**Architecture (final):**
```
llmWorker.js (Electron main process)
  → fork() → llmProcess.js (isolated Node.js child)
               → import('node-llama-cpp')
               → getLlama({ gpu: false })
               → LlamaCompletion.generateCompletion()
               → process.send({ type: 'result', ... })
  ← onCandidateResult → PATCH /api/siem/noise/candidates/:id/llm-result (immediate)
```

**Key files:**
- `platform/electron/llmWorker.js` — IPC handler, forks child, handles cancel/progress
- `platform/electron/llmProcess.js` — isolated inference worker (node-llama-cpp only)
- `platform/electron/preload.js` — exposes `onAnalysisStarted` IPC event
- `platform/shell/src/components/NoiseAdvisor.jsx` — per-candidate write-back in `onCandidateResult`
- `platform/shell/src/components/TopNav.jsx` — `LlmAnalysisBanner` global progress component
- `platform/electron/electron-builder.yml` — `asarUnpack: ["node_modules/**", "llmProcess.js"]`

**Known limitations:**
- CPU-only inference (~3-8 min per candidate on Phi-3.5 Mini Q4). GPU (CUDA) in progress — see GPU plan below.

### Pending (next beta.3 build — installer size reduction)

- `compression: maximum` (LZMA) added to `electron-builder.yml`
- Excluded node-llama-cpp build artifacts from installer: CMakeFiles, vcxproj, llama.cpp source, x64 obj dir, xpack, toolchains
- If CUDA fails to load after beta.3 install, revert `electron-builder.yml` exclusions and rebuild
- Committed `26e433b` — will take effect on next build

### Recently Completed (2026-04-11, v1.2.45-beta.4 — multi-model support + custom model fixes)

- **Per-model chat templates:** `llmProcess.js` now selects the correct prompt template and stop triggers per model family: Phi-3.5 (`<|system|>`/`<|end|>`), Qwen2 (`<|im_start|>`/`<|im_end|>`), Llama 3 (`<|start_header_id|>`/`<|eot_id|>`)
- **Template family stored in library:** Custom models now have a `templateFamily` field set at registration time, passed through `llmWorker.js` → `llmProcess.js` via `child.send`
- **Template selector UI:** Configuration > Tuning Center Models "Add Custom Model" section has a Template dropdown (Phi / Qwen / Llama) shown before browsing or downloading
- **Managed model downloads enabled:** `qwen2.5-1.5b-q4` and `llama-3.2-3b-q4` now have `downloadUrl` + `sha256` set, hosted at `0xKudoX/noise-advisor-models` on HuggingFace
- **Custom model browse fixed:** Replaced broken `file.path` file input approach with `dialog.showOpenDialog` via `llm:browse-gguf` IPC -- works correctly in packaged Electron
- **Model dropdown uses live library:** Tuning Center model dropdown now reads from `modelLibrary` (includes custom models) instead of hardcoded `LLM_MODELS` array
- **Settings sync on load:** If saved `llm_model` key doesn't match any library entry, auto-syncs to the active model on load
- **Tuning Center renames:** Configuration tab renamed from "Noise Advisor Models" to "Tuning Center Models"; section header updated to match
- **UI layout fixes:** Daily Avg column widened to 110px, Confidence to 90px; settings bar split into two rows (dropdowns top, buttons bottom left-aligned); Tuning Center Models tab widened to 960px
- **Button renames:** "Run Analysis" → "Analyze Logs"; "Run LLM (N)" → "AI Analysis (N)"
- **AI Analysis selection-aware:** When rows are selected, AI Analysis runs only on selected unanalyzed candidates; label shows "(N selected)"
- **Reload button:** `[ reload ]` button in TopNav between `[ reload ]` and username, visible only on beta builds (`__APP_VERSION__.includes('beta')`), calls `window.location.reload()`
- **Installer size:** beta.3 LZMA compression + artifact exclusions reduced installer from 1.04GB to 970MB

**Key files changed:**
- `platform/electron/llmProcess.js` -- per-model template/stop triggers, `templateFamily` param
- `platform/electron/llmWorker.js` -- `templateFamily` stored in library, passed to child; `dialog.showOpenDialog` IPC; managed model URLs set
- `platform/electron/preload.js` -- `browseGguf`, `addCustom(filePath, templateFamily)`, `downloadUrl(url, templateFamily)`
- `platform/shell/src/components/NoiseAdvisor.jsx` -- button renames, selection-aware AI Analysis, dropdown from live library, settings sync, column widths, layout
- `platform/shell/src/components/SiemConfiguration.jsx` -- template selector, dialog browse, Tuning Center renames, 960px width
- `platform/shell/src/components/TopNav.jsx` -- reload button, tab rename

### Recently Completed (2026-04-11, v1.2.45-beta.2 — Tuning Center rename + tab reorder)

- Renamed "Noise Advisor" to "Tuning Center" in TopNav, SiemSidebar, NoiseAdvisor.jsx page title
- Reordered SIEM tabs to SOC workflow: Dashboard | Alerts | Cases | Log Search | Detection Rules | Tuning Center | Audit Log | Configuration
- Removed section labels from SIEM sidebar, flattened to single nav list in same workflow order
- Tuning Center enterprise spec written: `docs/specs/2026-04-11-tuning-center-enterprise-design.md`

### Recently Completed (2026-04-11, v1.2.45-beta.2 — Phase 3 CONFIRMED WORKING)

Phase 3 analyst decision learning is fully operational. Log confirmed `Injecting analyst context` firing for each candidate, pulling in past approved/rejected decisions and override notes.

**Bugs fixed to get here:**
- `getAccessTokenSilently()` silent throw — try/catch added in `NoiseAdvisor.jsx`
- `/context` query `$4 IS NOT NULL` — cast to `$4::text` (candidates query)
- `/context` query `$3 IS NOT NULL` — cast to `$3::text` (suppression rules query)
- `fetchContext` timeout 5s → 15s
- Token presence logged in `llmWorker.js` for debugging
- Noise run fetch timeout 5min, try/catch on `/run` route
- JWKS cache extended to 24h to survive transient Auth0 outages
- DB: deleted 15M noisy network/info rows (Fluent Bit Sysmon Event ID 3), reclaimed 44GB
- Added `logs_noise_scoring_idx` composite index on `(user_id, timestamp)`
- Added Fluent Bit filter to drop known-safe process network connections

### Recently Completed (2026-04-11, v1.2.45-beta.2 — Phase 3 context query fix)

- Fixed `could not determine data type of parameter $4` error in `/context` endpoint -- cast `$4` to `::text` in the process_name condition
- Increased `fetchContext` timeout from 5s to 15s with URL logged on timeout
- Fixed noise run fetch timeout increased to 5 minutes (300s) in NoiseAdvisor.jsx
- Added try/catch to `/run` route so errors are logged server-side
- Added time filter to threshold query in `scoreNoiseCandidates` (was scanning all logs, now only last 7 days)
- Added composite index `logs_noise_scoring_idx` on `(user_id, timestamp)` for faster scoring queries
- Deleted 15M noisy network/info rows from Fluent Bit, VACUUM reclaimed 44GB (54GB -> 10GB used)
- Added Fluent Bit filter to drop Sysmon Event ID 3 network connections from known-safe desktop processes

**Key files changed:**
- `platform/server/routes/noise.js` — context query cast fix, /run try/catch
- `platform/server/services/noiseCron.js` — time filter on threshold query
- `platform/shell/src/components/NoiseAdvisor.jsx` — 5 min fetch timeout
- `platform/electron/llmProcess.js` — 15s fetchContext timeout + URL logging
- `C:\Program Files\fluent-bit\conf\cybertools.conf` — network noise filter

### Recently Completed (2026-04-11, v1.2.45 — Phase 3 token debug + fix)

Phase 3 was shipping in v1.2.44 but context injection wasn't firing. The log showed `Analyzing candidate` jumping straight to `Calling generateCompletion` with no `fetchContext` call. Root cause: `getAccessTokenSilently()` was throwing silently, leaving `token` undefined, which caused `fetchContext` to bail on `if (!serverUrl || !token) return null` with no log output.

**Fixes:**
- `NoiseAdvisor.jsx`: wrapped `getAccessTokenSilently()` in try/catch, defaults to empty string on error (analysis still runs, just without context)
- `llmProcess.js`: `fetchContext` now logs when it skips (token/serverUrl empty) and logs HTTP status codes on non-200 responses
- `llmWorker.js`: logs whether `authToken` is present or missing when `llm:analyze` IPC fires

**Key files changed:**
- `platform/shell/src/components/NoiseAdvisor.jsx`
- `platform/electron/llmProcess.js`
- `platform/electron/llmWorker.js`

**Next:** Confirm Phase 3 context injection is working by checking llm.log for `token=present` and `Injecting analyst context` lines after running analysis on previously-decided candidates.

### Recently Completed (2026-04-11, v1.2.44 — Phase 3 analyst decision learning)

LLM prompt now injected with past analyst decisions before each candidate analysis. The model sees what the analyst has approved, rejected, and overridden for similar patterns before making its verdict.

**How it works:**
- `GET /api/siem/noise/context?event_category=X&source=Y&process_name=Z` — new endpoint queries approved/rejected candidates + active suppression rules matching the pattern, returns up to 8 decisions + 5 rules
- `llmProcess.js` fetches context before each candidate via `http/https` using `LLM_SERVER_URL` + `LLM_AUTH_TOKEN` from fork env
- Context formatted as few-shot examples and injected into the system prompt
- Override notes (`[Analyst override] ...`) shown verbatim as highest-signal examples
- Token passed from render process: `NoiseAdvisor.jsx` → `window.electron.llm.analyze(candidates, model, token)` → `preload.js` → `llm:analyze` IPC → `llmWorker.js` → fork env

**Key files changed:**
- `platform/server/routes/noise.js` — added `GET /context` endpoint
- `platform/electron/llmProcess.js` — `fetchContext()`, `formatContext()`, context injected into `buildPrompt()`
- `platform/electron/llmWorker.js` — receives `authToken`, passes `LLM_SERVER_URL` + `LLM_AUTH_TOKEN` to fork env
- `platform/electron/preload.js` — `analyze()` now accepts and forwards `authToken`
- `platform/shell/src/components/NoiseAdvisor.jsx` — gets token via `getAccessTokenSilently()`, passes to `llm.analyze`

**Also in v1.2.44 (from v1.2.43 shell-only changes):**
- Override & Approve modal for CVE-unsafe candidates with required analyst note
- Table overflow fixed (`tableLayout: fixed`, `tdLlm` width constraint)
- Column widths tightened (checkbox, confidence, score, CVE safe)

### Recently Completed (2026-04-11, v1.2.43 — CUDA GPU inference)

CUDA binary compiled from source and bundled in installer. `llmProcess.js` uses `gpu: 'cuda'`. Shipped v1.2.43.

**What failed first (v1.2.42):** `NoBinaryFoundError` on launch — the CUDA binary wasn't present because `source download` wipes `localBuilds/` and we hadn't rebuilt before packaging.

**Correct build sequence (Developer PowerShell for VS 2022, Admin):**
```powershell
cd "C:\Users\lsgra\Desktop\claude projects\cybertools"
node node_modules/node-llama-cpp/dist/cli/cli.js source download --skipBuild
$env:CUDAFLAGS="-Xcompiler=/Zc:preprocessor"
node node_modules/node-llama-cpp/dist/cli/cli.js source build --gpu cuda
```

**Key gotchas:**
- Prebuilt binary incompatible with CUDA 13.2 — CCCL headers require `/Zc:preprocessor`, prebuilt doesn't include it
- `$env:CUDAFLAGS="-Xcompiler=/Zc:preprocessor"` is the fix — set before `source build`, not before cmake
- Raw cmake fails on `llama-addon` step: `node_api.h` not found — use `source build` CLI, not raw cmake
- Manually patching vcxproj before `source build` doesn't work — CLI regenerates and wipes patches
- Must run in Developer PowerShell for VS 2022 (Admin) — regular PowerShell lacks VS compiler and cmake on PATH
- `source download` wipes `localBuilds/` — always rebuild after download before packaging

**Full details in spec:** `docs/specs/2026-04-09-noise-suppression-llm-design.md` — GPU Acceleration section

**Confirmed working:** 41 candidates completed in under 10 minutes. ~8 sec/candidate on GPU vs ~3 min/candidate on CPU (~24x speedup).

**Next:**
- **Phase 3 — Analyst Decision Learning:** RAG-style prompt injection. Before each candidate analysis, fetch past analyst decisions (approved, rejected, overrides, active suppression rules) with similar `event_category`/`source`/`process_name` and inject as few-shot examples into the LLM system prompt. Requires new `GET /api/siem/noise/context` endpoint + server URL passed to `llmProcess.js` via fork env. Full spec in `docs/specs/2026-04-09-noise-suppression-llm-design.md` Phase 3 section.
- Override & Approve UI shipped (v1.2.43 server changes) — override notes stored as `[Analyst override] <note>` in `llm_cve_note`, audit logged as `noise.llm_override`
- Rebuild CUDA binary with multi-arch flags (`-arch=sm_75;sm_80;sm_86;sm_89;sm_90`) for wider GPU support
- NSIS optional section for GPU component at install time

### Recently Completed (2026-04-10, Noise Advisor Phase 2 — LLM integration)

**Embedded LLM support for Noise Advisor — live in Electron v1.2.18.**

- **`platform/electron/llmWorker.js`** (new): node-llama-cpp v3 IPC handler. 10 IPC channels: `llm:status`, `llm:analyze`, `llm:get-library`, `llm:set-active`, `llm:remove-model`, `llm:download-model`, `llm:check-update`, `llm:add-custom`, `llm:download-url`, `llm:cancel`. Push events: `llm:status-change`, `llm:candidate-result`, `llm:download-progress`, `llm:update-available`. Model lifecycle: lazy-load only when analysis triggered, dispose all (context + model + llama) after run so ~3GB RAM spike is temporary. Model library persisted to `%APPDATA%\0xKudo\model-library.json`. Models stored in `%APPDATA%\0xKudo\models\`.
- **`platform/electron/main.js`**: Wires `setupLlmIpc(mainWindow)` and `scheduleStartupUpdateCheck(mainWindow)` after window creation.
- **`platform/electron/preload.js`**: Exposes `window.electron.llm.*` for all 10 channels + 4 push event listeners.
- **`platform/server/routes/noise.js`**: Added `PATCH /candidates/:id/llm-result` write-back endpoint (Electron calls this after analysis). Single approve blocks with HTTP 409 if `llm_cve_safe = false`. Bulk approve filters CVE-unsafe candidates before update, returns `{ updated, cve_blocked }`.
- **`platform/shell/src/components/NoiseAdvisor.jsx`**: LLM settings bar (enabled/disabled, manual/auto trigger, model selector), CVE Safe + LLM Analysis columns (Electron only), per-row analyzing state, download model prompt banner, LLM unavailable banner, 409 CVE-block handling in approve actions, auto-trigger on tab open when trigger=auto.
- **`platform/shell/src/components/SiemConfiguration.jsx`**: Desktop App tab refactored to `DesktopAppTab` component. Added Noise Advisor — Model Library section: managed model table with download/remove/set-active, custom GGUF via file picker, download by URL, compatibility warnings (GGUF magic, quantization quality, RAM estimate).
- **DB migration:** `ALTER TABLE noise_candidates ADD COLUMN IF NOT EXISTS llm_cve_note TEXT` — run directly via psql on VPS (docs/ is gitignored, ran inline).
- **node-llama-cpp v3** added to `platform/electron/package.json`. Requires `npx @electron/rebuild` before each Electron build to compile native bindings for Electron 34.

**Pending for Phase 2 to be fully operational:**
- Set `GITHUB_MODEL_MANIFEST_URL` in `llmWorker.js` once models are published to `0xKudoSec-releases`
- Publish GGUF models to `0xKudoSec-releases` and set `downloadUrl` + `sha256` per model in `MANAGED_MODELS`
- Until then: "Check for an app update to enable downloads" banner shows in Noise Advisor (expected)

**Key gotchas:**
- node-llama-cpp v3 is ESM-only — all imports use dynamic `import()` inside `runAnalysis`
- `context.getSequence()` returns a `LlamaContextSequence` — passed as `{ contextSequence }` to `LlamaChatSession`
- Fresh `LlamaChatSession` per candidate keeps context clean between analyses
- `llm_cve_safe = false` is a hard block — cannot be overridden by user settings anywhere in the stack
- `file.path` on the file input element gives the filesystem path in Electron (not available in web browsers)

### Recently Completed (2026-04-09, Noise Advisor Phase 1)

**Server-side noise candidate scoring, Noise Advisor UI, manual trigger, and auto-suppression — live at 0xkudo.com.**

- **DB migration:** `noise_candidates` table + 9 new columns on `user_settings` (noise_auto_suppress, noise_llm_enabled, noise_llm_trigger, llm_model, llm_custom_model_path, noise_min_score, noise_learning_days, noise_learning_events, kb_auto_update). Run via psql heredoc on VPS.
- **`platform/server/services/noiseCron.js`:** Daily scoring job (node-cron, 02:30). Queries `logs` table grouped by `source, event_category, host`. Scores patterns on 5 signals (frequency, time consistency, zero analyst actions, no high/critical severity, same host). Score 70+ = high, 40-69 = medium. Exports `scoreNoiseCandidates` and `runAutoSuppress` for manual trigger.
- **`platform/server/routes/noise.js`:** Mounted at `/api/siem/noise` (before `/api/siem` in index.js — order matters). Routes: GET status, GET candidates, PATCH candidate, POST bulk, POST undo, GET activity, GET/PATCH settings, POST run (manual trigger). Uses `req.auth.sub` (express-jwt sets `req.auth`, not `req.user`).
- **`platform/server/index.js`:** Imports `noiseRoutes` and `scheduleNoiseCron`. Noise routes mounted before siem routes.
- **`platform/shell/src/components/NoiseAdvisor.jsx`:** Full desktop + mobile UI. Header matches SiemConfiguration (45px, bg-surface, border-bottom). Tab bar below header (Candidates / Activity Log) matches SiemConfiguration tab style. Settings bar with auto-suppress dropdown. Run Analysis button in header (right side). Result banner after run completes showing candidate count or threshold-not-met message. Action banner (green) after approve/reject with 3s auto-dismiss. Rows dim with "Updating..." during pending actions. Threshold progress bars when under 7 days / 10k events.
- **`platform/shell/src/components/TopNav.jsx`:** Noise Advisor added to SIEM_TABS.
- **`platform/shell/src/components/SiemSidebar.jsx`:** Noise Advisor added to System section.
- **`platform/shell/src/App.jsx`:** `/siem/noise` path added to SIEM_VIEW_PATHS, `<NoiseAdvisor />` wired to `siemView === 'noise'`.

**Post-launch fixes:**
- **Bulk approve missing rule creation:** `POST /candidates/bulk` was only updating status, not creating suppression rules. Fixed to loop candidates and create a `detection_rules` row for each approved one, matching the single-approve behavior.
- **Duplicate candidates:** `ON CONFLICT DO NOTHING` had no conflict target — added `UNIQUE (user_id, field_signature)` constraint to `noise_candidates` and fixed the upsert to use it. Duplicates removed via SQL, constraint added via psql on VPS.
- **10 missing suppression rules backfilled:** Created via direct SQL INSERT/UPDATE on VPS for already-approved candidates that had no rule.
- **Suppression confirmed working:** Dashboard shows 0 events last 24h with suppression rules active. Existing alerts persist (expected — suppression is not retroactive).
- **Suppression rules too broad (match_category + match_host only):** Rules were suppressing entire event categories. Fixed — `field_signature` now groups by `source, event_category, event_id, process_name, username, host` and rules use `match_category + match_event_id + match_process + match_username` (no `match_host`). `dominant_severity` added to signature via `MAX(CASE severity...)` array lookup (avoids slow `MODE() WITHIN GROUP` ordered-set aggregate that caused nginx timeouts).
- **42P18 indeterminate datatype:** `match_event_id` null parameter couldn't be typed by PostgreSQL — fixed with `$5::integer` cast and `sig.event_id ?? null` in all three rule creation paths.
- **Bulk approve placeholder mismatch:** SELECT after bulk update used wrong `$N` offsets — fixed with separate `selectPlaceholders` using `$2+` offset and params `[uid(req), ...safeIds]`.
- **runAnalysis stuck in Running state:** No try/catch — if fetch/parse threw, `setRunning(false)` never fired. Wrapped in try/catch, always resets state. Shows "0 new candidates found" banner on clean re-runs.
- **UI improvements:** Candidates grouped by dominant severity (critical → high → medium → low → info → unknown) with collapsible sections and +/− indicators. Run Analysis button moved to settings bar next to auto-suppress dropdown. Select All button + per-severity-group header checkbox (with indeterminate state). Undo button shows "Undoing..." with disabled state while in flight.

**Key gotchas:**
- `db.js` uses `export default { getPool, ... }` — import as `import db from './db.js'` and call `db.getPool()`
- `express-jwt` sets `req.auth`, not `req.user` — `uid = req => req.auth.sub`
- `cron` package not installed — use `node-cron` (same as retentionCron)
- Noise routes must be mounted before `/api/siem` or Express catches them first
- Detection rules use `match_category`, `match_event_id`, `match_process`, `match_username` — no `match_host`, no JSONB conditions column
- `detection_rules.id` is SERIAL (integer), not UUID — `suppression_rule_id` in noise_candidates is INTEGER
- `match_event_id` requires `$N::integer` cast when value may be null — PostgreSQL cannot infer type from null alone
- `MODE() WITHIN GROUP (ORDER BY severity)` causes nginx timeout on large datasets — use `MAX(CASE severity WHEN ... THEN N END)` with array lookup instead
- Streaming (`res.write()` NDJSON) breaks Electron's fetch — always use simple `res.json()` for `/run` endpoint

**First run results:** 10 candidates found from backlog — dns (6114/day HIGH), file (1833/day HIGH), process (50062/day MEDIUM), registry, authentication, wmi, powershell, system, network, and one unlabeled source. All approved by user, suppression rules created.

**Spec:** `docs/specs/2026-04-09-noise-suppression-llm-design.md`
**Plans:** `docs/plans/2026-04-09-noise-suppression-phase1.md` (complete), phase2.md, phase3.md (pending)

---

### Recently Completed (2026-04-08, domain migration + rebrand)

**Full domain migration from `tools.laynekudo.com` to `0xkudo.com` and rebrand to `[ 0xKudo ]`.**

- Epik DNS: A record `@` → VPS IP, CNAME `auth` → Auth0 edge tenant
- Auth0: SPA URLs updated, custom domain `auth.0xkudo.com` verified, roles claim updated to `https://0xkudo.com/roles`
- Code: ROLES_CLAIM, ingest URLs, PRODUCTION_URL all updated to `0xkudo.com`
- Brand title `[ 0xKudoSec ]` → `[ 0xKudo ]` across all surfaces
- New app icon + favicon deployed
- VPS: nginx config for `0xkudo.com`, SSL cert via Certbot, PM2 restarted from ecosystem.config.cjs
- Auth0 API identifier left as `https://tools.laynekudo.com/api` (immutable, not user-visible)
- Electron rebuild (Phase 6) pending — do before next desktop release

**Electron rebuild complete — v1.2.17 published to 0xKudoSec-releases with new icon and 0xkudo.com domain**

---

### Previously Completed (2026-04-08, mobile UI polish — inputs, buttons, controls)

**Comprehensive mobile layout pass across all tools and SIEM components.**

Key fixes applied:
- **Header margin:** All 19 tool headers now use `-16px` escape on mobile: `margin: isMobile ? '-16px -16px 20px -16px' : '-24px -24px 20px -24px'`
- **Buttons — natural width:** All primary buttons use natural width on mobile (no `width: '100%'`). Buttons in flex column containers use `alignSelf: 'flex-start'` to prevent stretch. `theme.css` has `button { width: auto; }` as a global baseline.
- **Select dropdowns — natural width:** All select elements on mobile use natural width. Where a select sits in a flex column, `alignSelf: 'flex-start'` prevents stretch.
- **Full-width inputs:** Inputs that should be full-width on mobile now have `width: '100%', boxSizing: 'border-box'` applied conditionally. Affected: osint-recon, threat-intel, cve-exploit-mapper, intruder (URL template).
- **Tab amber active style:** All tool tabs (log-anomaly-explainer, network-threat-analyzer, wordlist-generator, http-repeater, payload-generator) updated to amber active: `color: 'var(--accent-amber)'` + `borderBottom: '2px solid var(--accent-amber)'`.
- **Control row ordering:** log-anomaly-explainer and network-threat-analyzer — select + analyze button moved below the textarea/upload area on all screen sizes (was above on desktop, broken on mobile).
- **SIEM headers:** DetectionRules, AlertQueue, Cases — mobile header is flexible height column layout; buttons don't clip.
- **Log Search:** Severity filter row split into two rows on mobile (Time | Severity each on own row with label).
- **Audit Log:** Mobile header flexible height, "retained N days" on own line; filter row compact.
- **Sidebar/SiemSidebar footer:** Privacy Policy and Security Practices each on separate `<div>` lines.
- **HTTP Repeater mobile:** URL full-width on row 1, method select + Send button on row 2.
- **Payload Generator:** isMobile added to root component; web tab category grid 2-col on mobile.
- **Decoder mobile:** Two-level tab UI — 4-column grid of group tabs (URL/HTML/Base64/Hex/Binary/ROT13/Unicode/JWT), sub-tabs as 2-column grid below (only shown when group has >1 op). No borderRadius.
- **Reverse shell generator:** Generate button `alignSelf: 'flex-start'` on mobile (was `flex-end`, appeared right-aligned).
- **Network scanner mobile:** Select and buttons use `alignSelf: 'flex-start'` (no `width: '100%'`).
- **Intruder URL template:** Full-width on mobile, wrapper div also `width: '100%'` on mobile.

**Files changed:** All `tools/*/client/index.jsx`, `platform/shell/src/App.jsx`, `platform/shell/src/styles/theme.css`, `platform/shell/src/components/Sidebar.jsx`, `platform/shell/src/components/SiemSidebar.jsx`, `platform/shell/src/components/DetectionRules.jsx`, `platform/shell/src/components/AlertQueue.jsx`, `platform/shell/src/components/Cases.jsx`, `platform/shell/src/components/LogSearch.jsx`, `platform/shell/src/components/AuditLog.jsx`

---

### Recently Completed (2026-04-08, mobile header margin fix + sidebar footer fix)

**Tool header bars on mobile no longer use the negative margin escape.**

- `App.jsx` tool wrapper: `padding: '16px'` on mobile (was `'24px'` same as desktop)
- All 19 `tools/*/client/index.jsx`: header `style` spread with conditional margin:
  `margin: isMobile ? '0 0 20px 0' : '-24px -24px 20px -24px'` (tab tools use `'0'` on mobile)
- `alert-triage` and `payload-generator`: added `useIsMobile` import and `const isMobile = useIsMobile()` declaration (were the only two tools without it)
- `Sidebar.jsx` footer: Privacy Policy and Security Practices links now each wrapped in `<div>` so they appear on separate lines
- `docs/specs/ui-component-standards.md`: updated mobile section to document the header margin rule

**Files changed:** `platform/shell/src/App.jsx`, all `tools/*/client/index.jsx`, `platform/shell/src/components/Sidebar.jsx`, `docs/specs/ui-component-standards.md`

---

### Recently Completed (2026-04-08, UI polish — tool font-weight normalization)

**All tool components now render at correct weight (Fira Code 500, non-bold).**

Root cause: browsers don't inherit `font-weight` from `body` for `<button>`, `<input>`, `<select>`, `<textarea>`, and `<label>` — they apply their own UA bold defaults. React inline styles also bypass CSS cascade, so setting `font-weight` on `body` alone is insufficient.

Fixes applied:
- `platform/shell/src/styles/theme.css`: added global reset `button, input, select, textarea, label { font-family: var(--font); font-weight: 500; }`
- All tool `client/index.jsx` files: added `fontFamily: 'var(--font)'` to every button/tab style object (setting `fontFamily` inline forces the browser to re-resolve font properties from the cascade, picking up `font-weight: 500`)
- All tool title style objects: added `fontWeight: 'normal'`
- Checkbox label style objects (`checkItem`): added `fontWeight: 'normal'`
- Duplicate `fontFamily` keys (introduced by sed) cleaned up — build is warning-free

**Files changed:** `platform/shell/src/styles/theme.css`, all `tools/*/client/index.jsx`

---

### Recently Completed (2026-04-07, TopNav navigation + Fira Code — implemented)

**Navigation layout toggle + Fira Code font — fully implemented in live app.**

- **Fira Code** loaded via Google Fonts `@import` in `platform/shell/src/styles/theme.css`. `--font` updated from `'Source Code Pro'` to `'Fira Code'`. Applies to all platforms including mobile.
- **`navLayout` state** added to `App.jsx` (`AppInner`). Reads/writes `localStorage` under `cybertools_nav_layout` (`'topnav'` | `'sidebar'`). Default: `'topnav'`.
- **TopNav layout (desktop only):**
  - `CategoryBar` (Row 2) — renders below TopNav when `navLayout === 'topnav' && !isMobile`. Tools mode: Dashboard/Detect/Investigate/Report/Compliance/Simulate-Test/Config ↗. SIEM mode: SIEM view tabs.
  - `ToolBar` (Row 3) — renders when a category with tools is selected. Lists tools in that category as tabs. Hidden for Dashboard/Config.
  - Both exported from `platform/shell/src/components/TopNav.jsx`.
- **Sidebar layout** — `Sidebar.jsx` and `SiemSidebar.jsx` (plus Electron collapsible wrappers) now gated by `navLayout === 'sidebar'`. Mobile hamburger drawer untouched.
- **Footer** — shown when `navLayout === 'topnav' && !isMobile`. Version · build date · Privacy Policy, centered.
- **Appearance tab** added to `SiemConfiguration.jsx` (tab index 5). Two-button toggle: `[ Top Nav ]  [ Sidebar ]`. Receives `navLayout` + `setNavLayout` props from App.jsx. Applies immediately, no save button.
  - Desktop App tab shifted to index 6, Edit Config to index 7. All `tab === N` references and PIN gate `useEffect` checks updated.
- **`activeCategory` state** in `App.jsx` — derived from route on mount and sync'd on navigation. Drives which ToolBar row to show.

**Files changed:** `platform/shell/src/styles/theme.css`, `platform/shell/src/App.jsx`, `platform/shell/src/components/TopNav.jsx`, `platform/shell/src/components/SiemConfiguration.jsx`

---

### Recently Completed (2026-04-07, TopNav navigation redesign mockup)

**Navigation redesign — mockup approved, not yet implemented in code.**

Mockup: `mockups/topnav-navigation-mockup.html`

Three-row navigation pattern replacing the sidebar:
- **Row 1 (TopNav):** brand, SIEM | Tools app switcher (SIEM first), download button, user, logout, theme toggle
- **Row 2 (Category bar):** Dashboard, Detect, Investigate, Report, Compliance, Simulate/Test, Config ↗ — flat tabs, amber underline on active
- **Row 3 (Tool bar):** appears below Row 2 when a category is selected — lists all tools in that category as horizontal tabs, amber underline on active tool. Hidden for Dashboard and Config. Hidden entirely in SIEM mode.
- **SIEM mode:** Row 2 becomes flat SIEM view tabs (Dashboard, Alerts, Detection Rules, Log Search, Cases, Configuration, Audit Log). Row 3 hidden.
- **Footer:** version · build date · Privacy Policy, centered.
- Sidebar is removed entirely in this pattern.

**Also in this session:**
- Active alerts dedup count badge fixed — was clipped by `overflow:hidden` on title span; moved to flex sibling with `flexShrink:0`
- Domain migration spec created at `docs/specs/domain-migration.md` — full checklist for moving off `tools.laynekudo.com` including Epik DNS, Auth0, code, env vars, SSL, Electron rebuild
- Font decision: **Fira Code weight 500** chosen to replace Source Code Pro. Reason: slashed zero (0̷) preferred for security UI. JetBrains Mono and Inconsolata also tested and rejected. Not yet applied to live app — will be implemented alongside the TopNav navigation redesign. Load via Google Fonts or self-host; update `--font` in `platform/shell/src/styles/theme.css`.
- Navigation layout toggle spec written: `docs/specs/nav-layout-toggle.md`. Users will be able to switch between TopNav (default) and Sidebar from the Configuration Appearance section. State stored in localStorage under `cybertools_nav_layout`. Both sidebars kept as-is — conditionally rendered. Mobile unaffected.

---

### Recently Completed (2026-04-07, mobile UI fixes — no version bump)

**Mobile SIEM dashboard parity:**
- Auto-refresh every 15s with `loadingRef` guard (matches desktop)
- Severity filter replaced with multi-select `sevFilters` Set — single sev passes `?severity=` to server, multiple sevs filter client-side
- Collapsible "filter" button opens severity panel; button shows "filter (N)" when filters active
- Time range buttons (1h/6h/24h/48h/7d) applied to all four API calls
- Search bar with 300ms debounce, passes `?q=` to `/events/recent` — same as desktop
- Recent Events header shows active sev + search context with single Clear button
- Donut legend and event row badges both toggle sevFilters

**Audit log mobile fix:**
- Table was wider than viewport and draggable; root cause was `<main>` missing `minWidth:0` + `overflow:hidden` on mobile
- Replaced table with card-per-row layout on mobile (action badge + timestamp + IP + detail), matching AlertQueue pattern
- Desktop table unchanged

**Files changed:** `platform/shell/src/components/SiemDashboardMobile.jsx`, `platform/shell/src/components/AuditLog.jsx`, `platform/shell/src/App.jsx`

Full detail in `docs/specs/ui-improvements.md`.

---

### Recently Completed (2026-04-07, Electron security audit continued — v1.1.0 → v1.2.5)

**All actionable Electron security findings resolved. Current version: v1.2.5.**

Full audit spec: `docs/specs/2026-04-05-electron-security-audit.md`

Fixes by version:
- **v1.1.0:** fluent-bit:write-config input validation (length cap 64KB, dangerous directive block, path/section header checks)
- **v1.1.1:** Session-level CSP attempted — reverted in v1.1.4 (breaks Auth0 callback, deferred, needs F12 in packaged app to debug)
- **v1.1.5:** Auth0 callback server validates PKCE `code` + `state` params and `/callback` path before forwarding (Finding 3)
- **v1.1.6:** `electron-store` encrypted via `safeStorage`/Windows DPAPI — random key generated on first run, encrypted blob stored at `%APPDATA%\0xKudoSec\.store-key` (Finding 11)
- **v1.1.7:** userData path moved from `%APPDATA%\@cybertools\electron` to `%APPDATA%\0xKudoSec`
- **v1.1.8:** `process.env` subprocess allowlist — only 22 named vars passed to forked server, never `...process.env` (Finding 7). `app-builder-bin` moved to devDependencies (app size: 466MB → 277MB)
- **v1.1.9:** `allowToChangeInstallationDirectory` set to `false` then reverted to `true` — user wants choice, low risk
- **v1.2.0:** `executeJavaScript` in tray replaced with typed IPC `window:navigate` via preload bridge (Finding 12). `App.jsx` listens via `window.electron.window.onNavigate`
- **v1.2.1–v1.2.3:** Fluent Bit tray start/stop fixed — now calls `runSc()` from main process directly (same path as in-app buttons). UAC prompt appears on click.
- **v1.2.4:** DevTools/reload keyboard shortcuts blocked via `before-input-event` (F12, Ctrl+R, Ctrl+Shift+R, F5, Ctrl+Shift+I/J/C, Ctrl+U)
- **v1.2.5:** Reload shortcuts fully blocked via `Menu.setApplicationMenu(null)` — removes Chromium built-in shortcuts at root level

**Additional improvements in this session:**
- Agent status (Fluent Bit) added to both `Sidebar.jsx` and `SiemSidebar.jsx` above footer — polls every 15s, color-coded dot, Electron-only
- `.env.example` updated with missing vars: `AUTH0_TENANT_DOMAIN`, `INGEST_AUTH_DB_URL`, `OPS_DB_URL`, `DATABASE_CA_CERT`

**Remaining findings (deferred/blocked):**
- Finding 2: `fluent-bit:write-config` validation — deferred, no config editor UI exists yet
- Finding 10: Session-level CSP — deferred, breaks Auth0 callback flow
- Finding 13: Code signing — requires EV cert purchase (~$300-500/year)

**Note on Finding 3 (Auth0 state):** Auth0 SDK validates state internally as part of PKCE — the callback server now also validates `code` + `state` presence and correct path before forwarding

### Recently Completed (2026-04-07, security hardening continued — v1.2.6 → v1.2.15)

**Fluent Bit config editor (complete):**
- `Edit Config` tab in SiemConfiguration — visible only to users with `config-editor` Auth0 role in Electron
- Role detected from JWT custom claim `https://tools.laynekudo.com/roles`
- Auth0 setup: `config-editor` role created, Post Login Action deployed, assigned to Layne
- `requireRole` middleware added to `platform/server/middleware/requireAuth.js`
- Input sanitization: 50KB cap, null byte rejection, backtick/`$()` shell expansion blocked
- PIN gate: user sets a PIN (4-64 chars) stored as scrypt hash + salt in DPAPI-encrypted electron-store. Must re-enter every tab visit. PIN never stored in plaintext.
- PIN brute force lockout: 5 failed attempts triggers 60s lockout, tracked in memory (resets on app restart)
- scrypt guards: input length cap (256 chars) before hash, `timingSafeEqual` hash length guard prevents crash on corrupted store
- PIN recovery passphrase: scrypt hash + salt stored separately in electron-store. Required at PIN setup. Used to reset PIN without reinstalling.
- Existing PIN installs without recovery: `needs-recovery` state prompts user to add passphrase using current PIN
- IPC handlers: `fluent-bit:read-config`, `fluent-bit:write-config`, `settings:hasPin`, `settings:setPin`, `settings:verifyPin`, `settings:addRecovery`, `settings:resetWithPassphrase`
- Privacy policy updated: DPAPI encryption, scrypt PIN hashing, RBAC documented (Last updated: April 7, 2026)

**Full security review pass — findings 23-36 added to `docs/specs/security-hardening.md`:**
- 23: scrypt input length cap ✅ fixed in v1.2.8
- 24: timingSafeEqual hash length guard ✅ fixed in v1.2.8
- 25: PIN brute force lockout ✅ fixed in v1.2.8
- 26: `executeJavaScript` in Auth0 callback replaced with typed IPC `auth0:callback` ✅ fixed in v1.2.9/v1.2.10
- 27: Auth0 callback session nonce — deferred. Auth0 strips unknown params from redirects. appState approach documented in spec for future. Current posture: 127.0.0.1 binding + PKCE code+state validation.
- 28: PIN reset via recovery passphrase ✅ fixed in v1.2.11/v1.2.12
- 29: WorkspaceContext localStorage ✅ documented with intent comment in v1.2.13
- 30: CORS no-origin bypass ✅ documented with intent comment in v1.2.13
- 31: SRI on Vite build output ✅ fixed in v1.2.9 (`vite-plugin-subresource-integrity`)
- 32: Auth0 in-memory token storage ✅ documented with intent comment in v1.2.13
- 33: SSRF risk if Repeater/Intruder move server-side — deferred (future)
- 34: Raw system errors in IPC responses ✅ fixed in v1.2.13 (`fsErrMsg()` helper)
- 35: Electron version upgrade (17+ CVEs in Electron <=39.x) — open (medium, pre-enterprise rollout)
- 36: Fluent Bit bundled install + dynamic path + ACL + version check ✅ complete in v1.2.16

**Em dash cleanup:** Replaced em dashes with colons/periods in all security comments added this session (v1.2.13+).

**Splash-to-connecting flicker fix attempted and reverted:**
- `showInactive()` + `app:ready` IPC approach caused black window on launch
- Reverted to original `ready-to-show` handler in v1.2.10
- Documented in `docs/specs/ui-improvements.md` for future investigation

**v1.2.16 (2026-04-08) — Fluent Bit bundled install + in-app install prompt:**
- `findFluentBitConfPath()` in main.js: registry-first detection, fallback to default path, returns null if not installed
- `fluent-bit:info` IPC handler: returns installed status and version (conf path known internally, not displayed)
- `fluent-bit:install` IPC handler: launches bundled installer interactively from `process.resourcesPath/assets/`
- `fluent-bit:read-config` and `fluent-bit:write-config` use dynamic path (no longer hardcoded)
- `preload.js`: `fluentBit.info()` and `fluentBit.install()` exposed
- `SiemConfiguration.jsx` Connect a Source tab:
  - Fluent Bit tab: version badge in Agent Status panel; "Install Fluent Bit" button when not installed (Electron only, desktop + web, not mobile)
  - Wireshark tab added (desktop + web only, hidden on mobile): points to WIRESHARK nav in Electron, download link on web
  - Conf path intentionally not displayed — app uses it internally, user edits via Edit Config tab (role-gated)
- `installer.nsh`: optional Fluent Bit install page during NSIS install (checkbox, checked by default, skipped if already installed), `icacls` ACL grant on conf dir
- `electron-builder.yml`: `allowToChangeInstallationDirectory: false` (closes Electron audit Finding 14), `extraResources` for bundled installer
- Specs: `docs/specs/fluent-bit-bundled-install.md`, `docs/specs/wireshark-tshark-tool.md` (Wireshark not yet implemented)

**Current version: v1.2.16**

**VPS npm audit warnings:** electron-builder dep vulnerabilities are build-time only, not runtime. Electron CVEs not directly exploitable given current posture but tracked as finding 35.

### Recently Completed (2026-04-06, session 8 cont. 4)

**Electron UX improvements:**
- Connecting screen resized to 480x280 (same as splash), moveable while connecting, expands to 1400x900 after auth resolves via `window:expand` IPC
- Connecting screen redesigned to match splash: `0xKudo` brand, spinner, "Connecting..." — same fonts/colors as `splash.html`
- Electron loads into SIEM automatically after the user authenticates (`useEffect` on `isAuthenticated` calls `setActiveApp('siem')`)
- Unauthenticated state remains on tools (`ElectronHome` grid)

**Privacy page Electron fixes:**
- Clicking Privacy Policy link no longer causes full page reload — switched from `<a href>` to `navigate()` in both `Sidebar.jsx` and `SiemSidebar.jsx`
- Privacy page scroll fixed in Electron: page div uses `display:flex, flexDirection:column, height:100%` with `flex:1, overflowY:auto` scroll area — respects `overflow:hidden !important` on `#root` from preload CSS

**Rate limit raised:**
- General API limiter raised from 60 to 200 req/min — SIEM dashboard polling alone hits ~40 req/min, previous limit caused 429 floods

**Build date from GitHub releases:**
- `vite.config.js` now fetches GitHub API at build time to get the `published_at` date for the current version tag
- Falls back to today's date if no release exists yet (dev builds, pre-release)
- Footer date now only changes when a new release is actually published

**Security hardening items 21 + 22:**
- Item 21: All 15 `INTERVAL '${hours} hours'` template literal interpolations in `siem.js` replaced with `make_interval(hours := $N)` — fully parameterized, eliminates SQL injection risk in interval expressions
- Item 22: Privacy policy page added at `/privacy` — accessible pre-login, post-login, and in Electron; no em dashes; links in both sidebar footers use `navigate()` for Electron compat

**Version bump to v1.0.6:**
- `platform/electron/package.json` and `platform/shell/package.json` bumped to `1.0.6`
- Download URLs updated to v1.0.6 in `LandingPage.jsx` and `TopNav.jsx`

### Recently Completed (2026-04-06, session 8 cont. 3)

**Security hardening item 20 — per-user rate limit on key rotation:**
- `ingestKeyLimiter` now keyed on `req.auth.sub` instead of IP — blocks distributed attacks
- Window changed from 1 minute to 1 hour, max 5 rotations
- `handler` logs `ingest_key.rotation_blocked` audit entry when limit hit
- Falls back to IP if `req.auth.sub` is undefined

**All 20 security hardening items complete.**

### Recently Completed (2026-04-06, session 8 cont. 2)

**Security hardening item 17 — PostgreSQL SSL with trusted cert:**
- Generated self-signed CA + server cert on VPS (`~/pg-certs/`), 10-year expiry
- PostgreSQL configured to use `/etc/ssl/certs/pg-server.crt` and `/etc/ssl/private/pg-server.key`
- CA cert copied to `/var/www/cybertools/platform/server/certs/pg-ca.crt` (gitignored)
- `db.js` `getSsl()` reads `DATABASE_CA_CERT` env var, loads CA cert, sets `rejectUnauthorized: true`
- `DATABASE_CA_CERT` added to `/var/www/cybertools/.env`
- All three pools (main, ingest_auth, ops) log `[db] SSL mode: enabled (CA-verified)`
- Falls back to `rejectUnauthorized: false` with warning if `DATABASE_CA_CERT` not set
- **Gotcha:** `import.meta.url` resolves to CWD under PM2, not the file's directory — never use `__dirname` for cert paths; use an env var pointing to the absolute path instead

### Recently Completed (2026-04-06, session 8 cont.)

**Security hardening item 18 — secrets management:**
- Created `/var/www/cybertools/.env` with all secrets, permissions `600` owned by `layne`
- `ecosystem.config.cjs` replaced with minimal config using `env_file: '/var/www/cybertools/.env'`
- All plaintext secrets removed from `ecosystem.config.cjs` — file is now safe to inspect
- PM2 v6.0.14 supports `env_file` natively — no dotenv code change needed
- DB password rotation deferred — can be done anytime by updating `.env` + `ALTER ROLE` + `pm2 restart all --update-env`
- **Note:** use `pm2 restart all --update-env` (not just `pm2 restart all`) when `.env` changes, otherwise PM2 uses cached env

### Recently Completed (2026-04-06, session 8)

**Security hardening item 16 — audit log tamper detection:**
- Added `row_hash VARCHAR(64)` column to `audit_log`
- `audit.js` now generates `created_at` in app, computes SHA-256 of `(user_id|action|meta|ip|created_at)`, stores in `row_hash` on every INSERT
- PostgreSQL trigger `audit_log_no_modify` blocks all UPDATE/DELETE on `audit_log` for the `cybertools` app role
- `cybertools_ops` role (NOLOGIN) granted DELETE + UPDATE on `audit_log` as a carve-out for retention cron and future GDPR deletes
- `db.js` — added `getOpsPool()` using `OPS_DB_URL` env var, same pattern as `ingest_auth`
- `retentionCron.js` — audit_log DELETE queries switched to ops pool
- `retentionCron.js` — integrity check cron added (daily at 02:15), recomputes hashes for last 25h of rows, logs any mismatches to console
- `OPS_DB_URL` added to `ecosystem.config.cjs` on VPS
- **Gotcha:** same alphanumeric-only password rule applies to `cybertools_ops` as to `ingest_auth`

### Recently Completed (2026-04-05, session 7)

**SIEM alert queue — Add to Existing Case:**
- Alert detail modal now shows "Add to Existing Case" section (only when cases exist) below the existing Create Case section
- `loadCases()` fetches `GET /api/siem/cases` when a modal opens, populates a select dropdown
- `addToCase()` POSTs `{ alert_id }` to `POST /api/siem/cases/:id/alerts` and shows toast confirmation
- State: `cases` array, `selectedCaseId` string, `addingToCase` bool
- Section hidden when user has no cases

**Log Search severity filter — multi-select:**
- `sevFilter` (single string) replaced with `sevFilters` (Set) — multi-select, matches Detection Rules style
- Color-coded bordered buttons: filled when active, border-only when inactive
- Clear button appears when any filter is active
- Server-side: `/events/recent` accepts comma-separated severity values, builds `IN (...)` clause

**Dashboard active alerts — UX fixes:**
- Severity badge: fixed to `width: 64px`, `textAlign: center`, `display: inline-block` — uniform sizing, no layout shift
- Alert timestamp changed from `toLocaleTimeString()` to `toLocaleString()` — full date + time shown

### Recently Completed (2026-04-05, session 6)

**URL-based SIEM navigation:**
- SIEM views now sync to URL: `/siem`, `/siem/alerts`, `/siem/rules`, `/siem/logsearch`, `/siem/cases`, `/siem/configuration`, `/siem/auditlog`
- `activeApp` and `siemView` are derived from `location.pathname` on load via `useLocation`
- `useEffect` on `location.pathname` keeps state in sync with URL (handles back/forward buttons and direct URL loads)
- All SIEM navigation goes through `handleSiemNavigate` which calls `navigate()` to update the URL
- Electron is unaffected — still uses state-based navigation (no address bar)
- `SIEM_VIEW_PATHS` and `SIEM_VIEW_TO_PATH` lookup maps defined at module level for clean bidirectional mapping
- Added `<Route path="/siem/*" element={null} />` so React Router doesn't redirect `/siem/*` paths to the dashboard catchall
- Refresh on any SIEM view loads the correct view

### Recently Completed (2026-04-05, session 5)

**Security hardening item 15 — RLS audit and tightening:**
- Full audit of all `pool.query()` calls across `siem.js`, `ingest.js` confirmed every query has explicit `user_id` filter except the two ingest key lookup queries in `requireIngestKey` (by design — user_id not yet known at that point)
- Created `ingest_auth` PostgreSQL role with `BYPASSRLS`, granted SELECT + UPDATE on `user_ingest_keys` only
- Added `getIngestAuthPool()` to `db.js` — separate Pool using `INGEST_AUTH_DB_URL` env var, falls back to main pool with warning if not set
- Updated `requireIngestKey` in `ingest.js` to use `ingestAuthPool` for both the SELECT and the `last_used_at` UPDATE
- Revoked `BYPASSRLS` from `cybertools` role — RLS now active as second layer of defense
- Had to grant explicit table permissions to `cybertools` after BYPASSRLS revoke (permissions were previously implicit via bypass) — `audit_log`, `logs`, `alerts`, `cases`, `case_alerts`, `detection_rules`, `ingest_sources`, `user_settings`, `user_ingest_keys`, and `audit_log_id_seq` sequence
- `INGEST_AUTH_DB_URL` added to `ecosystem.config.cjs` on VPS
- **Gotcha:** `ingest_auth` password must not use special characters that require URL encoding in the connection string, or the pg driver will fail to authenticate silently (catch {} swallows the error, falls through to 401). Use a simple alphanumeric password for this role.
- **Gotcha:** `fluent-bit.conf` must include `@INCLUDE cybertools.conf` — the default install does not include it, so Fluent Bit was only outputting to stdout and not sending events to the server.
- **Gotcha:** Fluent Bit conf indentation must be exactly 4 spaces — 3 spaces causes `invalid indentation level` error and service fails to start (error 1067).
- Tested: 490 events accepted after fix, no errors in PM2 logs

### Recently Completed (2026-04-05, session 4)

**Security hardening item 14 — ingest key rotation banner:**
- Server: `broadcast('ingest_key_rotated', { userId })` added to `siem.js` after key rotate (not on first create)
- Client: WS listener in `AppInner` (`App.jsx`) sets `keyRotatedBanner` state; amber banner renders inside SIEM `<main>` so it appears on all SIEM views including dashboard and configuration
- Banner auto-dismisses when `new_events` WS message received — confirms Fluent Bit is connected with the new key
- Banner style matches Electron update banner: `--bg-surface` background, `--accent-amber` border/text, dismiss ✕ button
- Bug fixed: `make_interval(days := $3)` replaces interval string concat — PostgreSQL rejected `$3` used as both integer and text in same query
- Bug fixed: key rotation now correctly updates `created_at` and `last_used_at` — previously broken by RLS (resolved by BYPASSRLS in item 6)
- All 14 hardening items now complete (12 + 13 deferred). Next: Phase 2 hardening spec additions.

**Security hardening items 9 + 10 + 11:**
- Item 9: CSP tuned in helmet config — explicit directives, `connect-src` includes Auth0 domain + WSS origin, `frame-ancestors 'none'`, `report-uri /api/csp-report`. Report endpoint added at `POST /api/csp-report` (logs violations, returns 204).
- Item 10: PostgreSQL SSL enforced in production via `ssl: { rejectUnauthorized: false }` in `db.js`. `rejectUnauthorized: true` was tried first but failed — VPS uses a self-signed cert. Connection is still encrypted.
- Item 11: Removed `DEFAULT ''` from `user_id` on `logs` and `ingest_sources` via migration (`ALTER TABLE ... ALTER COLUMN user_id DROP DEFAULT`). App-layer guard added to `/api/ingest/beats` — rejects requests where `req.ingestUserId` is null with 401.
- Migration confirmed safe — zero rows had `user_id = ''` before migration.
- CSP middleware must be placed AFTER correlation ID middleware or `X-Request-ID` won't appear (helmet ordering issue from items 7+8).

**Security hardening items 7 + 8 — error sanitization + correlation IDs:**
- Error handler in `index.js` now returns generic message + requestId in production, full message in dev
- Correlation ID middleware generates `crypto.randomUUID()` per request, sets `req.id` and `X-Request-ID` response header
- `audit()` in `audit.js` accepts optional `requestId` param, stored in meta for traceability
- Middleware must be placed AFTER `helmet()` and `corsMiddleware` — placing it before caused the header to be absent (helmet/cors middleware ordering issue)
- **VPS bug:** A root-owned PM2 instance (from a prior `sudo pm2` invocation) was holding port 4000 and intercepting all requests before the user-level PM2 process. Fixed by `sudo pm2 delete all` to clear the root instance. Never use `sudo pm2` — always run PM2 as the `layne` user.
- Verified working: `X-Request-ID` header visible in curl and DevTools Network tab

**Security hardening item 6 — ingest broken after RLS fix:**
- Root cause: `requireIngestKey` middleware uses direct `pool.query()` which doesn't set `app.user_id`, so RLS on `user_ingest_keys` blocked the SELECT and returned 0 rows, falling through to 401
- Fix: `ALTER ROLE cybertools BYPASSRLS;` run as postgres superuser on VPS (takes effect immediately, no restart)
- RLS revisit deferred — app enforces user scoping in every query, BYPASSRLS is acceptable for now
- **Fluent Bit gotcha:** after generating or rotating an ingest key, Fluent Bit must be restarted to pick up the new key: `net stop fluent-bit; net start fluent-bit` (PowerShell, run as admin)
- `last_used_at` is now updating correctly post-fix

### Recently Completed (2026-04-05, session 3)

**Releases repo cleanup + v1.0.5:**
- Created fresh `0xKudoSec-releases1` repo, deleted old `0xKudoSec-releases` (had Claude as contributor), renamed new repo to `0xKudoSec-releases`
- Bumped to v1.0.5 to avoid version conflict with old repo
- Updated `DESKTOP_DOWNLOAD_URL` in `LandingPage.jsx` and `TopNav.jsx` to v1.0.5
- Current version: **v1.0.5**
- Releases repo is now clean -- no Claude contributor history

### Recently Completed (2026-04-05, session 2)

**Download button + landing page CTA polish:**
- `DESKTOP_DOWNLOAD_URL` constant added near top of both `LandingPage.jsx` and `TopNav.jsx` -- update this with every Electron release
- Landing page hero: "↓ Download for Windows" button added to CTA row, amber color + border, matches primary button weight/size
- TopNav: "↓ Desktop App" link added to right section, amber color + border like auth buttons, hidden in Electron (`!isElectron` guard)
- Hover effects on all three landing page CTA buttons: primary inverts (light fill → dark fill, border stays light), secondary inverts (transparent → text-muted fill), download inverts (transparent → amber fill)
- Primary CTA button now has explicit border matching fill color so outline is visible against dark background
- Electron release skill updated: Step 2b added -- update `DESKTOP_DOWNLOAD_URL` in both files on every release

### Recently Completed (2026-04-05)

**Electron release pipeline + UX fixes:**
- Branded icon replaced in `platform\electron\assets\icon.ico` -- convert PNGs at convertico.com, drop in place, rebuild
- Version display: `__APP_VERSION__` and `__BUILD_DATE__` injected via Vite define in `vite.config.js`, shown in both Sidebar and SiemSidebar footers below laynekudo.com link
- Update banner restyled with `--accent-amber` color (text, border, button, progress bar) -- much more visible
- Auto-updater race condition fixed: `pendingUpdateInfo` cached in main process, `update:check-pending` IPC handler lets renderer poll on mount so banner shows even if event fired before React mounted
- Fluent Bit start/stop elevated via `Start-Process ... -Verb RunAs` in both tray.js and main.js `runSc()` -- fixes silent failure when stopping service without admin
- Release process: bump BOTH `platform/electron/package.json` AND `platform/shell/package.json` to same version before every publish
- Current version: **v1.0.4**
- Electron release skill at `C:\Users\lsgra\.claude\skills\electron-release\SKILL.md`

**Layout scroll fix:**
- Root cause: `styles.layout` used `height: 100vh` but `#root` has `zoom: 1.15` -- inside a zoomed element `100vh` equals unzoomed viewport height, making layout 15% taller than root
- Fix: changed to `height: 100%` in `App.jsx` `styles.layout`
- Also made `main` a flex column with `overflow: hidden`, gave each SIEM view container `flex: 1, minHeight: 0, overflow: auto`

### Recently Completed (2026-04-04)

**Electron desktop wrapper (`platform/electron/`):**
- Frameless BrowserWindow with custom drag region on TopNav, window controls (minimize/maximize/close)
- Splash screen while Express boots, polls `/health` before showing main window
- In dev mode: detects already-running Express server instead of forking a second one
- System tray: left-click opens window, right-click shows menu (Fluent Bit status, Configure Agent, Quit)
- Fluent Bit IPC: status/start/stop/restart via `sc.exe`, write-config via IPC
- Tray-on-close behavior: hide to tray on close (configurable in SiemConfiguration Account tab)
- `_forceClose` flag allows tray Quit to bypass hide-on-close
- Auth0 login: `will-navigate` intercepts redirect to system browser, localhost:8765 callback server catches code, `executeJavaScript` dispatches `auth0-callback` event to renderer, Auth0 SDK completes token exchange
- Auth0 CORS fix: `http://localhost:5173` added to Auth0 Allowed Origins (CORS) and Allowed Web Origins
- Agent Status panel in SiemConfiguration Connect a Source tab (Electron-only, `isElectron` gated)
- Desktop App settings in SiemConfiguration Account tab (tray-on-close toggle)
- `electron-builder.yml` for Windows NSIS installer
- Placeholder `icon.ico` in `platform/electron/assets/`

**Key gotchas:**
- Production mode: `$env:NODE_ENV="production"; npx electron platform/electron/main.js` -- loads `tools.laynekudo.com` directly, no local server needed
- Dev mode: `npx electron platform/electron/main.js` with `npm run dev` already running
- Auth0 requires `http://localhost:5173` in both Allowed Web Origins AND Allowed Origins (CORS)
- Auth0 Non-Verifiable Callback URI End-User Confirmation should be enabled (security)
- `window-all-closed` must not call `app.quit()` -- tray keeps app alive
- `webSecurity: true` -- CORS fix belongs in Auth0 dashboard, not Electron
- `isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged` -- must use `!== 'production'` not `=== 'development'`
- Preload injects CSS to remove outer scrollbars (`overflow: hidden` on html/body/#root), thin styled inner scrollbars via `::-webkit-scrollbar`
- Preload works on remote URLs (tools.laynekudo.com) -- `window.electron` is available in production mode
- After any shell changes: push to GitHub, then on VPS: `cd /var/www/cybertools && npm install --include=dev --workspace=platform/shell && npm run build --workspace=platform/shell && pm2 restart all`

**Electron installer (2026-04-04):**
- `electron-builder.yml` updated -- only bundles `main.js`, `preload.js`, `tray.js`, `splash.html`, `assets/`, `node_modules/`, `package.json` (no server/shell dist -- production loads remote VPS)
- `platform/electron/package.json` updated: added `description`, `author`, pinned `electron` to `29.4.6` (not `^29.4.6` -- electron-builder requires fixed version), added `app-builder-bin` dependency
- Build must be run from an **Administrator terminal** -- winCodeSign extraction requires symlink privileges
- Build command: `cd platform/electron && npx electron-builder --win --x64`
- Output: `dist-electron/0xKudo Security Toolkit Setup 1.0.0.exe` (NSIS installer) + `dist-electron/win-unpacked/` (portable)
- Installer contains zero credentials -- no `.env`, no API keys, no Auth0 secrets, no ingest keys
- Placeholder `icon.ico` is 256x256 (minimum required). Replace with proper multi-size ICO (256/128/64/48/32/16px) -- create 1024x1024 PNG, convert at icoconvert.com, drop into `platform/electron/assets/icon.ico`, rebuild

**Electron UI fixes + auto-update (2026-04-04):**
- Web double scrollbar fixed: `theme.css` -- `html/body` now `height:100% overflow:hidden`, removed `min-height:100vh`
- Electron unauthenticated launch: shows `ElectronHome` (4 no-auth tool cards + login button) instead of LandingPage
- Auth0 loading flash fixed: blank nav shown during `isLoading` state in Electron instead of SIEM shell
- F12 opens DevTools in Electron for debugging
- Auto-update system: `electron-updater` checks GitHub Releases on launch + every 4h, shows banner in TopNav with Download/progress/Install states, clears cache on install
- Publish config: `0xKudoX/0xKudoSec-releases` (public repo, separate from private source repo)
- `GH_TOKEN` saved in `.env` (never committed)
- v1.0.0 published to `github.com/0xKudoX/0xKudoSec-releases`

**Release process for future versions:**
1. Bump version in `platform/electron/package.json`
2. From Admin PowerShell: `$env:GH_TOKEN="..."; cd platform/electron; npx electron-builder --win --x64 --publish always`
3. Go to `github.com/0xKudoX/0xKudoSec-releases/releases`, edit the draft, add title, click Publish release
4. Installed apps will show update banner within 5 seconds of next launch

**Branding + UI polish (2026-04-04):**
- Brand title changed to `[ 0xKudoSec ]` across all platforms (TopNav, LandingPage, ElectronHome)
- Brand font size 16px everywhere
- Electron logout: `logout({ openUrl: false })` -- instant, no browser redirect
- ElectronHome Tools tab correctly highlighted as active when unauthenticated
- Auth0 loading state in Electron shows blank nav instead of SIEM shell

**Repo cleanup (2026-04-04):**
- `.gitignore` updated: ignores `*.md`, `docs/`, `*.csv`, `dist-electron/`, `detection-rules.json`
- Untracked from repo: `HANDOFF.md`, `CLAUDE.md`, `.env.example`, `docs/`, `detection-rules.json`, loose spec files
- Added `detection-rules-example.json` -- shows alert/suppress rule format for new users
- Only app source code is committed going forward -- no docs, no Claude files, no env templates
- `0xKudoSec-releases` repo cleaned -- orphan branch with only README, release assets attached to tags
- `GH_TOKEN` in `.env` only -- never committed

**VPS security hardening (2026-04-04):**
- fail2ban installed, active, auto-starts on boot -- bans IPs after 10 failed SSH attempts for 10 minutes
- `/etc/fail2ban/jail.local` configured with maxretry=10, bantime=10m
- SSH password authentication disabled -- key-only login
- Root login disabled -- only `layne` user can SSH in
- `layne` user created with sudo access, SSH key copied from root
- PM2 auto-start configured under `layne` user (`pm2-layne.service`)
- App starts with: `cd /var/www/cybertools && pm2 start ecosystem.config.cjs`
- Security updates applied (`apt upgrade -y`)
- PostgreSQL confirmed localhost-only, not publicly exposed
- Firewall active: ports 22/80/443 only

**VPS access going forward:**
- SSH: `ssh layne@tools.laynekudo.com`
- If locked out by fail2ban: use Hetzner console, login as `layne`, run `sudo fail2ban-client unban --all`
- Deploy: `ssh layne@tools.laynekudo.com` then `cd /var/www/cybertools && git pull && npm run build --workspace=platform/shell && pm2 restart all`

**Next:** Replace icon.ico with real branded icon, privacy/data policy page, then Proxy tool Phase 2.

**Enterprise Security Hardening (2026-04-05):**
- Full 14-item hardening backlog, spec at `docs/specs/security-hardening.md`
- Compliance targets: PCI DSS v4.0, SOC 2 Type II, ISO 27001, NIST SP 800-53
- Items 1-6 complete:
  1. Audit log 1-year retention — retentionCron.js, per-user toggle + days in SiemConfiguration
  2. Expanded audit coverage — 18 action types across siem.js + ingest.js, AuditLog.jsx updated
  3. Rate limiting — ingestBeatsLimiter (300/min), ingestKeyLimiter (5/min), ruleImportLimiter (10/min), apiRateLimiter now covers /api/siem + /api/ingest
  4. JWT query param removed — dead SSE code eliminated from requireAuth.js
  5. GDPR account deletion — DELETE /api/siem/account, transactional delete across 7 tables, audit log anonymization, Auth0 user delete, danger zone UI in Account tab
  6. Ingest key expiry + last_used_at — user_ingest_keys: expiry_days/expires_at/last_used_at columns, expiry check in requireIngestKey, per-user expiry selector in UI, expiry warnings
     - Migration 004: docs/migrations/004-ingest-key-expiry.sql (applied to VPS)
     - Root cause of last_used_at not showing: Fluent Bit was using INGEST_API_KEY env fallback, not per-user key. Fixed by updating Fluent Bit conf with per-user key and removing INGEST_API_KEY from ecosystem.config.cjs
     - UI fix: SiemConfiguration API Key tab now refreshes keyMeta on tab focus so last_used_at stays current
     - INGEST_API_KEY must be removed from ecosystem.config.cjs on VPS (do this if not done yet)
- Remaining: items 7-11, 14 (items 12-13 deferred)
- Next: item 7 — sanitize error responses in production

**Electron UX fixes (2026-04-05, session 2):**
- Collapse button: `position: fixed`, `left: 0` when collapsed / `left: 240px` when open, `bottom: calc(80px / 1.15)` — bypasses zoom entirely, always visible in viewport regardless of window size.
- Collapse button always `borderRadius: '0 4px 4px 0'` (rounded right only), only the arrow character flips direction.
- SiemSidebar: `configuration` and `dashboard` both unlocked when unauthenticated — `dashboard` allows returning from configuration view after tray "Configure Agent" nav.
- SiemConfiguration: `width: 100%` on container — fills the full content area regardless of which navigation path was used (tray nav vs sidebar nav).
- **Key insight:** Electron installer does NOT need rebuilding for shell/server changes — production .exe loads `tools.laynekudo.com` directly. Only rebuild for `main.js`, `preload.js`, or tray changes.

**Electron UX fixes (2026-04-05):**
- Collapsible sidebar on unauth SIEM + Tools views. Both use identical `ElectronCollapsibleSiemSidebar` / `ElectronCollapsibleToolsSidebar` pattern: `display: flex` wrapper, sidebar child, then amber toggle button as flex sibling with `alignSelf: flex-start, marginTop: 8px`.
- RequireAuth card: `position: fixed, top: 44px, pointerEvents: none` on wrap, `pointerEvents: auto` on card — bypasses zoom, always centered, never blocks sidebar clicks.
- **Root cause of collapse button not working in SIEM:** `RequireAuth` wrap used `position: fixed` covering the full viewport including the collapse button area, swallowing all clicks. Fixed with `pointerEvents: none` on wrap.
- Configuration accessible without auth in Electron — `isElectron && siemView === 'configuration'` renders `SiemConfiguration` outside `RequireAuth` in both early-return and main render paths.
- SiemConfiguration: `Desktop App` tab added (Electron-only, index 5). When unauthenticated in Electron, only Desktop App tab shown, defaults to it. Tray-on-close toggle moved from Account tab to Desktop App tab.
- Sidebar `height: 100%` + `boxSizing: border-box` on both SiemSidebar and Sidebar — footer link pinned to bottom.
- ElectronHome: `minHeight: calc(100vh / 1.15 - 44px)` for zoom-correct vertical centering.
- Decoder desktop: flat chip button row replaces vertical side panel. Hover effect matches active button color. Mobile untouched.

**Layout scroll fix (2026-04-04, session 3):**
- Connect a Source tab content was overflowing the viewport with no way to scroll to steps 4 and 5.
- Root cause: `styles.layout` used `height: 100vh` but `#root` has `zoom: 1.15`. Inside a zoomed element, `100vh` still equals the unzoomed viewport height, making the layout div 15% taller than `#root` can contain. The browser scrollbar was on the page itself, not inside the content area.
- Fix: changed `styles.layout` in `App.jsx` from `height: 100vh` to `height: 100%` so it fills `#root` instead of the raw viewport.
- Also made `main` a flex column with `overflow: hidden` and gave each SIEM view container `flex: 1, minHeight: 0, overflow: auto` so each view handles its own internal scroll.
- **Key lesson:** Always use DevTools `getBoundingClientRect()` to measure actual element heights before guessing at CSS causes. `zoom` on a parent makes `100vh` descendants overflow.

---

### Recently Completed (2026-04-04, session 2)

**Phase 1 enterprise security hardening:**
- **Ingest API key hashing**: already done (SHA-256, plaintext never stored, one-time reveal on generation)
- **npm audit**: all high/critical CVEs fixed in server + shell workspaces. Remaining 4 moderate are vite/vitest dev-only
- **Audit log**: new `audit_log` table (append-only, never update/delete). New `platform/server/services/audit.js` service — fire-and-forget writes, never blocks requests. Logs: `ingest_key.rotate`, `rule.create`, `rule.delete`, `rules.import`, `alerts.bulk_delete`, `alerts.bulk_status`, `case.create`, `case.delete`
- **PostgreSQL RLS**: `ENABLE ROW LEVEL SECURITY` on all 7 user-data tables (`logs`, `ingest_sources`, `user_settings`, `user_ingest_keys`, `detection_rules`, `alerts`, `cases`). Policy: `user_id = current_setting('app.user_id', true)`. Background services (detection.js, retentionCron.js) connect as superuser and bypass RLS — they already include explicit `WHERE user_id = $1`. Migration applied to VPS via psql
- **db.withUser()** helper added to `platform/server/services/db.js` — sets `SET LOCAL app.user_id` for future non-superuser app roles
- **Audit Log UI**: `platform/shell/src/components/AuditLog.jsx` — SIEM page under System section. Filter by action type + limit (50/100/250/500), color-coded action badges, refresh button. Server: `GET /api/siem/audit-log`
- **Schema**: `docs/schema.sql` updated with audit_log table. Migration at `docs/migrations/002-rls-audit.sql` (gitignored, paste manually)

**Electron UX fixes (session 2):**
- **Loading screen**: animated connecting dots (1→2→3→1 at 500ms), `position: fixed` to bypass zoom scaling, centered over full window
- **ElectronHome**: restored TopNav, uses `minHeight: 100%` centering
- **Electron defaults to Tools tab** when unauthenticated (was defaulting to SIEM)
- **SIEM from unauth state**: clicking SIEM tab now shows full SiemSidebar + Authentication Required card. Collapsible sidebar (defaults collapsed, `›`/`‹` toggle) on unauth SIEM view
- **RequireAuth card**: centered via parent flex container (`alignItems/justifyContent: center`), no longer uses `position: fixed` (which was blocking sidebar clicks and window controls)
- **Landing page scroll**: `useEffect` in `LandingPage` sets `document.documentElement/body.style.overflow = 'auto'` on mount, restores on unmount — bypasses `overflow: hidden` from theme.css

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

### Recently Completed (2026-04-03, session 2)

**SIEM UI overhaul — multi-term search, alert tuning, detection rules search, Configuration page, sidebar fixes:**

- **Multi-term log search**: LogSearch and server `buildSearchConditions` rewritten to support space-separated AND terms, `field:value` syntax, comma-separated OR within a field (`event_id:4625,4688`). Parameterized queries throughout -- no SQL injection surface. Import endpoint (`/rules/import`) now enforces `Content-Type: application/json` to block multipart attacks.
- **35 new detection alert rules** added to `detection-rules.json` covering MITRE ATT&CK: Execution, PrivEsc, Persistence, DefenseEvasion, CredAccess, LateralMovement, Discovery. Total: 101 rules (52 alerts, 49 suppressions).
- **6 new suppressions** from CSV8 log analysis: Sendevsvc, sihost, sdbinst, rs2client, SYSTEM 4624, SYSTEM 4672.
- **False positive fixes**:
  - arp rule: added `match_process: 'arp'` so only arp.exe triggers (was firing on CefSharp paths containing "arp")
  - net user/localgroup rules: split into targeted rules with `match_process: 'net'`; bash running Claude shell scripts was triggering message-text match
  - rundll32 Defender false positive: added `match_message: 'Startupscan.dll'` suppression
  - RtkAud (Realtek audio driver): suppression added
  - jcmd: suppression added
  - Network Logon Type 3 alert: removed entirely -- message text matching too imprecise, was catching all SYSTEM service logons
- **Alert queue checkbox bug fixed**: `toggleOne` was firing from both `<td onClick>` and `<input onChange>`. Fixed by removing `onChange`, making input `readOnly`.
- **Alert queue resizable columns**: matches dashboard recent events pattern -- `colgroup` + `tableLayout: fixed`, `mousedown/mousemove/mouseup` on window, `DEFAULT_WIDTHS` per column, `resizeHandle` div with `borderRight: 2px solid var(--border)`. th padding `8px 18px 8px 14px`, td `maxWidth: 0, overflow: hidden, textOverflow: ellipsis`.
- **Dashboard severity filter**: changed from single-select string to multi-select Set (`sevFilters`). Persisted as array, initialized as `new Set()`. Colored chip buttons -- filled solid when active, colored border+text when inactive. Multi-select supported. `toggleSevFilter()` toggles Set membership. "All" clears Set. API passes single severity param when size===1, client-side filters when size>1.
- **Detection Rules search bar**: multi-term AND search with term chips (click to remove), severity filter chips (multi-select Set), shows "X of Y rules" count. Chips styled same as alert queue severity chips.
- **SiemConfiguration** (`platform/shell/src/components/SiemConfiguration.jsx`): new component merging SiemSettings + LogSources into a single tabbed page.
  - 5 tabs: API Key | Connect a Source | Log Retention | Active Sources | Account
  - API Key: ingest key generate/regenerate/copy, one-time display warning
  - Connect a Source: Fluent Bit / Winlogbeat 7 / Manual API sub-tabs, pre-filled configs with actual key, download + copy buttons, setup instructions
  - Log Retention: retention days setting + Download Log Data (custom DateTimePicker)
  - Active Sources: sources table + Upload Log File + Refresh button
  - Account: signed-in email display + password reset (email users get reset link, social users see provider message)
  - Fluent Bit config: all 10 channels, `Flush 2`, individual `.db` files at `C:\Program Files\fluent-bit\conf\`
  - Mobile: tabs wrap to two rows using `flex-wrap`, each tab `flex: 0 0 33.333%` so second row centers
  - Long code blocks (`sc.exe create`, `reg add` registry command): `whiteSpace: pre-wrap, wordBreak: break-all`
  - Tab hover effect matches sidebar (onMouseEnter/Leave color change)
- **App.jsx + SiemSidebar.jsx wired**: replaced `LogSources` + `SiemSettings` with `SiemConfiguration`. Sidebar "Settings" renamed to "Configuration", "Log Sources" nav item removed.
- **Tools sidebar**: "Configuration ↗" link added above "SIEM ↗". Clicking switches to SIEM app and navigates directly to configuration view. `onSwitchToSiemView` prop added to `Sidebar`.
- **Mobile sidebar drawer gap fix**: `overlay` div resized to match inner `<aside>` width (240px), removed double `borderRight`.

### Recently Completed (2026-04-03, session 2, continued)
- **Subdomain Enumerator WorkspaceContext crash fix**: when restored from workspace context, the saved data shape is `{ domain, subdomains }` but the component expected the full result shape with `sources`, `totalUnique`, `allSubdomains`, `analysis`. Two fixes:
  1. Normalize restored data in `useEffect`: set `allSubdomains: restore.allSubdomains || restore.subdomains || []`, `totalUnique`, `sources: restore.sources || {}`, `analysis: restore.analysis || null`
  2. Source cards: added `if (!src) return null` guard -- when `sources` is `{}`, any key lookup returns `undefined` and `src.count` was throwing

### Recently Completed (2026-04-04)
- Detection Rules UI overhaul:
  - Alert / Suppression tabs — each tab shows only its rule type with count badge
  - New Rule defaults to whichever tab is active
  - Export JSON button — downloads all rules as `detection-rules.json`
  - Import JSON button — bulk inserts rules from file, skips duplicates by name, shows toast with result count
  - Server: `GET /api/siem/rules/export` and `POST /api/siem/rules/import` (max 500 rules, validates all fields)
- CSV export fix: LogSearch export was breaking on messages containing newlines -- now always quotes all fields and collapses newlines to space
- LogSearch endpoint fix: was calling `/api/siem/events/recent` (correct) but had briefly been changed to `/api/siem/logs` (404) -- reverted
- Suppress filter NULL bug: `applySuppressFilters` in siem.js was silently dropping events with NULL nullable fields (process_name, source_ip, dest_ip) because PostgreSQL `NOT (NULL ILIKE '%x%')` = NULL. Fixed with `IS NOT NULL AND` guard on all ILIKE conditions. This was hiding all PowerShell, WMI, Defender, System, Application events.
- Fluent Bit expanded to 10 channels -- added System, Application, PowerShell/Operational, WMI-Activity/Operational, TaskScheduler/Operational, Windows Defender/Operational, Firewall, TerminalServices-RemoteConnectionManager/Operational
- PowerShell Script Block Logging enabled via registry (Event ID 4104 now fires)
- normalizeEvent.js: new HIGH_SEVERITY_EVENT_IDS, EVENT_ID_CATEGORY entries (powershell, wmi, scheduled-task, defender, rdp), `fluentBitSecurityUserFields()` for logon/account event user extraction
- Detection rules built up via CSV log analysis -- `detection-rules.json` in repo root is the master file
  - Suppress rules: jcmd.exe, Sophos, Claude, postgres, svchost, reg.exe, VS Code, Zoom, Discord, WUDFHost, EdgeUpdate, git.exe, bash.exe, BraveUpdate, BraveCrashHandler, OneDrive, AnthropicClaude updater, dllhost.exe, GoogleUpdater, node.exe, ossdbtoolsservice, AppInstallerPythonRedirector
  - Suppress EIDs: 4798, 4799, 5061, 5154, 5157, 5158, 5379, 5382, 5857, 5858, 7040, 16384, 16394
  - Alert rules: timestomping (EID 2) via powershell/cmd/wscript/rundll32/regsvr32 -- all critical severity
  - Import via Detection Rules > Import JSON. Duplicates skipped by name.

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

### Recently Completed (2026-04-03, continued)
- Fluent Bit expanded to 10 channels (was 2):
  - Added: System, Application, PowerShell/Operational, WMI-Activity/Operational, TaskScheduler/Operational, Windows Defender/Operational, Firewall, TerminalServices-RemoteConnectionManager/Operational
  - Config: `C:\Program Files\fluent-bit\conf\cybertools.conf` -- each channel has its own .db file for position tracking
  - PowerShell Script Block Logging enabled via registry (Event ID 4104 now fires)
  - normalizeEvent.js: added HIGH_SEVERITY_EVENT_IDS for 4104, 5857/5858/5861 (WMI), 4698/4702 (task scheduler), 1116-1120 (Defender), 7045/4697 (service install), 4778/4779/1149 (RDP)
  - EVENT_ID_CATEGORY extended: powershell, wmi, scheduled-task, defender, rdp categories added
  - Added `fluentBitSecurityUserFields()` extractor for Security channel logon/account events (4624/4625/4648/4720/4726/4738) -- merges into fields alongside network fields
  - Server-side only change -- no rebuild needed on VPS, pull + pm2 restart sufficient

- Bug fixes (2026-04-03):
  - LogSearch was calling `/api/siem/events/recent` instead of the correct endpoint (reverted -- events/recent is correct, it does support q= search)
  - **Critical suppress filter bug**: `applySuppressFilters` was dropping all events with NULL nullable fields (process_name, source_ip, dest_ip, etc.) because PostgreSQL `NOT (NULL ILIKE '%x%')` evaluates to NULL not TRUE, filtering the row. Fixed by adding `IS NOT NULL AND` guard before each ILIKE condition in siem.js. This was silently suppressing all PowerShell, WMI, Defender, System, and Application events (any event without a process_name).
- Landing page copy updates:
  - Removed all "Free to use" text, kept only "No credit card required"
  - Hero description updated: "response" replaced with "reporting, compliance" to match actual tool categories

- Tool category reorganization:
  - Network Scanner moved from Respond → Investigate
  - Respond renamed to Report (Incident Report Generator only)
  - Security Policy Translator moved to new Compliance category
  - Updated: Sidebar.jsx, Dashboard.jsx, DashboardMobile.jsx, LandingPage.jsx
- Landing page Tools nav + no-auth tool access:
  - Tools button in header/footer now scrolls to tools section
  - 4 no-auth tools (Decoder, Reverse Shell Generator, Wordlist Generator, Payload Generator) shown as clickable `↗` links on landing page
  - App.jsx: `NO_AUTH_ROUTES` array — unauthenticated users on these routes bypass landing page gate
  - All other routes still redirect unauthenticated users to landing page

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

---

## Domain Migration

Full spec at `docs/specs/domain-migration.md`. Summary of what needs to change:
- **Epik DNS:** A record for new domain → VPS IP; CNAME `auth.newdomain.com` → `dev-dk318hthn8qe0k7s.us.auth0.com`
- **Auth0 dashboard:** API audience identifier, SPA callback/logout/origin URLs, custom domain verification, Post Login Action roles claim namespace
- **Code:** `ROLES_CLAIM` in `requireAuth.js` + `SiemConfiguration.jsx`; ingest URLs in `LogSources.jsx`, `SiemConfiguration.jsx`, `siem.js`; `PRODUCTION_URL` in `electron/main.js`
- **VPS `.env`:** `ALLOWED_ORIGIN`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` — then `pm2 restart all --update-env`
- **SSL:** new Let's Encrypt cert for new domain via Certbot
- **Electron rebuild:** after cutover, rebuild and publish new installer with updated `PRODUCTION_URL`
