/**
 * Фоновый канвас: звёздное небо позади всего интерфейса.
 *
 * Отдельный `Stage` от того, что рисует частицы клика — это осознанно: фон
 * дешёвый и должен жить своим циклом даже там, где основной интерфейс на DOM
 * (как здесь), а не примешиваться к логике конкретного экрана.
 */

import { Stage, Starfield } from '@yg/engine';

export function createBackdrop(container: HTMLElement): { update: (dt: number) => void } {
  const stage = new Stage(container, () => field.resize(stage.viewport.width, stage.viewport.height));
  const field = new Starfield();
  field.resize(stage.viewport.width, stage.viewport.height);

  return {
    update(dt: number) {
      field.update(dt);
      stage.clear('#0b1020');
      field.draw(stage.ctx);
    },
  };
}
