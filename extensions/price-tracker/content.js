const HISTORY_LIMIT = 50;
const RETRY_DELAYS_MS = [500, 2000, 5000];

let dismissedThisPageLoad = false;

// Wildberries — SPA без JSON-LD/meta-тегов цены (проверено вживую: цена подгружается отдельным
// запросом уже после отрисовки страницы), поэтому читаем прямо с отрисованной карточки товара.
// Классы вида "priceBlockFinalPrice--AUlzU" — хэш-суффикс у WB меняется между деплоями, но сам
// префикс стабилен, поэтому матчим через [class*=...], а не точным именем класса.
function extractFromWildberries() {
  if (!/(^|\.)wildberries\.ru$/.test(location.hostname)) return null;
  if (!/\/catalog\/\d+\/detail\.aspx/.test(location.pathname)) return null;

  const finalEl = document.querySelector('[class*="priceBlockFinalPrice"]');
  if (!finalEl) return null;

  const parseRub = (text) => {
    const digits = (text || "").replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : null;
  };

  const price = parseRub(finalEl.textContent);
  if (!price) return null;

  const oldEl = document.querySelector('[class*="priceBlockOldPrice"]');
  const titleEl = document.querySelector('[class*="productTitle"]');

  return {
    price,
    currency: "₽",
    title: titleEl ? titleEl.textContent.trim() : (document.title.split(" купить")[0] || "").trim(),
    originalPrice: oldEl ? parseRub(oldEl.textContent) : null,
    marketplace: "Wildberries",
  };
}

// --- Цена за единицу в выдаче поиска WB (сравнение реальной выгоды между упаковками) ---
//
// Wildberries не показывает цену за 100г/100мл/шт — один и тот же товар продаётся у разных
// продавцов в разной фасовке (500г, 1кг, россыпью), и на глаз сравнить, что реально дешевле,
// почти невозможно. Достаём вес/объём/количество из названия товара (в aria-label карточки —
// проверено вживую, там обычно есть "1 кг", "500 г", "3 шт" и т.п.) и считаем цену за единицу.
// Это эвристика по тексту названия, не структурированные данные — если продавец не написал вес
// в названии или написал нестандартно, бейджа просто не будет (лучше промолчать, чем соврать).

function isWbSearchPage() {
  return /(^|\.)wildberries\.ru$/.test(location.hostname) && /\/catalog\/0\/search\.aspx/.test(location.pathname);
}

const QUANTITY_PATTERNS = [
  { re: /(\d+(?:[.,]\d+)?)\s*(?:грамм|гр\.?|г)(?![а-яё])/iu, unit: "g", mul: 1 },
  { re: /(\d+(?:[.,]\d+)?)\s*кг(?![а-яё])/iu, unit: "g", mul: 1000 },
  { re: /(\d+(?:[.,]\d+)?)\s*мл(?![а-яё])/iu, unit: "ml", mul: 1 },
  { re: /(\d+(?:[.,]\d+)?)\s*л(?![а-яё])/iu, unit: "ml", mul: 1000 },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:штук|шт\.?)(?![а-яё])/iu, unit: "pcs", mul: 1 },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:пары|пар)(?![а-яё])/iu, unit: "pcs", mul: 1 },
];

function parseQuantityFromTitle(title) {
  for (const p of QUANTITY_PATTERNS) {
    const m = title.match(p.re);
    if (!m) continue;
    const num = parseFloat(m[1].replace(",", "."));
    if (num > 0) return { amount: num * p.mul, unit: p.unit };
  }
  return null;
}

function formatUnitPrice(price, qty) {
  if (qty.unit === "g" || qty.unit === "ml") {
    const per100 = (price / qty.amount) * 100;
    const suffix = qty.unit === "g" ? "100 г" : "100 мл";
    return `${per100 < 10 ? per100.toFixed(2) : per100.toFixed(1)} ₽ / ${suffix}`;
  }
  if (qty.unit === "pcs") {
    const perPcs = price / qty.amount;
    return `${perPcs < 10 ? perPcs.toFixed(2) : perPcs.toFixed(1)} ₽ / шт`;
  }
  return null;
}

function parsePriceFromIns(insEl) {
  const digits = insEl.textContent.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

function scanSearchCardsForValue() {
  const list = document.querySelector(".product-card-list");
  if (!list) return;
  const cards = list.querySelectorAll(".product-card");
  cards.forEach((card) => {
    if (card.dataset.ptValueDone === "1") return;
    card.dataset.ptValueDone = "1";

    const link = card.querySelector("a.product-card__link");
    const insEl = card.querySelector("ins");
    // Вставляем бейдж в .product-card__wrapper (overflow: visible, flex-column), а НЕ в сам блок
    // цены — тот у WB display:flex + overflow:hidden и схлопывает добавленный элемент до
    // нулевого размера (проверено вживую: без явного inline-стиля новый child внутри него получал
    // rect 0x0). .product-card__wrapper — следующий блочный уровень выше, там элемент рендерится
    // нормально, просто новой строкой внизу карточки.
    const wrapper = card.querySelector(".product-card__wrapper");
    if (!link || !insEl || !wrapper) return;

    const name = link.getAttribute("aria-label") || "";
    const price = parsePriceFromIns(insEl);
    if (!price) return;

    const qty = parseQuantityFromTitle(name);
    if (!qty) return;

    const label = formatUnitPrice(price, qty);
    if (!label) return;

    const badge = document.createElement("div");
    badge.className = "pt-unit-badge";
    badge.textContent = label;
    wrapper.appendChild(badge);
  });
}

let searchListObserver = null;

function observeSearchList(list) {
  if (searchListObserver) searchListObserver.disconnect();
  searchListObserver = new MutationObserver(() => scanSearchCardsForValue());
  searchListObserver.observe(list, { childList: true, subtree: true });
}

function initSearchValueBadges() {
  let attempts = 0;
  const tryInit = () => {
    const list = document.querySelector(".product-card-list");
    if (!list) return false;
    scanSearchCardsForValue();
    observeSearchList(list);
    return true;
  };
  if (tryInit()) return;
  const interval = setInterval(() => {
    attempts++;
    if (tryInit() || attempts > 10) clearInterval(interval);
  }, 500);
}

// --- Сигнал "маломерит/большемерит" на странице отзывов WB (/catalog/ID/feedbacks) ---
//
// Проверено вживую: у WB нет структурированной агрегированной сводки по размеру — вкладка-фильтр
// "Посадка" в шапке отзывов просто СУЖАЕТ список отзывов до тех, что упомянули посадку, а не
// показывает готовую статистику (проверено: клик по ней уменьшил список с 7 отзывов до 2, без
// какого-либо процентного индикатора). Отдельного API-запроса за текстом отзывов тоже нет — весь
// текст уже отрисован в DOM силами самого сайта (гидратация происходит до захода content-script),
// поэтому просто читаем видимые карточки отзывов и считаем явные упоминания размера в тексте.
// Контейнер `.product-feedbacks__main-wrapper` и внутренний BEM-класс `product-feedbacks__main` —
// стабильные (без хэш-суффикса), а вот класс самой карточки отзыва (`item--xxxxx`) — хэшированный
// CSS-модуль и может смениться при следующем деплое WB, поэтому карточки ищем не по классу, а
// структурно: верхнеуровневые <li> внутри контейнера (без предка-li внутри него же).
function isWbFeedbacksPage() {
  return /(^|\.)wildberries\.ru$/.test(location.hostname) && /\/catalog\/\d+\/feedbacks/.test(location.pathname);
}

const FIT_SMALL_RE = /маломер|жмёт|жмет|тесновато|тесно(?![а-яё])|маловат/iu;
const FIT_LARGE_RE = /большемер|великоват|свободновато|просторновато|болтает(?:ся)?\s*на\s*ноге/iu;

function getFeedbackCards() {
  const container = document.querySelector(".product-feedbacks__main-wrapper");
  if (!container) return [];
  const allLis = Array.from(container.querySelectorAll("li"));
  return allLis.filter((li) => li.className && li.textContent.trim().length > 20 && !li.parentElement.closest("li"));
}

function ensureFitSummaryEl(container) {
  let el = container.querySelector(":scope > .pt-fit-summary");
  if (el) return el;
  el = document.createElement("div");
  el.className = "pt-fit-summary";
  container.insertBefore(el, container.firstChild);
  return el;
}

function scanFeedbacksForFitSignal() {
  const container = document.querySelector(".product-feedbacks__main-wrapper");
  if (!container) return;

  const cards = getFeedbackCards();
  let small = 0;
  let large = 0;
  for (const card of cards) {
    const text = card.textContent;
    if (FIT_SMALL_RE.test(text)) small++;
    if (FIT_LARGE_RE.test(text)) large++;
  }

  if (small === 0 && large === 0) return;

  const el = ensureFitSummaryEl(container);
  el.innerHTML = `
    <div class="pt-fit-title">Размер по отзывам (эвристика по тексту, не официальная статистика WB)</div>
    <div class="pt-fit-rows">
      ${small > 0 ? `<div class="pt-fit-row">🔺 ${small} ${small === 1 ? "отзыв пишет" : "отзыва(ов) пишут"}: маломерит</div>` : ""}
      ${large > 0 ? `<div class="pt-fit-row">🔻 ${large} ${large === 1 ? "отзыв пишет" : "отзыва(ов) пишут"}: большемерит</div>` : ""}
    </div>
    <div class="pt-fit-note">Из ${cards.length} прочитанных отзывов на этой странице.</div>
  `;
}

let feedbacksObserver = null;

function initFeedbacksFitSignal() {
  let attempts = 0;
  const tryInit = () => {
    const container = document.querySelector(".product-feedbacks__main-wrapper");
    if (!container) return false;
    scanFeedbacksForFitSignal();
    if (feedbacksObserver) feedbacksObserver.disconnect();
    feedbacksObserver = new MutationObserver(() => scanFeedbacksForFitSignal());
    feedbacksObserver.observe(container, { childList: true, subtree: true });
    return true;
  };
  if (tryInit()) return;
  const interval = setInterval(() => {
    attempts++;
    if (tryInit() || attempts > 10) clearInterval(interval);
  }, 500);
}

// Ozon: пока не реализовано — не смог вживую проверить вёрстку карточки товара (эта песочница
// заблокирована на уровне IP на ozon.ru), а гадать по памяти рискованно, могло устареть. На Ozon
// пока сработают только общие способы ниже (JSON-LD/meta/itemprop), если сайт их отдаёт.
function extractFromOzon() {
  return null;
}

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
  return extractFromWildberries() || extractFromOzon() || extractFromJsonLd() || extractFromMeta() || extractFromItemprop();
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

  let originalLine = "";
  if (record.originalPrice && record.originalPrice > record.price) {
    originalLine =
      history.length > 1
        ? `<div class="pt-original">Зачёркнутая цена на сайте: ${formatPrice(record.originalPrice, record.currency)} — маркетплейсы часто держат её завышенной постоянно. Доверяй графику ниже, а не ей.</div>`
        : `<div class="pt-original">Зачёркнутая цена на сайте: ${formatPrice(record.originalPrice, record.currency)} — маркетплейсы часто держат её завышенной постоянно, это не доказательство реальной скидки. История наблюдений начинается с этого захода.</div>`;
  }

  const sparkline = sparklineSVG(history, { width: 140, height: 30 });

  const widget = ensureWidget();
  widget.style.display = "flex";
  widget.querySelector(".pt-body").innerHTML = `
    <div class="pt-price">${formatPrice(record.price, record.currency)}</div>
    ${compareLine}
    <div class="pt-min">${minLine}</div>
    ${sparkline ? `<div class="pt-spark">${sparkline}</div>` : ""}
    ${originalLine}
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
      originalPrice: result.originalPrice ?? null,
      marketplace: result.marketplace ?? null,
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

function runRetryCascade() {
  loadAndUpdate();
  for (const delay of RETRY_DELAYS_MS) {
    setTimeout(loadAndUpdate, delay);
  }
}

function initForCurrentPage() {
  if (isWbSearchPage()) {
    initSearchValueBadges();
  } else if (isWbFeedbacksPage()) {
    initFeedbacksFitSignal();
  } else {
    runRetryCascade();
  }
}

initForCurrentPage();

// Wildberries (и многие другие магазины) — SPA: переход на другой товар со страницы поиска или
// с карточки на карточку меняет location.href через history.pushState, БЕЗ настоящей перезагрузки
// страницы. Content-script запускается один раз при первой загрузке и такие переходы не видит —
// поэтому без этого опроса цена обновлялась только по F5. Проверено вживую: обычный `popstate`
// тут не помогает (SPA не всегда его шлёт при переходах вперёд), поэтому просто следим за
// изменением URL по таймеру — надёжнее, чем перехватывать pushState/replaceState.
let lastUrl = location.href;
setInterval(() => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  dismissedThisPageLoad = false;
  if (widgetEl) widgetEl.style.display = "none";
  initForCurrentPage();
}, 800);
