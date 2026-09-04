const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clashReviewApi", {
  getPendingReview: () => ipcRenderer.invoke("clash:getPendingReview"),
  resolvePendingReview: (id, cardIds) => ipcRenderer.invoke("clash:resolvePendingReview", id, cardIds),
  clearPendingReview: () => ipcRenderer.invoke("clash:clearPendingReview"),
  getCards: () => ipcRenderer.invoke("clash:getCards"),
  getCardSampleCounts: () => ipcRenderer.invoke("clash:getCardSampleCounts"),
  getCardSamples: (cardId) => ipcRenderer.invoke("clash:getCardSamples", cardId),
  deleteCardSample: (cardId, file) => ipcRenderer.invoke("clash:deleteCardSample", cardId, file),
  onPendingReviewCount: (callback) => ipcRenderer.on("clash:pendingReviewCount", (_e, count) => callback(count)),
});
