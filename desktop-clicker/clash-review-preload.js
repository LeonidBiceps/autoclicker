const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clashReviewApi", {
  getPendingReview: () => ipcRenderer.invoke("clash:getPendingReview"),
  resolvePendingReview: (id, cardId) => ipcRenderer.invoke("clash:resolvePendingReview", id, cardId),
  clearPendingReview: () => ipcRenderer.invoke("clash:clearPendingReview"),
  getCards: () => ipcRenderer.invoke("clash:getCards"),
  onPendingReviewCount: (callback) => ipcRenderer.on("clash:pendingReviewCount", (_e, count) => callback(count)),
});
