// Собирает extensions/price-tracker в .zip для раздачи пользователям (установка вручную через
// chrome://extensions -> "Загрузить распакованное расширение", предварительно разархивировав).
// В этой папке нет ничего чувствительного (в отличие от clicker с license-tools) — упаковываем
// все runtime-файлы целиком, без allowlist.
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
  "sparkline.js",
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

async function build() {
  for (const file of ALLOWED_FILES) {
    if (!fs.existsSync(path.join(ROOT, file))) {
      throw new Error(`Ожидаемый файл расширения не найден: ${file}`);
    }
  }

  const version = readVersion();
  fs.mkdirSync(DIST, { recursive: true });
  const outPath = path.join(DIST, `PriceTracker-${version}.zip`);
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
