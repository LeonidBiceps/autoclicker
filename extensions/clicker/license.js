// Проверка лицензионного ключа полностью офлайн, без единого запроса в сеть —
// см. license-tools/ для того, как ключи выпускаются.

const PUBLIC_KEY_JWK = {
  key_ops: ["verify"],
  ext: true,
  kty: "EC",
  x: "tWdpy0GEs8iCTySd-cptzfZNUEx9hbhDmw6MSGn9LA8",
  y: "tGAOHn66WZnWyvFXTMzZOQYkB0_4dUxlOxl__4YG8yU",
  crv: "P-256",
};

function base64urlToBytes(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyLicenseKey(licenseKey) {
  if (!licenseKey) return { valid: false };
  const [payloadB64, sigB64] = licenseKey.trim().split(".");
  if (!payloadB64 || !sigB64) return { valid: false };

  try {
    const payloadBytes = base64urlToBytes(payloadB64);
    const sigBytes = base64urlToBytes(sigB64);

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      PUBLIC_KEY_JWK,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    const isValid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, sigBytes, payloadBytes);
    if (!isValid) return { valid: false };

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (Date.now() > payload.expiresAt) return { valid: false, expired: true, payload };

    return { valid: true, payload };
  } catch (e) {
    return { valid: false };
  }
}
