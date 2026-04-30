const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  screen,
  shell
} = require("electron");
const path = require("path");
const Store = require("electron-store");
const claudeSession = require("./claude-session");

const store = new Store({
  name: "claude-usage-bar",
  defaults: {
    poll_interval_seconds: 60,
    launch_at_login: false
  }
});

let tray = null;
let popoverWindow = null;
let settingsWindow = null;
let iconRenderer = null;
let iconRendererReady = null;
let pollTimer = null;
let fetching = false;

// Cache the last-rendered icon to avoid re-rendering when percent is unchanged
let lastRenderedPercent = undefined; // undefined = never rendered
let lastRenderedImage = null;

let lastState = {
  authenticated: false,
  plan: null,
  session_percent: null,
  session_resets_in: null,
  weekly_percent: null,
  weekly_resets_at: null,
  design_percent: null,
  last_updated: null,
  error: null
};

// ---------- helpers ----------

function colorForPercent(pct) {
  if (pct == null) return "#9a9aa2";
  if (pct < 50) return "#3fb950";
  if (pct < 80) return "#f0a020";
  return "#f85149";
}

function buildMiniBar(pct, width = 4) {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return "●".repeat(filled) + "○".repeat(width - filled);
}

function buildTrayTitle(state) {
  if (!state.authenticated) return " sign in";
  if (state.error && state.session_percent == null) return " ⚠";
  if (state.session_percent == null) return " …";
  const pct = Math.round(state.session_percent);
  return ` ${buildMiniBar(pct)} ${pct}%`;
}

function createIconRenderer() {
  iconRenderer = new BrowserWindow({
    width: 200,
    height: 80,
    show: false,
    frame: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: false,
      backgroundThrottling: false // keep responsive when hidden
    }
  });
  iconRendererReady = new Promise((resolve) => {
    iconRenderer.webContents.once("did-finish-load", () => resolve());
  });
  iconRenderer.loadFile(path.join(__dirname, "renderer", "tray-icon.html"));
}

async function renderTrayIconImage(percent) {
  if (!iconRenderer) return null;

  // Return cached image if percent hasn't changed (saves IPC + canvas render)
  const roundedPct = typeof percent === "number" ? Math.round(percent) : null;
  if (roundedPct === lastRenderedPercent && lastRenderedImage) {
    return lastRenderedImage;
  }

  await iconRendererReady;
  const arg = typeof percent === "number" ? percent : "null";
  const dataUrl = await iconRenderer.webContents.executeJavaScript(
    `window.renderIcon(${arg})`,
    true
  );
  if (!dataUrl) return null;
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;
  const buf = Buffer.from(base64, "base64");
  // scaleFactor: 2 tells Electron the PNG is @2x retina, so its logical
  // size in the menu bar is half the pixel dimensions.
  const img = nativeImage.createFromBuffer(buf, { scaleFactor: 2 });
  img.setTemplateImage(true);

  // Cache the result
  lastRenderedPercent = roundedPct;
  lastRenderedImage = img;

  return img;
}

function buildTrayTooltip(state) {
  if (!state.authenticated) return "Claude Usage: not signed in — click to sign in";
  if (state.error && state.session_percent == null) {
    return `Claude Usage: ${state.error}`;
  }
  if (state.session_percent == null) return "Claude Usage: loading…";
  const parts = [
    `Session: ${state.session_percent}% (resets in ${state.session_resets_in || "?"})`
  ];
  if (state.weekly_percent != null) {
    parts.push(`Weekly: ${state.weekly_percent}%`);
  }
  if (state.plan) parts.unshift(`Plan: ${state.plan}`);
  return `Claude Usage — ${parts.join(" · ")}`;
}

function getTrayIconImage() {
  // On macOS we render a text-only menu bar item — no icon to keep it compact.
  if (process.platform === "darwin") {
    return nativeImage.createEmpty();
  }
  const iconPath = path.join(__dirname, "assets", "app-icon.png");
  try {
    const img = nativeImage.createFromPath(iconPath);
    return img.isEmpty() ? nativeImage.createEmpty() : img;
  } catch {
    return nativeImage.createEmpty();
  }
}

// ---------- data ----------

async function refreshUsage() {
  if (fetching) return;
  fetching = true;
  try {
    const result = await claudeSession.fetchUsageViaDOM();
    if (!result.authenticated) {
      lastState = {
        ...lastState,
        authenticated: false,
        error: "Not signed in",
        last_updated: new Date().toISOString()
      };
    } else {
      lastState = {
        authenticated: true,
        plan: result.plan ?? lastState.plan,
        session_percent: result.session_percent ?? null,
        session_resets_in: result.session_resets_in ?? null,
        weekly_percent: result.weekly_percent ?? null,
        weekly_resets_at: result.weekly_resets_at ?? null,
        design_percent: result.design_percent ?? null,
        last_updated: new Date().toISOString(),
        error: result.error || null
      };
    }
  } catch (err) {
    lastState = {
      ...lastState,
      error: String(err.message || err),
      last_updated: new Date().toISOString()
    };
  } finally {
    fetching = false;
    pushStateEverywhere();
  }
}

function pushStateEverywhere() {
  updateTray();
  if (popoverWindow && !popoverWindow.isDestroyed()) {
    popoverWindow.webContents.send("usage:update", lastState);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("auth:update", {
      authenticated: lastState.authenticated
    });
  }
}

// ---------- tray ----------

async function updateTray() {
  if (!tray) return;
  tray.setToolTip(buildTrayTooltip(lastState));
  if (process.platform === "darwin") {
    const hasPct =
      lastState.authenticated && typeof lastState.session_percent === "number";
    if (hasPct) {
      tray.setTitle("");
      try {
        const img = await renderTrayIconImage(lastState.session_percent);
        if (img && !img.isEmpty()) tray.setImage(img);
      } catch {
        // ignore icon render errors
      }
    } else {
      tray.setImage(nativeImage.createEmpty());
      tray.setTitle(buildTrayTitle(lastState));
    }
  }
}

function createTray() {
  tray = new Tray(getTrayIconImage());
  updateTray();

  tray.on("click", (_event, bounds) => togglePopover(bounds));
  tray.on("right-click", () => {
    const menu = Menu.buildFromTemplate([
      { label: "Refresh now", click: () => refreshUsage() },
      { label: "Settings…", click: () => openSettings() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ]);
    tray.popUpContextMenu(menu);
  });
}

// ---------- popover ----------

function createPopover() {
  popoverWindow = new BrowserWindow({
    width: 340,
    height: 280,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true // save CPU when popover is hidden
    }
  });
  popoverWindow.loadFile(path.join(__dirname, "renderer", "popover.html"));
  popoverWindow.on("blur", () => {
    if (popoverWindow && !popoverWindow.webContents.isDevToolsOpened()) {
      popoverWindow.hide();
    }
  });
  popoverWindow.webContents.on("did-finish-load", () => {
    popoverWindow.webContents.send("usage:update", lastState);
  });
}

function positionPopover(bounds) {
  if (!popoverWindow) return;
  const winBounds = popoverWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  let x = Math.round(bounds.x + bounds.width / 2 - winBounds.width / 2);
  let y =
    process.platform === "darwin"
      ? Math.round(bounds.y + bounds.height + 4)
      : Math.round(bounds.y - winBounds.height - 4);
  const da = display.workArea;
  x = Math.max(da.x + 4, Math.min(x, da.x + da.width - winBounds.width - 4));
  y = Math.max(da.y + 4, Math.min(y, da.y + da.height - winBounds.height - 4));
  popoverWindow.setPosition(x, y, false);
}

function togglePopover(bounds) {
  if (!popoverWindow) createPopover();
  if (popoverWindow.isVisible()) {
    popoverWindow.hide();
    return;
  }
  if (bounds) positionPopover(bounds);
  popoverWindow.show();
  popoverWindow.focus();
}

// ---------- settings ----------

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 420,
    title: "Claude Usage Bar — Settings",
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

// ---------- polling ----------

function restartPolling() {
  if (pollTimer) clearInterval(pollTimer);
  const seconds = Math.max(30, Number(store.get("poll_interval_seconds")) || 60);
  pollTimer = setInterval(refreshUsage, seconds * 1000);
  refreshUsage();
}

// ---------- IPC ----------

ipcMain.handle("settings:get", () => ({
  poll_interval_seconds: store.get("poll_interval_seconds"),
  launch_at_login: store.get("launch_at_login")
}));

ipcMain.handle("settings:save", (_e, settings) => {
  if (settings.poll_interval_seconds) {
    store.set(
      "poll_interval_seconds",
      Math.max(30, Number(settings.poll_interval_seconds) || 60)
    );
  }
  if (typeof settings.launch_at_login === "boolean") {
    store.set("launch_at_login", settings.launch_at_login);
    app.setLoginItemSettings({
      openAtLogin: settings.launch_at_login,
      openAsHidden: true
    });
  }
  restartPolling();
  return true;
});

ipcMain.handle("auth:status", async () => ({
  authenticated: await claudeSession.isAuthenticated()
}));

ipcMain.handle("auth:login", async () => {
  const ok = await claudeSession.openLogin();
  if (ok) await refreshUsage();
  return { authenticated: ok };
});

ipcMain.handle("auth:logout", async () => {
  await claudeSession.logout();
  lastState = {
    ...lastState,
    authenticated: false,
    session_percent: null,
    weekly_percent: null,
    error: null
  };
  // Invalidate cached icon
  lastRenderedPercent = undefined;
  lastRenderedImage = null;
  pushStateEverywhere();
  return { authenticated: false };
});

ipcMain.handle("usage:get", () => lastState);
ipcMain.handle("usage:refresh", async () => {
  await refreshUsage();
  return lastState;
});
ipcMain.handle("settings:open", () => openSettings());
ipcMain.handle("app:openExternal", (_e, url) => {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return shell.openExternal(url);
  } catch {
    return false;
  }
});

// ---------- lifecycle ----------

app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(path.join(__dirname, "assets", "app-icon.png"));
    app.dock.hide();
  }
  createIconRenderer();
  createTray();
  // Popover is now lazy-created on first click (not at startup)

  const authed = await claudeSession.isAuthenticated();
  if (!authed) {
    openSettings();
  }

  restartPolling();
});

app.on("window-all-closed", (e) => {
  e.preventDefault?.();
});

// Clean up persistent resources on quit
app.on("will-quit", () => {
  if (pollTimer) clearInterval(pollTimer);
  claudeSession.destroy();
});
