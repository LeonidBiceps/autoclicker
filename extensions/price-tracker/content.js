const HISTORY_LIMIT = 50;
const RETRY_DELAYS_MS = [500, 2000, 5000];

let dismissedThisPageLoad = false;

function extractFromJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let data;
    try {
      data = JSON.parse(script.textContent);
    } catch (e) {
      continue;
    }
    const roots = Array.isArray(data) ? data : [data];
    for (const root of roots) {
      const nodes = root && root["@graph"] ? root["@graph"] : [root];
      for (const node of nodes) {
        const result = extractFromJsonLdNode(node);
        if (result) return result;
      }
    }
  }
  return null;
}

function extractFromJsonLdNode(node) {
  if (!node || typeof node !== "object") return null;
  const type = node["@type"];
  const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
  if (!isProduct) return null;

  let offers = node.offers;
  if (Array.isArray(offers)) offers = offers[0];
  if (!offers) return null;

  const price = parseFloat(offers.price ?? offers.lowPrice);
  if (!price || Number.isNaN(price)) return null;

  return {
    price,
    currency: offers.priceCurrency || null,
    title: node.name || document.title,
  };
}

function extractFromMeta() {
  const priceMeta = document.querySelector(
    'meta[property="product:price:amount"], meta[property="og:price:amount"]'
  );
  if (!priceMeta) return null;

  const price = parseFloat(priceMeta.content);
  if (!price || Number.isNaN(price)) return null;

  const currencyMeta = document.querySelector(
    'meta[property="product:price:currency"], meta[property="og:price:currency"]'
  );

  return {
    price,
    currency: currencyMeta ? currencyMeta.content : null,
    title: document.title,
  };
}

function extractFromItemprop() {
  const el = document.querySelector('[itemprop="price"]');
  if (!el) return null;

  const raw = el.getAttribute("content") || el.textContent || "";
  const price = parseFloat(raw.replace(/[^\d.,]/g, "").replace(",", "."));
  if (!price || Number.isNaN(price)) return null;

  const currencyEl = document.querySelector('[itemprop="priceCurrency"]');
  const currency = currencyEl ? currencyEl.getAttribute("content") || currencyEl.textContent : null;

  return { price, currency, title: document.title };
}

function extractPrice() {
  return extractFromJsonLd() || extractFromMeta() || extractFromItemprop();
}

function getStorageKey() {
  return `price:${location.origin}${location.pathname}`;
}

function formatPrice(price, currency) {
  const rounded = Number.isInteger(price) ? price : price.toFixed(2);
  return currency ? `${rounded} ${currency}` : `${rounded}`;
}

let widgetEl = null;

function ensureWidget() {
  if (widgetEl) return widgetEl;
  widgetEl = document.createElement("div");
  widgetEl.className = "pt-widget";
  widgetEl.innerHTML = `
    <button class="pt-close" title="Скрыть">×</button>
    <div class="pt-body"></div>
  `;
  widgetEl.querySelector(".pt-close").addEventListener("click", () => {
    dismissedThisPageLoad = true;
    widgetEl.style.display = "none";
  });
  document.documentElement.appendChild(widgetEl);
  return widgetEl;
}

function showWidget(record) {
  if (dismissedThisPageLoad) return;

  const history = record.history;
  const prices = history.map((h) => h.price);
  const min = Math.min(...prices);

  let compareLine = "";
  if (history.length > 1) {
    const prev = history[history.length - 2];
    const diff = record.price - prev.price;
    if (diff !== 0) {
      const pct = Math.abs((diff / prev.price) * 100).toFixed(1);
      const arrow = diff < 0 ? "▼" : "▲";
      const cls = diff < 0 ? "pt-down" : "pt-up";
      compareLine = `<div class="pt-compare ${cls}">${arrow} ${pct}% с прошлого раза</div>`;
    }
  }

  const minLine =
    min < record.price
      ? `мин. за всё время: ${formatPrice(min, record.currency)}`
      : "это минимум за всё время";

  const sparkline = sparklineSVG(history, { width: 140, height: 30 });

  const widget = ensureWidget();
  widget.style.display = "flex";
  widget.querySelector(".pt-body").innerHTML = `
    <div class="pt-price">${formatPrice(record.price, record.currency)}</div>
    ${compareLine}
    <div class="pt-min">${minLine}</div>
    ${sparkline ? `<div class="pt-spark">${sparkline}</div>` : ""}
  `;
}

function checkPriceAlert(record) {
  if (record.targetPrice == null) return;
  if (record.price > record.targetPrice) return;
  if (record.notifiedPrice != null && record.price >= record.notifiedPrice) return;

  chrome.runtime.sendMessage({
    type: "PRICE_ALERT",
    title: record.title,
    price: record.price,
    currency: record.currency,
    url: record.url,
  });

  const key = getStorageKey();
  chrome.storage.local.set({ [key]: { ...record, notifiedPrice: record.price } });
}

function loadAndUpdate() {
  const result = extractPrice();
  if (!result) return;

  const key = getStorageKey();
  chrome.storage.local.get([key], (data) => {
    const existing = data[key];
    const now = Date.now();
    let history = existing?.history || [];
    const lastEntry = history[history.length - 1];

    if (!lastEntry || lastEntry.price !== result.price) {
      history.push({ ts: now, price: result.price });
      if (history.length > HISTORY_LIMIT) history = history.slice(-HISTORY_LIMIT);
    }

    const record = {
      url: location.href,
      title: result.title,
      currency: result.currency,
      price: result.price,
      history,
      lastSeen: now,
      targetPrice: existing?.targetPrice ?? null,
      notifiedPrice: existing?.notifiedPrice ?? null,
    };

    chrome.storage.local.set({ [key]: record });
    showWidget(record);
    checkPriceAlert(record);
  });
}

for (const delay of RETRY_DELAYS_MS) {
  setTimeout(loadAndUpdate, delay);
}
