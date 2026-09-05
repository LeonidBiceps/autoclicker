const DESKTOP_APP_URL = "https://github.com/LeonidBiceps/autoclicker/releases/download/v2.28.0/MultiTool-2.28.0.exe";
const DONATE_URL = "https://www.donationalerts.com/r/leonidbiceps111";
const REPO = "LeonidBiceps/autoclicker";

const DEFAULT_SETTINGS = {
  intervalMs: 100,
  jitterMs: 20,
  actionType: "mouse",
  button: "left",
  keyToPress: { key: " ", code: "Space", keyCode: 32 },
  hotkey: "F8",
  stopAfterClicks: 0,
  stopAfterMs: 0,
  positionJitterPx: 0,
  licenseKey: "",
  profiles: {},
};

// Какие поля настроек входят в профиль/экспорт (не licenseKey — его не переносим при шаринге).
const PROFILE_FIELDS = [
  "intervalMs",
  "jitterMs",
  "actionType",
  "button",
  "keyToPress",
  "positionJitterPx",
  "stopAfterClicks",
  "stopAfterMs",
];

// verifyLicenseKey живёт в license.js (общий для content/options/popup)

let settings = { ...DEFAULT_SETTINGS };
let listeningForKey = false;
let proUnlocked = false;

function fields() {
  return {
    intervalMs: document.getElementById("intervalMs"),
    jitterMs: document.getElementById("jitterMs"),
    positionJitterPx: document.getElementById("positionJitterPx"),
    actionType: document.getElementById("actionType"),
    button: document.getElementById("button"),
    hotkey: document.getElementById("hotkey"),
    stopAfterClicks: document.getElementById("stopAfterClicks"),
    stopAfterSeconds: document.getElementById("stopAfterSeconds"),
  };
}

function keyLabel(info) {
  if (!info) return "—";
  if (info.key === " ") return "Space";
  return info.key.length === 1 ? info.key.toUpperCase() : info.key;
}

function updateActionVisibility() {
  const isKeyboard = settings.actionType === "keyboard";
  document.getElementById("buttonField").hidden = isKeyboard;
  document.getElementById("keyField").hidden = !isKeyboard;
}

function updateProUI() {
  const posJitterInput = document.getElementById("positionJitterPx");
  const posJitterBadge = document.getElementById("posJitterBadge");
  posJitterInput.disabled = !proUnlocked;
  posJitterBadge.hidden = proUnlocked;

  document.getElementById("profilesBadge").hidden = proUnlocked;
  document.getElementById("exportBadge").hidden = proUnlocked;

  const proOnlyControls = [
    "profileSelect",
    "applyProfileBtn",
    "deleteProfileBtn",
    "newProfileName",
    "saveProfileBtn",
    "exportBtn",
    "importFile",
  ];
  for (const id of proOnlyControls) {
    document.getElementById(id).disabled = !proUnlocked;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderProfileSelect() {
  const select = document.getElementById("profileSelect");
  const names = Object.keys(settings.profiles || {});
  select.innerHTML = names.length
    ? names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")
    : `<option value="">— нет сохранённых —</option>`;
}

async function refreshLicenseStatus(showMessage) {
  const message = document.getElementById("licenseMessage");
  const proStatus = document.getElementById("proStatus");

  if (showMessage) message.textContent = "Проверяем…";

  const result = await verifyLicenseKey(settings.licenseKey);
  proUnlocked = result.valid;
  updateProUI();

  if (result.valid) {
    const until = new Date(result.payload.expiresAt).toLocaleDateString("ru-RU");
    proStatus.textContent = `Pro активирован до ${until} — последовательность точек и разброс позиции доступны.`;
    if (showMessage) message.textContent = "Ключ подошёл, Pro активирован.";
  } else {
    proStatus.textContent =
      "Бесплатная версия. Pro открывает последовательность точек (в панели на странице) и разброс позиции клика.";
    if (showMessage) {
      message.textContent = result.expired
        ? "Этот ключ истёк — нужен новый."
        : settings.licenseKey
        ? "Ключ не подошёл."
        : "";
    }
  }
}

function showStatus(text) {
  const status = document.getElementById("status");
  status.textContent = text;
  setTimeout(() => {
    if (status.textContent === text) status.textContent = "";
  }, 1500);
}

function save(partial) {
  settings = { ...settings, ...partial };
  chrome.storage.sync.set(partial, () => showStatus("Сохранено"));
}

function loadIntoForm() {
  const f = fields();
  f.intervalMs.value = settings.intervalMs;
  f.jitterMs.value = settings.jitterMs;
  f.positionJitterPx.value = settings.positionJitterPx;
  f.actionType.value = settings.actionType;
  f.button.value = settings.button;
  f.hotkey.value = settings.hotkey;
  f.stopAfterClicks.value = settings.stopAfterClicks;
  f.stopAfterSeconds.value = settings.stopAfterMs / 1000;
  document.getElementById("keyName").textContent = keyLabel(settings.keyToPress);
  document.getElementById("licenseKey").value = settings.licenseKey;
  updateActionVisibility();
}

function bindHandlers() {
  const f = fields();

  f.intervalMs.addEventListener("change", () => {
    save({ intervalMs: Math.max(10, parseInt(f.intervalMs.value, 10) || DEFAULT_SETTINGS.intervalMs) });
  });
  f.jitterMs.addEventListener("change", () => {
    save({ jitterMs: Math.max(0, parseInt(f.jitterMs.value, 10) || 0) });
  });
  f.positionJitterPx.addEventListener("change", () => {
    save({ positionJitterPx: Math.max(0, parseInt(f.positionJitterPx.value, 10) || 0) });
  });
  f.actionType.addEventListener("change", () => {
    save({ actionType: f.actionType.value });
    updateActionVisibility();
  });
  f.button.addEventListener("change", () => {
    save({ button: f.button.value });
  });
  f.hotkey.addEventListener("change", () => {
    const key = (f.hotkey.value || "F8").trim().toUpperCase() || "F8";
    f.hotkey.value = key;
    save({ hotkey: key });
  });
  f.stopAfterClicks.addEventListener("change", () => {
    save({ stopAfterClicks: Math.max(0, parseInt(f.stopAfterClicks.value, 10) || 0) });
  });
  f.stopAfterSeconds.addEventListener("change", () => {
    const seconds = Math.max(0, parseFloat(f.stopAfterSeconds.value) || 0);
    save({ stopAfterMs: seconds * 1000 });
  });

  document.getElementById("setKeyBtn").addEventListener("click", () => {
    listeningForKey = true;
    document.getElementById("setKeyBtn").textContent = "Нажми клавишу…";
  });

  document.addEventListener("keydown", (e) => {
    if (!listeningForKey) return;
    e.preventDefault();
    const keyToPress = { key: e.key, code: e.code, keyCode: e.keyCode };
    listeningForKey = false;
    document.getElementById("setKeyBtn").textContent = "Установить клавишу";
    document.getElementById("keyName").textContent = keyLabel(keyToPress);
    save({ keyToPress });
  });

  document.getElementById("openShortcuts").addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });

  document.getElementById("downloadDesktopBtn").addEventListener("click", () => {
    const message = document.getElementById("downloadDesktopMessage");
    if (!DESKTOP_APP_URL) {
      message.textContent = "Ссылка ещё не настроена (DESKTOP_APP_URL в options.js).";
      return;
    }
    chrome.tabs.create({ url: DESKTOP_APP_URL });
  });

  document.getElementById("donateForProBtn").addEventListener("click", () => {
    const message = document.getElementById("donateForProMessage");
    if (!DONATE_URL) {
      message.textContent = "Ссылка ещё не настроена (DONATE_URL в options.js).";
      return;
    }
    chrome.tabs.create({ url: DONATE_URL });
  });

  document.getElementById("activateBtn").addEventListener("click", () => {
    const key = document.getElementById("licenseKey").value.trim();
    if (!key) return;
    save({ licenseKey: key });
    refreshLicenseStatus(true);
  });

  document.getElementById("saveProfileBtn").addEventListener("click", () => {
    if (!proUnlocked) return;
    const nameInput = document.getElementById("newProfileName");
    const name = nameInput.value.trim();
    if (!name) return;
    const snapshot = {};
    for (const field of PROFILE_FIELDS) snapshot[field] = settings[field];
    const profiles = { ...(settings.profiles || {}), [name]: snapshot };
    save({ profiles });
    nameInput.value = "";
    renderProfileSelect();
    document.getElementById("profileSelect").value = name;
  });

  document.getElementById("applyProfileBtn").addEventListener("click", () => {
    if (!proUnlocked) return;
    const name = document.getElementById("profileSelect").value;
    const profile = (settings.profiles || {})[name];
    if (!profile) return;
    save({ ...profile });
    loadIntoForm();
    updateActionVisibility();
    showStatus(`Применён профиль «${name}»`);
  });

  document.getElementById("deleteProfileBtn").addEventListener("click", () => {
    if (!proUnlocked) return;
    const name = document.getElementById("profileSelect").value;
    if (!name || !(settings.profiles || {})[name]) return;
    const profiles = { ...settings.profiles };
    delete profiles[name];
    save({ profiles });
    renderProfileSelect();
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    if (!proUnlocked) return;
    const exportData = { profiles: settings.profiles || {} };
    for (const field of PROFILE_FIELDS) exportData[field] = settings[field];
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "autoclicker-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("importFile").addEventListener("change", async (e) => {
    const importMessage = document.getElementById("importMessage");
    if (!proUnlocked) return;
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const partial = {};
      for (const field of PROFILE_FIELDS) {
        if (field in data) partial[field] = data[field];
      }
      if (data.profiles && typeof data.profiles === "object") {
        partial.profiles = { ...(settings.profiles || {}), ...data.profiles };
      }
      save(partial);
      loadIntoForm();
      updateActionVisibility();
      renderProfileSelect();
      importMessage.textContent = "Импортировано.";
    } catch (err) {
      importMessage.textContent = `Не получилось прочитать файл: ${err.message}`;
    }
    e.target.value = "";
  });
}

function isNewerVersion(latest, current) {
  const a = latest.split(".").map((n) => parseInt(n, 10));
  const b = current.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

async function checkForExtensionUpdate() {
  try {
    // Не все релизы содержат .zip расширения (иногда обновляется только desktop-версия) — поэтому
    // смотрим список релизов, а не только /releases/latest, и берём первый (самый свежий), где
    // такой файл реально есть.
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`);
    if (!res.ok) return;
    const releases = await res.json();
    let asset = null;
    for (const release of releases) {
      asset = (release.assets || []).find((a) => /^Autoclicker-Extension-\d+\.\d+\.\d+\.zip$/.test(a.name));
      if (asset) break;
    }
    if (!asset) return;
    const latestVersion = asset.name.match(/^Autoclicker-Extension-(\d+\.\d+\.\d+)\.zip$/)[1];
    const currentVersion = chrome.runtime.getManifest().version;
    if (!isNewerVersion(latestVersion, currentVersion)) return;

    const banner = document.getElementById("updateBanner");
    document.getElementById("updateBannerText").textContent = `Вышла версия ${latestVersion} (у тебя ${currentVersion})`;
    banner.title =
      "Скачай .zip, распакуй поверх старой папки и нажми «Обновить» на карточке расширения в chrome://extensions.";
    banner.href = asset.browser_download_url;
    banner.hidden = false;
  } catch (e) {
    // нет сети или GitHub недоступен — молча пропускаем, это не блокирует работу расширения
  }
}

chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
  settings = { ...DEFAULT_SETTINGS, ...stored };
  loadIntoForm();
  renderProfileSelect();
  bindHandlers();
  refreshLicenseStatus(false);
  checkForExtensionUpdate();
});
