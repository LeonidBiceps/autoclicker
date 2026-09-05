// Автономная проверка нативного модуля (без Electron) — крутит короткий burst и сравнивает
// количество кликов, которое сообщил Rust, с тем, сколько реально пришло в этот же процесс через
// глобальный хук (uiohook-napi, уже используется в проекте для записи макросов) — так убеждаемся,
// что клики РЕАЛЬНО происходят на уровне ОС, а не просто инкрементируется счётчик внутри Rust.
const native = require("./native-clicker.win32-x64-msvc.node");
const { uIOhook } = require("../node_modules/uiohook-napi");

let observed = 0;
uIOhook.on("mousedown", () => observed++);
uIOhook.start();

console.log("running 500ms burst, interval=0 (max speed)...");
const ok = native.startBurst("mouse-left", 0, 0, 500);
console.log("startBurst returned:", ok);

setTimeout(() => {
  const midCount = native.getBurstCount();
  console.log("mid-run getBurstCount():", midCount, "isBurstRunning():", native.isBurstRunning());
}, 200);

setTimeout(() => {
  const finalCount = native.stopBurst();
  uIOhook.stop();
  console.log("Rust reported clicks:", finalCount);
  console.log("uiohook observed mousedown events:", observed);
  console.log(finalCount > 100 && observed > 100 ? "PASS: real clicks at high rate" : "FAIL: too few clicks or mismatch");
  process.exit(0);
}, 700);
