const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pickApi", {
  reportClick: (point) => ipcRenderer.send("pick:done", point),
  reportRegion: (region) => ipcRenderer.send("region:done", region),
});
