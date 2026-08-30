const REJECT_TEXT_RE = /^(reject all|decline all|decline|reject|only necessary|necessary only|отклонить всё|отклонить все|отклонить|только необходимые)$/i;
const BANNER_HINT_RE = /cookie|cookies|куки|персональн/i;

let attempted = false;

function findRejectButton() {
  const candidates = document.querySelectorAll("button, a[role='button'], [role='button']");
  for (const el of candidates) {
    const text = (el.textContent || "").trim();
    if (!text || text.length > 40) continue;
    if (REJECT_TEXT_RE.test(text)) {
      return el;
    }
  }
  return null;
}

function pageMentionsCookies() {
  const bodyText = document.body ? document.body.innerText.slice(0, 3000) : "";
  return BANNER_HINT_RE.test(bodyText);
}

function tryDismiss() {
  if (attempted) return;
  if (!pageMentionsCookies()) return;

  const button = findRejectButton();
  if (button) {
    attempted = true;
    button.click();
    incrementBlockedCount("cookieBanners");
  }
}

function start() {
  tryDismiss();
  const observer = new MutationObserver(() => {
    tryDismiss();
    if (attempted) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setTimeout(() => observer.disconnect(), 8000);
}

getSettings((settings) => {
  if (settings.cookieBanners) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
  }
});
