let trackedItems = [];
let history = [];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function loadState() {
  const stored = await chrome.storage.local.get({ trackedItems: [], history: [] });
  trackedItems = stored.trackedItems;
  history = stored.history;
}

async function saveTrackedItems() {
  await chrome.storage.local.set({ trackedItems });
}

function renderItemsList() {
  const container = document.getElementById("itemsList");
  if (trackedItems.length === 0) {
    container.innerHTML = `<div class="empty-hint">Пока нет отслеживаемых товаров — добавь первый выше.</div>`;
    return;
  }
  container.innerHTML = trackedItems
    .map(
      (item) => `<div class="item-row">
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">Артикул ${escapeHtml(item.nmId)} · ${item.keywords.map(escapeHtml).join(", ")}</div>
        </div>
        <button class="delete-btn" data-id="${item.id}" title="Удалить">×</button>
      </div>`
    )
    .join("");
  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      trackedItems = trackedItems.filter((i) => i.id !== btn.dataset.id);
      await saveTrackedItems();
      renderItemsList();
      renderHistoryFilter();
    });
  });
}

function renderHistoryFilter() {
  const select = document.getElementById("historyFilter");
  const prevValue = select.value;
  if (trackedItems.length === 0) {
    select.innerHTML = `<option value="">— нет товаров —</option>`;
    renderHistoryTable();
    return;
  }
  select.innerHTML = trackedItems
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.nmId)})</option>`)
    .join("");
  if (trackedItems.some((i) => i.id === prevValue)) select.value = prevValue;
  renderHistoryTable();
}

function renderHistoryTable() {
  const container = document.getElementById("historyTable");
  const select = document.getElementById("historyFilter");
  const item = trackedItems.find((i) => i.id === select.value);
  if (!item) {
    container.innerHTML = `<div class="empty-hint">Нет данных.</div>`;
    return;
  }
  const rows = history
    .filter((h) => String(h.nmId) === String(item.nmId))
    .sort((a, b) => b.at - a.at)
    .slice(0, 100);

  if (rows.length === 0) {
    container.innerHTML = `<div class="empty-hint">Пока нет истории по этому товару — открой поиск WB по одному из его ключевых слов, дай странице просканироваться.</div>`;
    return;
  }

  container.innerHTML = `<table>
    <thead><tr><th>Дата</th><th>Запрос</th><th>Позиция</th></tr></thead>
    <tbody>
      ${rows
        .map(
          (r) => `<tr>
            <td>${new Date(r.at).toLocaleString("ru-RU")}</td>
            <td>${escapeHtml(r.keyword)}</td>
            <td class="position-cell"><b>#${r.position}</b></td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function bindHandlers() {
  document.getElementById("addBtn").addEventListener("click", async () => {
    const message = document.getElementById("addMessage");
    const nmId = document.getElementById("nmId").value.trim().replace(/\D/g, "");
    const name = document.getElementById("itemName").value.trim();
    const keywords = document
      .getElementById("keywords")
      .value.split("\n")
      .map((k) => k.trim())
      .filter(Boolean);

    if (!nmId) {
      message.textContent = "Укажи артикул (только цифры).";
      return;
    }
    if (!name) {
      message.textContent = "Укажи название для себя.";
      return;
    }
    if (keywords.length === 0) {
      message.textContent = "Добавь хотя бы одно ключевое слово.";
      return;
    }

    const existing = trackedItems.find((i) => String(i.nmId) === String(nmId));
    if (existing) {
      const merged = new Set([...existing.keywords, ...keywords]);
      existing.keywords = Array.from(merged);
      message.textContent = `Добавлены ключевые слова к «${existing.name}».`;
    } else {
      trackedItems.push({ id: genId(), nmId, name, keywords });
      message.textContent = "Добавлено.";
    }
    await saveTrackedItems();
    renderItemsList();
    renderHistoryFilter();

    document.getElementById("nmId").value = "";
    document.getElementById("itemName").value = "";
    document.getElementById("keywords").value = "";
  });

  document.getElementById("historyFilter").addEventListener("change", renderHistoryTable);
}

async function init() {
  await loadState();
  renderItemsList();
  renderHistoryFilter();
  bindHandlers();

  // Держим страницу настроек актуальной, даже если история пополняется сканированием
  // в другой вкладке, пока эта страница остаётся открытой.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.trackedItems) {
      trackedItems = changes.trackedItems.newValue || [];
      renderItemsList();
      renderHistoryFilter();
    }
    if (changes.history) {
      history = changes.history.newValue || [];
      renderHistoryTable();
    }
  });
}

init();
