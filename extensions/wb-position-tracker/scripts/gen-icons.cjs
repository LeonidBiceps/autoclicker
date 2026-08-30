// Генерирует icons/icon{16,32,48,128}.png чистым Node (без внешних библиотек изображений) —
// фиолетовый квадрат с растущими белыми "столбиками" (график позиций). Запускать один раз:
//   node scripts/gen-icons.cjs

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT_DIR = path.join(__dirname, "..", "icons");
const BG = [124, 58, 237]; // фиолетовый, в духе WB
const FG = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function bars(size, x, barIndex, barCount) {
  // 3 столбика возрастающей высоты в правой нижней трети иконки
  const heights = [0.35, 0.6, 0.85];
  const barW = Math.max(1, Math.floor(size * 0.14));
  const gap = Math.max(1, Math.floor(size * 0.06));
  const totalW = barCount * barW + (barCount - 1) * gap;
  const startX = Math.floor(size * 0.62) - Math.floor(totalW / 2) + barIndex * (barW + gap);
  const h = Math.floor(size * 0.5 * heights[barIndex]);
  const baseY = Math.floor(size * 0.78);
  return { x0: startX, x1: startX + barW, y0: baseY - h, y1: baseY };
}

function generatePng(size) {
  const rowBytes = size * 4;
  const raw = Buffer.alloc((rowBytes + 1) * size);

  const barRects = [0, 1, 2].map((i) => bars(size, 0, i, 3));

  for (let y = 0; y < size; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      let color = BG;
      for (const r of barRects) {
        if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) {
          color = FG;
          break;
        }
      }
      const offset = y * (rowBytes + 1) + 1 + x * 4;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = generatePng(size);
  const outPath = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`  ${outPath} (${png.length} байт)`);
}
console.log("Готово.");
