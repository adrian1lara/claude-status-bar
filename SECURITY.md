# Security Policy

## Reporting a vulnerability

If you discover a security issue in Claude Usage Bar, please **do not open a
public GitHub issue**. Instead, email:

**laraasdev@gmail.com**

Include:
- A description of the issue and its impact
- Steps to reproduce
- Affected version (see `package.json`)
- Your environment (OS, Electron version)

I'll acknowledge within 7 days and aim to ship a fix or mitigation within 30
days for confirmed issues. Please give me a reasonable window to patch before
public disclosure.

## Scope

In scope:
- The Electron app code in this repository (`main.js`, `preload.js`,
  `claude-session.js`, `renderer/`)
- The release/build pipeline
- Dependencies declared in `package.json`

Out of scope:
- Vulnerabilities in claude.ai itself — report those to Anthropic
- Social-engineering, physical access, or DoS against the user's own machine
- Issues that require a pre-compromised local user account

## What this app stores

- A persistent claude.ai session cookie, kept in Electron's default session
  store under your OS user data directory (e.g.
  `~/Library/Application Support/claude-usage-bar` on macOS).
- Local preferences (poll interval, launch-at-login) in a JSON file in the same directory.

No data is sent anywhere except claude.ai itself, using your own logged-in
session.
