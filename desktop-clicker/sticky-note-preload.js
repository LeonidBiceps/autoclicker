const { contextBridge, ipcRenderer } = require("electron");

// Какая именно заметка открыта в этом окне main.js знает сам (по webContents.id — см.
// noteWindowIdMap в main.js), так что сюда не нужно передавать id заметки вручную.
contextBridge.exposeInMainWorld("noteApi", {
  getInitialData: () => ipcRenderer.invoke("notes:getInitialData"),
  updateContent: (text, html) => ipcRenderer.send("notes:updateContent", { text, html }),
  updateColor: (color) => ipcRenderer.send("notes:updateColor", color),
  deleteNote: () => ipcRenderer.send("notes:deleteSelf"),
  saveImage: (arrayBuffer, mimeType) => ipcRenderer.invoke("notes:saveImage", arrayBuffer, mimeType),
});
