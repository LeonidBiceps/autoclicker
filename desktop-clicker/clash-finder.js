// Распознавание карты Clash Royale на экране: сканирует один регион (где на экране появляется
// разыгранная противником карта — калибруется вручную самим пользователем, как и у обычного
// триггера по картинке) против ВСЕЙ базы карт разом, а не одного образца, как у "Триггера по
// картинке". Переиспользует движок сравнения из image-finder.js (matchOnce) — тот же алгоритм,
// просто в цикле по многим образцам вместо одного.
const fs = require("fs");
const path = require("path");
const jimp = require("jimp");
const { Region } = require("@nut-tree-fork/shared");
const { matchOnce } = require("./image-finder");
const { CLASH_CARDS } = require("./clash-cards");

// Настоящих иконок карт в комплекте нет (это графика Supercell, встраивать её в приложение —
// отдельный вопрос авторских прав, который сознательно не решаем автоматическим скачиванием
// откуда-либо) — вместо них генерируем простую заглушку (цветной квадрат с подписью) для каждой
// карты, чтобы движок сравнения можно было проверить уже сейчас. Как только появятся настоящие
// иконки (свои же скриншоты из клиента игры) — файл с тем же id в этой папке просто заменяется,
// код трогать не нужно.
// Простой seeded PRNG (mulberry32) — детерминированный по id карты, но БЕЗ периодичности. Клетчатый
// узор (два чередующихся цвета) казался проще, но у него ровно та проблема, для которой и нужен
// coarse-to-fine поиск: при загрублении (COARSE_SCALE=4) повторяющийся паттерн алиасится сам на
// себя со сдвигом на период, из-за чего грубый проход попадал в ложный, но "похожий" сдвиг, и
// точный проход после этого уже не мог исправиться (радиус уточнения меньше периода узора) —
// поймано именно на этом тесте (заглушки отличались друг от друга, но самосовпадение с самим собой
// давало ~0.70 вместо ~1.0 из-за неправильно найденной позиции). Шумовая мозаика без периода этого
// не допускает.
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
// Заглушка — шумовая мозаика (блоки псевдослучайного цвета, детерминированные по id карты) с
// подписью поверх. Настоящие иконки карт (когда появятся) и так будут с реальной текстурой
// рисунка — это только для проверки самого движка распознавания на месте будущих настоящих файлов.
async function generatePlaceholderIcon(card, filePath) {
  const size = 64;
  const blockSize = 8;
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
  if (!cachedFont) cachedFont = await jimp.loadFont(jimp.FONT_SANS_16_WHITE);
  // Шрифт FONT_SANS_16_WHITE — только ASCII, а имена карт на русском, поэтому подписываем id
  // (латиница, уже читаемо) вместо name, чтобы не рисовать "???".
  img.print(cachedFont, 2, 2, { text: card.id, alignmentX: jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: jimp.VERTICAL_ALIGN_MIDDLE }, size - 4, size - 4);
  await img.writeAsync(filePath);
}

// Гарантирует, что у каждой карты есть файл иконки в iconsDir (заглушка, если настоящей ещё нет).
async function ensureCardIcons(iconsDir) {
  fs.mkdirSync(iconsDir, { recursive: true });
  for (const card of CLASH_CARDS) {
    const filePath = path.join(iconsDir, `${card.id}.png`);
    if (!fs.existsSync(filePath)) {
      await generatePlaceholderIcon(card, filePath);
    }
  }
}

// Грузит картинку файла в "Image"-форму, которую понимает matchOnce() — независимо от
// screen.config.resourceDirectory (та глобальная настройка уже занята под "Триггер по картинке").
async function loadImageFile(filePath) {
  const img = await jimp.read(filePath);
  return {
    width: img.bitmap.width,
    height: img.bitmap.height,
    data: img.bitmap.data,
    colorMode: 1, // ColorMode.RGB — jimp уже отдаёт RGBA как есть, менять местами каналы не нужно
  };
}

// Грузит все шаблоны карт разом (по одному разу на сеанс распознавания, не на каждый опрос) —
// картинки маленькие, но незачем перечитывать с диска и заново декодировать PNG каждые 400-1000мс.
async function loadCardTemplates(iconsDir) {
  await ensureCardIcons(iconsDir);
  const templates = [];
  for (const card of CLASH_CARDS) {
    const filePath = path.join(iconsDir, `${card.id}.png`);
    try {
      const needleImage = await loadImageFile(filePath);
      templates.push({ ...card, needleImage });
    } catch (e) {
      // повреждённый/нечитаемый файл иконки — пропускаем эту карту, не валим весь опрос целиком
    }
  }
  return templates;
}

// Дешёвая "подпись" кадра — среднее R/G/B по сетке 8x8 клеток. Сравнение со ВСЕЙ базой карт
// (matchOnce на каждый из ~100 шаблонов) — тяжёлая синхронная математика на главном процессе
// Electron (там же крутится тайминг самих кликов), и гонять её на каждый тик опроса, даже когда
// на экране ничего не изменилось с прошлого раза, — это и есть основная причина подтормаживаний
// при включённом отслеживании. Кадр без изменений (подавляющее большинство тиков — карта
// разыгрывается редко) обходится в O(ширина×высота) на сложение, а не в тяжёлую корреляцию по
// всем шаблонам — и просто пропускается.
const SIGNATURE_GRID = 8;
function computeSignature(image) {
  const { width, height, data } = image;
  const cells = SIGNATURE_GRID;
  const sums = new Float64Array(cells * cells * 3);
  const counts = new Int32Array(cells * cells);
  const cw = Math.max(1, Math.ceil(width / cells));
  const ch = Math.max(1, Math.ceil(height / cells));
  for (let y = 0; y < height; y++) {
    const cy = Math.min(cells - 1, Math.floor(y / ch));
    for (let x = 0; x < width; x++) {
      const cx = Math.min(cells - 1, Math.floor(x / cw));
      const cellIdx = cy * cells + cx;
      const p = (y * width + x) * 4;
      sums[cellIdx * 3] += data[p];
      sums[cellIdx * 3 + 1] += data[p + 1];
      sums[cellIdx * 3 + 2] += data[p + 2];
      counts[cellIdx]++;
    }
  }
  for (let i = 0; i < cells * cells; i++) {
    const c = counts[i] || 1;
    sums[i * 3] /= c;
    sums[i * 3 + 1] /= c;
    sums[i * 3 + 2] /= c;
  }
  return sums;
}

// Порог в единицах среднего значения канала (0-255) на клетку сетки — подобран с запасом
// ниже обычного шума перекодирования кадра, чтобы не пропустить реально появившуюся иконку.
const SIGNATURE_CHANGE_THRESHOLD = 3;
function signatureChanged(a, b) {
  if (!a || !b || a.length !== b.length) return true;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  return diff / a.length > SIGNATURE_CHANGE_THRESHOLD;
}

// Один тик распознавания: снимает регион один раз. Если картинка не изменилась с прошлого тика
// (prevSignature) — не сравнивает со всеми шаблонами вообще (см. computeSignature выше). Если
// изменилась — сравнивает со ВСЕМИ шаблонами, отдавая событийному циклу передышку каждые
// YIELD_EVERY карт (иначе один скан — это одна сплошная синхронная пауза на ~полсекунды,
// в течение которой подвиснет и сама автоматизация кликов).
const YIELD_EVERY = 12;
async function scanForCard(nutScreen, region, templates, confidenceThreshold, prevSignature) {
  const haystack = await nutScreen.grabRegion(new Region(region.x, region.y, region.width, region.height));
  const signature = computeSignature(haystack);
  if (prevSignature && !signatureChanged(prevSignature, signature)) {
    return { match: null, signature };
  }
  let best = null;
  let i = 0;
  for (const card of templates) {
    const { confidence } = await matchOnce(haystack, card.needleImage);
    if (confidence >= confidenceThreshold && (!best || confidence > best.confidence)) {
      best = { id: card.id, name: card.name, elixir: card.elixir, confidence };
    }
    i++;
    if (i % YIELD_EVERY === 0) await new Promise((resolve) => setImmediate(resolve));
  }
  return { match: best, signature };
}

module.exports = { ensureCardIcons, loadCardTemplates, scanForCard };
