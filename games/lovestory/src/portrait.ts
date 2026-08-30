/**
 * Портрет персонажа — примитивами, без единой картинки (тот же принцип, что
 * и в остальных играх студии), но здесь это витрина жанра — от привлекательности
 * персонажей напрямую зависит, захочет ли игрок вернуться. Поэтому в отличие
 * от силуэтов противников в других играх студии тут в ход идут градиенты,
 * многослойные волосы и анимешные глаза, а не плоская заливка.
 *
 * Спроектирован на «канонический» размер 200px по высоте головы+плеч,
 * масштабируется под любой запрошенный размер.
 */

import { roundRect } from '@yg/engine';
import type { CharacterDef, FaceShape, HairStyle } from './characters';
import type { Expression } from './story';

/** Женский пресет (крупные глаза, румяна, розовые губы) читался одинаково на
 * всех — этот флаг задаёт мужской вариант черт, чтобы парни выглядели парнями. */
const isMale = (c: CharacterDef): boolean => c.gender === 'male';

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

const darken = (hex: string, amount: number): string => lighten(hex, -amount);

/**
 * Силуэт лица. Женский — мягкий, с заострённым подбородком («сердечком»).
 * Мужской ветвится дальше на `FaceShape` — иначе все парни делят один контур
 * и различаются только цветом, а форма лица считывается сильнее, чем палитра.
 */
const MALE_FACE_SHAPES: Record<FaceShape, readonly [number, number, number, number, number, number, number, number, number, number, number, number]> = {
  // [верхняя ширина, начало сужения Y, ширина скул, Y скул, конец кривой к подбородку X, конец Y,
  //  подбородок X (внутр.), подбородок Y] — используются попарно как зеркальные control points.
  // Широкая, обрубленный подбородок — атлетичный типаж (Артём).
  square: [52, -64, 66, -4, 60, 22, 57, 44, 42, 60, 18, 66],
  // Узкое, вытянутое лицо — утончённый типаж (Даниил).
  lean: [42, -66, 54, -2, 48, 26, 45, 48, 32, 66, 14, 72],
  // Мягкие полные щёки, короче по высоте — дружелюбный типаж (Руслан).
  round: [54, -62, 68, 2, 58, 28, 52, 50, 34, 64, 16, 68],
  // Высокие скулы, острый подбородок — драматичный типаж (Лев).
  sharp: [50, -64, 64, -10, 56, 16, 50, 38, 34, 58, 12, 70],
};

function faceOutline(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  male: boolean,
  shape: FaceShape = 'square',
): void {
  if (male) {
    const [c1x, c1y, c2x, c2y, c3x, c3y, c4x, c4y, c5x, c5y, c6x, c6y] = MALE_FACE_SHAPES[shape];
    ctx.beginPath();
    ctx.moveTo(cx, cy - 66 * s);
    ctx.bezierCurveTo(cx + c1x * s, cy + c1y * s, cx + c2x * s, cy + c2y * s, cx + c3x * s, cy + c3y * s);
    ctx.bezierCurveTo(cx + c4x * s, cy + c4y * s, cx + c5x * s, cy + c5y * s, cx + c6x * s, cy + c6y * s);
    ctx.bezierCurveTo(cx + c6x * 0.44 * s, cy + (c6y + 3) * s, cx - c6x * 0.44 * s, cy + (c6y + 3) * s, cx - c6x * s, cy + c6y * s);
    ctx.bezierCurveTo(cx - c4x * s, cy + c4y * s, cx - c5x * s, cy + c5y * s, cx - c3x * s, cy + c3y * s);
    ctx.bezierCurveTo(cx - c2x * s, cy + c2y * s, cx - c1x * s, cy + c1y * s, cx, cy - 66 * s);
    ctx.closePath();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy - 66 * s);
  ctx.bezierCurveTo(cx + 50 * s, cy - 64 * s, cx + 63 * s, cy - 8 * s, cx + 57 * s, cy + 18 * s);
  ctx.bezierCurveTo(cx + 53 * s, cy + 46 * s, cx + 30 * s, cy + 69 * s, cx, cy + 71 * s);
  ctx.bezierCurveTo(cx - 30 * s, cy + 69 * s, cx - 53 * s, cy + 46 * s, cx - 57 * s, cy + 18 * s);
  ctx.bezierCurveTo(cx - 63 * s, cy - 8 * s, cx - 50 * s, cy - 64 * s, cx, cy - 66 * s);
  ctx.closePath();
}

export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  c: CharacterDef,
  expression: Expression = 'neutral',
  blink = false,
): void {
  const s = size / 200;
  const male = isMale(c);

  // Мягкое световое пятно позади персонажа — отделяет его от фона и придаёт
  // сцене «студийный свет», а не плоский силуэт на фоне.
  const halo = ctx.createRadialGradient(cx, cy - 10 * s, 10 * s, cx, cy - 10 * s, 120 * s);
  halo.addColorStop(0, 'rgba(255,209,102,0.16)');
  halo.addColorStop(1, 'rgba(255,209,102,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy - 10 * s, 120 * s, 0, Math.PI * 2);
  ctx.fill();

  // Плечи/воротник — ширина зависит от комплекции персонажа, крой — от outfitStyle.
  const b = c.build;
  drawOutfit(ctx, cx, cy, s, b, c);

  // Волосы — задний слой с лёгким градиентом (темнее к краю, чуть светлее у макушки).
  // 'long' даёт заметно более крупную массу волос, доходящую до плеч.
  // 'undercut' его вовсе пропускает: бритые виски — это кожа головы, а не
  // волосы другого силуэта, так что задний слой здесь просто нечему рисовать.
  if (c.hairStyle !== 'undercut') {
    const hairMassY = c.hairStyle === 'long' ? cy + 6 * s : cy - 8 * s;
    const hairMassRy = c.hairStyle === 'long' ? 118 * s : 96 * s;
    const hairBackGrad = ctx.createRadialGradient(cx, cy - 40 * s, 10 * s, cx, hairMassY, 100 * s);
    hairBackGrad.addColorStop(0, lighten(c.hairDark, 22));
    hairBackGrad.addColorStop(1, c.hairDark);
    ctx.fillStyle = hairBackGrad;
    ctx.beginPath();
    ctx.ellipse(cx, hairMassY, 80 * s, hairMassRy, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Шея — поверх заднего слоя волос, но до головы, чья нижняя дуга перекроет
  // её верх и даст плавный переход без видимого шва. Градиент вместо плоского
  // тона: свет слева, тень справа — та же светотень, что и на лице выше,
  // без него шея на стыке с лицом выглядит вырезанной из другого материала.
  const neckGrad = ctx.createLinearGradient(cx - 15 * s, cy, cx + 15 * s, cy);
  neckGrad.addColorStop(0, darken(c.skin, 4));
  neckGrad.addColorStop(1, darken(c.skin, 16));
  ctx.fillStyle = neckGrad;
  roundRect(ctx, cx - 15 * s, cy + 50 * s, 30 * s, 55 * s, 6 * s);
  ctx.fill();

  // Голова — форма лица + мягкий градиент светотени (свет слева-сверху).
  const skinGrad = ctx.createRadialGradient(cx - 18 * s, cy - 24 * s, 6 * s, cx, cy + 4 * s, 90 * s);
  skinGrad.addColorStop(0, lighten(c.skin, 14));
  skinGrad.addColorStop(1, darken(c.skin, 6));
  ctx.fillStyle = skinGrad;
  faceOutline(ctx, cx, cy, s, male, c.faceShape);
  ctx.fill();

  // Дополнительные зоны светотени поверх базового градиента — одного радиального
  // пятна достаточно для плоской заливки, но не для рельефа. Клипуем каждую
  // по контуру лица, иначе блик/тень вылезут за силуэт на скруглениях.
  ctx.save();
  faceOutline(ctx, cx, cy, s, male, c.faceShape);
  ctx.clip();

  // Блик на лбу — свет сверху-слева задевает выступ надбровных дуг.
  const foreheadGlow = ctx.createRadialGradient(cx - 10 * s, cy - 46 * s, 2 * s, cx - 10 * s, cy - 46 * s, 34 * s);
  foreheadGlow.addColorStop(0, `rgba(255,255,255,${male ? 0.12 : 0.16})`);
  foreheadGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = foreheadGlow;
  ctx.beginPath();
  ctx.arc(cx - 10 * s, cy - 46 * s, 34 * s, 0, Math.PI * 2);
  ctx.fill();

  // Тень скулы с теневой стороны (справа) — контур скулы отделяется от щеки,
  // без него лицо читается как один плоский овал вне зависимости от формы.
  const cheekShade = ctx.createRadialGradient(cx + 38 * s, cy + 10 * s, 4 * s, cx + 38 * s, cy + 10 * s, 42 * s);
  cheekShade.addColorStop(0, `rgba(0,0,0,${male ? 0.1 : 0.07})`);
  cheekShade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cheekShade;
  ctx.beginPath();
  ctx.arc(cx + 38 * s, cy + 10 * s, 42 * s, 0, Math.PI * 2);
  ctx.fill();

  // Тёплый рефлекс на подбородке — отражённый от одежды/шеи свет снизу,
  // частая деталь портретной светотени, которую плоская заливка не даёт.
  const chinBounce = ctx.createRadialGradient(cx, cy + 52 * s, 2 * s, cx, cy + 52 * s, 30 * s);
  chinBounce.addColorStop(0, `rgba(255,200,150,0.1)`);
  chinBounce.addColorStop(1, 'rgba(255,200,150,0)');
  ctx.fillStyle = chinBounce;
  ctx.beginPath();
  ctx.arc(cx, cy + 52 * s, 30 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  if (male) {
    // Тень скулы/челюсти — лёгкий контур вдоль нижнего края лица, добавляет
    // рельеф без бороды. У девушек этой тени нет — мягкая светотень достаточна.
    // Повторяет ту же геометрию, что и faceOutline для этой формы лица —
    // иначе тень «плавает» над контуром вместо того, чтобы лечь вдоль него.
    const [, , , , , , jawX, jawY, , , chinX, chinY] = MALE_FACE_SHAPES[c.faceShape];
    ctx.strokeStyle = darken(c.skin, 26);
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 2.5 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - jawX * s, cy + jawY * s);
    ctx.quadraticCurveTo(cx - chinX * 0.5 * s, cy + (chinY + 2) * s, cx, cy + chinY * s);
    ctx.quadraticCurveTo(cx + chinX * 0.5 * s, cy + (chinY + 2) * s, cx + jawX * s, cy + jawY * s);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Уши — градиент вместо плоской заливки плюс внутренняя складка (завиток),
  // без неё ухо читается как гладкая нашлёпка, а не орган со своим рельефом.
  for (const dir of [-1, 1] as const) {
    const ex = cx + dir * 58 * s;
    const ey = cy + 4 * s;
    const earGrad = ctx.createRadialGradient(ex - dir * 2 * s, ey - 3 * s, 1 * s, ex, ey, 12 * s);
    earGrad.addColorStop(0, lighten(c.skin, 8));
    earGrad.addColorStop(1, darken(c.skin, 8));
    ctx.fillStyle = earGrad;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 7 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = darken(c.skin, 20);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - dir * 2 * s, ey - 6 * s);
    ctx.quadraticCurveTo(ex + dir * 2 * s, ey - 1 * s, ex - dir * 1 * s, ey + 5 * s);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (c.hairStyle === 'undercut') {
    // Бритые виски уже видны как кожа головы (задний слой волос для этого
    // стиля вообще не рисуется) — здесь только лёгкая штриховка щетины,
    // чтобы висок читался как свежевыбритый, а не просто голая кожа.
    ctx.strokeStyle = darken(c.skin, 22);
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 0.8 * s;
    ctx.lineCap = 'round';
    for (const dir of [-1, 1] as const) {
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(cx + dir * (56 + i * 4) * s, cy - 30 * s);
        ctx.lineTo(cx + dir * (56 + i * 4) * s, cy - 12 * s);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Румянец — сильнее при смущении, лёгкий при улыбке/смехе. У парней —
  // только лёгкий след при смущении: сплошные розовые щёки читаются как
  // макияж и стирают разницу между мужским и женским лицом.
  const blushExpressions = male ? ['shy'] : ['shy', 'smile', 'laugh'];
  if (blushExpressions.includes(expression)) {
    const blushAlpha = expression === 'shy' ? (male ? 0.22 : 0.4) : 0.2;
    for (const dir of [-1, 1] as const) {
      const bg = ctx.createRadialGradient(cx + dir * 36 * s, cy + 22 * s, 1 * s, cx + dir * 36 * s, cy + 22 * s, 16 * s);
      bg.addColorStop(0, `rgba(255,110,150,${blushAlpha})`);
      bg.addColorStop(1, 'rgba(255,110,150,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx + dir * 36 * s, cy + 22 * s, 16 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawEyes(ctx, cx, cy, s, c.eyes, expression, blink, male);
  drawBrows(ctx, cx, cy, s, c.hair, expression, male);
  drawMouth(ctx, cx, cy, s, expression, male);
  drawNose(ctx, cx, cy, s, c.skin);
  if (c.accessory === 'glasses') drawGlasses(ctx, cx, cy, s);
  if (c.accessory === 'beautyMark') drawBeautyMark(ctx, cx, cy, s);
  if (c.accessory === 'scar') drawScar(ctx, cx, cy, s, c.skin);
  drawHairFront(ctx, cx, cy, s, c.hair, c.hairDark, c.hairStyle);
  // Серьга — поверх волос: у длинных/боковых причёсок прядь у виска рисуется
  // именно там, где сидит мочка уха, и полностью её закрывает, если рисовать раньше.
  if (c.accessory === 'earring') drawEarring(ctx, cx, cy, s);
}

/** Серьга-гвоздик в одном ухе — читается как «свой» знак даже на миниатюре, где палитра/причёска смазываются в одно пятно. */
function drawEarring(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const ex = cx + 58 * s;
  const ey = cy + 13 * s;
  ctx.save();
  ctx.fillStyle = '#e8ecf4';
  ctx.beginPath();
  ctx.arc(ex, ey, 2.6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(ex - 0.7 * s, ey - 0.7 * s, 0.9 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Родинка у губ — классический «актёрский» штрих, узнаваемый силуэт вне зависимости от ракурса/мимики. */
function drawBeautyMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(60,40,35,0.8)';
  ctx.beginPath();
  ctx.arc(cx + 13 * s, cy + 41 * s, 2.1 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Шрам через бровь — классический «крутого парня» штрих: светлый рубец от брови вниз на скулу. */
function drawScar(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, skin: string): void {
  // Ниже и правее брови, на щеке — там его никогда не перекрывает чёлка
  // или шапка волос, каким бы ни был силуэт причёски сверху.
  const x = cx + 32 * s;
  const y = cy + 6 * s;
  ctx.save();
  ctx.strokeStyle = lighten(skin, 55);
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 2.4 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 5 * s, y - 16 * s);
  ctx.quadraticCurveTo(x + 4 * s, y - 2 * s, x - 3 * s, y + 16 * s);
  ctx.stroke();
  // Тонкая тёмная кромка рядом со светлой линией — придаёт рубцу объём,
  // без неё это просто белая царапина, а не зажившая рана.
  ctx.strokeStyle = darken(skin, 22);
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.1 * s;
  ctx.beginPath();
  ctx.moveTo(x - 2 * s, y - 16 * s);
  ctx.quadraticCurveTo(x + 7 * s, y - 2 * s, x, y + 16 * s);
  ctx.stroke();
  ctx.restore();
}

/** Круглые очки — деталь характера (не только палитры), поверх глаз, под чёлкой. */
function drawGlasses(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const eyeY = cy - 6 * s;
  const dx = 25 * s;
  const r = 13.5 * s;

  ctx.save();
  ctx.strokeStyle = 'rgba(40,32,26,0.85)';
  ctx.lineWidth = 2.2 * s;
  ctx.lineCap = 'round';

  for (const dir of [-1, 1] as const) {
    const ex = cx + dir * dx;
    ctx.beginPath();
    ctx.arc(ex, eyeY, r, 0, Math.PI * 2);
    ctx.stroke();
    // Лёгкий блик на стекле — иначе оправа выглядит пустой рамкой.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(ex - r * 0.35, eyeY - r * 0.35, r * 0.4, r * 0.22, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Переносица — короткая перемычка между стёклами.
  ctx.beginPath();
  ctx.moveTo(cx - dx + r, eyeY - 1 * s);
  ctx.lineTo(cx + dx - r, eyeY - 1 * s);
  ctx.stroke();

  // Дужки к вискам.
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * (dx + r), eyeY - 1 * s);
    ctx.lineTo(cx + dir * (dx + r + 10 * s), eyeY - 4 * s);
    ctx.stroke();
  }
  ctx.restore();
}

/** Плечи/воротник — крой различается по outfitStyle, ширина — по комплекции build. */
function drawOutfit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  b: number,
  c: CharacterDef,
): void {
  const outfitGrad = ctx.createLinearGradient(cx, cy + 86 * s, cx, cy + 210 * s);
  outfitGrad.addColorStop(0, c.outfit);
  outfitGrad.addColorStop(1, c.outfitDark);

  // Капюшон худи — рисуется до плеч, чтобы воротник лёг поверх его основания.
  if (c.outfitStyle === 'hoodie') {
    ctx.fillStyle = c.outfitDark;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 96 * s, 68 * s * b, 40 * s, 0, Math.PI, 0);
    ctx.fill();
  }

  ctx.fillStyle = c.outfitDark;
  ctx.beginPath();
  ctx.moveTo(cx - 72 * s * b, cy + 132 * s);
  ctx.quadraticCurveTo(cx, cy + 92 * s, cx + 72 * s * b, cy + 132 * s);
  ctx.lineTo(cx + 95 * s * b, cy + 210 * s);
  ctx.lineTo(cx - 95 * s * b, cy + 210 * s);
  ctx.closePath();
  ctx.fill();

  const bodyPath = new Path2D();
  bodyPath.moveTo(cx - 56 * s * b, cy + 120 * s);
  bodyPath.quadraticCurveTo(cx, cy + 86 * s, cx + 56 * s * b, cy + 120 * s);
  bodyPath.lineTo(cx + 78 * s * b, cy + 210 * s);
  bodyPath.lineTo(cx - 78 * s * b, cy + 210 * s);
  bodyPath.closePath();
  ctx.fillStyle = outfitGrad;
  ctx.fill(bodyPath);

  // Складки ткани поверх заливки — без них одежда выглядит как крашеный
  // картон. Клипуем по силуэту тела, чтобы блик/тень не вылезли за плечи.
  ctx.save();
  ctx.clip(bodyPath);

  // Блик на плечах — свет сверху задевает самую высокую точку силуэта.
  for (const dir of [-1, 1] as const) {
    const shoulderGlow = ctx.createRadialGradient(
      cx + dir * 40 * s * b, cy + 108 * s, 2 * s,
      cx + dir * 40 * s * b, cy + 108 * s, 36 * s,
    );
    shoulderGlow.addColorStop(0, 'rgba(255,255,255,0.16)');
    shoulderGlow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shoulderGlow;
    ctx.beginPath();
    ctx.arc(cx + dir * 40 * s * b, cy + 108 * s, 36 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Диагональные складки-тени от плеч к центру — classic drape, читается как
  // мятая/облегающая ткань, а не гладкий пластик.
  ctx.strokeStyle = darken(c.outfit, 22);
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 3 * s;
  ctx.lineCap = 'round';
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * 50 * s * b, cy + 128 * s);
    ctx.quadraticCurveTo(cx + dir * 30 * s * b, cy + 155 * s, cx + dir * 42 * s * b, cy + 190 * s);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Тень под воротником — короткая дуга, отделяет плечи от груди, даёт
  // ощущение, что ткань драпируется, а не сидит одной плоскостью.
  ctx.strokeStyle = darken(c.outfit, 18);
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.arc(cx, cy + 96 * s, 34 * s * b, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();

  if (c.outfitStyle === 'jacket') {
    // Открытый воротник курткой — два треугольных отворота у горла.
    ctx.fillStyle = darken(c.outfit, 30);
    for (const dir of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * 6 * s, cy + 90 * s);
      ctx.lineTo(cx + dir * 30 * s, cy + 100 * s);
      ctx.lineTo(cx + dir * 14 * s, cy + 128 * s);
      ctx.closePath();
      ctx.fill();
    }
    // Молния по центру.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 108 * s);
    ctx.lineTo(cx, cy + 195 * s);
    ctx.stroke();
  } else if (c.outfitStyle === 'hoodie') {
    // Шнурки капюшона — две короткие завязки у горла.
    ctx.strokeStyle = lighten(c.outfit, 40);
    ctx.lineWidth = 2.2 * s;
    ctx.lineCap = 'round';
    for (const dir of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * 8 * s, cy + 108 * s);
      ctx.lineTo(cx + dir * 6 * s, cy + 128 * s);
      ctx.stroke();
    }
  }
}

/**
 * Нос — переносица, крылья и кончик, а не два штриха. Всё контурными
 * тенями/бликами без заливки: сплошной силуэт носа «взрослит» лицо сильнее
 * любой другой детали, а тень+блик дают объём, оставаясь лёгкими.
 */
function drawNose(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, skin: string): void {
  ctx.save();

  // Переносица — мягкий блик по левому краю спинки носа (свет слева-сверху,
  // тот же источник, что и у общего градиента лица).
  ctx.strokeStyle = lighten(skin, 20);
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.4 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 3 * s, cy - 2 * s);
  ctx.quadraticCurveTo(cx - 4 * s, cy + 8 * s, cx - 2.5 * s, cy + 15 * s);
  ctx.stroke();

  // Теневая сторона спинки — справа, там же, где скула уходит в тень.
  ctx.strokeStyle = darken(skin, 16);
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  ctx.moveTo(cx + 1 * s, cy - 1 * s);
  ctx.quadraticCurveTo(cx + 2 * s, cy + 9 * s, cx + 1.5 * s, cy + 16 * s);
  ctx.stroke();

  // Кончик — короткая тень снизу, задаёт границу перед губой.
  ctx.strokeStyle = darken(skin, 24);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(cx - 3 * s, cy + 18 * s);
  ctx.quadraticCurveTo(cx, cy + 21 * s, cx + 2.5 * s, cy + 17.5 * s);
  ctx.stroke();

  // Крылья носа — пара коротких теней-«запятых», без них кончик висит в
  // воздухе без опоры на лицо.
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = 1.1 * s;
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * 2 * s, cy + 15 * s);
    ctx.quadraticCurveTo(cx + dir * 5.5 * s, cy + 18 * s, cx + dir * 4 * s, cy + 20.5 * s);
    ctx.stroke();
  }

  // Блик на кончике — маленькое светлое пятно, последний штрих объёма.
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = lighten(skin, 24);
  ctx.beginPath();
  ctx.ellipse(cx - 0.5 * s, cy + 16.5 * s, 2 * s, 1.3 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  color: string,
  expression: Expression,
  blink: boolean,
  male: boolean,
): void {
  const eyeY = cy - 6 * s;
  const dx = 25 * s;
  // Мужской глаз — уже (меньше по ширине белка) и без «сверкающего» второго
  // блика и стрелки-реснички: те два приёма сильнее всего читаются как макияж.
  const widthMul = male ? 0.66 : 0.8;

  for (const dir of [-1, 1] as const) {
    const ex = cx + dir * dx;

    if (blink || expression === 'laugh') {
      ctx.strokeStyle = '#2a2230';
      ctx.lineWidth = 2.6 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, eyeY, 10 * s, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      continue;
    }

    if (expression === 'shy') {
      ctx.strokeStyle = '#2a2230';
      ctx.lineWidth = 2.6 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, eyeY, 9 * s, 0.18 * Math.PI, 0.82 * Math.PI);
      ctx.stroke();
      continue;
    }

    const r = expression === 'surprised' ? 12.5 * s : 10.5 * s;

    // Белок с лёгкой тенью сверху (веко) — иначе глаз выглядит «выпученным».
    ctx.fillStyle = '#fffaf5';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, r * widthMul, r, 0, 0, Math.PI * 2);
    ctx.fill();

    // Радужка — градиент от тёмного края к цвету глаз, крупная, «анимешная».
    const irisR = r * 0.62;
    const iris = ctx.createRadialGradient(ex, eyeY + r * 0.1, irisR * 0.15, ex, eyeY + r * 0.1, irisR);
    iris.addColorStop(0, lighten(color, 40));
    iris.addColorStop(0.55, color);
    iris.addColorStop(1, darken(color, 40));
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(ex, eyeY + r * 0.1, irisR, 0, Math.PI * 2);
    ctx.fill();

    // Радиальные штрихи радужки — тонкая текстура вместо однотонного диска,
    // главное отличие «настоящего» глаза от закрашенного кружка. Чередуем
    // тёмные/светлые для лёгкой рябi, не ровным веером — так не похоже на
    // штрих-код.
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, eyeY + r * 0.1, irisR, 0, Math.PI * 2);
    ctx.clip();
    const spokes = 10;
    for (let i = 0; i < spokes; i += 1) {
      const a = (Math.PI * 2 * i) / spokes + (i % 2) * 0.12;
      const dark = i % 3 === 0;
      ctx.strokeStyle = dark ? darken(color, 46) : lighten(color, 26);
      ctx.globalAlpha = dark ? 0.28 : 0.22;
      ctx.lineWidth = irisR * 0.1;
      ctx.beginPath();
      ctx.moveTo(ex, eyeY + r * 0.1);
      ctx.lineTo(ex + Math.cos(a) * irisR * 1.1, eyeY + r * 0.1 + Math.sin(a) * irisR * 1.1);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#160f18';
    ctx.beginPath();
    ctx.arc(ex, eyeY + r * 0.14, irisR * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // Блик: у парней один, у девушек два (крупный сверху-слева + маленький
    // снизу-справа) — двойной блик усиливает «сверкающий» девичий взгляд.
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(ex - irisR * 0.32, eyeY - r * 0.18, irisR * 0.3, 0, Math.PI * 2);
    ctx.fill();
    if (!male) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(ex + irisR * 0.35, eyeY + r * 0.42, irisR * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }

    // Верхнее веко — толстая дуга, нижнее — тоньше и короче (классический анимешный приём).
    ctx.strokeStyle = '#241a26';
    ctx.lineWidth = 2.4 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(ex, eyeY, r * widthMul, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.lineWidth = 1.3 * s;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(ex, eyeY, r * widthMul, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (!male) {
      // Ресничка «стрелкой» у внешнего уголка — лёгкий штрих, не контур целиком.
      const flick = dir * r * 0.28;
      ctx.strokeStyle = '#241a26';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(ex + dir * r * 0.78, eyeY - r * 0.35);
      ctx.lineTo(ex + dir * r * 0.78 + flick, eyeY - r * 0.65);
      ctx.stroke();
    }
  }
}

function drawBrows(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  hairColor: string,
  expression: Expression,
  male: boolean,
): void {
  // Мужская бровь — толще, темнее и ближе к глазу, почти без изгиба: тонкая
  // высокая дуга — самый «женский» из всех штрихов лица.
  ctx.strokeStyle = darken(hairColor, male ? 24 : 12);
  ctx.lineWidth = (male ? 3.6 : 2.6) * s;
  ctx.lineCap = 'round';
  const raise = expression === 'surprised' ? 4 * s : 0;
  const browY = cy - (male ? 22 : 26) * s - raise;
  const arch = male ? 1 * s : 3 * s;

  for (const dir of [-1, 1] as const) {
    const bx = cx + dir * 25 * s;
    const tilt = expression === 'sad' ? dir * 3 * s : 0;
    // Лёгкая дуга вместо прямой линии — иначе брови читаются как «сердитые».
    ctx.beginPath();
    ctx.moveTo(bx - 10 * s, browY + tilt * 0.4);
    ctx.quadraticCurveTo(bx, browY - arch - tilt * 0.3, bx + 10 * s, browY + tilt);
    ctx.stroke();
  }
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  expression: Expression,
  male: boolean,
): void {
  const my = cy + 34 * s;
  // Розовая «помада» — женский цвет; у мужчин — нейтральный тон кожи губ,
  // без розового оттенка, и линия тоньше.
  const lip = male ? '#a8695f' : '#c96f7e';
  ctx.strokeStyle = lip;
  ctx.fillStyle = lip;
  ctx.lineWidth = (male ? 2 : 2.4) * s;
  ctx.lineCap = 'round';

  switch (expression) {
    case 'smile': {
      const r = male ? 13 * s : 15 * s;
      ctx.beginPath();
      ctx.arc(cx, my - 7 * s, r, 0.16 * Math.PI, 0.84 * Math.PI);
      ctx.stroke();
      drawLipVolume(ctx, cx, my, r, s, lip);
      return;
    }
    case 'laugh':
      ctx.beginPath();
      ctx.ellipse(cx, my, 12 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(cx, my - 2 * s, 8 * s, 3.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'surprised':
      ctx.beginPath();
      ctx.ellipse(cx, my, 6 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'shy':
      ctx.beginPath();
      ctx.arc(cx, my - 5 * s, 8 * s, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      return;
    case 'sad':
      ctx.beginPath();
      ctx.arc(cx, my + 7 * s, 13 * s, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      return;
    default:
      ctx.beginPath();
      ctx.moveTo(cx - 8 * s, my);
      ctx.quadraticCurveTo(cx, my + 1.5 * s, cx + 8 * s, my);
      ctx.stroke();
      drawLipVolume(ctx, cx, my, 9 * s, s, lip);
  }
}

/**
 * Тень над линией рта (граница верхней губы) и блик под ней (сочная нижняя
 * губа) — на плоской заливке рот читается как царапина, эти два штриха дают
 * ему объём без утолщения самой линии.
 */
function drawLipVolume(ctx: CanvasRenderingContext2D, cx: number, my: number, r: number, s: number, lip: string): void {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = darken(lip, 30);
  ctx.lineWidth = 1 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, my - 7 * s, r * 0.72, 0.22 * Math.PI, 0.78 * Math.PI);
  ctx.stroke();

  ctx.globalAlpha = 0.3;
  ctx.fillStyle = lighten(lip, 40);
  ctx.beginPath();
  ctx.ellipse(cx, my + 2.5 * s, r * 0.34, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Чёлка и боковые пряди — рисуются поверх всего лица, силуэт зависит от hairStyle. */
function drawHairFront(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  hair: string,
  hairDark: string,
  style: HairStyle,
): void {
  const grad = ctx.createLinearGradient(cx, cy - 78 * s, cx, cy - 20 * s);
  grad.addColorStop(0, lighten(hair, 12));
  grad.addColorStop(1, hair);
  ctx.fillStyle = grad;

  if (style === 'curly') {
    // Плотные завитки — кластер перекрывающихся кругов вместо гладкого
    // силуэта чёлки. Смещения детерминированные (не Math.random в рендере),
    // но неравномерные по размеру/высоте — иначе «завитки» читаются как
    // ровный ряд шариков, а не текстура волос.
    const bumps: Array<[number, number, number]> = [
      [-52, -46, 19],
      [-34, -66, 21],
      [-12, -76, 22],
      [12, -76, 22],
      [34, -66, 21],
      [52, -46, 19],
      [-44, -20, 17],
      [44, -20, 17],
    ];
    for (const [bx, by, br] of bumps) {
      const x = cx + bx * s;
      const y = cy + by * s;
      const r = br * s;
      const bumpGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.15, x, y, r);
      bumpGrad.addColorStop(0, lighten(hair, 16));
      bumpGrad.addColorStop(1, hairDark);
      ctx.fillStyle = bumpGrad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Пара завитков спускается на виски — тот же приём, что боковые пряди
    // у других причёсок, но круглый, а не вытянутый.
    for (const dir of [-1, 1] as const) {
      const x = cx + dir * 58 * s;
      const y = cy + 2 * s;
      const bumpGrad = ctx.createRadialGradient(x - dir * 4 * s, y - 5 * s, 2 * s, x, y, 15 * s);
      bumpGrad.addColorStop(0, lighten(hair, 10));
      bumpGrad.addColorStop(1, hairDark);
      ctx.fillStyle = bumpGrad;
      ctx.beginPath();
      ctx.arc(x, y, 15 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (style === 'undercut') {
    // Растрёпанный верх торчком — рваный зигзаг прямыми отрезками, а не
    // гладкая кривая: единственный силуэт в игре без единой плавной дуги,
    // сразу читается как «резкий», даже не разглядывая цвет или лицо.
    ctx.beginPath();
    ctx.moveTo(cx - 40 * s, cy - 24 * s);
    ctx.lineTo(cx - 36 * s, cy - 58 * s);
    ctx.lineTo(cx - 22 * s, cy - 40 * s);
    ctx.lineTo(cx - 14 * s, cy - 74 * s);
    ctx.lineTo(cx - 2 * s, cy - 46 * s);
    ctx.lineTo(cx + 10 * s, cy - 80 * s);
    ctx.lineTo(cx + 20 * s, cy - 46 * s);
    ctx.lineTo(cx + 32 * s, cy - 66 * s);
    ctx.lineTo(cx + 38 * s, cy - 26 * s);
    ctx.lineTo(cx + 30 * s, cy - 18 * s);
    ctx.lineTo(cx - 30 * s, cy - 18 * s);
    ctx.closePath();
    ctx.fill();

    // Блик на паре прядей — та же идея, что глянец на других причёсках, но
    // короткими прямыми штрихами, а не одной дугой.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.6 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 14 * s, cy - 72 * s);
    ctx.lineTo(cx - 8 * s, cy - 52 * s);
    ctx.moveTo(cx + 10 * s, cy - 78 * s);
    ctx.lineTo(cx + 15 * s, cy - 56 * s);
    ctx.stroke();

    // Линия бритого виска — тонкая тень на границе кожи и короткой щетины,
    // без неё «андеркат» не отличить от просто короткой стрижки.
    ctx.strokeStyle = darken(hair, 30);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.2 * s;
    for (const dir of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * 32 * s, cy - 30 * s);
      ctx.quadraticCurveTo(cx + dir * 40 * s, cy - 8 * s, cx + dir * 34 * s, cy + 10 * s);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (style === 'swept') {
    // Косой пробор: основная масса чёлки уходит на одну сторону (вправо),
    // другая сторона — короче и чище, лоб приоткрыт по диагонали.
    ctx.beginPath();
    ctx.moveTo(cx - 60 * s, cy - 22 * s);
    ctx.quadraticCurveTo(cx - 56 * s, cy - 72 * s, cx - 20 * s, cy - 80 * s);
    ctx.quadraticCurveTo(cx + 20 * s, cy - 86 * s, cx + 60 * s, cy - 30 * s);
    ctx.quadraticCurveTo(cx + 40 * s, cy - 20 * s, cx + 18 * s, cy - 44 * s);
    ctx.quadraticCurveTo(cx - 10 * s, cy - 52 * s, cx - 30 * s, cy - 30 * s);
    ctx.quadraticCurveTo(cx - 46 * s, cy - 20 * s, cx - 60 * s, cy - 22 * s);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'long') {
    // Более длинная, слегка растрёпанная чёлка — заходит ниже, ближе к бровям.
    ctx.beginPath();
    ctx.moveTo(cx - 64 * s, cy - 20 * s);
    ctx.quadraticCurveTo(cx - 60 * s, cy - 76 * s, cx - 24 * s, cy - 82 * s);
    ctx.quadraticCurveTo(cx - 6 * s, cy - 86 * s, cx + 4 * s, cy - 74 * s);
    ctx.quadraticCurveTo(cx + 16 * s, cy - 86 * s, cx + 30 * s, cy - 80 * s);
    ctx.quadraticCurveTo(cx + 60 * s, cy - 74 * s, cx + 64 * s, cy - 20 * s);
    ctx.quadraticCurveTo(cx + 28 * s, cy - 30 * s, cx, cy - 26 * s);
    ctx.quadraticCurveTo(cx - 28 * s, cy - 30 * s, cx - 64 * s, cy - 20 * s);
    ctx.closePath();
    ctx.fill();
  } else {
    // 'short' — гладкая кромка с лёгкой зубчатой текстурой на самой макушке
    // (пара коротких зубцов, не на всём контуре — иначе снова «корона»).
    ctx.beginPath();
    ctx.moveTo(cx - 62 * s, cy - 26 * s);
    ctx.quadraticCurveTo(cx - 58 * s, cy - 74 * s, cx - 30 * s, cy - 78 * s);
    ctx.lineTo(cx - 20 * s, cy - 88 * s);
    ctx.lineTo(cx - 10 * s, cy - 78 * s);
    ctx.quadraticCurveTo(cx, cy - 82 * s, cx + 10 * s, cy - 78 * s);
    ctx.lineTo(cx + 20 * s, cy - 88 * s);
    ctx.lineTo(cx + 30 * s, cy - 78 * s);
    ctx.quadraticCurveTo(cx + 58 * s, cy - 74 * s, cx + 62 * s, cy - 26 * s);
    ctx.quadraticCurveTo(cx + 30 * s, cy - 42 * s, cx, cy - 38 * s);
    ctx.quadraticCurveTo(cx - 30 * s, cy - 42 * s, cx - 62 * s, cy - 26 * s);
    ctx.closePath();
    ctx.fill();
  }

  // Тонкие линии пробора — намёк на отдельные пряди без «зубчатого» контура.
  ctx.strokeStyle = darken(hair, 20);
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.3 * s;
  ctx.lineCap = 'round';
  for (const t of [-0.55, -0.18, 0.18, 0.55] as const) {
    const lx = cx + t * 44 * s;
    ctx.beginPath();
    ctx.moveTo(lx, cy - 78 * s);
    ctx.quadraticCurveTo(lx + t * 6 * s, cy - 56 * s, lx + t * 10 * s, cy - 34 * s);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Блик по верхней кромке чёлки — придаёт волосам глянец, а не мат. Второй,
  // короче и тоньше, южнее первого — один блик читается как пластик, два
  // разной длины — как отдельные пряди, поймавшие свет по-разному.
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.8 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 46 * s, cy - 44 * s);
  ctx.quadraticCurveTo(cx - 16 * s, cy - 78 * s, cx + 6 * s, cy - 76 * s);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  ctx.moveTo(cx + 14 * s, cy - 40 * s);
  ctx.quadraticCurveTo(cx + 24 * s, cy - 60 * s, cx + 34 * s, cy - 58 * s);
  ctx.stroke();

  // Боковые пряди вдоль щёк — 'long' спускается заметно ниже, до плеч.
  const sideLen = style === 'long' ? 92 * s : 48 * s;
  const sideY = style === 'long' ? cy + 28 * s : cy + 6 * s;
  for (const dir of [-1, 1] as const) {
    const sideGrad = ctx.createLinearGradient(cx + dir * 46 * s, cy - 20 * s, cx + dir * 78 * s, sideY + sideLen * 0.6);
    sideGrad.addColorStop(0, hair);
    sideGrad.addColorStop(1, hairDark);
    ctx.fillStyle = sideGrad;
    ctx.beginPath();
    ctx.ellipse(cx + dir * 62 * s, sideY, 15 * s, sideLen, dir * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(cx + dir * 52 * s, cy - 14 * s);
    ctx.quadraticCurveTo(cx + dir * 68 * s, sideY - sideLen * 0.3, cx + dir * 58 * s, sideY + sideLen * 0.7);
    ctx.stroke();
  }
}
