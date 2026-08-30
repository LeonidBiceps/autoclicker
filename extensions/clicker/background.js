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
