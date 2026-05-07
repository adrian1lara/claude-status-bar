// Manages a logged-in claude.ai session inside Electron:
//  - openLogin(): visible window where the user logs in normally.
//                 Resolves when a sessionKey cookie appears.
//  - isAuthenticated(): true if we have a sessionKey cookie.
//  - fetchUsageViaDOM(): opens a hidden window on claude.ai/settings/usage,
//                        scrapes the rendered DOM, returns parsed usage.
//  - logout(): clears cookies for claude.ai.
//  - destroy(): cleanup persistent resources.

const { BrowserWindow, session, powerMonitor } = require("electron");

const CLAUDE_ORIGIN = "https://claude.ai";
const LOGIN_URL = `${CLAUDE_ORIGIN}/login`;
const USAGE_URL = `${CLAUDE_ORIGIN}/settings/usage`;
const REAL_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// ---------- persistent scraper window ----------
// Reuse a single hidden BrowserWindow across poll cycles instead of
// creating + destroying one per refresh. This saves ~40-80 MB of peak
// memory and avoids the cost of renderer-process spin-up each time.
let scraperWin = null;

// After a wake-from-sleep the persistent scraper window may be in a broken
// state (zombie renderer, stale HTTP state). Destroy it so next poll gets
// a fresh window.
function resetScraperOnWake() {
  destroyScraper();
}

// Wire up once when the module first loads. powerMonitor is only available
// after app is ready, so we defer until the first getOrCreateScraper call.
let _wakeListenerAttached = false;
function ensureWakeListener() {
  if (_wakeListenerAttached) return;
  _wakeListenerAttached = true;
  try {
    powerMonitor.on("resume", resetScraperOnWake);
  } catch {
    // powerMonitor not ready yet — will be attached on first scraper creation
  }
}

function getOrCreateScraper() {
  ensureWakeListener();
  if (scraperWin && !scraperWin.isDestroyed()) return scraperWin;
  scraperWin = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: false,
      backgroundThrottling: false, // keep JS timers running when hidden
      images: false, // don't load images — we only need text
    },
  });
  scraperWin.webContents.setUserAgent(REAL_UA);
  // Prevent audio/video from loading in the scraper
  scraperWin.webContents.setAudioMuted(true);
  scraperWin.on("closed", () => {
    scraperWin = null;
  });
  return scraperWin;
}

function destroyScraper() {
  if (scraperWin && !scraperWin.isDestroyed()) {
    try {
      scraperWin.destroy();
    } catch {}
  }
  scraperWin = null;
}

// ---------- helpers ----------

function getDefaultSession() {
  return session.defaultSession;
}

async function getSessionCookie() {
  const ses = getDefaultSession();
  // Try both domain variants in a single pass
  const [dotCookies, plainCookies] = await Promise.all([
    ses.cookies.get({ domain: ".claude.ai", name: "sessionKey" }),
    ses.cookies.get({ domain: "claude.ai", name: "sessionKey" }),
  ]);
  if (dotCookies && dotCookies.length) return dotCookies[0];
  if (plainCookies && plainCookies.length) return plainCookies[0];
  return null;
}

async function isAuthenticated() {
  const cookie = await getSessionCookie();
  if (!cookie) return false;
  // Treat cookies with a past expiration as gone (can happen after long sleep)
  if (cookie.expirationDate && cookie.expirationDate < Date.now() / 1000) {
    return false;
  }
  return true;
}

async function logout() {
  const ses = getDefaultSession();
  // Clear both domain variants in parallel
  const [all1, all2] = await Promise.all([
    ses.cookies.get({ domain: ".claude.ai" }),
    ses.cookies.get({ domain: "claude.ai" }),
  ]);
  const allCookies = [...all1, ...all2];
  await Promise.allSettled(
    allCookies.map((c) => {
      const url = `https://${c.domain.replace(/^\./, "")}${c.path || "/"}`;
      return ses.cookies.remove(url, c.name);
    }),
  );
  // Also destroy the scraper so it picks up the cleared session next time
  destroyScraper();
}

function openLogin() {
  return new Promise((resolve, _reject) => {
    const win = new BrowserWindow({
      width: 480,
      height: 720,
      title: "Sign in to Claude",
      autoHideMenuBar: true,
      webPreferences: {
        partition: "persist:claude",
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setMenuBarVisibility(false);
    win.webContents.setUserAgent(REAL_UA);
    win.loadURL(LOGIN_URL);

    let resolved = false;

    const checkInterval = setInterval(async () => {
      try {
        const ses = win.webContents.session;
        const cookies = await ses.cookies.get({
          domain: ".claude.ai",
          name: "sessionKey",
        });
        if (cookies && cookies.length) {
          // Copy cookies from the partition session into the default session
          // so the hidden polling window can see them too.
          const all = await ses.cookies.get({ domain: ".claude.ai" });
          await Promise.allSettled(
            all.map((c) =>
              session.defaultSession.cookies.set({
                url: `https://${c.domain.replace(/^\./, "")}${c.path || "/"}`,
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                secure: c.secure,
                httpOnly: c.httpOnly,
                sameSite: c.sameSite,
                expirationDate: c.expirationDate,
              }),
            ),
          );
          resolved = true;
          clearInterval(checkInterval);
          win.close();
          resolve(true);
        }
      } catch {
        // ignore — keep polling
      }
    }, 1000);

    win.on("closed", () => {
      clearInterval(checkInterval);
      if (!resolved) resolve(false);
    });
  });
}

// Scrape /settings/usage in a persistent hidden BrowserWindow, read DOM text.
// On failure, destroys the scraper so the next call gets a fresh window.
async function fetchUsageViaDOM() {
  const authed = await isAuthenticated();
  if (!authed) {
    // Re-try by copying cookies from the persist:claude partition into
    // defaultSession — the login window may have renewed them during sleep.
    await rehydrateCookiesFromPartition();
    const authed2 = await isAuthenticated();
    if (!authed2) return { authenticated: false };
  }

  // Reset scraper if it navigated away from claude.ai (e.g. redirect to /login
  // after a cookie expiry) so we start fresh rather than re-scraping a login page.
  if (scraperWin && !scraperWin.isDestroyed()) {
    const url = scraperWin.webContents.getURL();
    if (url && !url.startsWith(CLAUDE_ORIGIN)) {
      destroyScraper();
    }
  }

  const win = getOrCreateScraper();

  try {
    await win.loadURL(USAGE_URL);

    // Wait for the usage UI to render. Poll the DOM up to ~12s.
    const data = await pollUntilParsed(win, 12_000);

    // If we got redirected to login, the cookie is gone — report not authed
    const finalUrl = win.webContents.getURL();
    if (finalUrl && finalUrl.includes("/login")) {
      destroyScraper();
      return { authenticated: false };
    }

    return { authenticated: true, ...data };
  } catch (err) {
    // If the window broke, reset it for next cycle
    destroyScraper();
    return { authenticated: true, error: String(err.message || err) };
  }
}

// Copy cookies from the persist:claude partition (used by the login window)
// into defaultSession so the scraper window can use them. This repairs the
// state that can be lost after a sleep/wake cycle.
async function rehydrateCookiesFromPartition() {
  try {
    const partitionSession = session.fromPartition("persist:claude");
    const all = await partitionSession.cookies.get({ domain: ".claude.ai" });
    if (!all.length) return;
    await Promise.allSettled(
      all.map((c) =>
        session.defaultSession.cookies.set({
          url: `https://${c.domain.replace(/^\./, "")}${c.path || "/"}`,
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
          expirationDate: c.expirationDate,
        }),
      ),
    );
  } catch {
    // ignore — best effort
  }
}

async function pollUntilParsed(win, timeoutMs) {
  const start = Date.now();
  let lastText = "";
  while (Date.now() - start < timeoutMs) {
    let text = "";
    try {
      text = await win.webContents.executeJavaScript(
        "document.body?document.body.innerText:''",
      );
    } catch {
      text = "";
    }
    lastText = text;
    const parsed = parseUsageText(text);
    if (parsed.session_percent != null) {
      return { ...parsed, scraped_at: new Date().toISOString() };
    }
    await sleep(500);
  }
  return {
    error: "Could not parse usage from claude.ai (UI may have changed).",
    raw_excerpt: lastText.slice(0, 500),
    scraped_at: new Date().toISOString(),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Extract percentages and reset times from the rendered text. Tolerant to
// reordering/whitespace differences. Mirrors the visible dashboard sections:
//   "Plan usage limits"  Pro
//   "Current session"    XX% used    "Resets in 3 hr 45 min"
//   "Weekly limits"
//   "All models"         XX% used    "Resets Tue 12:00 AM"
//   "Claude Design"      XX% used

// Pre-compile regexes once instead of per-call for faster parsing
const RE_PLAN_BLOCK =
  /Plan usage limits[\s\S]{0,40}?\b(Pro Max|Max|Pro|Free|Team|Enterprise)\b/i;
const RE_PLAN_FALLBACK = /\b(Pro Max|Max|Pro|Free|Team|Enterprise)\b/;

const RE_SESSION_FULL =
  /Current session[\s\S]*?Resets in\s+([^\n]+?)\s*(?:\n|$)[\s\S]*?(\d+)\s*%\s*used/i;
const RE_SESSION_ALT = /Current session[\s\S]*?(\d+)\s*%\s*used/i;
const RE_SESSION_RESET =
  /Resets in\s+([0-9]+\s*hr(?:\s*[0-9]+\s*min)?|[0-9]+\s*min)/i;

const RE_WEEKLY =
  /All models[\s\S]*?Resets\s+([^\n]+?)\s*(?:\n|$)[\s\S]*?(\d+)\s*%\s*used/i;
const RE_DESIGN = /Claude Design[\s\S]*?(\d+)\s*%\s*used/i;

function parseUsageText(text) {
  if (!text) return {};
  const out = {};

  const planMatch = RE_PLAN_BLOCK.exec(text) || RE_PLAN_FALLBACK.exec(text);
  if (planMatch) out.plan = planMatch[1];

  // Current session block
  const sessionMatch = RE_SESSION_FULL.exec(text);
  if (sessionMatch) {
    out.session_resets_in = sessionMatch[1].trim();
    out.session_percent = Number(sessionMatch[2]);
  } else {
    const alt = RE_SESSION_ALT.exec(text);
    if (alt) out.session_percent = Number(alt[1]);
    const reset = RE_SESSION_RESET.exec(text);
    if (reset) out.session_resets_in = reset[1].trim();
  }

  // Weekly "All models"
  const weekly = RE_WEEKLY.exec(text);
  if (weekly) {
    out.weekly_resets_at = weekly[1].trim();
    out.weekly_percent = Number(weekly[2]);
  }

  // Claude Design / model-specific
  const design = RE_DESIGN.exec(text);
  if (design) out.design_percent = Number(design[1]);

  return out;
}

module.exports = {
  openLogin,
  isAuthenticated,
  logout,
  fetchUsageViaDOM,
  destroy: destroyScraper,
};
