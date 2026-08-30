/**
 * __TITLE__ — заготовка новой игры.
 *
 * Здесь уже подключено всё, что требует платформа: прелоадер и сигнал
 * готовности, облачный сейв, пауза со звуком на время рекламы, события
 * воронки. Останется заменить содержимое `update`/`draw` на свою механику.
 */

import { Input, Loop, Sfx, Stage, metrics, roundRect } from '@yg/engine';
import { yg } from '@yg/ysdk';
import './style.css';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`нет элемента #${id}`);
  return el as T;
};

const boardEl = $<HTMLDivElement>('board');
const scoreEl = $<HTMLElement>('score');
const restartBtn = $<HTMLButtonElement>('restart');
const soundBtn = $<HTMLButtonElement>('sound');
const loaderEl = $<HTMLDivElement>('loader');

const sfx = new Sfx();

// ── состояние ──────────────────────────────────────────────────────────────

let score = 0;
/** Демо-механика: цель, по которой нужно попасть. Замените на свою. */
let target = { x: 0.5, y: 0.5, r: 40, t: 0 };

function reset(): void {
  score = 0;
  spawnTarget();
  syncHud();
}

function spawnTarget(): void {
  target = { x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.7, r: 40, t: 0 };
}

function syncHud(): void {
  scoreEl.textContent = score.toLocaleString('ru-RU');
  soundBtn.textContent = sfx.isMuted ? '🔇' : '🔊';
}

// ── графика ────────────────────────────────────────────────────────────────

const stage = new Stage(boardEl, () => {
  /* здесь пересчитывается вёрстка при смене размера */
});

const loop = new Loop(
  (dt) => {
    target.t += dt;
  },
  () => {
    const { ctx, viewport } = stage;
    stage.clear('#0f1117');

    const x = target.x * viewport.width;
    const y = target.y * viewport.height;
    // Лёгкая пульсация — дешёвый способ сделать цель «живой».
    const r = target.r * (1 + 0.08 * Math.sin(target.t * 4));

    ctx.fillStyle = '#7aa2f7';
    roundRect(ctx, x - r, y - r, r * 2, r * 2, r * 0.35);
    ctx.fill();
  },
);

// ── ввод ───────────────────────────────────────────────────────────────────

new Input(boardEl, {
  onTap: (clientX, clientY) => {
    const rect = stage.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cx = target.x * stage.viewport.width;
    const cy = target.y * stage.viewport.height;

    if (Math.hypot(x - cx, y - cy) <= target.r * 1.3) {
      score += 1;
      sfx.play('merge');
      spawnTarget();
      syncHud();
      yg.save({ score });
    } else {
      sfx.play('error');
    }
  },
});

restartBtn.onclick = () => {
  sfx.play('click');
  void restart();
};

soundBtn.onclick = () => {
  sfx.setMuted(!sfx.isMuted);
  syncHud();
  yg.save({ muted: sfx.isMuted });
};

async function restart(): Promise<void> {
  // Полноэкранная реклама уместна на перезапуске: игрок уже вне потока.
  // Кулдаун и прогрев обёртка держит сама, лишние вызовы отсеются.
  const res = await yg.interstitial();
  if (res.shown) metrics.send('ad_interstitial_shown', { placement: 'restart' });
  reset();
  metrics.send('game_start');
}

// Реклама обязана глушить игру, иначе поверх ролика играет наш звук.
yg.events.on('pause', () => {
  loop.pause();
  sfx.suspend();
});
yg.events.on('resume', () => {
  loop.resume();
  sfx.resume();
});

// ── старт ──────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  metrics.send('load_start');
  await yg.init({ gameplayApi: true });

  const saved = await yg.load<{ score?: number; muted?: boolean }>({});
  if (saved.muted === true) sfx.setMuted(true);
  score = typeof saved.score === 'number' ? saved.score : 0;

  spawnTarget();
  syncHud();
  loop.start();

  // Ждать кадр бесконечно нельзя: в скрытом айфрейме rAF не вызывается вовсе.
  let revealed = false;
  const reveal = (): void => {
    if (revealed) return;
    revealed = true;
    loaderEl.classList.add('hidden');
    setTimeout(() => loaderEl.remove(), 350);
    yg.ready();
    metrics.send('load_done');
    metrics.send('game_start');
  };
  requestAnimationFrame(reveal);
  setTimeout(reveal, 1000);
}

void boot();
