// Распознавание карты Clash Royale по появлению юнита НА ПОЛЕ БОЯ (не по иконке карты — в игре
// нет такого элемента интерфейса: когда противник разыгрывает карту, всплывает не иконка, а сам
// юнит, причём где угодно на поле — некоторые карты (Копатель, Гоблинская бочка, воздушные атаки)
// ставятся и на твою половину тоже). Значит подход "маленький фиксированный регион + иконка из
// меню колоды" в принципе не может работать — сравнивать нужно со скриншотами самих юнитов, и
// искать по всему полю, а не в одной точке.
//
// Полный перебор по всему полю на каждый тик (matchOnce против ~100 шаблонов на каждой позиции)
// был бы ещё тяжелее, чем прежний вариант, который уже лагал на маленьком регионе. Поэтому:
//   1) поле разбивается на сетку ячеек (см. computeGridSignature) — на каждый тик дёшево
//      считаем, какие ячейки вообще изменились с прошлого кадра (только там могло что-то
//      появиться/двинуться);
//   2) соседние изменившиеся ячейки группируются в прямоугольные "области интереса"
//      (groupIntoRegions) — обычно 1-3 таких области на тик, а не всё поле;
//   3) тяжёлая сверка со всей базой шаблонов (matchOnce) гоняется только внутри этих областей,
//      а не по всему захваченному полю.
const fs = require("fs");
const path = require("path");
const jimp = require("jimp");
const { Region, imageToJimp } = require("@nut-tree-fork/shared");
const { matchOnce } = require("./image-finder");
const { CLASH_CARDS } = require("./clash-cards");

// Сколько образцов юнита храним на карту максимум — сверка идёт против ВСЕХ образцов карты, так
// что больше образцов = точнее (разные ракурсы/масштаб), но и медленнее. При превышении лимита
// один из существующих образцов (случайный) вытесняется новым — простая эвристика без отслеживания
// возраста/качества, но со временем набор остаётся разнообразным, а не бесконечно растёт.
const MAX_SAMPLES_PER_CARD = 12;

function cardSamplesDir(iconsDir, cardId) {
  return path.join(iconsDir, cardId);
}

// --- Заглушки (пока нет настоящих скриншотов юнитов с поля) -----------------------------------
// Настоящих скриншотов юнитов в комплекте нет и быть не может (это графика Supercell) — вместо
// них генерируется шумовая заглушка на каждую карту, чтобы можно было проверить сам движок
// сравнения уже сейчас. Как только появятся настоящие скриншоты (свои же кропы юнитов с поля во
// время матчей) — файл с тем же id в этой папке заменяется, код трогать не нужно.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashOf(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash >>> 0;
}
let cachedFont = null;
async function generatePlaceholderIcon(card, filePath) {
  const size = 48; // юниты на поле мельче иконок из меню — заглушка тоже поменьше
  const blockSize = 6;
  const rand = mulberry32(hashOf(card.id));
  const img = new jimp(size, size);
  for (let by = 0; by < size; by += blockSize) {
    for (let bx = 0; bx < size; bx += blockSize) {
      const color = jimp.rgbaToInt(40 + Math.floor(rand() * 180), 40 + Math.floor(rand() * 180), 40 + Math.floor(rand() * 180), 255);
      for (let y = by; y < by + blockSize; y++) {
        for (let x = bx; x < bx + blockSize; x++) {
          img.setPixelColor(color, x, y);
        }
      }
    }
  }
  if (!cachedFont) cachedFont = await jimp.loadFont(jimp.FONT_SANS_8_WHITE);
  img.print(cachedFont, 1, 1, { text: card.id, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE }, size - 2, size - 2);
  await img.writeAsync(filePath);
}

// У каждой карты — своя папка с образцами (не один файл): по мере игры сюда добавляются новые
// кропы юнита с поля (см. saveNewSample), а заглушка (placeholder.png) удаляется, как только
// появляется первый настоящий образец — не хотим, чтобы она разбавляла сравнение до конца жизни.
async function ensureCardIcons(iconsDir) {
  fs.mkdirSync(iconsDir, { recursive: true });
  for (const card of CLASH_CARDS) {
    const dir = cardSamplesDir(iconsDir, card.id);
    // Миграция со старой схемы (один плоский файл <id>.png — это была иконка карты из меню,
    // другая семантика вообще) — она тут больше не нужна и мешала бы, просто убираем.
    const legacyFlatFile = path.join(iconsDir, `${card.id}.png`);
    if (fs.existsSync(legacyFlatFile) && fs.statSync(legacyFlatFile).isFile()) {
      fs.unlinkSync(legacyFlatFile);
    }
    fs.mkdirSync(dir, { recursive: true });
    const existing = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
    if (existing.length === 0) {
      await generatePlaceholderIcon(card, path.join(dir, "placeholder.png"));
    }
  }
}

async function loadImageFile(filePath) {
  const img = await jimp.read(filePath);
  return {
    width: img.bitmap.width,
    height: img.bitmap.height,
    data: img.bitmap.data,
    colorMode: 1, // ColorMode.RGB — jimp уже отдаёт RGBA как есть, менять местами каналы не нужно
  };
}

async function loadCardTemplates(iconsDir) {
  await ensureCardIcons(iconsDir);
  const templates = [];
  for (const card of CLASH_CARDS) {
    const dir = cardSamplesDir(iconsDir, card.id);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
    const needleImages = [];
    for (const f of files) {
      try {
        needleImages.push(await loadImageFile(path.join(dir, f)));
      } catch (e) {
        // повреждённый/нечитаемый файл конкретного образца — пропускаем именно его
      }
    }
    if (needleImages.length) templates.push({ ...card, needleImages });
  }
  return templates;
}

// Добавляет новый образец в уже загруженный в памяти список шаблонов карты (без перечитывания
// файлов с диска) — используется сразу после того, как saveNewSample записала его на диск, чтобы
// новый образец начал учитываться в сравнении немедленно, а не только после перезапуска.
function addSampleInMemory(card, image) {
  if (!card.needleImages) card.needleImages = [];
  if (card.needleImages.length >= MAX_SAMPLES_PER_CARD) {
    card.needleImages.splice(Math.floor(Math.random() * card.needleImages.length), 1);
  }
  card.needleImages.push(image);
}

// Сохраняет новый кроп с поля как обучающий образец карты — либо от уверенного авто-распознавания,
// либо от ручной поправки пользователя (см. main.js). image — то же {width,height,data,colorMode},
// что возвращает scanForCard/nutScreen.grabRegion; imageToJimp корректно разворачивает каналы под
// PNG независимо от colorMode, так же как это уже делает matchOnce при сравнении.
async function saveNewSample(iconsDir, cardId, image) {
  const dir = cardSamplesDir(iconsDir, cardId);
  fs.mkdirSync(dir, { recursive: true });
  const placeholderPath = path.join(dir, "placeholder.png");
  // Windows блокирует файл от удаления, пока он открыт где-то ещё (например, показан в UI как
  // <img src="file://...">) — это не повод проваливать сохранение нового образца, попробуем
  // убрать заглушку ещё раз в другой раз (round-robin ниже рано или поздно вытеснит её сам).
  try {
    if (fs.existsSync(placeholderPath)) fs.rmSync(placeholderPath, { force: true });
  } catch (e) {
    // EBUSY и подобное — не критично, см. комментарий выше
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
  if (files.length >= MAX_SAMPLES_PER_CARD) {
    const victim = files[Math.floor(Math.random() * files.length)];
    try {
      fs.rmSync(path.join(dir, victim), { force: true });
    } catch (e) {
      // тоже может быть занят — просто оставляем на этот раз, лимит не критичен для одной единицы
    }
  }
  const jimpImg = imageToJimp(image);
  await jimpImg.writeAsync(path.join(dir, `sample-${Date.now()}.png`));
}

// --- Сетка ячеек для motion-detection по всему полю -------------------------------------------

const DEFAULT_CELL_SIZE = 40; // примерный размер ячейки в пикселях экрана — меньше типичного юнита

function computeGridSignature(image, cellSize) {
  const { width, height, data } = image;
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const sums = new Float64Array(cols * rows * 3);
  const counts = new Int32Array(cols * rows);
  for (let y = 0; y < height; y++) {
    const cy = Math.min(rows - 1, Math.floor(y / cellSize));
    for (let x = 0; x < width; x++) {
      const cx = Math.min(cols - 1, Math.floor(x / cellSize));
      const idx = cy * cols + cx;
      const p = (y * width + x) * 4;
      sums[idx * 3] += data[p];
      sums[idx * 3 + 1] += data[p + 1];
      sums[idx * 3 + 2] += data[p + 2];
      counts[idx]++;
    }
  }
  for (let i = 0; i < cols * rows; i++) {
    const c = counts[i] || 1;
    sums[i * 3] /= c;
    sums[i * 3 + 1] /= c;
    sums[i * 3 + 2] /= c;
  }
  return { cols, rows, cellSize, values: sums };
}

// Порог чуть грубее, чем у прежней "подписи на весь регион" — ячейки маленькие (40x40), и
// обычный шум перекодирования кадра на таком масштабе заметнее.
const CELL_CHANGE_THRESHOLD = 10;
function findChangedCells(prev, next) {
  const changed = [];
  for (let i = 0; i < next.cols * next.rows; i++) {
    const dr = Math.abs(prev.values[i * 3] - next.values[i * 3]);
    const dg = Math.abs(prev.values[i * 3 + 1] - next.values[i * 3 + 1]);
    const db = Math.abs(prev.values[i * 3 + 2] - next.values[i * 3 + 2]);
    if ((dr + dg + db) / 3 > CELL_CHANGE_THRESHOLD) changed.push(i);
  }
  return changed;
}

// Соседние изменившиеся ячейки — это, скорее всего, один и тот же появившийся/двигающийся юнит,
// а не несколько независимых событий. Группируем их через обход в ширину (4-связность) в
// прямоугольные "области интереса" и расширяем каждую на padCells ячеек в каждую сторону —
// силуэт юнита почти всегда больше одной ячейки 40x40, а motion-detection могла зацепить только
// его часть (например, только ноги, если верх пока сливается с фоном).
function groupIntoRegions(changedCells, cols, rows, padCells = 1) {
  const changedSet = new Set(changedCells);
  const visited = new Set();
  const boxes = [];
  for (const start of changedCells) {
    if (visited.has(start)) continue;
    const queue = [start];
    visited.add(start);
    let minX = start % cols, maxX = start % cols, minY = Math.floor(start / cols), maxY = Math.floor(start / cols);
    while (queue.length) {
      const cur = queue.shift();
      const cx = cur % cols, cy = Math.floor(cur / cols);
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      const candidates = [];
      if (cx > 0) candidates.push(cur - 1);
      if (cx < cols - 1) candidates.push(cur + 1);
      if (cy > 0) candidates.push(cur - cols);
      if (cy < rows - 1) candidates.push(cur + cols);
      for (const n of candidates) {
        if (changedSet.has(n) && !visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    boxes.push({
      cellX0: Math.max(0, minX - padCells),
      cellY0: Math.max(0, minY - padCells),
      cellX1: Math.min(cols - 1, maxX + padCells),
      cellY1: Math.min(rows - 1, maxY + padCells),
    });
  }
  return boxes;
}

function cellBoxToPixels(box, cellSize, haystackWidth, haystackHeight) {
  const x = box.cellX0 * cellSize;
  const y = box.cellY0 * cellSize;
  const w = Math.min(haystackWidth - x, (box.cellX1 - box.cellX0 + 1) * cellSize);
  const h = Math.min(haystackHeight - y, (box.cellY1 - box.cellY0 + 1) * cellSize);
  return { x, y, width: w, height: h };
}

// Вырезает прямоугольный кусок из Image-подобного объекта {width,height,data,colorMode} —
// то, что возвращает nutScreen.grabRegion() и чего просит matchOnce().
function cropImage(image, x, y, w, h) {
  const { width, data, colorMode } = image;
  const out = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcStart = ((y + row) * width + x) * 4;
    const destStart = row * w * 4;
    data.copy(out, destStart, srcStart, srcStart + w * 4);
  }
  return { width: w, height: h, data: out, colorMode };
}

// --- Основной цикл распознавания ----------------------------------------------------------------

const YIELD_EVERY = 12; // передышка событийному циклу каждые N сравнений — иначе один тик со
// сравнением по нескольким областям интереса это одна сплошная синхронная пауза, во время
// которой подвиснет и сама автоматизация кликов.

async function matchAgainstTemplates(haystackCrop, templates, confidenceThreshold, yieldCounter) {
  if (haystackCrop.width < 4 || haystackCrop.height < 4) return null;
  let best = null;
  for (const card of templates) {
    let cardBest = 0;
    for (const needle of card.needleImages) {
      if (needle.width > haystackCrop.width || needle.height > haystackCrop.height) continue;
      const { confidence } = await matchOnce(haystackCrop, needle);
      if (confidence > cardBest) cardBest = confidence;
      yieldCounter.n++;
      if (yieldCounter.n % YIELD_EVERY === 0) await new Promise((resolve) => setImmediate(resolve));
    }
    if (cardBest >= confidenceThreshold && (!best || cardBest > best.confidence)) {
      best = { id: card.id, name: card.name, elixir: card.elixir, confidence: cardBest };
    }
  }
  return best;
}

// Один тик распознавания: снимает поле один раз. Первый тик (нет prevSignature) или смена
// размера региона — просто запоминаем кадр как точку отсчёта, БЕЗ сверки с базой: нет смысла
// (и небезопасно по ложным срабатываниям) искать по всему захваченному полю целиком — юнит,
// который уже был на поле в момент включения, не так важен, как то, что появится дальше. Дальше
// на каждый тик сверяются только изменившиеся с прошлого кадра области.
// Возвращает МАССИВ совпадений (за один тик может одновременно проявиться больше одной карты —
// например, ты и противник играете картами почти одновременно в разных частях поля).
async function scanForCard(nutScreen, region, templates, confidenceThreshold, prevSignature, cellSize = DEFAULT_CELL_SIZE) {
  const haystack = await nutScreen.grabRegion(new Region(region.x, region.y, region.width, region.height));
  const signature = computeGridSignature(haystack, cellSize);

  if (!prevSignature || prevSignature.cols !== signature.cols || prevSignature.rows !== signature.rows) {
    return { matches: [], signature, lastCrop: null };
  }

  const yieldCounter = { n: 0 };
  const changedCells = findChangedCells(prevSignature, signature);
  if (changedCells.length === 0) return { matches: [], signature, lastCrop: null };

  const boxes = groupIntoRegions(changedCells, signature.cols, signature.rows, 1);
  const matches = [];
  let lastCrop = null;
  for (const box of boxes) {
    const px = cellBoxToPixels(box, cellSize, haystack.width, haystack.height);
    const crop = cropImage(haystack, px.x, px.y, px.width, px.height);
    lastCrop = crop; // для ручной поправки — последняя обработанная область интереса на этот тик,
    // даже если её не удалось распознать; см. main.js clash:recordManualPlay
    const best = await matchAgainstTemplates(crop, templates, confidenceThreshold, yieldCounter);
    if (best) {
      matches.push({
        ...best,
        region: { x: region.x + px.x, y: region.y + px.y, width: px.width, height: px.height },
        cropImage: crop, // для самообучения — см. main.js clashPollTick
      });
    }
  }
  return { matches, signature, lastCrop };
}

module.exports = { ensureCardIcons, loadCardTemplates, scanForCard, saveNewSample, addSampleInMemory, MAX_SAMPLES_PER_CARD };
