const input = document.getElementById("apiKey");
const status = document.getElementById("status");

chrome.storage.local.get("apiKey", (data) => {
  if (data.apiKey) input.value = data.apiKey;
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.local.set({ apiKey: input.value.trim() }, () => {
    status.textContent = "Сохранено.";
    setTimeout(() => (status.textContent = ""), 2000);
  });
});
