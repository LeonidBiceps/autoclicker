let activeTabId = null;

// Wraps chrome.tabs.sendMessage and always reads chrome.runtime.lastError,
// even when the caller doesn't need it — otherwise a tab with no content
// script (chrome://..., New Tab, a page loaded before install/reload) logs
// an "Unchecked runtime.lastError" warning in the extension's console.
function sendToTab(tabId, message, callback) {
  chrome.tabs.sendMessage(tabId, message, (response) => {
    const err = chrome.runtime.lastError;
    callback(err ? null : response, err);
  });
}

function renderStatus(status) {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  const count = document.getElementById("count");
  const toggleBtn = document.getElementById("toggleBtn");
  const panelBtn = document.getElementById("panelBtn");

  if (!status) {
    dot.className = "dot off";
    text.textContent = "Расширение не подключено к этой вкладке (обнови страницу)";
    count.textContent = "";
    toggleBtn.textContent = "Недоступно";
    toggleBtn.disabled = true;
    panelBtn.disabled = true;
    return;
  }

  dot.className = `dot ${status.running ? "on" : "off"}`;
  text.textContent = status.running ? "Активен на этой вкладке" : "Остановлен";
  count.textContent = `Кликов на этой вкладке: ${status.clickCount}`;
  toggleBtn.disabled = false;
  toggleBtn.textContent = status.running ? "Стоп" : "Старт";
  toggleBtn.classList.toggle("running", status.running);
  panelBtn.disabled = false;
  panelBtn.textContent = status.panelVisible ? "Скрыть панель" : "Показать панель";
}

function queryStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;
    activeTabId = tab.id;
    sendToTab(tab.id, { type: "GET_STATUS" }, (response) => renderStatus(response));
  });
}

document.getElementById("toggleBtn").addEventListener("click", () => {
  if (activeTabId == null) return;
  sendToTab(activeTabId, { type: "TOGGLE" }, () => queryStatus());
});

document.getElementById("panelBtn").addEventListener("click", () => {
  if (activeTabId == null) return;
  sendToTab(activeTabId, { type: "TOGGLE_PANEL" }, () => queryStatus());
});

document.getElementById("optionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function refreshTierBadge() {
  chrome.storage.sync.get({ licenseKey: "" }, async ({ licenseKey }) => {
    const result = await verifyLicenseKey(licenseKey);
    const badge = document.getElementById("tierBadge");
    badge.textContent = result.valid ? "Pro" : "Free";
    badge.classList.toggle("pro", result.valid);
  });
}

queryStatus();
refreshTierBadge();
