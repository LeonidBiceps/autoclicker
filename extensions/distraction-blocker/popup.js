const checkboxIds = Object.keys(DEFAULT_SETTINGS);

const STAT_LABELS = {
  youtubeShorts: "YouTube Shorts",
  instagramReels: "Instagram Reels",
  facebookReels: "Facebook Reels",
  cookieBanners: "Cookie-баннеров",
};

function load() {
  getSettings((settings) => {
    for (const id of checkboxIds) {
      document.getElementById(id).checked = Boolean(settings[id]);
    }
  });
  renderStats();
}

function renderStats() {
  getBlockedCounts((counts) => {
    const container = document.getElementById("stats");
    container.innerHTML = COUNTER_KEYS.map(
      (key) => `<div class="stat-row"><span>${STAT_LABELS[key]}</span><span class="stat-value">${counts[key]}</span></div>`
    ).join("");
  });
}

function bindHandlers() {
  for (const id of checkboxIds) {
    document.getElementById(id).addEventListener("change", (event) => {
      chrome.storage.sync.set({ [id]: event.target.checked });
    });
  }

  document.getElementById("resetStats").addEventListener("click", () => {
    const keys = COUNTER_KEYS.map((k) => `blockedCount:${k}`);
    chrome.storage.local.remove(keys, renderStats);
  });
}

load();
bindHandlers();
