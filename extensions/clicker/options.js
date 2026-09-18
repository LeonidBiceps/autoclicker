const DESKTOP_APP_URL = "https://github.com/LeonidBiceps/autoclicker/releases/download/v1.2.0/MultiTool-1.2.0.exe";
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

// РљР°РєРёРµ РїРѕР»СЏ РЅР°СЃС‚СЂРѕРµРє РІС…РѕРґСЏС‚ РІ РїСЂРѕС„РёР»СЊ/СЌРєСЃРїРѕСЂС‚ (РЅРµ licenseKey вЂ” РµРіРѕ РЅРµ РїРµСЂРµРЅРѕСЃРёРј РїСЂРё С€Р°СЂРёРЅРіРµ).
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

// verifyLicenseKey Р¶РёРІС‘С‚ РІ license.js (РѕР±С‰РёР№ РґР»СЏ content/options/popup)

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
  if (!info) return "вЂ”";
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
    : `<option value="">вЂ” РЅРµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… вЂ”</option>`;
}

async function refreshLicenseStatus(showMessage) {
  const message = document.getElementById("licenseMessage");
  const proStatus = document.getElementById("proStatus");

  if (showMessage) message.textContent = "РџСЂРѕРІРµСЂСЏРµРјвЂ¦";

  const result = await verifyLicenseKey(settings.licenseKey);
  proUnlocked = result.valid;
  updateProUI();

  if (result.valid) {
    const until = new Date(result.payload.expiresAt).toLocaleDateString("ru-RU");
    proStatus.textContent = `Pro Р°РєС‚РёРІРёСЂРѕРІР°РЅ РґРѕ ${until} вЂ” РїРѕСЃР»РµРґРѕРІР°С‚РµР»СЊРЅРѕСЃС‚СЊ С‚РѕС‡РµРє Рё СЂР°Р·Р±СЂРѕСЃ РїРѕР·РёС†РёРё РґРѕСЃС‚СѓРїРЅС‹.`;
    if (showMessage) message.textContent = "РљР»СЋС‡ РїРѕРґРѕС€С‘Р», Pro Р°РєС‚РёРІРёСЂРѕРІР°РЅ.";
  } else {
    proStatus.textContent =
      "Р‘РµСЃРїР»Р°С‚РЅР°СЏ РІРµСЂСЃРёСЏ. Pro РѕС‚РєСЂС‹РІР°РµС‚ РїРѕСЃР»РµРґРѕРІР°С‚РµР»СЊРЅРѕСЃС‚СЊ С‚РѕС‡РµРє (РІ РїР°РЅРµР»Рё РЅР° СЃС‚СЂР°РЅРёС†Рµ) Рё СЂР°Р·Р±СЂРѕСЃ РїРѕР·РёС†РёРё РєР»РёРєР°.";
    if (showMessage) {
      message.textContent = result.expired
        ? "Р­С‚РѕС‚ РєР»СЋС‡ РёСЃС‚С‘Рє вЂ” РЅСѓР¶РµРЅ РЅРѕРІС‹Р№."
        : settings.licenseKey
        ? "РљР»СЋС‡ РЅРµ РїРѕРґРѕС€С‘Р»."
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
  chrome.storage.sync.set(partial, () => showStatus("РЎРѕС…СЂР°РЅРµРЅРѕ"));
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
    document.getElementById("setKeyBtn").textContent = "РќР°Р¶РјРё РєР»Р°РІРёС€СѓвЂ¦";
  });

  document.addEventListener("keydown", (e) => {
    if (!listeningForKey) return;
    e.preventDefault();
    const keyToPress = { key: e.key, code: e.code, keyCode: e.keyCode };
    listeningForKey = false;
    document.getElementById("setKeyBtn").textContent = "РЈСЃС‚Р°РЅРѕРІРёС‚СЊ РєР»Р°РІРёС€Сѓ";
    document.getElementById("keyName").textContent = keyLabel(keyToPress);
    save({ keyToPress });
  });

  document.getElementById("openShortcuts").addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });

  document.getElementById("downloadDesktopBtn").addEventListener("click", () => {
    const message = document.getElementById("downloadDesktopMessage");
    if (!DESKTOP_APP_URL) {
      message.textContent = "РЎСЃС‹Р»РєР° РµС‰С‘ РЅРµ РЅР°СЃС‚СЂРѕРµРЅР° (DESKTOP_APP_URL РІ options.js).";
      return;
    }
    chrome.tabs.create({ url: DESKTOP_APP_URL });
  });

  document.getElementById("donateForProBtn").addEventListener("click", () => {
    const message = document.getElementById("donateForProMessage");
    if (!DONATE_URL) {
      message.textContent = "РЎСЃС‹Р»РєР° РµС‰С‘ РЅРµ РЅР°СЃС‚СЂРѕРµРЅР° (DONATE_URL РІ options.js).";
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
    showStatus(`РџСЂРёРјРµРЅС‘РЅ РїСЂРѕС„РёР»СЊ В«${name}В»`);
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
      importMessage.textContent = "РРјРїРѕСЂС‚РёСЂРѕРІР°РЅРѕ.";
    } catch (err) {
      importMessage.textContent = `РќРµ РїРѕР»СѓС‡РёР»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ С„Р°Р№Р»: ${err.message}`;
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
    // РќРµ РІСЃРµ СЂРµР»РёР·С‹ СЃРѕРґРµСЂР¶Р°С‚ .zip СЂР°СЃС€РёСЂРµРЅРёСЏ (РёРЅРѕРіРґР° РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ С‚РѕР»СЊРєРѕ desktop-РІРµСЂСЃРёСЏ) вЂ” РїРѕСЌС‚РѕРјСѓ
    // СЃРјРѕС‚СЂРёРј СЃРїРёСЃРѕРє СЂРµР»РёР·РѕРІ, Р° РЅРµ С‚РѕР»СЊРєРѕ /releases/latest, Рё Р±РµСЂС‘Рј РїРµСЂРІС‹Р№ (СЃР°РјС‹Р№ СЃРІРµР¶РёР№), РіРґРµ
    // С‚Р°РєРѕР№ С„Р°Р№Р» СЂРµР°Р»СЊРЅРѕ РµСЃС‚СЊ.
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
    document.getElementById("updateBannerText").textContent = `Р’С‹С€Р»Р° РІРµСЂСЃРёСЏ ${latestVersion} (Сѓ С‚РµР±СЏ ${currentVersion})`;
    banner.title =
      "РЎРєР°С‡Р°Р№ .zip, СЂР°СЃРїР°РєСѓР№ РїРѕРІРµСЂС… СЃС‚Р°СЂРѕР№ РїР°РїРєРё Рё РЅР°Р¶РјРё В«РћР±РЅРѕРІРёС‚СЊВ» РЅР° РєР°СЂС‚РѕС‡РєРµ СЂР°СЃС€РёСЂРµРЅРёСЏ РІ chrome://extensions.";
    banner.href = asset.browser_download_url;
    banner.hidden = false;
  } catch (e) {
    // РЅРµС‚ СЃРµС‚Рё РёР»Рё GitHub РЅРµРґРѕСЃС‚СѓРїРµРЅ вЂ” РјРѕР»С‡Р° РїСЂРѕРїСѓСЃРєР°РµРј, СЌС‚Рѕ РЅРµ Р±Р»РѕРєРёСЂСѓРµС‚ СЂР°Р±РѕС‚Сѓ СЂР°СЃС€РёСЂРµРЅРёСЏ
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
