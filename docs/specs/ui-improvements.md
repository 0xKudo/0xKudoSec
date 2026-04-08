# UI Improvements Spec

**Created:** 2026-04-06
**Applies to:** All UI/UX improvements, polish, and visual changes to the 0xKudo Security Toolkit

> **IMPORTANT:** This spec must always be used alongside [`ui-desktop-mobile.md`](ui-desktop-mobile.md).
> Every improvement listed here must be implemented for both desktop and mobile unless explicitly marked as Electron-only or desktop-only with a documented reason.
> Before implementing any item, read both specs.

---

## Completed Improvements

### Mobile SIEM Dashboard — Parity and Filter fixes (2026-04-07)

**Fixed:**
- Auto-refresh: dashboard now polls every 15s (same as desktop) via `setInterval` with a `loadingRef` guard. First load shows spinner; subsequent refreshes update silently.
- Severity filter: was client-side slice of 20 pre-loaded rows. Now passes `?severity=` to server when one severity active; client-side filters when multiple selected. `sevFilters` is a `Set` — multiple severities can be selected simultaneously. Filter button shows "filter (N)" when active.
- Severity panel: collapsible panel opened by the "filter" button. Tap any severity to toggle it in/out of the active set. Tap "All" to clear. Panel stays open so multiple can be selected without reopening.
- Time range filter: 1h/6h/24h/48h/7d buttons applied to all four API calls (stats, alerts/counts, events/by-severity, events/recent).
- Search bar: 300ms debounced search input, passes `?q=` to `/events/recent` — same behavior as desktop search.
- Recent Events header: shows active severity and search context, single "Clear" button resets both.
- Donut legend and event row severity badges both toggle into/out of the `sevFilters` Set.

**Files changed:** `platform/shell/src/components/SiemDashboardMobile.jsx`, `platform/shell/src/App.jsx`

---

### Audit Log — Mobile layout (2026-04-07)

**Fixed:**
- Table was wider than the mobile viewport and could be dragged side to side.
- Replaced the table with a card-per-row layout on mobile (same pattern as `AlertQueue`). Each card shows: action badge + timestamp, IP, detail text. Desktop table unchanged.
- Root cause of the overflow: `<main>` on mobile lacked `minWidth: 0` and `overflow: hidden`, and `AuditLog` used `height: 100%` which doesn't resolve in a flex parent without those constraints.

**Files changed:** `platform/shell/src/components/AuditLog.jsx`, `platform/shell/src/App.jsx`

---

## Pending Improvements

### 1. Font — Fira Code (not yet applied to live app)

**Decision:** Replace Source Code Pro with **Fira Code weight 500** across the entire platform.

**Reason:** Fira Code uses a slashed zero (0̷), which is preferred for a security toolkit UI. Source Code Pro and JetBrains Mono use a dotted zero. Inconsolata was also tested and rejected.

**Implementation:**
- Load Fira Code (self-host or Google Fonts: `family=Fira+Code:wght@500`)
- Update `--font` in `platform/shell/src/styles/theme.css` from `'Source Code Pro'` to `'Fira Code'`
- Apply at the same time as the TopNav navigation redesign (item 2 below)

**Platform:** All — web, mobile, Electron.

---

### 2. TopNav Navigation Layout (not yet applied to live app)

**Decision:** Replace the sidebar with a three-row top navigation. Mockup: `mockups/topnav-navigation-mockup.html`.

**Layout:**
- **Row 1 (TopNav):** brand, SIEM | Tools app switcher (SIEM first), download button, user, logout, theme toggle
- **Row 2 (Category bar):** Dashboard, Detect, Investigate, Report, Compliance, Simulate/Test, Config ↗ — flat tabs, amber underline on active. In SIEM mode, shows SIEM view tabs instead (Dashboard, Alerts, Detection Rules, Log Search, Cases, Configuration, Audit Log).
- **Row 3 (Tool bar):** appears when a category is selected — lists all tools in that category as horizontal tabs. Amber underline on active tool. Hidden for Dashboard and Config. Hidden in SIEM mode.
- **Footer:** version · build date · Privacy Policy, centered.
- Sidebar (`Sidebar.jsx`, `SiemSidebar.jsx`) removed from the layout.

**Navigation layout toggle:** A user-facing setting in Configuration allows switching between the TopNav layout and the original Sidebar layout. See item 3 below.

**Platform:** Desktop and web. Mobile already uses a hamburger drawer — not affected.

**Files to change:**
- `platform/shell/src/App.jsx` — add `navLayout` state (default: `'topnav'`), persisted to localStorage. Conditionally render sidebar or topnav rows based on setting.
- `platform/shell/src/components/TopNav.jsx` — extend with Row 2 category bar and Row 3 tool bar (tools mode only)
- `platform/shell/src/styles/theme.css` — update `--font`
- `platform/shell/src/pages/SettingsPage.jsx` (or `SiemConfiguration.jsx`) — add nav layout toggle

---

### 3. Navigation Layout Toggle in Configuration

**Description:** Users can switch between the TopNav layout (three-row) and the original Sidebar layout from the Configuration page. Preference is persisted to localStorage under `cybertools_nav_layout` (`'topnav'` | `'sidebar'`). Default is `'topnav'`.

**UI:** A simple two-option toggle in the Appearance section of Configuration:
```
Navigation layout:  [ Top Nav ]  [ Sidebar ]
```

**Scope:** Desktop and web only. Mobile is unaffected (always uses hamburger drawer).

**Implementation notes:**
- `navLayout` state lives in `App.jsx`, read from localStorage on mount
- Pass `navLayout` and `setNavLayout` down to the Configuration component
- `Sidebar.jsx` and `SiemSidebar.jsx` are kept but only rendered when `navLayout === 'sidebar'`
- TopNav rows 2 and 3 only render when `navLayout === 'topnav'`
- No server-side storage needed — this is a local UI preference

---

### 4. Splash-to-Connecting Screen Flicker (Electron only)

**Description:** On app launch, the splash screen (`splash.html`) disappears and then the React connecting screen appears immediately after, causing a visible flash between the two screens.

**Expected behavior:** The transition should be seamless — the user should see one continuous loading screen from app launch through to authentication, with no flicker or blank frame between splash and connecting.

**Proposed fix:**
- Keep the splash window alive until the React app signals it has painted, rather than destroying it on `ready-to-show`
- Add an `app:ready` IPC signal sent from `ElectronLoadingScreen` on mount (`useEffect`)
- In `main.js`, use `ipcMain.once('app:ready', ...)` to destroy the splash and call `mainWindow.show()` atomically
- Use `mainWindow.showInactive()` on `ready-to-show` to render offscreen without stealing focus

**Files to change:**
- `platform/electron/main.js` — replace `ready-to-show` handler, add `ipcMain.once('app:ready')`
- `platform/electron/preload.js` — expose `window.electron.window.ready()`
- `platform/shell/src/App.jsx` — call `window.electron?.window?.ready?.()` in `ElectronLoadingScreen` useEffect

**Platform:** Electron only — does not apply to web/mobile.

---
