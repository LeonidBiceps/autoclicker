import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Плагин Vite, дающий странице-генератору право записать файл на диск.
 *
 * Без него готовые PNG пришлось бы скачивать руками через `<a download>` и
 * раскладывать по папкам — то есть ровно та ручная возня, которой хочется
 * избежать. Эндпоинт живёт только в дев-режиме и пишет строго внутрь
 * `games/<slug>/store`.
 */
export function assetsPlugin({ gamesDir }) {
  return {
    name: 'yg-store-assets',
    apply: 'serve',
    configureServer(server) {
      // Страница-генератор общая для всех игр, поэтому лежит в tools и
      // отдаётся middleware, а не копируется в каждую игру.
      server.middlewares.use('/store-art', (req, res, next) => {
        if (req.method !== 'GET') return next();
        void (async () => {
          const file = path.join(HERE, 'store-art', 'index.html');
          try {
            const html = await fs.readFile(file, 'utf8');
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end(html);
          } catch (error) {
            res.statusCode = 500;
            res.end(`не удалось прочитать ${file}: ${String(error)}`);
          }
        })();
      });

      server.middlewares.use('/__save-asset', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }

        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          void (async () => {
            try {
              const { slug, name, dataUrl } = JSON.parse(Buffer.concat(chunks).toString('utf8'));

              // Имена приходят из браузера — не пускаем их гулять по файловой
              // системе за пределы папки игры.
              if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug) || !/^[a-z0-9][a-z0-9.@-]*$/i.test(name)) {
                throw new Error('недопустимое имя');
              }

              const base64 = String(dataUrl).split(',')[1] ?? '';
              const buffer = Buffer.from(base64, 'base64');
              const dir = path.join(gamesDir, slug, 'store');
              await fs.mkdir(dir, { recursive: true });
              const file = path.join(dir, name);
              await fs.writeFile(file, buffer);

              console.log(`  сохранено: ${path.relative(process.cwd(), file)} (${buffer.length} Б)`);
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ ok: true, bytes: buffer.length }));
            } catch (error) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
            }
          })();
        });
      });
    },
  };
}
