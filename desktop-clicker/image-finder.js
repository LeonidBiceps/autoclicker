// Собственная реализация поиска картинки на экране для nut-js.
//
// В nut-js v4 поиск шаблона (screen.find(imageResource(...))) требует отдельно
// зарегистрированного ImageFinder-провайдера — сам движок сравнения картинок
// в пакет не входит. Готового провайдера для этого форка (@nut-tree-fork/*) на
// npm не существует, а официальный @nut-tree/template-matcher (на opencv4nodejs)
// тоже не опубликован и тянет тяжёлую нативную зависимость, которая рискует
// сломать сборку .exe. Поэтому здесь — свой матчер на jimp (уже используется
// внутри nut-js), без нативного кода.
//
// Алгоритм в два прохода, чтобы не сравнивать каждый пиксель экрана "в лоб"
// (это было бы O(W*H*w*h) и заняло бы секунды на весь экран):
//   1) грубый проход по уменьшенным (в COARSE_SCALE раз) картинкам — находим
//      кандидатов на позицию;
//   2) точная проверка кандидатов в оригинальном разрешении в небольшом
//      радиусе вокруг лучшей грубой позиции.
const jimp = require("jimp");
const { imageToJimp, MatchResult, Region } = require("@nut-tree-fork/shared");

const COARSE_SCALE = 4; // во сколько раз уменьшаем для грубого прохода
const COARSE_STEP = 2; // шаг сканирования по грубой картинке (в её пикселях)
const REFINE_RADIUS = COARSE_SCALE * COARSE_STEP; // радиус уточнения в пикселях оригинала

// Держим все 3 канала (R,G,B), а не яркость — на чистой яркости, например,
// пурпурный и серый одного тона неотличимы, из-за чего движок ловил ложные
// совпадения на однотонных областях (см. тест _test-image-negative.js).
function toRgb(jimpImg) {
  const { width, height, data } = jimpImg.bitmap;
  const n = width * height;
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    r[p] = data[i] / 255;
    g[p] = data[i + 1] / 255;
    b[p] = data[i + 2] / 255;
  }
  return { width, height, r, g, b };
}

function downscale(img, scale) {
  const { width, height } = img;
  const dw = Math.max(1, Math.floor(width / scale));
  const dh = Math.max(1, Math.floor(height / scale));
  const r = new Float32Array(dw * dh), g = new Float32Array(dw * dh), b = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(width - 1, x * scale);
      const sy = Math.min(height - 1, y * scale);
      const sp = sy * width + sx;
      const dp = y * dw + x;
      r[dp] = img.r[sp];
      g[dp] = img.g[sp];
      b[dp] = img.b[sp];
    }
  }
  return { width: dw, height: dh, r, g, b };
}

// Нормированная кросс-корреляция по трём каналам needle относительно haystack в точке (ox, oy).
//
// Считаем статистику ОТДЕЛЬНО по каждому каналу (R,G,B), а не смешивая их в
// одну сумму — иначе пространственно однотонный, но цветной шаблон (скажем,
// чистая магента 255/0/255) выглядит как "текстура" из-за разницы между
// каналами R и G, хотя на самом деле никакой пространственной структуры нет.
// Из-за этого корреляция на однотонных областях превращается в сравнение
// всего 3 чисел (R,G,B) и почти всегда даёт обманчиво высокий балл. Поэтому
// однотонность каждой области проверяем per-channel, и для однотонных
// областей считаем не корреляцию, а прямое расстояние между средними цветами.
function correlationAt(haystack, needle, ox, oy) {
  const channels = [haystack.r, haystack.g, haystack.b];
  const needleChannels = [needle.r, needle.g, needle.b];
  const npx = needle.width * needle.height;
  const meanH = [0, 0, 0], meanN = [0, 0, 0];
  const varH = [0, 0, 0], varN = [0, 0, 0];
  let covar = 0;
  for (let c = 0; c < 3; c++) {
    const hCh = channels[c];
    const nCh = needleChannels[c];
    let sH = 0, sN = 0, sHH = 0, sNN = 0, sHN = 0;
    for (let y = 0; y < needle.height; y++) {
      const hRow = (oy + y) * haystack.width + ox;
      const nRow = y * needle.width;
      for (let x = 0; x < needle.width; x++) {
        const h = hCh[hRow + x];
        const nv = nCh[nRow + x];
        sH += h;
        sN += nv;
        sHH += h * h;
        sNN += nv * nv;
        sHN += h * nv;
      }
    }
    meanH[c] = sH / npx;
    meanN[c] = sN / npx;
    varH[c] = sHH - (sH * sH) / npx;
    varN[c] = sNN - (sN * sN) / npx;
    covar += sHN - (sH * sN) / npx;
  }
  const needleFlat = varN[0] < 1e-4 && varN[1] < 1e-4 && varN[2] < 1e-4;
  const haystackFlat = varH[0] < 1e-4 && varH[1] < 1e-4 && varH[2] < 1e-4;
  if (needleFlat || haystackFlat) {
    // Если однотонная только ОДНА из областей — точно не совпадение.
    if (needleFlat !== haystackFlat) return -1;
    const dr = meanH[0] - meanN[0], dg = meanH[1] - meanN[1], db = meanH[2] - meanN[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db); // 0..~1.73
    return 1 - dist * 2; // строгий штраф за разницу среднего цвета
  }
  const totalVarH = varH[0] + varH[1] + varH[2];
  const totalVarN = varN[0] + varN[1] + varN[2];
  const denom = Math.sqrt(totalVarH * totalVarN);
  if (denom < 1e-6) return -1;
  const corrScore = covar / denom;

  // Настоящие "почти однотонные" области реального скриншота (фон/обои с лёгким шумом или
  // градиентом) не проходят строгую проверку выше (дисперсия не равна нулю), но чистая
  // корреляция для такого слабого сигнала численно неустойчива — знаменатель маленький, и шум
  // решает результат больше, чем реальное сходство (проверено вживую: confidence заметно ниже
  // порога на таких образцах). Подмешиваем сравнение среднего цвета пропорционально тому,
  // насколько мало текстуры в патче (среднее на пиксель, чтобы не зависеть от размера needle) —
  // для текстурных образцов (иконки, кнопки) вес около нуля, ничего не меняется.
  const avgVar = (totalVarH + totalVarN) / (2 * npx);
  const NEAR_FLAT_SCALE = 0.004;
  const nearFlatWeight = Math.max(0, 1 - avgVar / NEAR_FLAT_SCALE);
  if (nearFlatWeight > 0) {
    const dr = meanH[0] - meanN[0], dg = meanH[1] - meanN[1], db = meanH[2] - meanN[2];
    const colorScore = 1 - Math.sqrt(dr * dr + dg * dg + db * db) * 2;
    return nearFlatWeight * colorScore + (1 - nearFlatWeight) * corrScore;
  }
  return corrScore;
}

function findBestMatch(haystack, needle, searchLeft, searchTop, searchRight, searchBottom, step) {
  let best = { score: -Infinity, x: searchLeft, y: searchTop };
  for (let y = searchTop; y <= searchBottom; y += step) {
    for (let x = searchLeft; x <= searchRight; x += step) {
      const score = correlationAt(haystack, needle, x, y);
      if (score > best.score) best = { score, x, y };
    }
  }
  return best;
}

async function matchOnce(haystackImage, needleImage) {
  const haystackJimp = imageToJimp(haystackImage);
  const needleJimp = imageToJimp(needleImage);
  const haystackRgb = toRgb(haystackJimp);
  const needleRgb = toRgb(needleJimp);

  if (needleRgb.width > haystackRgb.width || needleRgb.height > haystackRgb.height) {
    return { confidence: 0, location: new Region(0, 0, needleRgb.width, needleRgb.height) };
  }

  // Грубый проход
  const coarseHay = downscale(haystackRgb, COARSE_SCALE);
  const coarseNeedle = downscale(needleRgb, COARSE_SCALE);
  const coarseMaxX = coarseHay.width - coarseNeedle.width;
  const coarseMaxY = coarseHay.height - coarseNeedle.height;
  if (coarseMaxX < 0 || coarseMaxY < 0) {
    return { confidence: 0, location: new Region(0, 0, needleRgb.width, needleRgb.height) };
  }
  const coarseBest = findBestMatch(coarseHay, coarseNeedle, 0, 0, coarseMaxX, coarseMaxY, COARSE_STEP);

  // Уточнение в оригинальном разрешении вокруг грубой позиции
  const centerX = coarseBest.x * COARSE_SCALE;
  const centerY = coarseBest.y * COARSE_SCALE;
  const maxX = haystackRgb.width - needleRgb.width;
  const maxY = haystackRgb.height - needleRgb.height;
  const left = Math.max(0, centerX - REFINE_RADIUS);
  const top = Math.max(0, centerY - REFINE_RADIUS);
  const right = Math.min(maxX, centerX + REFINE_RADIUS);
  const bottom = Math.min(maxY, centerY + REFINE_RADIUS);
  const fineBest = findBestMatch(haystackRgb, needleRgb, left, top, right, bottom, 1);

  const confidence = Math.max(0, Math.min(1, (fineBest.score + 1) / 2));
  return {
    confidence,
    location: new Region(fineBest.x, fineBest.y, needleRgb.width, needleRgb.height),
  };
}

class JimpImageFinder {
  // nut-js's screen.find() (see screen-helpers.function.js: getMatchResult) не
  // проверяет поле MatchResult.error вообще — оно там просто игнорируется, и
  // "мягкий" провал через error приводил к тому, что screen.find() резолвился
  // с координатами несовпадения как с настоящим совпадением. Поэтому здесь
  // реально бросаем исключение при недостаточной уверенности — это единственный
  // способ заставить screen.find()/screen.waitFor() корректно отклонить поиск.
  async findMatch(matchRequest) {
    const { location, confidence } = await matchOnce(matchRequest.haystack, matchRequest.needle);
    const threshold = matchRequest.confidence ?? 0.99;
    if (confidence < threshold) {
      throw new Error(`No match with required confidence. Best match: ${confidence.toFixed(3)}`);
    }
    return new MatchResult(confidence, location);
  }

  async findMatches(matchRequest) {
    try {
      return [await this.findMatch(matchRequest)];
    } catch (e) {
      return [];
    }
  }
}

module.exports = { JimpImageFinder };
