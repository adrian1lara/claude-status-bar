# Claude Usage Bar — project notes

Electron menu bar / system tray app that shows the user's real-time
Claude usage (session % and weekly %) by scraping `claude.ai/settings/usage`
with the user's own logged-in session. Unofficial; not affiliated with
Anthropic.

## Architecture

- `main.js` — Electron main process. Owns the tray, popover, settings
  window, polling loop, IPC handlers, and the hidden offscreen
  `BrowserWindow` used to rasterize the tray icon.
- `claude-session.js` — All claude.ai interaction. Manages the login
  window (partition `persist:claude`), the persistent hidden scraper
  window, cookie copy into `session.defaultSession`, and DOM-text
  parsing via pre-compiled regexes.
- `preload.js` — `contextBridge` API for renderer → main IPC. Renderers
  run with `contextIsolation: true`, `nodeIntegration: false`.
- `renderer/`
  - `tray-icon.html` — offscreen canvas; exposes `window.renderIcon(pct)`
    returning a base64 PNG @2x for the macOS template image.
  - `popover.html` / `popover.js` — the dropdown shown on tray click.
  - `settings.html` / `settings.js` — login/logout, poll interval,
    launch-at-login.
- `electron-builder.config.js` — packaging config (DMG for mac, NSIS for
  win).
- `.github/workflows/release.yml` — tag-triggered (`v*.*.*`) build for
  macOS + Windows; uploads unsigned artifacts + SHA256s to a draft
  GitHub Release.

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

## Things to be careful about

- **Never log or persist the sessionKey cookie.** It's auth material.
- **Don't add network calls to anywhere besides claude.ai.** A core
  selling point in the README is "no telemetry, nothing sent anywhere
  except claude.ai with the user's own session."
- **Keep `contextIsolation: true` / `nodeIntegration: false`** on every
  `BrowserWindow`. The login window and scraper load remote claude.ai
  content.
- **`app:openExternal` IPC validates URLs** (https/http only). Preserve
  that check if you touch it — it's the only thing stopping a
  compromised renderer from triggering `file://` or custom schemes.
- **Parser fragility**: `parseUsageText` regexes mirror the visible text
  structure of `/settings/usage` ("Current session", "All models",
  "Resets in …"). When Anthropic redesigns that page, this breaks.
  Update the regex set in `claude-session.js` and bump the version.
- **macOS tray title vs image**: `getTrayIconImage()` returns empty on
  darwin because the menu-bar item is rendered as a custom @2x template
  PNG via the offscreen renderer. On other platforms a static PNG is
  used.

## Running and building

```bash
npm install
npm start              # dev
npm run build:mac      # .dmg (arm64 + x64)
npm run build:win      # .exe (NSIS x64)
```

Releases are produced by the GitHub Actions workflow when a `v*.*.*`
tag is pushed. Code-signing env vars are scaffolded but commented out;
flip them on after obtaining Apple Developer / Windows OV certs. Until
then, builds are unsigned and users must bypass Gatekeeper / SmartScreen
manually (documented in README).

## Files that should never be committed

Already covered by `.gitignore`: `node_modules/`, `dist/`, `.DS_Store`,
`*.local.json` (electron-store data), `.env*`, signing certs (`*.p12`,
`*.pem`, `*.mobileprovision`).

## Conventions

- The user prefers terse explanations and minimal comments — only
  comment the non-obvious "why".
- README and SECURITY.md are kept in English. UI strings in `renderer/`
  are also English.
- Don't introduce a build step for the renderer (no bundler, no TS).
  HTML/JS files are loaded directly by Electron — keep it that way
  unless explicitly asked.
