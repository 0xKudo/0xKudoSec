# UI Improvements Spec

**Created:** 2026-04-06
**Applies to:** All UI/UX improvements, polish, and visual changes to the 0xKudo Security Toolkit

> **IMPORTANT:** This spec must always be used alongside [`ui-desktop-mobile.md`](ui-desktop-mobile.md).
> Every improvement listed here must be implemented for both desktop and mobile unless explicitly marked as Electron-only or desktop-only with a documented reason.
> Before implementing any item, read both specs.

---

## Pending Improvements

### 1. Splash-to-Connecting Screen Flicker (Electron only)

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
