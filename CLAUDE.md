# Claude Usage Bar — project notes

Electron menu bar / system tray app that shows the user's real-time
Claude usage (session % and weekly %) by scraping `claude.ai/settings/usage`
with the user's own logged-in session. Unofficial; not affiliated with
Anthropic.

## Architecture

- `main.js` — Electron main process. Owns the tray, popover, settings
  window, polling loop, IPC handlers, sleep/wake recovery via
  `powerMonitor`, and the hidden offscreen `BrowserWindow` used to
  rasterize the tray icon.
- `claude-session.js` — All claude.ai interaction. Manages the login
  window (partition `persist:claude`), the persistent hidden scraper
  window, cookie copy into `session.defaultSession`, cookie rehydration
  from the partition on wake, and DOM-text parsing via pre-compiled
  regexes.
- `simple-store.js` — Zero-dependency JSON config store. Replaces
  `electron-store` (which pulled 25 packages). Reads/writes a single
  JSON file in `app.getPath('userData')`. Exposes `get(key)` /
  `set(key, value)` — same API surface, ~57 lines.
- `preload.js` — `contextBridge` API for renderer → main IPC. Renderers
  run with `contextIsolation: true`, `nodeIntegration: false`.
- `renderer/`
  - `tray-icon.html` — offscreen canvas; exposes `window.renderIcon(pct)`
    returning a base64 PNG @2x for the macOS template image.
  - `popover.html` / `popover.js` — the dropdown shown on tray click.
    Lazy-created on first click, not at startup.
  - `settings.html` / `settings.js` — login/logout, poll interval,
    launch-at-login.
- `electron-builder.config.js` — packaging config (DMG for mac, NSIS for
  win). Only packs the explicit file whitelist — no node_modules end up
  in the asar since there are zero runtime dependencies.
- `.github/workflows/release.yml` — tag-triggered (`v*.*.*`) build for
  macOS + Windows; publishes only the `.dmg` and `.exe` directly to a
  live (non-draft) GitHub Release.

## How usage data flows

1. `refreshUsage()` runs on `setInterval` (default 60s, min 30s).
2. It calls `claudeSession.fetchUsageViaDOM()`, which reuses one hidden
   `BrowserWindow` (memory optimization — do not recreate per poll) and
   loads `https://claude.ai/settings/usage`.
3. `pollUntilParsed` polls `document.body.innerText` every 500ms for up
   to 12s, running `parseUsageText` until `session_percent` is found.
4. `lastState` is updated and pushed to tray + popover + settings via
   `pushStateEverywhere()`.
5. The tray icon is re-rendered only when the rounded percent changes
   (`lastRenderedPercent` cache).

## Sleep/wake recovery

- `powerMonitor.on('resume')` fires in both `main.js` and
  `claude-session.js` when the machine wakes from sleep.
- `main.js`: calls `restartPolling()` — clears the stale `setInterval`
  (macOS pauses timers during sleep) and fires an immediate refresh.
- `claude-session.js`: destroys the scraper `BrowserWindow` on resume
  so the next poll gets a fresh renderer with valid HTTP/cookie state.
- `isAuthenticated()` checks `cookie.expirationDate` — an expired cookie
  is treated as absent rather than silently used.
- `rehydrateCookiesFromPartition()` copies cookies from `persist:claude`
  back into `defaultSession` when auth fails — repairs cookie state lost
  during sleep without requiring the user to log in again.

## Windows shutdown / quit flow

- `isQuitting` flag (default `false`) is set to `true` in `before-quit`.
- `window-all-closed` only calls `e.preventDefault()` when `!isQuitting`,
  so the app stays alive as a tray-only process normally but lets the OS
  shutdown signal propagate cleanly.
- `cleanupAndQuit()` tears down resources in safe order: poll timer →
  scraper → `iconRenderer` → `tray.destroy()` → `app.quit()`. The tray
  must be destroyed before process exit on Windows or the Shell holds a
  dangling native handle (null-pointer AV).
- Tray "Quit" routes through `cleanupAndQuit()`, not bare `app.quit()`.
- `will-quit` repeats the same teardown as a safety net for OS-initiated
  shutdowns.

## Security boundaries

- `contextIsolation: true` / `nodeIntegration: false` on every
  `BrowserWindow` — page JS has no access to Node APIs.
- `setWindowOpenHandler({ action: 'deny' })` on both the scraper and
  login windows — page scripts cannot spawn new unrestricted windows.
- `will-navigate` guard on the scraper: blocks navigation to any origin
  outside `https://claude.ai`.
- `will-navigate` guard on the login window: allows `claude.ai`,
  `*.anthropic.com`, `*.google.com` (needed for Google OAuth); blocks
  everything else.
- `app:openExternal` IPC validates URLs — `https`/`http` only. Prevents
  a compromised renderer from triggering `file://` or custom schemes.
- `settings:save` IPC rejects non-object payloads and any key outside
  `{ poll_interval_seconds, launch_at_login }`.
- The `sessionKey` cookie is never logged, persisted to any file, or
  sent anywhere outside claude.ai.

## Things to be careful about

- **Never log or persist the sessionKey cookie.** It's auth material.
- **Don't add network calls to anywhere besides claude.ai.** A core
  selling point in the README is "no telemetry, nothing sent anywhere
  except claude.ai with the user's own session."
- **Keep all security boundaries intact** (see section above). Each one
  has a specific reason — don't remove them for convenience.
- **Parser fragility**: `parseUsageText` regexes mirror the visible text
  structure of `/settings/usage` ("Current session", "All models",
  "Resets in …"). When Anthropic redesigns that page, this breaks.
  Update the regex set in `claude-session.js` and bump the version.
- **macOS tray title vs image**: `getTrayIconImage()` returns empty on
  darwin because the menu-bar item is rendered as a custom @2x template
  PNG via the offscreen renderer. On other platforms a static PNG is
  used.
- **No runtime dependencies.** Keep it that way. `simple-store.js`
  replaced `electron-store` specifically to eliminate 25 transitive
  packages from the asar. Any new dependency needs a strong justification.
- **No bundler for the renderer.** HTML/JS files are loaded directly by
  Electron. Don't introduce a build step unless explicitly asked.

## Running and building

```bash
npm install
npm start              # dev
npm run build:mac      # .dmg (arm64 + x64)
npm run build:win      # .exe (NSIS x64)
```

Releases are produced by the GitHub Actions workflow when a `v*.*.*`
tag is pushed. Workflow builds both platforms, collects only the `.dmg`
and `.exe`, and publishes them as a live GitHub Release automatically.
Code-signing env vars are scaffolded but commented out in the workflow;
flip them on after obtaining Apple Developer / Windows OV certs. Until
then, builds are unsigned — macOS users bypass Gatekeeper, Windows users
bypass SmartScreen (both documented in README).

## Files that should never be committed

Already covered by `.gitignore`: `node_modules/`, `dist/`, `.DS_Store`,
`claude-usage-bar.json` (config store), `.env*`, signing certs (`*.p12`,
`*.pem`, `*.mobileprovision`).

## Conventions

- The user prefers terse explanations and minimal comments — only
  comment the non-obvious "why".
- README and SECURITY.md are kept in English. UI strings in `renderer/`
  are also English.
- Don't introduce a build step for the renderer (no bundler, no TS).
  HTML/JS files are loaded directly by Electron — keep it that way
  unless explicitly asked.
