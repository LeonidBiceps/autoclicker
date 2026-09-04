const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clashHudApi", {
  getCards: () => ipcRenderer.invoke("clash:getCards"),
  onState: (callback) => ipcRenderer.on("clash:state", (event, state) => callback(state)),
});
