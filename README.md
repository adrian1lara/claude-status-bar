# Claude Usage Bar

> ⚠️ **Unofficial — not affiliated with, endorsed by, or sponsored by Anthropic.**
> "Claude" is a trademark of Anthropic, PBC.

Menu bar / system tray app that connects to your Anthropic account
(claude.ai) and shows your **real-time usage** — the same numbers you see
on `claude.ai/settings/usage`. It works no matter where you're spending
your quota: the Claude web app, Claude Code, the desktop app,
third-party clients, etc. It all counts toward the same limit and this
app reflects that.

- **macOS**: menu bar app (no dock icon). Title: `▣▣▣░░ 67%`
- **Windows**: tray icon with tooltip
- Click → popover with: plan, current 5h session %, countdown to reset,
  weekly limit %, next weekly reset
- No API key required — you sign in with your normal Anthropic login once

## How it works

1. The first time you open the app, a login window to `claude.ai` is
   shown. You log in the way you normally do (Google, email + magic
   link, SSO, passkey, etc.).
2. The app stores the session cookie in Electron's local storage (in
   your OS user-data folder).
3. Every 60 seconds (configurable) it opens a **hidden** window that
   loads `claude.ai/settings/usage` with your session and reads the
   rendered DOM to extract the percentages Anthropic already shows you
   there.
4. It paints those numbers in the menu bar / tray.

There is no intermediate server, no telemetry, and nothing is sent
anywhere other than claude.ai using your own session.

## Privacy & stored data

The only things kept on your machine:

- The **claude.ai session cookie** (the same one your browser uses),
  inside Electron's user-data directory:
  - macOS: `~/Library/Application Support/claude-usage-bar`
  - Windows: `%APPDATA%\claude-usage-bar`
- Your **preferences** (poll interval, launch-at-login) in a JSON file
  via `electron-store`.

To sign out: use the **Logout** button in Settings, or delete that
folder.

## Limitations

- The app **scrapes the DOM** of `claude.ai/settings/usage`. If
  Anthropic changes the HTML of that page, the parser may break until a
  new version is released.
- You must stay logged in. If your session expires, sign in again from
  Settings.
- This is not an official client. Use it at your own risk and within
  Anthropic's Terms of Service.

## Run from source

```bash
npm install
npm start
```

## Build binaries

```bash
npm run build:mac   # .dmg (arm64 + x64)
npm run build:win   # .exe (NSIS, x64)
```

Pre-built binaries are unsigned. macOS will flag them as coming from an
"unidentified developer" — right-click → **Open** the first time.
Windows SmartScreen will show a warning — **More info → Run anyway**.

## License

MIT — see `LICENSE`. Security reports: `SECURITY.md`.
