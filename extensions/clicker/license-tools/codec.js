// Общие хелперы кодирования, одинаковые что в Node-скриптах, что в расширении
// (в content.js/options.js этот же код продублирован как чистый браузерный JS —
// см. функции base64urlEncode/base64urlDecode там же).

function base64urlEncode(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  return new Uint8Array(Buffer.from(padded, "base64"));
}

module.exports = { base64urlEncode, base64urlDecode };
