const DEFAULT_SETTINGS = { enabled: true, profile: "general", keyword: "" };

const checkbox = document.getElementById("enabled");
const profileSelect = document.getElementById("profile");
const keywordInput = document.getElementById("keyword");

chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
  checkbox.checked = settings.enabled;
  profileSelect.value = settings.profile;
  keywordInput.value = settings.keyword;
});

checkbox.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: checkbox.checked });
});

profileSelect.addEventListener("change", () => {
  chrome.storage.sync.set({ profile: profileSelect.value });
});

keywordInput.addEventListener("input", () => {
  chrome.storage.sync.set({ keyword: keywordInput.value });
});
