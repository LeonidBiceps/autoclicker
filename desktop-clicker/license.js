// Тот же публичный ключ и та же схема, что и в браузерном расширении
// (extensions/clicker/license.js) — один и тот же ключ, выданный
// generate-license.js, работает и там, и здесь.
//
// Отличие desktop-версии: тут есть доступ к ОС, поэтому лицензию можно
// (по желанию продавца) привязать к конкретному компьютеру — см. getMachineId().
// В браузерном расширении так сделать нельзя (песочница), там ключ без
// привязки к железу работает как обычно.

const { webcrypto } = require("crypto");
const os = require("os");
const crypto = require("crypto");

const PUBLIC_KEY_JWK = {
  key_ops: ["verify"],
  ext: true,
  kty: "EC",
  x: "tWdpy0GEs8iCTySd-cptzfZNUEx9hbhDmw6MSGn9LA8",
  y: "tGAOHn66WZnWyvFXTMzZOQYkB0_4dUxlOxl__4YG8yU",
  crv: "P-256",
};

// Отпечаток машины: hostname + platform/arch + MAC-адреса сетевых интерфейсов,
// захэшированные в одну строку. Не идеален (сменишь сетевую карту — сменится
// и ID), но для защиты от «дай другу свой ключ» вполне достаточно — это не
// военная защита, а разумный барьер для обычного пользователя.
function getMachineId() {
  const interfaces = os.networkInterfaces();
  const macs = Object.values(interfaces)
    .flat()
    .filter((i) => i && !i.internal && i.mac && i.mac !== "00:00:00:00:00:00")
    .map((i) => i.mac)
    .sort();
  const raw = [os.hostname(), os.platform(), os.arch(), macs.join(",")].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function base64urlToBytes(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  return new Uint8Array(Buffer.from(padded, "base64"));
}

async function verifyLicenseKey(licenseKey) {
  if (!licenseKey) return { valid: false };
  const [payloadB64, sigB64] = licenseKey.trim().split(".");
  if (!payloadB64 || !sigB64) return { valid: false };

  try {
    const payloadBytes = base64urlToBytes(payloadB64);
    const sigBytes = base64urlToBytes(sigB64);

    const publicKey = await webcrypto.subtle.importKey(
      "jwk",
      PUBLIC_KEY_JWK,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    const isValid = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, sigBytes, payloadBytes);
    if (!isValid) return { valid: false };

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (Date.now() > payload.expiresAt) return { valid: false, expired: true, payload };

    if (payload.machineId && payload.machineId !== getMachineId()) {
      return { valid: false, wrongMachine: true, payload };
    }

    return { valid: true, payload };
  } catch (e) {
    return { valid: false };
  }
}

module.exports = { verifyLicenseKey, getMachineId };
