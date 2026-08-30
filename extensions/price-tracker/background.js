function formatPrice(price, currency) {
  const rounded = Number.isInteger(price) ? price : price.toFixed(2);
  return currency ? `${rounded} ${currency}` : `${rounded}`;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "PRICE_ALERT") return;

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Цена упала ниже порога",
    message: `${message.title}: ${formatPrice(message.price, message.currency)}`,
  });
});
