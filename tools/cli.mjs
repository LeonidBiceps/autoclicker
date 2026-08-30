#!/usr/bin/env node
/**
 * Единая CLI студии.
 *
 *   npm run new -- <slug> "Название"   — новая игра из шаблона
 *   npm run dev -- <slug>              — дев-сервер
 *   npm run build -- <slug>|--all      — прод-сборка + проверка бюджета
 *   npm run preview -- <slug>          — прод-сборка локально
 *   npm run package -- <slug>|--all    — zip, готовый к загрузке на платформу
 *   npm run list                       — что есть в портфеле
 */

import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameConfig } from './vite.shared.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAMES_DIR = path.join(ROOT, 'games');
const BUILD_DIR = path.join(ROOT, 'build');
const TEMPLATE_DIR = path.join(ROOT, 'templates', 'game');

/** Бюджеты веса. Первый экран — то, что решает, останется ли игрок. */
const BUDGET = {
  warnBytes: 3 * 1024 * 1024,
  failBytes: 20 * 1024 * 1024,
};

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const fmtBytes = (n) => {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(2)} МБ`;
};

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listGames() {
  if (!(await exists(GAMES_DIR))) return [];
  const entries = await fs.readdir(GAMES_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function resolveGame(slug) {
  const games = await listGames();
  if (!slug) {
    if (games.length === 1) return games[0];
    fail(
      `укажите игру: ${games.map((g) => c.bold(g)).join(', ') || '(портфель пуст, начните с npm run new)'}`,
    );
  }
  if (!games.includes(slug)) fail(`игра «${slug}» не найдена. Доступны: ${games.join(', ') || '—'}`);
  return slug;
}

function fail(message) {
  console.error(`\n${c.red('✗')} ${message}\n`);
  process.exit(1);
}

/**
 * Удаляет папку, переживая временную блокировку.
 *
 * В Windows файл, который только что записали, ещё несколько сотен миллисекунд
 * может держать индексатор или антивирус — удаление падает с EPERM/EBUSY.
 * Одного повтора обычно хватает, но берём запас.
 */
async function rmWithRetry(dir, attempts = 6) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const retriable = ['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error?.code);
      if (!retriable || i === attempts - 1) throw error;
      await new Promise((r) => setTimeout(r, 120 * (i + 1)));
    }
  }
}

async function dirSize(dir) {
  let total = 0;
  const files = [];
  const walk = async (d) => {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const { size } = await fs.stat(full);
        total += size;
        files.push({ path: path.relative(dir, full), size });
      }
    }
  };
  await walk(dir);
  files.sort((a, b) => b.size - a.size);
  return { total, files };
}

// ── команды ───────────────────────────────────────────────────────────────

async function cmdList() {
  const games = await listGames();
  if (games.length === 0) {
    console.log(`\n${c.dim('Портфель пуст.')} Создайте первую игру: ${c.bold('npm run new -- my-game "Моя игра"')}\n`);
    return;
  }
  console.log(`\n${c.bold('Портфель')} (${games.length})\n`);
  for (const g of games) {
    const pkgPath = path.join(GAMES_DIR, g, 'package.json');
    let title = '';
    let version = '';
    if (await exists(pkgPath)) {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      title = pkg.description ?? '';
      version = pkg.version ?? '';
    }
    const built = (await exists(path.join(GAMES_DIR, g, 'dist'))) ? c.green('собрана') : c.dim('не собрана');
    console.log(`  ${c.bold(g.padEnd(18))} ${c.dim(version.padEnd(8))} ${built}  ${c.dim(title)}`);
  }
  console.log('');
}

async function cmdNew(slug, title) {
  if (!slug) fail('нужен идентификатор: npm run new -- my-game "Моя игра"');
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(slug)) {
    fail('идентификатор — латиница в нижнем регистре, цифры и дефис (например: merge-farm)');
  }
  const dest = path.join(GAMES_DIR, slug);
  if (await exists(dest)) fail(`игра «${slug}» уже существует`);
  if (!(await exists(TEMPLATE_DIR))) fail('шаблон templates/game не найден');

  const displayTitle = title || slug;

  const copy = async (from, to) => {
    await fs.mkdir(to, { recursive: true });
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name.replace(/^_/, '.'));
      if (entry.isDirectory()) await copy(src, dst);
      else {
        const text = await fs.readFile(src, 'utf8');
        const filled = text
          .replaceAll('__SLUG__', slug)
          .replaceAll('__TITLE__', displayTitle);
        await fs.writeFile(dst, filled, 'utf8');
      }
    }
  };

  await copy(TEMPLATE_DIR, dest);
  // Папка статики создаётся отдельно: держать в шаблоне файл-пустышку нельзя —
  // он бы уехал в релизный архив вместе со сборкой.
  await fs.mkdir(path.join(dest, 'public'), { recursive: true });

  console.log(`\n${c.green('✓')} Игра ${c.bold(slug)} создана в games/${slug}`);
  console.log(`\n  ${c.dim('запустить:')} npm run dev -- ${slug}\n`);
}

async function cmdDev(slug, portArg) {
  const game = await resolveGame(slug);
  const { createServer } = await import('vite');
  const dir = path.join(GAMES_DIR, game);

  const config = createGameConfig({ dir, name: game });
  // Порт можно закрепить: держать несколько игр открытыми одновременно удобно,
  // а плавающий порт ломает закладки и настройки предпросмотра.
  const port = Number(portArg);
  if (Number.isInteger(port) && port > 0) {
    config.server = { ...config.server, port, strictPort: true };
  }

  const server = await createServer(config);
  await server.listen();
  console.log('');
  server.printUrls();
  console.log(
    `\n  ${c.dim('Мок Yandex SDK включён автоматически. Проверить без него:')} ${c.bold('?mock=0')}\n`,
  );
}

async function cmdAssets(slug) {
  const game = await resolveGame(slug);
  const { createServer } = await import('vite');
  const dir = path.join(GAMES_DIR, game);

  const config = createGameConfig({ dir, name: game });
  // Страница сама всё нарисует и разложит по файлам, как только откроется.
  config.server = { ...config.server, open: `/store-art?slug=${game}` };

  const server = await createServer(config);
  await server.listen();

  console.log(`\n${c.blue('▸')} Генератор ассетов для ${c.bold(game)}`);
  server.printUrls();
  console.log(
    `\n  ${c.dim('Файлы появятся в')} games/${game}/store/${c.dim('. Страница:')} /store-art?slug=${game}`,
  );
  console.log(`  ${c.dim('Когда всё сохранится — закройте вкладку и остановите сервер (Ctrl+C).')}\n`);
}

async function cmdBuild(slugOrAll) {
  const games = slugOrAll === '--all' ? await listGames() : [await resolveGame(slugOrAll)];
  const { build } = await import('vite');
  const results = [];

  for (const game of games) {
    const dir = path.join(GAMES_DIR, game);
    console.log(`\n${c.blue('▸')} Сборка ${c.bold(game)}`);
    await rmWithRetry(path.join(dir, 'dist'));
    await build(createGameConfig({ dir, name: game }));
    const report = await auditBuild(dir, game);
    results.push(report);
  }
  return results;
}

/** Проверяет собранную игру на то, что ломает публикацию чаще всего. */
async function auditBuild(dir, game) {
  const dist = path.join(dir, 'dist');
  if (!(await exists(dist))) fail(`сборка ${game} не создала dist`);

  const { total, files } = await dirSize(dist);
  const problems = [];

  // index.html обязан лежать в корне архива.
  if (!(await exists(path.join(dist, 'index.html')))) {
    problems.push('в корне сборки нет index.html');
  }

  // Внешние ресурсы платформа не пропускает: всё, кроме её же SDK, должно
  // лежать внутри архива.
  const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8').catch(() => '');
  const external = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((url) => !/^https:\/\/(yandex\.ru|yastatic\.net|mc\.yandex\.ru)/.test(url));
  if (external.length > 0) {
    problems.push(`внешние ресурсы в index.html: ${external.join(', ')}`);
  }

  // Абсолютные пути ломаются на CDN, где игра лежит в подпапке.
  if (/(?:src|href)\s*=\s*["']\/[^/]/i.test(html)) {
    problems.push('абсолютные пути (/assets/...) — нужен относительный base');
  }

  console.log(`  ${c.dim('вес:')} ${fmtBytes(total)}`);
  for (const f of files.slice(0, 5)) {
    console.log(`    ${c.dim(fmtBytes(f.size).padStart(10))}  ${f.path}`);
  }

  if (total > BUDGET.failBytes) problems.push(`вес ${fmtBytes(total)} выше потолка ${fmtBytes(BUDGET.failBytes)}`);
  else if (total > BUDGET.warnBytes) {
    console.log(`  ${c.yellow('!')} вес выше комфортного бюджета ${fmtBytes(BUDGET.warnBytes)} — первый экран будет грузиться долго`);
  }

  if (problems.length > 0) {
    console.log(`  ${c.red('✗')} проблемы:`);
    for (const p of problems) console.log(`    - ${p}`);
    throw new Error(`${game}: сборка не прошла проверку`);
  }

  console.log(`  ${c.green('✓')} проверки пройдены`);
  return { game, total, files };
}

async function cmdPreview(slug) {
  const game = await resolveGame(slug);
  await cmdBuild(game);
  const { preview } = await import('vite');
  const dir = path.join(GAMES_DIR, game);
  const server = await preview(createGameConfig({ dir, name: game }));
  console.log('');
  server.printUrls();
  console.log('');
}

async function cmdPackage(slugOrAll) {
  const games = slugOrAll === '--all' ? await listGames() : [await resolveGame(slugOrAll)];
  await cmdBuild(slugOrAll === '--all' ? '--all' : games[0]);
  await fs.mkdir(BUILD_DIR, { recursive: true });

  const { default: archiver } = await import('archiver');

  for (const game of games) {
    const dist = path.join(GAMES_DIR, game, 'dist');
    const pkgPath = path.join(GAMES_DIR, game, 'package.json');
    const version = (await exists(pkgPath))
      ? JSON.parse(await fs.readFile(pkgPath, 'utf8')).version ?? '0.0.0'
      : '0.0.0';

    const zipPath = path.join(BUILD_DIR, `${game}-v${version}.zip`);
    await new Promise((resolve, reject) => {
      const out = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      out.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(out);
      // Содержимое dist кладётся в корень архива — платформа ищет index.html там.
      archive.directory(dist, false);
      void archive.finalize();
    });

    const { size } = await fs.stat(zipPath);
    console.log(
      `\n${c.green('✓')} ${c.bold(path.relative(ROOT, zipPath))}  ${c.dim(fmtBytes(size))}`,
    );
  }
  console.log(`\n  ${c.dim('Загрузить архив в консоли разработчика Яндекс Игр (games.yandex.ru/console).')}\n`);
}

// ── точка входа ───────────────────────────────────────────────────────────

const [, , command, ...rest] = process.argv;

const commands = {
  new: () => cmdNew(rest[0], rest.slice(1).join(' ')),
  dev: () => cmdDev(rest[0], rest[1]),
  assets: () => cmdAssets(rest[0]),
  build: () => cmdBuild(rest[0]),
  preview: () => cmdPreview(rest[0]),
  package: () => cmdPackage(rest[0]),
  list: () => cmdList(),
};

const run = commands[command];
if (!run) {
  console.log(`
${c.bold('Студия HTML5-игр для Яндекс Игр')}

  ${c.bold('npm run list')}                       что есть в портфеле
  ${c.bold('npm run new -- <slug> "Название"')}   новая игра из шаблона
  ${c.bold('npm run dev -- <slug>')}              дев-сервер с моком SDK
  ${c.bold('npm run assets -- <slug>')}           иконка, обложка и скриншоты для карточки
  ${c.bold('npm run build -- <slug>')}            прод-сборка + проверки
  ${c.bold('npm run preview -- <slug>')}          посмотреть прод-сборку
  ${c.bold('npm run package -- <slug>')}          zip для загрузки на платформу

  ${c.dim('Добавьте --all вместо slug, чтобы обработать весь портфель.')}
`);
  process.exit(command ? 1 : 0);
}

try {
  await run();
} catch (error) {
  fail(error?.message ?? String(error));
}
