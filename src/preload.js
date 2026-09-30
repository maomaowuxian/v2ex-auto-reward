const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("v2exApp", {
  getState: () => ipcRenderer.invoke("state:get"),
  runClaim: (options) => ipcRenderer.invoke("claim:run", options),
  runLogin: () => ipcRenderer.invoke("login:run"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  openLogs: () => ipcRenderer.invoke("logs:open"),
  showError: (title, body) => ipcRenderer.invoke("dialog:error", title, body),
  onStateUpdate: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("state:update", listener);
    return () => ipcRenderer.removeListener("state:update", listener);
  }
});
