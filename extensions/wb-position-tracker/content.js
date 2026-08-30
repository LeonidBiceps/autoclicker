// Сканирует страницу поиска Wildberries: находит органический порядок товаров (без рекламных
// каруселей) и ищет в нём отслеживаемые артикулы для текущего ключевого слова.
//
// Структура страницы (проверено вживую на wildberries.ru, сентябрь 2026):
// - Список результатов: .product-card-list
// - Каждый органический товар — ПРЯМОЙ потомок списка с классом .product-card,
//   id вида "c<артикул>" (например id="c1207541549" -> артикул 1207541549)
// - Рекламные карусели (типа "Вместе с ... ищут" / бренд-баннеры) — тоже лежат внутри
//   .product-card-list, но НЕ являются прямым потомком с классом .product-card: это обёртка
//   (класс вида commonCarousel--...), внутри которой уже вложены свои .product-card.
//   Поэтому берём только ПРЯМЫХ потомков с классом .product-card — это даёт настоящий
//   органический рейтинг, без рекламных вставок.
//
// Ограничение (не баг): Wildberries — SPA с бесконечной прокруткой, ?page=N в URL не работает
// (сброс на первую porцию при обычной перезагрузке). Поэтому видно только то, что уже
// подгружено в текущей вкладке — если товара не видно, надо прокрутить страницу вниз, чтобы
// подгрузились следующие товары, и проверить снова.

const HISTORY_DEDUPE_MS = 6 * 60 * 60 * 1000; // не пишем повторно ту же позицию чаще, чем раз в 6 часов

function getKeywordFromUrl() {
  const params = new URLSearchParams(location.search);
  return (params.get("search") || "").trim();
}

function scanOrganicIds() {
  const list = document.querySelector(".product-card-list");
  if (!list) return [];
  return Array.from(list.children)
    .filter((child) => child.classList.contains("product-card"))
    .map((child) => (child.id || "").replace(/^c/, ""))
    .filter(Boolean);
}

async function getTrackedItems() {
  const { trackedItems } = await chrome.storage.local.get({ trackedItems: [] });
  return trackedItems;
}

async function appendHistory(entries) {
  if (entries.length === 0) return;
  const { history } = await chrome.storage.local.get({ history: [] });
  const now = Date.now();

  for (const entry of entries) {
    const last = [...history].reverse().find((h) => h.nmId === entry.nmId && h.keyword === entry.keyword);
    if (last && last.position === entry.position && now - last.at < HISTORY_DEDUPE_MS) continue;
    history.push({ ...entry, at: now });
  }

  // Не даём истории расти бесконечно — держим последние 2000 записей.
  const trimmed = history.slice(-2000);
  await chrome.storage.local.set({ history: trimmed });
}

async function runScan() {
  const keyword = getKeywordFromUrl();
  const organicIds = scanOrganicIds();
  const trackedItems = await getTrackedItems();

  const relevant = trackedItems.filter((item) =>
    (item.keywords || []).some((k) => k.trim().toLowerCase() === keyword.toLowerCase())
  );

  const results = relevant.map((item) => {
    const index = organicIds.indexOf(String(item.nmId));
    return {
      nmId: item.nmId,
      name: item.name,
      keyword,
      position: index === -1 ? null : index + 1,
    };
  });

  await chrome.storage.local.set({
    lastScan: { keyword, tabUrl: location.href, results, organicCount: organicIds.length, scannedAt: Date.now() },
  });

  await appendHistory(
    results.filter((r) => r.position !== null).map((r) => ({ nmId: r.nmId, keyword: r.keyword, position: r.position }))
  );

  renderOverlay(results, organicIds.length);
  return results;
}

// --- Overlay panel на странице ---

let overlayEl = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.id = "wbpt-overlay";
  overlayEl.innerHTML = `
    <div id="wbpt-header">
      <span>Позиции в поиске</span>
      <button id="wbpt-close" title="Скрыть">×</button>
    </div>
    <div id="wbpt-body"></div>
  `;
  document.body.appendChild(overlayEl);
  overlayEl.querySelector("#wbpt-close").addEventListener("click", () => {
    overlayEl.hidden = true;
  });
  return overlayEl;
}

function renderOverlay(results, organicCount) {
  if (results.length === 0) return; // нет отслеживаемых товаров под этот запрос — не мешаем
  const el = ensureOverlay();
  el.hidden = false;
  const body = el.querySelector("#wbpt-body");
  body.innerHTML = results
    .map((r) => {
      if (r.position === null) {
        return `<div class="wbpt-row wbpt-not-found">${escapeHtml(r.name)} — не найден среди ${organicCount} загруженных (прокрути вниз)</div>`;
      }
      return `<div class="wbpt-row"><b>#${r.position}</b> — ${escapeHtml(r.name)}</div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// --- Наблюдение за подгрузкой новых товаров при скролле ---

let debounceTimer = null;
function scheduleScan() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runScan, 400);
}

function observeList() {
  const list = document.querySelector(".product-card-list");
  if (!list) {
    setTimeout(observeList, 500);
    return;
  }
  const observer = new MutationObserver(scheduleScan);
  observer.observe(list, { childList: true });
}

// Отвечаем на запрос popup'а — пересканировать по требованию
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "wbpt:scan") {
    runScan().then((results) => sendResponse({ ok: true, results, keyword: getKeywordFromUrl() }));
    return true; // асинхронный ответ
  }
});

scheduleScan();
observeList();
