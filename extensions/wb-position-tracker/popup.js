function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function isWbSearchUrl(url) {
  return /^https:\/\/(www\.)?wildberries\.ru\/catalog\/0\/search\.aspx/.test(url || "");
}

async function render() {
  const content = document.getElementById("content");
  const { trackedItems } = await chrome.storage.local.get({ trackedItems: [] });

  if (trackedItems.length === 0) {
    content.innerHTML = `<p class="hint">Пока нет отслеживаемых товаров — добавь их на странице настроек.</p>`;
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !isWbSearchUrl(tab.url)) {
    content.innerHTML = `<p class="hint">Открой поиск на wildberries.ru по нужному запросу — тут появится позиция твоих товаров.</p>`;
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

document.getElementById("optionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
