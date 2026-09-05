# Desktop-Only v1.2.50 Packaging Fix (→ v1.2.51)

**Date:** 2026-09-05
**Status:** Root cause fixed in repo; needs a rebuild + release from a machine with the build toolchain.
**For:** whoever does the next Electron build (possibly a different account).

---

## What happened

v1.2.50 shipped the 5 desktop-only tools (Network Scanner, HTTP Repeater, Intruder, Vulnerability
Scanner, Subdomain Enumerator) as local Electron IPC modules under `platform/electron/tools/`. On
launch the packaged app crashes:

```
Uncaught Exception:
Error: Cannot find module './tools/network-scanner-core.js'
Require stack: …/resources/app.asar/main.js
```

### Root cause (FIXED)

`platform/electron/electron-builder.yml` `files:` listed files individually and never included the
new `tools/` directory, so the 10 modules in `platform/electron/tools/*.js` were **not packed into
`app.asar`**. `main.js` requires them (`require('./tools/network-scanner')`, which in turn requires
`./network-scanner-core.js`, etc.), so the app throws on startup.

**Fix already applied to the repo** (this commit): added `- "tools/**/*"` to the `files:` array in
`electron-builder.yml`. No code change needed beyond a rebuild.

---

## What the next build needs to do

1. **Pull the fix.** `git pull` on `main` (the `tools/**/*` files glob must be present in
   `platform/electron/electron-builder.yml`). Confirm the 10 files exist: `ls platform/electron/tools/*.js`.

2. **Fix the GitHub token first.** The v1.2.50 publish 401'd because `GH_TOKEN` in `.env` was expired.
   That is why `latest.yml` was never uploaded and the update banner failed until it was hand-built.
   Put a valid token (repo scope on `0xKudoSec-releases`) in `.env` as `GH_TOKEN=…` so
   `electron-builder --publish` uploads the exe **and** `latest.yml` **and** the blockmap automatically.

3. **Bump the version to 1.2.51** in both `platform/electron/package.json` and
   `platform/shell/package.json`, and update `DESKTOP_DOWNLOAD_URL` in
   `platform/shell/src/pages/LandingPage.jsx` and `platform/shell/src/components/TopNav.jsx` to the
   1.2.51 installer URL. Commit.

4. **Build + publish** (Admin PowerShell not required if winCodeSign is already cached; otherwise it is):
   ```powershell
   cd "…/cybertools/platform/electron"
   $env:GH_TOKEN = "<token from .env>"
   npx electron-builder --win --x64 --publish always
   ```
   - **Skip the `better-sqlite3` node-gyp rebuild** from the `electron-release` skill — it is **moot on
     this branch**: `forkServer` was deleted and `better-sqlite3` is not a dependency or referenced
     anywhere. (If a future change re-adds a forked local server, restore that step.)
   - A benign `rcedit` "Unable to commit changes" warning may appear and retry; the exe still builds.
   - With a valid token this uploads `…Setup-1.2.51.exe`, `latest.yml`, and the blockmap consistently,
     so the auto-updater "just works" (no hand-building `latest.yml`).

5. **Publish the draft** on GitHub: title `0xKudo Security Toolkit v1.2.51`, click Publish.

6. **Deploy the VPS shell** (so the download button + version match): push `main`, then
   `ssh root@92.112.181.219` → `cd /var/www/cybertools && git pull && npm run build --workspace
   platform/shell && pm2 restart cybertools-server` (that process ONLY; never `pm2 restart all` /
   `sudo pm2`). The VPS `origin` is HTTPS on a repo that must be public (or have a stored token/deploy
   key) for the non-interactive `git pull`.

7. **Verify:** install/update to 1.2.51, launch — no crash — open Network Scanner and run a scan.

---

## Verifying the crash is fixed without a full manual install

After building, confirm the modules are inside the asar:
```powershell
npx asar list "…/dist-electron/win-unpacked/resources/app.asar" | Select-String "tools/"
```
You should see `tools/network-scanner-core.js` and the other 9 modules. (Before the fix this list was
empty.)

---

## nmap — working as designed (not a bug)

- The nmap installer **is bundled** via `extraResources` (`assets/nmap-7.991-setup.exe` →
  `resources/assets/nmap-7.991-setup.exe`). Confirm the ~36 MB file exists at
  `platform/electron/assets/nmap-7.991-setup.exe` before building (it is gitignored — download the
  same Nmap Windows setup on a fresh machine and drop it there).
- The **install prompt is in-app, not in the NSIS installer.** The Network Scanner tool calls
  `window.electron.nmap.status()` on open; only if nmap is missing does it show an "Install nmap"
  button that runs `nmap:install` (launching the bundled installer). `resolveNmapPath()` checks PATH
  plus `C:/D:/E:\Program Files\Nmap\nmap.exe`.
- To see the prompt you must be on a machine **without** nmap. On a machine that already has nmap
  (e.g. `D:\Program Files\Nmap`), status returns installed and the scanner runs with no prompt — this
  is correct.

---

## latest.yml format (only needed if you ever hand-build it)

If the token can't be fixed and you must upload `latest.yml` manually, it must reference the exact
asset name on the release with the real base64 SHA512 and byte size:

```yaml
version: 1.2.51
files:
  - url: <exact-exe-asset-name>.exe
    sha512: <base64 sha512 of the exe>
    size: <bytes>
path: <exact-exe-asset-name>.exe
sha512: <same base64 sha512>
releaseDate: '<ISO timestamp>'
```

Compute the hash: `node -e "const c=require('crypto'),f=require('fs');const h=c.createHash('sha512');
f.createReadStream('<exe path>').on('data',d=>h.update(d)).on('end',()=>console.log(h.digest('base64')))"`.
Note: GitHub converts spaces in an uploaded filename to dots, so the asset may be
`0xKudo.Security.Toolkit.Setup.1.2.51.exe` — `url`/`path` in `latest.yml` must match that exactly.
Letting `electron-builder --publish` do it avoids all of this.
</content>
