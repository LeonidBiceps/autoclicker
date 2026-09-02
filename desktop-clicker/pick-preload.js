const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pickApi", {
  reportClick: (point) => ipcRenderer.send("pick:done", point),
  reportRegion: (region) => ipcRenderer.send("region:done", region),
  addPoint: (point) => ipcRenderer.send("points:add", point),
  undoPoint: () => ipcRenderer.send("points:undo"),
  finishPoints: () => ipcRenderer.send("points:finish"),
  cancelPoints: () => ipcRenderer.send("points:cancel"),
  onPointsCount: (cb) => ipcRenderer.on("points:count", (event, count) => cb(count)),
});
