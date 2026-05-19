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

## Download

Go to the [Releases page](../../releases/latest) and download:

- **macOS** → `Claude Usage Bar-x.x.x.dmg`
- **Windows** → `Claude Usage Bar Setup x.x.x.exe`

---

## Installing on macOS (unsigned app)

The app is not signed with an Apple Developer certificate, so macOS
Gatekeeper will block it on first launch. Follow these steps:

### Step 1 — Open the DMG and drag to Applications

Open the downloaded `.dmg` file and drag **Claude Usage Bar** into your
`/Applications` folder as usual.

### Step 2 — Bypass Gatekeeper (one-time only)

macOS will say _"Claude Usage Bar cannot be opened because it is from an
unidentified developer"_ or _"Apple cannot check it for malicious software"_.

**Option A — Right-click method (easiest):**

1. Open **Finder** and go to `/Applications`
2. **Right-click** (or Control-click) on **Claude Usage Bar**
3. Click **Open** in the context menu
4. Click **Open** again in the dialog that appears
5. The app will launch and macOS will remember your choice — future opens work normally

**Option B — System Settings method:**

1. Try to open the app normally — it will be blocked
2. Open **System Settings → Privacy & Security**
3. Scroll down to the **Security** section
4. You will see _"Claude Usage Bar was blocked"_ with an **Open Anyway** button
5. Click **Open Anyway**, then confirm with **Open**

**Option C — Terminal (if both above fail):**

```
xattr -cr "/Applications/Claude Usage Bar.app"
```

Then open the app normally. This removes the quarantine flag macOS sets
on downloaded files.

### Step 3 — Sign in

A sign-in window to `claude.ai` opens automatically on first launch.
Log in the way you normally do (Google, email magic link, SSO, etc.).
The app captures only the session cookie and uses it to read your usage
page — nothing else.

---

## Installing on Windows

Run the downloaded `.exe` installer. Windows SmartScreen may show a
warning because the app is unsigned:

1. Click **More info**
2. Click **Run anyway**

The app installs and adds a tray icon in the system tray (bottom-right).

---

## How it works

1. On first launch a login window to `claude.ai` is shown. You log in
   the way you normally do (Google, email + magic link, SSO, passkey, etc.).
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
  - macOS: `~/Library/Application Support/claude-usage-bar/`
  - Windows: `%APPDATA%\claude-usage-bar\`
- Your **preferences** (poll interval, launch-at-login) in
  `claude-usage-bar.json` in the same folder.

To sign out: use the **Sign out** button in Settings, or delete that folder.

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
pnpm install
pnpm start
```

## Build binaries

```bash
pnpm run build:mac   # .dmg (arm64 + x64)
pnpm run build:win   # .exe (NSIS, x64)
```

## License

MIT — see `LICENSE`. Security reports: `SECURITY.md`.
