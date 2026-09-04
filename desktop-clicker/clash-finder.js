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

// Один тик распознавания: снимает regionToImage один раз и сравнивает со ВСЕМИ шаблонами —
// возвращает лучшее совпадение выше порога, либо null.
async function scanForCard(nutScreen, region, templates, confidenceThreshold) {
  const haystack = await nutScreen.grabRegion(new Region(region.x, region.y, region.width, region.height));
  let best = null;
  for (const card of templates) {
    const { confidence } = await matchOnce(haystack, card.needleImage);
    if (confidence >= confidenceThreshold && (!best || confidence > best.confidence)) {
      best = { id: card.id, name: card.name, elixir: card.elixir, confidence };
    }
  }
  return best;
}

module.exports = { ensureCardIcons, loadCardTemplates, scanForCard };
