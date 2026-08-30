// Выдаёт один лицензионный ключ покупателю. Запускать после каждой продажи.
//
//   node generate-license.js "Имя или @telegram покупателя" 30
//   node generate-license.js "Имя или @telegram покупателя" 30 a1b2c3d4e5f6g7h8
//
// Второй аргумент — на сколько дней активен ключ (это и есть твоя «подписка»:
// продал ещё раз — выдал новый ключ с новым сроком). Без аргумента — 365 дней.
//
// Третий аргумент (необязательно) — ID компьютера покупателя из desktop-версии
// (кнопка «Скопировать» в разделе Pro). Если указать — ключ будет работать
// ТОЛЬКО на этом компьютере в desktop-приложении (защита от «дай другу ключ»).
// В браузерном расширении привязка к железу не действует в любом случае —
// там это технически невозможно (песочница), ключ сработает где угодно.
// Без третьего аргумента — ключ обычный, без привязки, работает везде.

const fs = require("fs");
const path = require("path");
const { webcrypto } = require("crypto");
const { base64urlEncode } = require("./codec");

const PRIVATE_KEY_PATH = path.join(__dirname, "private-key.json");

async function main() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error("Нет private-key.json — сначала запусти: node generate-keypair.js");
    process.exit(1);
  }

  const buyer = process.argv[2] || "unknown";
  const days = parseInt(process.argv[3], 10) || 365;
  const machineId = process.argv[4] || null;

  const privateJwk = JSON.parse(fs.readFileSync(PRIVATE_KEY_PATH, "utf8"));
  const privateKey = await webcrypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const payload = {
    buyer,
    tier: "pro",
    issuedAt: Date.now(),
    expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
    machineId,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, payloadBytes);

  const licenseKey = `${base64urlEncode(payloadBytes)}.${base64urlEncode(new Uint8Array(signature))}`;

  console.log("Покупатель:", buyer);
  console.log("Активен до:", new Date(payload.expiresAt).toLocaleString("ru-RU"));
  console.log("Привязка к компьютеру:", machineId ? machineId : "нет (работает везде)");
  console.log("\nЛицензионный ключ (отправь покупателю):\n");
  console.log(licenseKey);
}

main();
