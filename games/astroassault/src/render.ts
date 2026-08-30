/**
 * Отрисовка арены.
 *
 * Всё примитивами: игрок — фигура с ногами/торсом/стволом, враги — силуэты
 * разной формы по типу, кровь и вспышки — движок эффектов студии. Никаких
 * изображений — тот же принцип, что и в остальных играх портфеля.
 *
 * Мир шире экрана, поэтому всё, что имеет мировые координаты (платформы,
 * пули, враги, игрок, частицы), рисуется внутри одного `ctx.translate(-cameraX, 0)`
 * — не нужно вручную вычитать камеру в каждой функции отрисовки. Небо и
 * земля рисуются ДО трансляции: это бесконечный фон, а не часть уровня.
 */

import { Particles, Rings, Shake, roundRect, type Stage } from '@yg/engine';
import type { ArenaSim, Bullet, Enemy, Platform } from './sim';

const ENEMY_COLORS: Record<Enemy['kind'], { body: string; glow: string }> = {
  walker: { body: '#e0245e', glow: '#ff6b9a' },
  runner: { body: '#f6b93b', glow: '#ffd873' },
  shooter: { body: '#2e86de', glow: '#6fb1ff' },
  boss: { body: '#8854d0', glow: '#c9a8ff' },
};

interface WeaponShape {
  /** Длина ствола в игровых px (до масштаба). */
  length: number;
  width: number;
  color: string;
  /** Снайперский прицел сверху. */
  scope?: boolean;
  /** Барабан/магазин под стволом (дробовик). */
  drum?: boolean;
}

/** Силуэт оружия в руках персонажа — каждое держится и целится иначе. */
const WEAPON_SHAPE: Record<string, WeaponShape> = {
  pistol: { length: 22, width: 4, color: '#e8ecf4' },
  smg: { length: 26, width: 4.5, color: '#ffd873', drum: true },
  shotgun: { length: 24, width: 7, color: '#ff9f5a', drum: true },
  sniper: { length: 42, width: 3.5, color: '#6fb1ff', scope: true },
  rocket: { length: 30, width: 9, color: '#f7768e' },
};

export class Renderer {
  readonly particles = new Particles(260);
  readonly rings = new Rings();
  readonly shake = new Shake();
  private lastPlayerX = 0;
  /** Фаза цикла ходьбы — растёт, пока игрок движется, копится независимо от кадровой частоты. */
  private walkPhase = 0;
  private muzzleFlash = 0;
  private bgPhase = 0;

  constructor(private readonly stage: Stage) {}

  spawnHitFx(x: number, y: number, crit: boolean): void {
    this.particles.burst(x, y, {
      count: crit ? 14 : 7,
      colors: crit ? ['#ffd166', '#fff3c4'] : ['#ff6b9a', '#ffffff'],
      speed: 160,
      size: crit ? 3.5 : 2.5,
      life: 0.35,
    });
    if (crit) this.rings.spawn(x, y, '#ffd166', 0.3, 2);
  }

  spawnDeathFx(x: number, y: number, boss: boolean): void {
    this.particles.burst(x, y, {
      count: boss ? 60 : 16,
      colors: ['#ff6b9a', '#ffd166', '#ffffff'],
      speed: boss ? 320 : 190,
      size: boss ? 5 : 3,
      life: boss ? 1.1 : 0.6,
      gravity: 300,
    });
    this.rings.spawn(x, y, '#ffffff', boss ? 0.6 : 0.35, boss ? 4 : 2);
    if (boss) this.shake.kick(16);
  }

  spawnPlayerHitFx(x: number, y: number): void {
    this.particles.burst(x, y, { count: 10, colors: ['#ff3b5c', '#ffffff'], speed: 140, size: 3, life: 0.4 });
    this.shake.kick(6);
  }

  spawnExplosionFx(x: number, y: number): void {
    this.particles.burst(x, y, {
      count: 34,
      colors: ['#ffd166', '#ff9f5a', '#ffffff'],
      speed: 240,
      size: 4.5,
      life: 0.6,
      gravity: 100,
    });
    this.rings.spawn(x, y, '#ff9f5a', 0.4, 4);
    this.shake.kick(10);
  }

  triggerMuzzleFlash(): void {
    this.muzzleFlash = 0.06;
  }

  update(dt: number, sim: ArenaSim): void {
    this.particles.update(dt);
    this.rings.update(dt);
    this.shake.update(dt);
    this.bgPhase += dt;

    const moved = Math.abs(sim.playerX - this.lastPlayerX);
    this.lastPlayerX = sim.playerX;
    // Фаза шага растёт пропорционально пройденному пути, а не времени — иначе
    // ноги «шагали» бы на месте, даже когда персонаж стоит.
    if (moved > 0.3 && sim.isGrounded) this.walkPhase += moved * 0.05;
    else if (sim.isGrounded) this.walkPhase *= 0.85; // плавно к нейтральной стойке

    if (this.muzzleFlash > 0) this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
  }

  draw(sim: ArenaSim): void {
    const { ctx } = this.stage;
    const { width, height } = this.stage.viewport;

    this.stage.clear('#0b0f1a');
    this.shake.apply(ctx);

    // Небо — вертикальный градиент, дёшево создаёт атмосферу без ассетов.
    const sky = ctx.createLinearGradient(0, 0, 0, sim.groundY);
    sky.addColorStop(0, '#0b0f1a');
    sky.addColorStop(1, '#1a2140');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, sim.groundY);

    this.drawNebula(sim);
    this.drawStars(sim);
    this.drawSkyline(sim);
    this.drawParallaxHills(sim);

    // Земля — тоже бесконечный фон уровня, но с полосой чуть темнее неба.
    const groundGrad = ctx.createLinearGradient(0, sim.groundY, 0, height);
    groundGrad.addColorStop(0, '#1b2340');
    groundGrad.addColorStop(1, '#0e1224');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, sim.groundY, width, height - sim.groundY);

    ctx.save();
    ctx.translate(-sim.cameraX, 0);

    this.drawGroundPanels(sim);

    // Линия земли на всю ширину МИРА, а не экрана — иначе на дальних
    // платформах видно, что подложка обрывается за кадром.
    ctx.strokeStyle = 'rgba(122,162,247,0.35)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(122,162,247,0.5)';
    ctx.shadowBlur = 6 * sim.scale;
    ctx.beginPath();
    ctx.moveTo(0, sim.groundY);
    ctx.lineTo(sim.worldWidth, sim.groundY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (const p of sim.platforms) this.drawPlatform(p, sim);
    for (const b of sim.bullets) this.drawBullet(b, sim);
    for (const e of sim.enemies) this.drawEnemy(e, sim);
    this.drawPlayer(sim);

    this.rings.draw(ctx);
    this.particles.draw(ctx);

    this.drawReticle(sim);

    ctx.restore(); // отменяем translate(-cameraX)
    ctx.restore(); // отменяем shake.apply

    this.drawLowHpVignette(sim);
  }

  /** Мягкие цветные пятна в небе — дальше звёзд, добавляют глубины плоскому градиенту. */
  private drawNebula(sim: ArenaSim): void {
    const { ctx } = this.stage;
    const { width } = this.stage.viewport;
    const offset = -sim.cameraX * 0.04; // почти неподвижный слой — самый дальний фон
    const spacing = width * 1.4;
    const blobs: Array<{ dx: number; color: string; ry: number }> = [
      { dx: 0.15, color: 'rgba(122,90,247,0.12)', ry: 0.25 },
      { dx: 0.55, color: 'rgba(247,90,190,0.08)', ry: 0.42 },
      { dx: 0.85, color: 'rgba(90,180,247,0.1)', ry: 0.15 },
    ];
    const startI = Math.floor(-offset / spacing) - 1;
    for (let i = startI; i < startI + 3; i += 1) {
      for (const b of blobs) {
        const cx = offset + i * spacing + b.dx * spacing;
        const cy = sim.groundY * b.ry;
        const r = spacing * 0.5;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, b.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Красная пульсация по краям экрана на низком ХП — тревога без цифр на HUD. */
  private drawLowHpVignette(sim: ArenaSim): void {
    const ratio = sim.hp / sim.maxHp;
    if (ratio >= 0.3 || sim.hp <= 0) return;
    const { ctx } = this.stage;
    const { width, height } = this.stage.viewport;
    const pulse = 0.5 + 0.5 * Math.sin(this.bgPhase * 6);
    const intensity = (0.3 - ratio) / 0.3; // 0..1 — сильнее, чем меньше здоровья
    const alpha = (0.22 + 0.22 * pulse) * intensity;
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.35,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.75,
    );
    grad.addColorStop(0, 'rgba(255,59,92,0)');
    grad.addColorStop(1, `rgba(255,59,92,${alpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  /** Редкие звёзды в верхней части неба — почти бесплатная деталь, сразу читается как космос. */
  private drawStars(sim: ArenaSim): void {
    const { ctx } = this.stage;
    const { width } = this.stage.viewport;
    const offset = -sim.cameraX * 0.08;
    const step = 46 * sim.scale;
    const startI = Math.floor(-offset / step) - 1;
    ctx.fillStyle = '#e8ecf4';
    for (let i = startI; i < startI + Math.ceil(width / step) + 2; i += 1) {
      // Псевдослучайные, но детерминированные позиция/яркость/фаза мерцания —
      // без стейта и без Math.random() в цикле рендера.
      const seed = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      const seed2 = Math.abs(Math.sin(i * 78.233) * 12543.123) % 1;
      const px = offset + i * step + seed * step;
      const py = sim.groundY * (0.06 + seed2 * 0.7);
      const twinkle = 0.35 + 0.45 * Math.abs(Math.sin(this.bgPhase * 1.4 + i * 7));
      ctx.globalAlpha = twinkle;
      const r = (seed > 0.8 ? 1.6 : 1) * sim.scale;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Силуэты дальних сооружений — самый медленный слой параллакса, задаёт «место действия». */
  private drawSkyline(sim: ArenaSim): void {
    const { ctx } = this.stage;
    const { width } = this.stage.viewport;
    const offset = -sim.cameraX * 0.15;
    const step = 150 * sim.scale;
    const startI = Math.floor(-offset / step) - 1;
    ctx.fillStyle = 'rgba(122,162,247,0.05)';
    for (let i = startI; i < startI + Math.ceil(width / step) + 3; i += 1) {
      const seed = Math.abs(Math.sin(i * 33.1) * 9871.7) % 1;
      const h = (40 + seed * 90) * sim.scale;
      const w = step * 0.55;
      const x = offset + i * step;
      ctx.fillRect(x, sim.groundY - h, w, h);
      // Пара «окон» на каждой башне — дешёвая деталь, отличающая её от простого блока.
      ctx.fillStyle = 'rgba(122,162,247,0.1)';
      ctx.fillRect(x + w * 0.3, sim.groundY - h * 0.7, w * 0.12, h * 0.12);
      ctx.fillRect(x + w * 0.6, sim.groundY - h * 0.45, w * 0.12, h * 0.12);
      ctx.fillStyle = 'rgba(122,162,247,0.05)';
    }
  }

  /** Дальние силуэты холмов — едут медленнее переднего плана, создают глубину без ассетов. */
  private drawParallaxHills(sim: ArenaSim): void {
    const { ctx } = this.stage;
    const { width } = this.stage.viewport;
    const offset = -sim.cameraX * 0.3;
    ctx.fillStyle = 'rgba(122,162,247,0.06)';
    const step = 220 * sim.scale;
    const startI = Math.floor(-offset / step) - 1;
    for (let i = startI; i < startI + Math.ceil(width / step) + 3; i += 1) {
      const cx = offset + i * step;
      const r = step * 0.7;
      ctx.beginPath();
      ctx.arc(cx, sim.groundY + r * 0.4, r, Math.PI, 0);
      ctx.fill();
    }
  }

  /** Полосы на земле переднего плана — превращают заливку в подобие технического пола. */
  private drawGroundPanels(sim: ArenaSim): void {
    const { ctx } = this.stage;
    const { height } = this.stage.viewport;
    const step = 60 * sim.scale;
    ctx.strokeStyle = 'rgba(122,162,247,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < sim.worldWidth; x += step) {
      ctx.moveTo(x, sim.groundY + 4 * sim.scale);
      ctx.lineTo(x, height);
    }
    ctx.stroke();
  }

  private drawPlatform(p: Platform, sim: ArenaSim): void {
    const { ctx } = this.stage;
    const s = sim.scale;
    const y = sim.groundY + p.y;
    const thickness = 14 * s;

    // Опоры до земли — платформа читается как часть уровня, а не как
    // плавающий обрубок без физической связи с ареной.
    ctx.fillStyle = 'rgba(35,43,72,0.6)';
    const legW = 6 * s;
    ctx.fillRect(p.x + 10 * s, y + thickness, legW, sim.groundY - (y + thickness));
    ctx.fillRect(p.x + p.width - 10 * s - legW, y + thickness, legW, sim.groundY - (y + thickness));

    ctx.fillStyle = '#232b48';
    roundRect(ctx, p.x, y, p.width, thickness, 5 * s);
    ctx.fill();
    ctx.fillStyle = 'rgba(122,162,247,0.5)';
    ctx.shadowColor = 'rgba(122,162,247,0.6)';
    ctx.shadowBlur = 5 * s;
    ctx.fillRect(p.x, y, p.width, 3 * s);
    ctx.shadowBlur = 0;

    // Огоньки вдоль кромки — та же деталь, что окна на скайлайне: недорого,
    // узнаваемо. Мягко пульсируют, каждый со своей фазой по позиции — иначе
    // ряд одинаковых неподвижных точек читается как текстура, а не как огни.
    let li = 0;
    for (let lx = p.x + 14 * s; lx < p.x + p.width - 10 * s; lx += 34 * s, li += 1) {
      const pulse = 0.55 + 0.45 * Math.sin(this.bgPhase * 2.2 + li * 1.7 + p.x * 0.01);
      ctx.fillStyle = '#ffd166';
      ctx.globalAlpha = pulse;
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 4 * s * pulse;
      ctx.beginPath();
      ctx.arc(lx, y + thickness + 3 * s, 1.6 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  private drawPlayer(sim: ArenaSim): void {
    const { ctx } = this.stage;
    const s = sim.scale;
    const x = sim.playerX;
    const y = sim.groundY + sim.playerY;
    const flashing = sim.invulnLeft > 0 && Math.floor(performance.now() / 90) % 2 === 0;
    const swing = Math.sin(this.walkPhase); // -1..1, шаг вперёд/назад
    const airborne = !sim.isGrounded;

    // Тень на земле — приземлённая точка контакта, а не координата отрисовки
    // (та едет вверх в прыжке). Сжимается с высотой, иначе персонаж в воздухе
    // выглядит приклеенным к полу, а не оторвавшимся от него.
    const heightOff = Math.max(0, -sim.playerY);
    const shadowScale = Math.max(0.3, 1 - heightOff / (110 * s));
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.32 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(x, sim.groundY, 14 * s * shadowScale, 4 * s * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = flashing ? 0.45 : 1;

    // Ноги: в воздухе поджаты/растопырены по знаку вертикальной скорости
    // (условно — по знаку playerY-изменения через флаг airborne), на земле —
    // обычный противофазный шаг.
    const legLen = 18 * s;
    const hipY = y - legLen;
    ctx.strokeStyle = '#2c3654';
    ctx.lineWidth = 6 * s;
    ctx.lineCap = 'round';
    for (const dir of [1, -1] as const) {
      const kick = airborne ? dir * 10 * s : swing * dir * 8 * s;
      const footY = airborne ? y - 6 * s : y;
      ctx.beginPath();
      ctx.moveTo(x - 4 * s * dir, hipY);
      ctx.lineTo(x - 4 * s * dir + kick, footY);
      ctx.stroke();
    }

    // Лёгкое покачивание корпуса в такт шагу — иначе бег выглядит как скольжение.
    const bob = airborne ? 3 * s : Math.abs(swing) * 2 * s;
    const torsoY = hipY - bob;

    // Торс красится в цвет выбранного класса — Штурмовик синий, Снайпер
    // фиолетовый, Тяжёлый оранжевый: видно, за кого играешь, не открывая меню.
    const cls = sim.classDef;
    ctx.fillStyle = cls.colorDark;
    roundRect(ctx, x - 13 * s, torsoY - 30 * s, 26 * s, 30 * s, 7 * s);
    ctx.fill();
    ctx.fillStyle = cls.color;
    roundRect(ctx, x - 13 * s, torsoY - 30 * s, 26 * s, 22 * s, 7 * s);
    ctx.fill();

    // Голова со шлемом-полосой — минимальная деталь, которая делает силуэт
    // «персонажем», а не геометрической фигурой.
    ctx.fillStyle = '#ffe0b2';
    ctx.beginPath();
    ctx.arc(x, torsoY - 38 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cls.colorDark;
    ctx.fillRect(x - 10 * s, torsoY - 42 * s, 20 * s, 4 * s);

    // Оружие поворачивается по реальному углу прицела (мышь/автонаведение),
    // а не только по стороне, куда смотрит игрок — иначе выстрел вверх или
    // по диагонали визуально не читается. Форма ствола различается по типу
    // оружия — дробовик короткий и толстый, снайперка длинная с прицелом.
    const gunY = torsoY - 20 * s;
    const angle = sim.gunAimAngle;
    this.drawWeapon(x, gunY, angle, sim.weapon.id, s);

    ctx.restore();
  }

  private drawWeapon(x: number, gunY: number, angle: number, weaponId: string, s: number): void {
    const { ctx } = this.stage;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const along = (d: number): [number, number] => [x + cos * d * s, gunY + sin * d * s];
    const shape = WEAPON_SHAPE[weaponId] ?? WEAPON_SHAPE.pistol!;

    // Плечевая часть — общая для всех, отличается только цветом и длиной ствола.
    const [sx, sy] = along(2);
    const [ex, ey] = along(shape.length);

    if (shape.scope) {
      // Прицел снайперки — короткий цилиндр над стволом, перпендикулярно ему.
      const [mx0, my0] = along(shape.length * 0.55);
      const px = -sin * 6 * s;
      const py = cos * 6 * s;
      ctx.strokeStyle = '#0d1020';
      ctx.lineWidth = 3 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mx0, my0);
      ctx.lineTo(mx0 + px, my0 + py);
      ctx.stroke();
    }

    if (shape.drum) {
      // Барабан/магазин дробовика под стволом — короткая толстая деталь.
      const [dx, dy] = along(shape.length * 0.45);
      ctx.fillStyle = '#0d1020';
      ctx.beginPath();
      ctx.arc(dx, dy, shape.width * 0.9 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#1c2138';
    ctx.lineWidth = (shape.width + 3) * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.width * s;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    if (this.muzzleFlash > 0) {
      // Вспышка — не просто кружок, а звезда из лучей поперёк ствола: короткая,
      // но заметно «стреляет», а не мигает точкой на конце оружия.
      const fade = this.muzzleFlash / 0.06;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(angle);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = shape.color;
      ctx.shadowBlur = 16 * s * fade;
      ctx.globalAlpha = fade;
      const spike = (shape.width + 10) * s * fade;
      ctx.beginPath();
      ctx.moveTo(spike, 0);
      for (let i = 1; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? spike : spike * 0.4;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shape.color;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, (shape.width + 2) * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawEnemy(e: Enemy, sim: ArenaSim): void {
    const { ctx } = this.stage;
    const colors = ENEMY_COLORS[e.kind];
    const s = sim.scale;
    const groundY = sim.groundY;
    // Общая фаза шага на всех врагов одного типа — дешевле, чем хранить
    // индивидуальную анимацию на каждого, а разница на глаз незаметна.
    const swing = Math.sin(e.age * 6 + e.id);

    ctx.save();
    ctx.fillStyle = colors.body;
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 8 * s;

    if (e.kind === 'boss') {
      const bob = Math.abs(Math.sin(e.age * 2)) * 3 * s;
      ctx.beginPath();
      ctx.arc(e.x, groundY - e.radius - bob, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Шипы по контуру — читаются как «босс», даже мельком.
      ctx.fillStyle = colors.glow;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + e.age * 0.6;
        const px = e.x + Math.cos(a) * e.radius;
        const py = groundY - e.radius - bob + Math.sin(a) * e.radius;
        ctx.beginPath();
        ctx.arc(px, py, e.radius * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#e8ecf4';
      ctx.beginPath();
      ctx.arc(e.x + e.facing * e.radius * 0.4, groundY - e.radius * 1.2 - bob, e.radius * 0.18, 0, Math.PI * 2);
      ctx.fill();
      // Пульсирующее ядро в центре — усиливает ощущение угрозы у босса.
      const corePulse = 0.5 + 0.5 * Math.sin(e.age * 5);
      ctx.fillStyle = colors.glow;
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = (10 + corePulse * 8) * s;
      ctx.globalAlpha = 0.5 + corePulse * 0.4;
      ctx.beginPath();
      ctx.arc(e.x, groundY - e.radius - bob, e.radius * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    } else if (e.kind === 'runner') {
      // Ноги — короткие штрихи в противофазе, тело наклонено по ходу бега.
      ctx.strokeStyle = colors.body;
      ctx.lineWidth = 3 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e.x - e.facing * e.radius * 0.3, groundY - e.radius * 0.6);
      ctx.lineTo(e.x - e.facing * e.radius * 0.3 + swing * 6 * s, groundY);
      ctx.moveTo(e.x + e.facing * e.radius * 0.1, groundY - e.radius * 0.6);
      ctx.lineTo(e.x + e.facing * e.radius * 0.1 - swing * 6 * s, groundY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(e.x + e.facing * e.radius, groundY - e.radius * 1.5);
      ctx.lineTo(e.x - e.radius * 0.5, groundY - e.radius * 0.6);
      ctx.lineTo(e.x - e.radius * 0.5, groundY - e.radius * 2.1);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      this.drawEye(e.x + e.facing * e.radius * 0.3, groundY - e.radius * 1.3, e.radius * 0.13, colors.glow, s);
    } else if (e.kind === 'shooter') {
      // Медленное «дыхание» корпуса — без него неподвижный дальнобойщик
      // выглядит как статичный спрайт, а не как живой противник.
      const breathe = Math.sin(e.age * 2.5 + e.id) * 1.2 * s;
      roundRect(
        ctx,
        e.x - e.radius * 0.8,
        groundY - e.radius * 2 - breathe,
        e.radius * 1.6,
        e.radius * 2,
        e.radius * 0.3,
      );
      ctx.fill();
      ctx.shadowBlur = 0;
      // Ствол, направленный на игрока — видно, что это дальнобойный тип.
      ctx.strokeStyle = '#1c2138';
      ctx.lineWidth = 3 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e.x, groundY - e.radius * 1.3 - breathe);
      ctx.lineTo(e.x + e.facing * e.radius * 1.4, groundY - e.radius * 1.2 - breathe);
      ctx.stroke();
      this.drawEye(e.x + e.facing * e.radius * 0.2, groundY - e.radius * 1.5 - breathe, e.radius * 0.14, colors.glow, s);
    } else {
      // 'walker': прямоугольное тело + короткие ноги-штрихи. Тело чуть
      // подпрыгивает в такт шагу — иначе ноги переступают под неподвижным блоком.
      const stepBob = Math.abs(swing) * 1.6 * s;
      ctx.strokeStyle = colors.body;
      ctx.lineWidth = 4 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e.x - e.radius * 0.4, groundY - e.radius * 0.4);
      ctx.lineTo(e.x - e.radius * 0.4 + swing * 3 * s, groundY);
      ctx.moveTo(e.x + e.radius * 0.4, groundY - e.radius * 0.4);
      ctx.lineTo(e.x + e.radius * 0.4 - swing * 3 * s, groundY);
      ctx.stroke();

      ctx.fillStyle = colors.body;
      roundRect(ctx, e.x - e.radius, groundY - e.radius * 2.1 - stepBob, e.radius * 2, e.radius * 1.8, e.radius * 0.35);
      ctx.fill();
      ctx.shadowBlur = 0;
      this.drawEye(e.x + e.facing * e.radius * 0.35, groundY - e.radius * 1.5 - stepBob, e.radius * 0.16, colors.glow, s);
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    if (e.hp < e.maxHp) this.drawHpBar(e.x, groundY - e.radius * 2 - 10 * s, e.radius * 2, e.hp / e.maxHp, s);
  }

  /**
   * Светящаяся точка-глаз — дешёвый способ дать рядовому врагу «взгляд», а не
   * только силуэт. `r` уже в масштабированных единицах (доля от `e.radius`,
   * который сам содержит масштаб) — здесь дополнительно не умножаем.
   */
  private drawEye(x: number, y: number, r: number, glow: string, s: number): void {
    const { ctx } = this.stage;
    ctx.fillStyle = '#0d1020';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = glow;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 4 * s;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawHpBar(cx: number, y: number, width: number, ratio: number, s: number): void {
    const { ctx } = this.stage;
    const h = 4 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, cx - width / 2, y, width, h, h / 2);
    ctx.fill();
    ctx.fillStyle = ratio > 0.4 ? '#9ece6a' : '#f7768e';
    roundRect(ctx, cx - width / 2, y, width * Math.max(0, ratio), h, h / 2);
    ctx.fill();
  }

  private drawBullet(b: Bullet, sim: ArenaSim): void {
    const { ctx } = this.stage;
    const s = sim.scale;
    const y = sim.groundY + b.y;
    const len = Math.hypot(b.vx, b.vy) || 1;

    if (b.hostile) {
      this.drawTracer(b.x, y, b.vx, b.vy, len, s, '#f7768e', 3, 10);
      return;
    }

    // Каждое оружие оставляет узнаваемый след, а не одну и ту же золотую
    // чёрточку — дробь летит дробинками, снайперка — длинным ярким лучом.
    switch (b.weaponId) {
      case 'shotgun': {
        ctx.save();
        ctx.fillStyle = '#ff9f5a';
        ctx.shadowColor = '#ff9f5a';
        ctx.shadowBlur = 4 * s;
        ctx.beginPath();
        ctx.arc(b.x, y, 2.4 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }
      case 'sniper':
        this.drawTracer(b.x, y, b.vx, b.vy, len, s, '#6fb1ff', 2.5, 26);
        return;
      case 'rocket':
        this.drawTracer(b.x, y, b.vx, b.vy, len, s, '#f7768e', 6, 14);
        return;
      default:
        this.drawTracer(b.x, y, b.vx, b.vy, len, s, '#ffd166', 3, 10);
    }
  }

  private drawTracer(
    x: number,
    y: number,
    vx: number,
    vy: number,
    len: number,
    s: number,
    color: string,
    width: number,
    trail: number,
  ): void {
    const { ctx } = this.stage;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width * s;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 6 * s;
    ctx.beginPath();
    ctx.moveTo(x - (vx / len) * trail * s, y - (vy / len) * trail * s);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  }

  /** Прицельная сетка в точке наведения мыши — только пока активен прицел мышью. */
  private drawReticle(sim: ArenaSim): void {
    const point = sim.aimWorldPoint;
    if (!point) return;
    const { ctx } = this.stage;
    const s = sim.scale;
    const x = point.x;
    const y = sim.groundY + point.y;
    const r = 10 * s;
    const gap = 4 * s;

    ctx.save();
    ctx.strokeStyle = sim.isFiring ? '#ff6b6b' : '#e8ecf4';
    ctx.lineWidth = 2 * s;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 5 * s;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r - gap, y);
    ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y);
    ctx.lineTo(x + r + gap, y);
    ctx.moveTo(x, y - r - gap);
    ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap);
    ctx.lineTo(x, y + r + gap);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 1.6 * s, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.restore();
  }
}
