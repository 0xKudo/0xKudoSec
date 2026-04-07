# UI Desktop / Mobile Spec

**Created:** 2026-04-01
**Applies to:** All tools and platform features in the 0xKudo Security Toolkit

> **See also:** [`ui-improvements.md`](ui-improvements.md) — tracks pending UI/UX improvements and polish.
> Both specs should be consulted together whenever UI work is being planned or implemented.

---

## Core Rule

Every tool and every feature must be designed and implemented for both desktop and mobile before it ships. No exceptions unless explicitly marked as a platform deferral (see below).

---

## Breakpoint

- **Mobile:** viewport width < 768px — detected via the `useIsMobile` hook (`platform/shell/src/hooks/useIsMobile.js`)
- **Desktop:** viewport width >= 768px

---

## Implementation Pattern

Use `isMobile` conditionals inside a single component file. Do not create separate component files for mobile and desktop versions of the same tool.

```jsx
const isMobile = useIsMobile();

return isMobile ? (
  <MobileLayout ... />
) : (
  <DesktopLayout ... />
);
```

- The mobile and desktop JSX blocks may be defined as inline blocks or as local sub-components within the same file.
- Never alter shared styles (CSS variables, global classes) to fix a mobile layout issue. Use inline styles or scoped CSS within the component.
- Never use media queries as a substitute for `isMobile` conditionals in tool components. The hook is the single source of truth for layout branching.

---

## Feature Parity Requirement

All features available on desktop must be available on mobile, and vice versa. This includes:

- All tool inputs and controls
- All output panels and result displays
- All actions (copy, download, export, submit, clear)
- All modals, drawers, and detail views
- All navigation and tool access

If a feature requires a significantly different interaction pattern on mobile (e.g., a multi-column layout becoming a stacked accordion), that is expected -- but the feature itself must still be present and functional.

---

## Checklist for New Tools and Features

Before marking any tool or feature complete, verify both viewports:

- [ ] Desktop layout implemented and tested
- [ ] Mobile layout implemented and tested
- [ ] All inputs accessible on mobile (no clipped or hidden form fields)
- [ ] All outputs accessible on mobile (no overflow or unscrollable panels)
- [ ] All action buttons reachable on mobile (tap targets >= 44px)
- [ ] No horizontal scroll on mobile unless intentional (e.g., code/hex output)
- [ ] Modals and drawers close correctly on mobile
- [ ] Long content (logs, payloads, scan results) scrollable on mobile

---

## Platform Deferrals

Some features may be intentionally unavailable on a specific platform due to technical constraints (e.g., Electron-only APIs, browser security restrictions). This is allowed only when explicitly documented.

### How to mark a deferral

In the tool's `manifest.json`, add a `platformNotes` field:

```json
{
  "platformNotes": {
    "mobile": "Full intercept proxy requires Electron. Web version shows replay-only mode.",
    "desktop": null
  }
}
```

In the tool's client component, show a clear in-UI notice on the limited platform:

```jsx
{isMobile && isElectronFeature && (
  <div className="platform-notice">
    Full intercept mode requires the desktop app.
  </div>
)}
```

### Current known deferrals

| Tool | Platform | Deferred Feature | Reason |
|------|----------|-----------------|--------|
| Proxy | All web (desktop + mobile) | Full intercept mode | Requires Electron for low-level network interception |

---

## File Ownership

| Concern | Location |
|---------|----------|
| Mobile breakpoint detection | `platform/shell/src/hooks/useIsMobile.js` |
| Platform nav (sidebar, hamburger drawer) | `platform/shell/src/components/Sidebar.jsx` |
| SIEM dashboard mobile layout | `platform/shell/src/pages/SiemDashboardMobile.jsx` |
| Main dashboard mobile layout | `platform/shell/src/pages/DashboardMobile.jsx` |
| Tool client layouts | `tools/[tool-id]/client/index.jsx` — desktop and mobile in same file |

---

## Theme and Styling Constraints

All layout work must respect the platform theme system. Do not hardcode colors -- use CSS variables only:

- `--bg`, `--text`, `--sidebar-bg`, `--border` for structural colors
- `--font` (Source Code Pro Medium, weight 500) for all text
- Severity colors only for status indicators: `--critical`, `--high`, `--medium`, `--low`, `--info`
- Button styles: `--btn-primary-bg`, `--btn-primary-text`

These variables switch automatically between dark and light mode via `data-theme` on `<html>`. Never hardcode hex values in tool components.
