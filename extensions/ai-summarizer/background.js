const MODEL = "claude-haiku-4-5-20251001";
const API_URL = "https://api.anthropic.com/v1/messages";

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

async function summarize(title, text, instruction) {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) {
    return { error: "no-api-key" };
  }

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        messages: [
          {
            role: "user",
            content: `${instruction} Заголовок: "${title}".\n\nТекст статьи:\n${text}`,
          },
        ],
      }),
    });
  } catch (e) {
    return { error: `Сеть недоступна: ${e.message}` };
  }

  if (!response.ok) {
    const body = await response.text();
    return { error: `Ошибка API (${response.status}): ${body.slice(0, 300)}` };
  }

  const data = await response.json();
  const summary = data.content?.[0]?.text || "";
  return { summary };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE") {
    summarize(message.title, message.text, message.instruction).then(sendResponse);
    return true;
  }
  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
});
