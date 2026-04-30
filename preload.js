const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (s) => ipcRenderer.invoke("settings:save", s),
  getUsage: () => ipcRenderer.invoke("usage:get"),
  refreshUsage: () => ipcRenderer.invoke("usage:refresh"),
  openSettings: () => ipcRenderer.invoke("settings:open"),
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
  authStatus: () => ipcRenderer.invoke("auth:status"),
  authLogin: () => ipcRenderer.invoke("auth:login"),
  authLogout: () => ipcRenderer.invoke("auth:logout"),
  onUsageUpdate: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on("usage:update", handler);
    // Return unsubscribe function to prevent listener leaks
    return () => ipcRenderer.removeListener("usage:update", handler);
  },
  onAuthUpdate: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on("auth:update", handler);
    return () => ipcRenderer.removeListener("auth:update", handler);
  }
});
