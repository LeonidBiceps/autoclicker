/**
 * Фон сцены диалога: предметная обстановка под место действия главы (коридор,
 * столовая — см. `Location` в story.ts), а не абстрактный градиент на все
 * сцены разом. Рисуется с низкой непрозрачностью и по краям экрана — портрет
 * должен оставаться в фокусе, а не соревноваться за внимание с интерьером.
 */

import { drawPortrait } from './portrait';
import type { CharacterDef } from './characters';
import type { Expression, Location } from './story';

interface LocationPalette {
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  accent: string;
}

const PALETTE: Record<Location, LocationPalette> = {
  hallway: { skyTop: '#3d1c42', skyMid: '#26132e', skyBottom: '#170b1e', accent: '#ffd166' },
  cafeteria: { skyTop: '#402036', skyMid: '#2a1528', skyBottom: '#180c1c', accent: '#ff9f5a' },
  rooftop: { skyTop: '#16224a', skyMid: '#101a38', skyBottom: '#0a1228', accent: '#ffd98a' },
  observatory: { skyTop: '#2a1d4a', skyMid: '#1b1332', skyBottom: '#0f0a1e', accent: '#7fd8ff' },
};

export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: number,
  character: CharacterDef | null,
  expression: Expression,
  blink: boolean,
  location: Location = 'hallway',
): void {
  const pal = PALETTE[location];

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, pal.skyTop);
  grad.addColorStop(0.55, pal.skyMid);
  grad.addColorStop(1, pal.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (location === 'cafeteria') drawCafeteria(ctx, width, height);
  else if (location === 'rooftop') drawRooftop(ctx, width, height, phase);
  else if (location === 'observatory') drawObservatory(ctx, width, height, phase);
  else drawHallway(ctx, width, height);

  drawBokeh(ctx, width, height, phase, pal.accent);

  if (character) {
    // Ограничиваем по меньшей стороне (высоте) канонической компоновки —
    // на узком высоком экране портрет иначе выходит за кадр по ширине плеч,
    // на широком «альбомном» превью — раздувается на весь экран по высоте.
    const size = Math.min(width * 0.62, height * 0.5);
    // Едва заметное «дыхание» — портрет полностью статичен, если ничего не
    // печатается, и без него читается как застывшая картинка, а не персонаж.
    const breathe = Math.sin(phase * 1.1) * size * 0.006;
    drawPortrait(ctx, width / 2, height * 0.34 + breathe, size, character, expression, blink);
  }

  // Мягкая тень снизу — облегчает читаемость текстового окна поверх портрета.
  const floor = ctx.createLinearGradient(0, height * 0.72, 0, height);
  floor.addColorStop(0, 'rgba(23,11,30,0)');
  floor.addColorStop(1, 'rgba(23,11,30,0.55)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, height * 0.72, width, height * 0.28);
}

/** Ряды шкафчиков у краёв экрана и светлое окно в конце коридора. */
function drawHallway(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const horizonY = height * 0.3;

  // Окно в торце коридора — мягкое световое пятно, задаёт глубину.
  const window = ctx.createRadialGradient(width / 2, horizonY, 4, width / 2, horizonY, width * 0.45);
  window.addColorStop(0, 'rgba(255,230,180,0.14)');
  window.addColorStop(1, 'rgba(255,230,180,0)');
  ctx.fillStyle = window;
  ctx.beginPath();
  ctx.arc(width / 2, horizonY, width * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Шкафчики по краям — только у самых боковых полос экрана, не мешают портрету.
  const lockerW = width * 0.09;
  const rows = 4;
  for (const side of [-1, 1] as const) {
    const baseX = side < 0 ? 0 : width - lockerW;
    for (let i = 0; i < rows; i += 1) {
      const y = horizonY + (i / rows) * (height - horizonY);
      const h = (height - horizonY) / rows;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(122,90,247,0.07)' : 'rgba(122,90,247,0.1)';
      ctx.fillRect(baseX, y, lockerW, h - 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(baseX + lockerW / 2, y + 4);
      ctx.lineTo(baseX + lockerW / 2, y + h - 6);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(baseX + (side < 0 ? lockerW * 0.75 : lockerW * 0.25), y + h / 2, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Пол — сходящиеся к окну линии, лёгкий намёк на перспективу коридора.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(width / 2 + i * (width * 0.09), height);
    ctx.lineTo(width / 2 + i * 6, horizonY + 10);
    ctx.stroke();
  }
}

/** Силуэты столов и подвесных светильников — мягкие, размытые по краям кадра. */
function drawCafeteria(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  // Подвесные светильники сверху.
  for (const t of [0.18, 0.5, 0.82]) {
    const lx = width * t;
    const glow = ctx.createRadialGradient(lx, height * 0.08, 2, lx, height * 0.08, width * 0.16);
    glow.addColorStop(0, 'rgba(255,180,110,0.16)');
    glow.addColorStop(1, 'rgba(255,180,110,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, height * 0.08, width * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, height * 0.05);
    ctx.stroke();
  }

  // Столы у нижних краёв — размытые прямоугольники, персонаж их не заслоняет
  // только у самого низа кадра, где всё равно перекрыто диалоговым окном.
  ctx.fillStyle = 'rgba(255,159,90,0.08)';
  for (const side of [-1, 1] as const) {
    const tx = width / 2 + side * width * 0.42;
    ctx.beginPath();
    ctx.ellipse(tx, height * 0.86, width * 0.16, height * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(tx - width * 0.1, height * 0.68, width * 0.2, height * 0.16);
    ctx.fillStyle = 'rgba(255,159,90,0.08)';
  }
}

/** Ночной город снизу, крупная луна и плотное звёздное небо — крыша общаги. */
function drawRooftop(ctx: CanvasRenderingContext2D, width: number, height: number, phase: number): void {
  // Луна — мягкое световое пятно в верхней трети.
  const moon = ctx.createRadialGradient(width * 0.78, height * 0.14, 2, width * 0.78, height * 0.14, width * 0.22);
  moon.addColorStop(0, 'rgba(255,244,214,0.5)');
  moon.addColorStop(0.4, 'rgba(255,244,214,0.14)');
  moon.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(width * 0.78, height * 0.14, width * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,235,0.75)';
  ctx.beginPath();
  ctx.arc(width * 0.78, height * 0.14, width * 0.045, 0, Math.PI * 2);
  ctx.fill();

  // Плотные звёзды — детерминированные, мерцают независимо от общего боке.
  for (let i = 0; i < 24; i += 1) {
    const seedX = Math.abs(Math.sin(i * 45.1) * 22222.7) % 1;
    const seedY = Math.abs(Math.sin(i * 91.7) * 9631.3) % 1;
    const x = seedX * width;
    const y = seedY * height * 0.45;
    const twinkle = 0.4 + 0.5 * Math.abs(Math.sin(phase * 1.6 + i * 5));
    ctx.globalAlpha = twinkle * 0.7;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, i % 5 === 0 ? 1.6 : 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Силуэт вентиляционной шахты слева — тот самый «бортик» из сюжета.
  ctx.fillStyle = 'rgba(10,15,30,0.55)';
  ctx.fillRect(width * 0.04, height * 0.58, width * 0.16, height * 0.3);
  ctx.fillRect(width * 0.05, height * 0.5, width * 0.14, height * 0.1);

  // Городской силуэт по нижнему краю — тёмные прямоугольники разной высоты.
  const buildingCount = 10;
  ctx.fillStyle = 'rgba(6,10,24,0.75)';
  for (let i = 0; i < buildingCount; i += 1) {
    const seed = Math.abs(Math.sin(i * 17.3) * 5432.1) % 1;
    const w = width / buildingCount;
    const h = height * (0.06 + seed * 0.12);
    ctx.fillRect(i * w, height - h, w - 2, h);
    if (seed > 0.5) {
      ctx.fillStyle = 'rgba(255,209,102,0.18)';
      ctx.fillRect(i * w + w * 0.3, height - h + h * 0.3, w * 0.15, w * 0.15);
      ctx.fillStyle = 'rgba(6,10,24,0.75)';
    }
  }
}

/** Телескоп, круговая звёздная карта на стене и тёплое свечение экрана — кружок астрономии. */
function drawObservatory(ctx: CanvasRenderingContext2D, width: number, height: number, phase: number): void {
  // Звёздная карта — кольцо с делениями на стене, за спиной у персонажа.
  const chartX = width * 0.82;
  const chartY = height * 0.2;
  const chartR = width * 0.14;
  ctx.strokeStyle = 'rgba(127,216,255,0.16)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(chartX, chartY, chartR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(chartX, chartY, chartR * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(chartX + Math.cos(a) * chartR * 0.92, chartY + Math.sin(a) * chartR * 0.92);
    ctx.lineTo(chartX + Math.cos(a) * chartR, chartY + Math.sin(a) * chartR);
    ctx.stroke();
  }

  // Телескоп — тёмный тубус по диагонали слева, на треноге.
  ctx.save();
  ctx.translate(width * 0.12, height * 0.68);
  ctx.rotate(-0.6);
  ctx.fillStyle = 'rgba(8,6,18,0.6)';
  ctx.fillRect(-10, -70, 20, 90);
  ctx.fillStyle = 'rgba(127,216,255,0.12)';
  ctx.fillRect(-10, -70, 20, 8);
  ctx.restore();
  ctx.strokeStyle = 'rgba(8,6,18,0.6)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(width * 0.12, height * 0.82);
  ctx.lineTo(width * 0.06, height * 0.95);
  ctx.moveTo(width * 0.12, height * 0.82);
  ctx.lineTo(width * 0.12, height * 0.96);
  ctx.moveTo(width * 0.12, height * 0.82);
  ctx.lineTo(width * 0.18, height * 0.95);
  ctx.stroke();

  // Свечение экрана снизу — тёплое пятно у нижнего края, как включённый монитор.
  const screen = ctx.createRadialGradient(width * 0.5, height * 0.98, 4, width * 0.5, height * 0.98, width * 0.35);
  screen.addColorStop(0, 'rgba(127,216,255,0.14)');
  screen.addColorStop(1, 'rgba(127,216,255,0)');
  ctx.fillStyle = screen;
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.98, width * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Редкие дальние звёзды сквозь «окно купола».
  for (let i = 0; i < 14; i += 1) {
    const seedX = Math.abs(Math.sin(i * 33.9) * 7777.7) % 1;
    const seedY = Math.abs(Math.sin(i * 61.3) * 4321.9) % 1;
    const twinkle = 0.4 + 0.4 * Math.abs(Math.sin(phase * 1.4 + i * 4));
    ctx.globalAlpha = twinkle * 0.6;
    ctx.fillStyle = '#dff2ff';
    ctx.beginPath();
    ctx.arc(seedX * width, seedY * height * 0.4, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Детерминированные псевдослучайные огоньки — без Math.random() в кадре. */
function drawBokeh(ctx: CanvasRenderingContext2D, width: number, height: number, phase: number, accent: string): void {
  const count = 16;
  for (let i = 0; i < count; i += 1) {
    const seedX = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const seedY = Math.abs(Math.sin(i * 78.233) * 12543.123) % 1;
    const speed = 8 + (i % 4) * 5;
    const x = seedX * width;
    const y = height - ((phase * speed + seedY * height) % (height + 40));
    const r = 2.4 + (i % 3) * 1.8;
    const twinkle = 0.5 + 0.5 * Math.sin(phase * 1.2 + i * 3);
    ctx.globalAlpha = 0.12 + 0.1 * twinkle;
    ctx.fillStyle = i % 3 === 0 ? accent : '#ff9fc4';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
