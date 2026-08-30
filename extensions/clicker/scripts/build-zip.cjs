// Собирает extensions/clicker в .zip для раздачи пользователям (установка вручную через
// chrome://extensions -> "Загрузить распакованное расширение", предварительно разархивировав).
//
// ВАЖНО: список файлов — явный allowlist, а не "всё, кроме .gitignore". Причина: в этой папке
// рядом лежит license-tools/ с private-key.json (приватный ключ, которым подписываются лицензии).
// Если его случайно упаковать в zip и раздать пользователям — они смогут сами штамповать себе
// Pro-лицензии навсегда. Поэтому здесь только явно перечисленные runtime-файлы расширения.
//
//   node scripts/build-zip.cjs

const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const ALLOWED_FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "license.js",
  "options.css",
  "options.html",
  "options.js",
  "overlay.css",
  "popup.css",
  "popup.html",
  "popup.js",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

function readVersion() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  return manifest.version;
}

function assertAllowlistIsSafe() {
  const leaked = ALLOWED_FILES.filter(
    (f) => f.includes("license-tools") || f.toLowerCase().includes("private-key")
  );
  if (leaked.length > 0) {
    throw new Error(`СТОП: в ALLOWED_FILES чувствительные пути: ${leaked.join(", ")}. Убери их и пересобери.`);
  }
}

async function build() {
  assertAllowlistIsSafe();

  for (const file of ALLOWED_FILES) {
    if (!fs.existsSync(path.join(ROOT, file))) {
      throw new Error(`Ожидаемый файл расширения не найден: ${file}`);
    }
  }

  const version = readVersion();
  fs.mkdirSync(DIST, { recursive: true });
  const outPath = path.join(DIST, `Autoclicker-Extension-${version}.zip`);
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

  const output = fs.createWriteStream(outPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
  });

  archive.pipe(output);
  for (const file of ALLOWED_FILES) {
    archive.file(path.join(ROOT, file), { name: file });
  }
  await archive.finalize();
  await done;

  console.log(`Готово: ${outPath}`);
  console.log(`Файлов в архиве: ${ALLOWED_FILES.length}`);
  ALLOWED_FILES.forEach((e) => console.log(`  ${e}`));
}

build().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
