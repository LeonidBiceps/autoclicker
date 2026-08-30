// Запускается ОДИН РАЗ, чтобы завести пару ключей для подписи лицензий.
//
//   node generate-keypair.js
//
// Создаёт private-key.json (держи в секрете, никогда не клади в само расширение
// и не публикуй) и печатает публичный ключ — его нужно вставить в
// PUBLIC_KEY_JWK внутри extensions/clicker/content.js и options.js (он безопасен
// для публикации, это и есть смысл асимметричной подписи: подписывать может
// только тот, у кого private-key.json, а проверять подпись — кто угодно).

const fs = require("fs");
const path = require("path");
const { webcrypto } = require("crypto");

const PRIVATE_KEY_PATH = path.join(__dirname, "private-key.json");

async function main() {
  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error(`Файл уже существует: ${PRIVATE_KEY_PATH}`);
    console.error("Если правда хочешь новую пару ключей — удали его вручную и запусти скрипт снова.");
    console.error("(Осторожно: старые лицензионные ключи, выданные покупателям, перестанут проверяться.)");
    process.exit(1);
  }

  const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicJwk = await webcrypto.subtle.exportKey("jwk", publicKey);
  const privateJwk = await webcrypto.subtle.exportKey("jwk", privateKey);

  fs.writeFileSync(PRIVATE_KEY_PATH, JSON.stringify(privateJwk, null, 2));

  console.log("Готово. Приватный ключ сохранён в:", PRIVATE_KEY_PATH);
  console.log("НЕ публикуй этот файл и не клади его в папку расширения.\n");
  console.log("Вставь этот объект как PUBLIC_KEY_JWK в content.js и options.js:\n");
  console.log(JSON.stringify(publicJwk, null, 2));
}

main();
