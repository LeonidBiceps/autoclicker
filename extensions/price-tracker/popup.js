function formatPrice(price, currency) {
  const rounded = Number.isInteger(price) ? price : price.toFixed(2);
  return currency ? `${rounded} ${currency}` : `${rounded}`;
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let affiliateTemplate = "";

function buildLink(originalUrl) {
  if (!affiliateTemplate.trim() || !affiliateTemplate.includes("{url}")) return originalUrl;
  return affiliateTemplate.replace("{url}", encodeURIComponent(originalUrl));
}

function render(entries) {
  const list = document.getElementById("list");
  const empty = document.getElementById("empty");
  list.innerHTML = "";

  if (entries.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  entries.sort((a, b) => b.record.lastSeen - a.record.lastSeen);

  for (const { key, record } of entries) {
    const history = record.history || [];
    let changeHtml = "";
    if (history.length > 1) {
      const prev = history[history.length - 2];
      const diff = record.price - prev.price;
      if (diff !== 0) {
        const pct = Math.abs((diff / prev.price) * 100).toFixed(1);
        const arrow = diff < 0 ? "▼" : "▲";
        const cls = diff < 0 ? "down" : "up";
        changeHtml = `<div class="item-change ${cls}">${arrow} ${pct}%</div>`;
      }
    }

    const sparkline = sparklineSVG(history, { width: 140, height: 28 });
    const safeTitle = escapeHtml(record.title);
    const href = escapeHtml(buildLink(record.url));

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="item-top">
        <div class="item-info">
          <a class="item-title" href="${href}" target="_blank" title="${safeTitle}">${safeTitle}</a>
          <div class="item-domain">${escapeHtml(domainOf(record.url))}</div>
        </div>
        <div style="display:flex; align-items:flex-start; gap:6px;">
          <div style="text-align:right;">
            <div class="item-price">${formatPrice(record.price, record.currency)}</div>
            ${changeHtml}
          </div>
          <button class="item-delete" data-key="${key}" title="Удалить">×</button>
        </div>
      </div>
      ${sparkline ? `<div class="item-spark">${sparkline}</div>` : ""}
      <div class="item-threshold">
        <label>Уведомить, если ниже</label>
        <input type="number" class="threshold-input" data-key="${key}" value="${record.targetPrice ?? ""}" placeholder="—" />
      </div>
    `;
    list.appendChild(el);
  }

  list.querySelectorAll(".item-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      chrome.storage.local.remove(btn.dataset.key, load);
    });
  });

  list.querySelectorAll(".threshold-input").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.key;
      chrome.storage.local.get([key], (data) => {
        const record = data[key];
        if (!record) return;
        const parsed = input.value === "" ? null : parseFloat(input.value);
        const targetPrice = parsed == null || Number.isNaN(parsed) ? null : parsed;
        chrome.storage.local.set({ [key]: { ...record, targetPrice, notifiedPrice: null } });
      });
    });
  });
}

function load() {
  chrome.storage.local.get(null, (all) => {
    const entries = Object.entries(all)
      .filter(([key]) => key.startsWith("price:"))
      .map(([key, record]) => ({ key, record }));
    render(entries);
  });
}

document.getElementById("clearAll").addEventListener("click", () => {
  chrome.storage.local.get(null, (all) => {
    const keys = Object.keys(all).filter((key) => key.startsWith("price:"));
    chrome.storage.local.remove(keys, load);
  });
});

const affiliateInput = document.getElementById("affiliateTemplate");
affiliateInput.addEventListener("change", () => {
  affiliateTemplate = affiliateInput.value;
  chrome.storage.sync.set({ affiliateTemplate });
  load();
});

chrome.storage.sync.get({ affiliateTemplate: "" }, (settings) => {
  affiliateTemplate = settings.affiliateTemplate;
  affiliateInput.value = affiliateTemplate;
  load();
});
