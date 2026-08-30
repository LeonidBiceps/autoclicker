// Обфусцирует чувствительный JS (в первую очередь license.js — там логика
// проверки лицензии), собирает .exe через electron-builder, затем ВСЕГДА
// восстанавливает читаемый исходный код обратно (даже если сборка упала).
//
// Обфускация не делает код невзламываемым — это в принципе невозможно для
// клиентского JS без сервера. Она поднимает порог: вместо «открыть main.js
// в блокноте и поменять одну строчку» требуется реальное реверс-инжиниринг
// усилие. Этого достаточно против подавляющего большинства случайных попыток,
// не достаточно против целенаправленного взлома — это честная граница, не
// баг данного подхода.
//
//   npm run dist

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const JavaScriptObfuscator = require("javascript-obfuscator");

const ROOT = path.join(__dirname, "..");

const FILES_TO_OBFUSCATE = ["main.js", "license.js", "keymap.js", "store.js", "preload.js", "pick-preload.js"];

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  selfDefending: true,
  target: "node",
};

function backupPath(file) {
  return path.join(ROOT, `${file}.bak`);
}

function obfuscateAll() {
  for (const file of FILES_TO_OBFUSCATE) {
    const fullPath = path.join(ROOT, file);
    const original = fs.readFileSync(fullPath, "utf8");
    fs.writeFileSync(backupPath(file), original);

    const obfuscated = JavaScriptObfuscator.obfuscate(original, OBFUSCATOR_OPTIONS).getObfuscatedCode();
    fs.writeFileSync(fullPath, obfuscated);
    console.log(`  обфусцирован: ${file}`);
  }
}

function restoreAll() {
  for (const file of FILES_TO_OBFUSCATE) {
    const bak = backupPath(file);
    if (!fs.existsSync(bak)) continue;
    fs.writeFileSync(path.join(ROOT, file), fs.readFileSync(bak, "utf8"));
    fs.unlinkSync(bak);
  }
}

function anyBackupsLeftover() {
  return FILES_TO_OBFUSCATE.some((file) => fs.existsSync(backupPath(file)));
}

if (anyBackupsLeftover()) {
  console.error(
    "Найдены файлы .bak — похоже, прошлая сборка прервалась и не восстановила исходники.\n" +
      "Проверь main.js.bak и т.п. рядом с main.js и реши: восстановить их вручную или удалить."
  );
  process.exit(1);
}

try {
  console.log("Обфусцируем перед сборкой...");
  obfuscateAll();

  console.log("\nСобираем через electron-builder...");
  execSync("npx electron-builder --win portable", { cwd: ROOT, stdio: "inherit" });

  console.log("\nГотово: смотри dist/");
} finally {
  console.log("\nВосстанавливаем читаемый исходный код...");
  restoreAll();
}
