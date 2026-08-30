import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assetsPlugin } from './assets-plugin.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Общий конфиг Vite для всех игр студии.
 *
 * Ключевые решения продиктованы платформой:
 *  - `base: './'` — игра раздаётся с произвольного подпути на CDN Яндекса,
 *    абсолютные пути там ломаются;
 *  - агрессивный inline ассетов — каждый лишний HTTP-запрос на мобильном
 *    интернете дороже, чем пара килобайт в бандле;
 *  - `console` вырезается в проде: логи мока не должны утекать в релиз.
 */
export function createGameConfig({ dir, name }) {
  return {
    root: dir,
    base: './',
    publicDir: path.join(dir, 'public'),
    plugins: [assetsPlugin({ gamesDir: path.join(root, 'games') })],
    resolve: {
      alias: {
        '@yg/ysdk': path.join(root, 'packages/ysdk/src/index.ts'),
        '@yg/engine': path.join(root, 'packages/engine/src/index.ts'),
      },
    },
    build: {
      outDir: path.join(dir, 'dist'),
      // Чистит папку сама CLI: на Windows удаление сразу после записи упирается
      // в занятый хендл (индексатор, антивирус, синхронизация), и нужен ретрай,
      // которого у Vite нет.
      emptyOutDir: false,
      target: 'es2020',
      // 8 КБ: всё, что мельче, дешевле встроить в base64, чем тянуть запросом.
      assetsInlineLimit: 8192,
      cssCodeSplit: false,
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: { passes: 2, drop_console: true, drop_debugger: true },
        format: { comments: false },
      },
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
      // Порог предупреждения совпадает с бюджетом первого экрана.
      chunkSizeWarningLimit: 400,
    },
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      open: false,
    },
    preview: { host: true, port: 4173 },
    define: {
      __GAME_NAME__: JSON.stringify(name),
    },
  };
}
