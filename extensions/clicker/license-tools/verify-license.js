// Проверка ключа перед отправкой покупателю (та же логика, что и в самом расширении):
//
//   node verify-license.js "<ключ>"
//
// В выводе будет payload.machineId, если ключ выпущен с привязкой к конкретному
// компьютеру (desktop-версия) — null, если ключ универсальный.

const { webcrypto } = require("crypto");
const { base64urlDecode } = require("./codec");

const PUBLIC_KEY_JWK = {
  key_ops: ["verify"],
  ext: true,
  kty: "EC",
  x: "tWdpy0GEs8iCTySd-cptzfZNUEx9hbhDmw6MSGn9LA8",
  y: "tGAOHn66WZnWyvFXTMzZOQYkB0_4dUxlOxl__4YG8yU",
  crv: "P-256",
};

async function verifyLicenseKey(licenseKey) {
  const [payloadB64, sigB64] = (licenseKey || "").trim().split(".");
  if (!payloadB64 || !sigB64) return { valid: false, reason: "bad-format" };

  const payloadBytes = base64urlDecode(payloadB64);
  const sigBytes = base64urlDecode(sigB64);

  const publicKey = await webcrypto.subtle.importKey(
    "jwk",
    PUBLIC_KEY_JWK,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );

  const isValid = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, sigBytes, payloadBytes);
  if (!isValid) return { valid: false, reason: "bad-signature" };

  const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  if (Date.now() > payload.expiresAt) return { valid: false, reason: "expired", payload };

  return { valid: true, payload };
}

const key = process.argv[2];
verifyLicenseKey(key).then((result) => console.log(JSON.stringify(result, null, 2)));
