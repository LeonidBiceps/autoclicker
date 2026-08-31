const { contextBridge, ipcRenderer, clipboard } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (partial) => ipcRenderer.invoke("settings:set", partial),
  verifyLicense: (key) => ipcRenderer.invoke("license:verify", key),
  getMachineId: () => ipcRenderer.invoke("system:getMachineId"),
  pickActiveWindowTitle: () => ipcRenderer.invoke("system:pickActiveWindowTitle"),
  toggle: () => ipcRenderer.invoke("click:toggle"),
  getStatus: () => ipcRenderer.invoke("click:status"),
  pickPoint: () => ipcRenderer.invoke("point:pick"),
  sampleColor: (point) => ipcRenderer.invoke("color:sample", point),
  captureKey: () => ipcRenderer.invoke("key:capture"),
  openDonate: () => ipcRenderer.invoke("donate:open"),

  setSchedule: (hhmm, repeat, intervalMin) => ipcRenderer.invoke("schedule:set", hhmm, repeat, intervalMin),
  cancelSchedule: () => ipcRenderer.invoke("schedule:cancel"),

  startRecording: () => ipcRenderer.invoke("macro:startRecording"),
  stopRecording: () => ipcRenderer.invoke("macro:stopRecording"),
  saveMacro: (name, events, repeat) => ipcRenderer.invoke("macro:save", name, events, repeat),
  playMacro: (name) => ipcRenderer.invoke("macro:play", name),
  deleteMacro: (name) => ipcRenderer.invoke("macro:delete", name),
  updateMacro: (oldName, newName, repeat) => ipcRenderer.invoke("macro:update", oldName, newName, repeat),
  playMacroChain: (names) => ipcRenderer.invoke("macro:playChain", names),

  exportSettings: () => ipcRenderer.invoke("settings:export"),
  importSettings: () => ipcRenderer.invoke("settings:import"),

  listStartupApps: () => ipcRenderer.invoke("startup:list"),
  toggleStartupApp: (name, source, enable) => ipcRenderer.invoke("startup:toggle", name, source, enable),

  captureAndRecognizeText: () => ipcRenderer.invoke("ocr:capture"),
  copyText: (text) => clipboard.writeText(text),
  pickTextTriggerRegion: () => ipcRenderer.invoke("textTrigger:pickRegion"),

  startRecordingScreen: () => ipcRenderer.invoke("record:start"),
  stopRecordingScreen: () => ipcRenderer.invoke("record:stop"),
  saveVideoRecording: (buffer) => ipcRenderer.invoke("record:saveVideo", buffer),
  openRecordingsFolder: () => ipcRenderer.invoke("record:openFolder"),

  onStatus: (callback) => ipcRenderer.on("status:update", (_e, data) => callback(data)),
  onNote: (callback) => ipcRenderer.on("note:show", (_e, text) => callback(text)),
  onRecordingStopped: (callback) => ipcRenderer.on("recording:stopped", (_e, events) => callback(events)),
  onRecordingProgress: (callback) => ipcRenderer.on("recording:progress", (_e, count) => callback(count)),
});
