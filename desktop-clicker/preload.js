const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (partial) => ipcRenderer.invoke("settings:set", partial),
  verifyLicense: (key) => ipcRenderer.invoke("license:verify", key),
  getMachineId: () => ipcRenderer.invoke("system:getMachineId"),
  toggle: () => ipcRenderer.invoke("click:toggle"),
  getStatus: () => ipcRenderer.invoke("click:status"),
  pickPoint: () => ipcRenderer.invoke("point:pick"),
  captureKey: () => ipcRenderer.invoke("key:capture"),
  openDonate: () => ipcRenderer.invoke("donate:open"),
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  openUpdateDownload: (url) => ipcRenderer.invoke("update:openDownload", url),

  setSchedule: (hhmm) => ipcRenderer.invoke("schedule:set", hhmm),
  cancelSchedule: () => ipcRenderer.invoke("schedule:cancel"),

  startRecording: () => ipcRenderer.invoke("macro:startRecording"),
  stopRecording: () => ipcRenderer.invoke("macro:stopRecording"),
  saveMacro: (name, events) => ipcRenderer.invoke("macro:save", name, events),
  playMacro: (name) => ipcRenderer.invoke("macro:play", name),
  deleteMacro: (name) => ipcRenderer.invoke("macro:delete", name),

  exportSettings: () => ipcRenderer.invoke("settings:export"),
  importSettings: () => ipcRenderer.invoke("settings:import"),

  onStatus: (callback) => ipcRenderer.on("status:update", (_e, data) => callback(data)),
  onNote: (callback) => ipcRenderer.on("note:show", (_e, text) => callback(text)),
  onRecordingStopped: (callback) => ipcRenderer.on("recording:stopped", (_e, events) => callback(events)),
});
