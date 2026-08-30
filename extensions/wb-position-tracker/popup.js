function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isWbSearchUrl(url) {
  return /^https:\/\/(www\.)?wildberries\.ru\/catalog\/0\/search\.aspx/.test(url || "");
}

function isWbProductUrl(url) {
  return /^https:\/\/(www\.)?wildberries\.ru\/catalog\/\d+\/detail\.aspx/.test(url || "");
}

// Выполняется НА странице товара (chrome.scripting) — извлекает артикул и название.
function extractProductInfoOnPage() {
  const match = location.pathname.match(/\/catalog\/(\d+)\/detail\.aspx/);
  const nmId = match ? match[1] : null;
  const titleEl = document.querySelector('[class*="productTitle"]');
  const name = titleEl ? titleEl.textContent.trim() : (document.title.split(" купить")[0] || "").trim();
  return { nmId, name };
}

async function saveNewItem(nmId, name, keyword) {
  const { trackedItems } = await chrome.storage.local.get({ trackedItems: [] });
  trackedItems.push({ id: genId(), nmId, name, keywords: [keyword] });
  await chrome.storage.local.set({ trackedItems });
}

// --- Состояние 1: страница товара — быстрое добавление ---

async function renderProductPage(tab, trackedItems) {
  const content = document.getElementById("content");
  content.innerHTML = `<p class="hint">Читаем карточку товара…</p>`;

  let info;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractProductInfoOnPage,
    });
    info = result;
  } catch (e) {
    content.innerHTML = `<p class="hint">Не удалось прочитать страницу — перезагрузи вкладку и попробуй снова.</p>`;
    return;
  }

  if (!info || !info.nmId) {
    content.innerHTML = `<p class="hint">Не нашли артикул на этой странице.</p>`;
    return;
  }

  const existing = trackedItems.find((i) => String(i.nmId) === String(info.nmId));
  if (existing) {
    content.innerHTML = `
      <p class="hint">Уже отслеживается как «${escapeHtml(existing.name)}»,
        по запросам: ${existing.keywords.map(escapeHtml).join(", ")}.</p>
      <p class="hint">Добавить ещё один запрос для этого товара можно на странице настроек.</p>
    `;
    return;
  }

  content.innerHTML = `
    <p class="hint">Товар: <b>${escapeHtml(info.name)}</b> (арт. ${escapeHtml(info.nmId)})</p>
    <div class="field">
      <label for="quickKeyword">Ключевое слово для отслеживания</label>
      <input type="text" id="quickKeyword" placeholder="например: кроссовки мужские" />
    </div>
    <button id="quickAddBtn" class="secondary-btn">Добавить в отслеживание</button>
    <p class="hint" id="quickAddMessage"></p>
  `;

  document.getElementById("quickAddBtn").addEventListener("click", async () => {
    const keyword = document.getElementById("quickKeyword").value.trim();
    const message = document.getElementById("quickAddMessage");
    if (!keyword) {
      message.textContent = "Укажи ключевое слово.";
      return;
    }
    await saveNewItem(info.nmId, info.name, keyword);
    message.textContent = "Добавлено! Зайди в поиск по этому запросу, чтобы увидеть позицию.";
    document.getElementById("quickAddBtn").disabled = true;
  });
}

// --- Состояние 2: страница поиска — живое сканирование ---

function renderSearchPage(tab, trackedItems) {
  const content = document.getElementById("content");

  if (trackedItems.length === 0) {
    content.innerHTML = `<p class="hint">Пока нет отслеживаемых товаров — зайди на карточку своего
      товара на WB и открой это расширение там, чтобы добавить его в один клик.</p>`;
    return;
  }

  content.innerHTML = `<p class="hint">Сканируем текущую страницу…</p>`;

  chrome.tabs.sendMessage(tab.id, { type: "wbpt:scan" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      content.innerHTML = `<p class="hint">Не удалось получить данные со страницы — перезагрузи вкладку с поиском и попробуй снова.</p>`;
      return;
    }
    const { results, keyword } = response;
    if (results.length === 0) {
      content.innerHTML = `<p class="hint">Для запроса «${escapeHtml(keyword)}» нет отслеживаемых товаров с таким ключевым словом.</p>`;
      return;
    }
    content.innerHTML = results
      .map((r) =>
        r.position === null
          ? `<div class="row not-found">${escapeHtml(r.name)} — не найден среди загруженного (прокрути страницу)</div>`
          : `<div class="row"><b>#${r.position}</b> — ${escapeHtml(r.name)}</div>`
      )
      .join("");
  });
}

// --- Состояние 3: дашборд — последняя известная позиция по каждому товару ---

async function renderDashboard(trackedItems) {
  const content = document.getElementById("content");

  if (trackedItems.length === 0) {
    content.innerHTML = `<p class="hint">Пока нет отслеживаемых товаров. Зайди на карточку своего
      товара на wildberries.ru и открой это расширение — появится кнопка «Добавить в отслеживание».</p>`;
    return;
  }

  const { history } = await chrome.storage.local.get({ history: [] });

  content.innerHTML = trackedItems
    .map((item) => {
      const own = history.filter((h) => String(h.nmId) === String(item.nmId)).sort((a, b) => b.at - a.at);
      const last = own[0];
      const info = last
        ? `<b>#${last.position}</b> по «${escapeHtml(last.keyword)}» (${new Date(last.at).toLocaleDateString("ru-RU")})`
        : `нет данных — зайди в поиск WB по одному из ключевых слов`;
      return `<div class="row">${escapeHtml(item.name)}: ${info}</div>`;
    })
    .join("");
}

async function render() {
  const content = document.getElementById("content");
  content.innerHTML = `<p class="hint">Загрузка…</p>`;

  const { trackedItems } = await chrome.storage.local.get({ trackedItems: [] });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab && isWbProductUrl(tab.url)) {
    await renderProductPage(tab, trackedItems);
  } else if (tab && isWbSearchUrl(tab.url)) {
    renderSearchPage(tab, trackedItems);
  } else {
    await renderDashboard(trackedItems);
  }
}

document.getElementById("optionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
