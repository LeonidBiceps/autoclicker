const DEFAULT_SETTINGS = {
  youtubeShorts: true,
  instagramReels: true,
  facebookReels: true,
  cookieBanners: true,
};

const COUNTER_KEYS = ["youtubeShorts", "instagramReels", "facebookReels", "cookieBanners"];

function getSettings(callback) {
  chrome.storage.sync.get(DEFAULT_SETTINGS, callback);
}

function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    getSettings(callback);
  });
}

function incrementBlockedCount(key) {
  const storageKey = `blockedCount:${key}`;
  chrome.storage.local.get([storageKey], (data) => {
    chrome.storage.local.set({ [storageKey]: (data[storageKey] || 0) + 1 });
  });
}

function getBlockedCounts(callback) {
  const storageKeys = COUNTER_KEYS.map((k) => `blockedCount:${k}`);
  chrome.storage.local.get(storageKeys, (data) => {
    const result = {};
    for (const key of COUNTER_KEYS) {
      result[key] = data[`blockedCount:${key}`] || 0;
    }
    callback(result);
  });
}
