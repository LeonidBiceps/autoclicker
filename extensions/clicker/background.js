chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;
    const type = command === "panic-stop-autoclicker" ? "PANIC_STOP" : "TOGGLE";
    chrome.tabs.sendMessage(tab.id, { type }, () => {
      void chrome.runtime.lastError; // нет content-script на этой вкладке — тихо игнорируем
    });
  });
});

// --- Скачать картинку по правому клику ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "download-image",
    title: "Скачать через Автокликер",
    contexts: ["image"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== "download-image" || !info.srcUrl) return;
  chrome.downloads.download({ url: info.srcUrl }, () => {
    void chrome.runtime.lastError; // например, картинка — data:URL необычного вида или сеть недоступна
  });
});
