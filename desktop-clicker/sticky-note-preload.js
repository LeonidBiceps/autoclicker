const { contextBridge, ipcRenderer } = require("electron");

// Какая именно заметка открыта в этом окне main.js знает сам (по webContents.id — см.
// noteWindowIdMap в main.js), так что сюда не нужно передавать id заметки вручную.
contextBridge.exposeInMainWorld("noteApi", {
  getInitialData: () => ipcRenderer.invoke("notes:getInitialData"),
  updateText: (text) => ipcRenderer.send("notes:updateText", text),
  updateColor: (color) => ipcRenderer.send("notes:updateColor", color),
  deleteNote: () => ipcRenderer.send("notes:deleteSelf"),
});
