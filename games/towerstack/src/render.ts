/**
 * Отрисовка башни на Canvas2D.
 *
 * Блоки — просто скруглённые прямоугольники с hue-градиентом, камера едет
 * вверх вслед за стопкой. Обломки от промаха — отдельная лёгкая физика
 * (гравитация + вращение), не завязанная на модель: логика уже отдала их
 * готовыми в момент промаха, дальше это только зрелище.
 */

import { Particles, Rings, Shake, clamp, roundRect, type Stage } from '@yg/engine';
import { BLOCK_HEIGHT, WORLD_WIDTH, type FallingPiece, type Tower } from './sim';

interface LivePiece extends FallingPiece {
  life: number;
}

const GRAVITY = 340;

export class Renderer {
  private cameraY = 0;
  private pieces: LivePiece[] = [];
  private readonly particles = new Particles(180);
  private readonly rings = new Rings();
  private readonly shake = new Shake();
  /** Лёгкое покачивание летящего блока по Y — иначе он выглядит приклеенным к рельсам. */
  private bobPhase = 0;

  constructor(private readonly stage: Stage) {}

  private scale(): number {
    return this.stage.viewport.width / WORLD_WIDTH;
  }

  addFallingPieces(pieces: readonly FallingPiece[]): void {
    for (const p of pieces) this.pieces.push({ ...p, life: 2.6 });
  }

  spawnPerfectFx(x: number, y: number, hue: string): void {
    const { sx, sy } = this.toScreen(x, y);
    this.rings.spawn(sx, sy, hue, 0.55, 3);
    this.rings.spawn(sx, sy, '#ffffff', 0.4, 2);
    this.particles.burst(sx, sy, {
      count: 22,
      colors: [hue, '#ffffff'],
      speed: 180,
      size: 3.5,
      life: 0.6,
      spread: Math.PI * 1.4,
      direction: -Math.PI / 2,
    });
    this.shake.kick(3);
  }

  spawnMissFx(x: number, y: number): void {
    const { sx, sy } = this.toScreen(x, y);
    this.shake.kick(9);
    this.particles.burst(sx, sy, {
      count: 14,
      colors: ['#f7768e', '#ff9db0'],
      speed: 140,
      size: 3,
      life: 0.5,
    });
  }

  private toScreen(worldX: number, worldY: number): { sx: number; sy: number } {
    const scale = this.scale();
    const { height } = this.stage.viewport;
    const sx = worldX * scale;
    const sy = height - 90 - (worldY - this.cameraY) * scale;
    return { sx, sy };
  }

  update(dt: number, tower: Tower): void {
    this.bobPhase += dt;
    const scale = this.scale();
    const { height } = this.stage.viewport;

    // Камера едет вслед за вершиной стопки, но с запозданием (lerp) — резкий
    // скачок при каждом новом блоке выглядел бы как икота, а не рост башни.
    const topY = tower.blocks.length * BLOCK_HEIGHT;
    const targetCameraY = Math.max(0, topY - (height - 90 - height * 0.32) / scale);
    this.cameraY += (targetCameraY - this.cameraY) * clamp(dt * 3.2, 0, 1);

    for (let i = this.pieces.length - 1; i >= 0; i -= 1) {
      const p = this.pieces[i];
      if (!p) continue;
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vr * dt;
      p.life -= dt;
      if (p.life <= 0) this.pieces.splice(i, 1);
    }

    this.particles.update(dt);
    this.rings.update(dt);
    this.shake.update(dt);
  }

  draw(tower: Tower): void {
    const { ctx } = this.stage;
    const { width, height } = this.stage.viewport;
    const scale = this.scale();

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#2a1d45');
    sky.addColorStop(0.6, '#1f1636');
    sky.addColorStop(1, '#160f28');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    this.shake.apply(ctx);

    // Дальние горизонтальные полосы — намёк на высоту без единой текстуры:
    // чем выше забег, тем гуще они «пролетают» мимо камеры вниз экрана.
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    const bandStep = 60 * scale;
    const bandOffset = (this.cameraY * scale) % bandStep;
    for (let y = -bandOffset; y < height; y += bandStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    tower.blocks.forEach((block, i) => {
      const { sx, sy } = this.toScreen(block.x, i * BLOCK_HEIGHT);
      if (sy < -BLOCK_HEIGHT * scale || sy > height + BLOCK_HEIGHT * scale) return;
      this.drawBlock(sx, sy, block.width * scale, block.hue, 1);
    });

    if (tower.alive && tower.current) {
      const bob = Math.sin(this.bobPhase * 5) * 2;
      const { sx, sy } = this.toScreen(tower.current.x, (tower.blocks.length + 1) * BLOCK_HEIGHT);
      this.drawBlock(sx, sy + bob, tower.current.width * scale, tower.current.hue, 1, true);

      // Направляющая линия вниз от летящего блока к вершине стопки — помогает
      // на глаз оценить, куда именно он приземлится, особенно на скорости.
      const top = this.toScreen(0, tower.blocks.length * BLOCK_HEIGHT);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(sx, sy + bob + (BLOCK_HEIGHT * scale) / 2);
      ctx.lineTo(sx, top.sy - (BLOCK_HEIGHT * scale) / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const p of this.pieces) {
      const { sx, sy } = this.toScreen(p.x, p.y);
      ctx.save();
      ctx.globalAlpha = clamp(p.life / 1.2, 0, 1);
      ctx.translate(sx, sy);
      ctx.rotate(p.rotation);
      this.drawBlock(0, 0, Math.max(2, p.width * scale), p.hue, 1, false, true);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    this.rings.draw(ctx);
    this.particles.draw(ctx);
    ctx.restore();
  }

  private drawBlock(
    cx: number,
    cy: number,
    w: number,
    hue: number,
    alpha: number,
    glow = false,
    centered = false,
  ): void {
    const { ctx } = this.stage;
    const h = BLOCK_HEIGHT * this.scale();
    const x = centered ? -w / 2 : cx - w / 2;
    const y = centered ? -h / 2 : cy - h / 2;
    const r = Math.min(8, w * 0.16, h * 0.28);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (glow) {
      ctx.shadowColor = `hsl(${hue},80%,60%)`;
      ctx.shadowBlur = 16;
    }

    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, `hsl(${hue},70%,64%)`);
    grad.addColorStop(1, `hsl(${hue},62%,44%)`);
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Блик по верхней кромке — тонкая светлая линия, дешёвый способ намекнуть
    // на объём без полноценного 3D.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, h * 0.05);
    ctx.beginPath();
    ctx.moveTo(x + r, y + 1);
    ctx.lineTo(x + w - r, y + 1);
    ctx.stroke();

    ctx.restore();
  }

  celebrateHeightMilestone(worldX: number, worldY: number): void {
    const { sx, sy } = this.toScreen(worldX, worldY);
    this.rings.spawn(sx, sy, '#ffd166', 0.7, 3);
    this.shake.kick(6);
  }
}
