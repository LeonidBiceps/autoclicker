/**
 * Фоновый канвас — то же звёздное небо, что и в Космоферме, но в самоцветной
 * палитре. Переиспользуем движок эффектов студии, а не пишем новый фон с нуля.
 */

import { Stage, Starfield } from '@yg/engine';

export function createBackdrop(container: HTMLElement): { update: (dt: number) => void } {
  const stage = new Stage(container, () => field.resize(stage.viewport.width, stage.viewport.height));
  const field = new Starfield(0.00014, ['#e0245e', '#2e86de', '#f6b93b', '#8854d0', '#ffffff']);
  field.resize(stage.viewport.width, stage.viewport.height);

  return {
    update(dt: number) {
      field.update(dt);
      stage.clear('#141227');
      field.draw(stage.ctx);
    },
  };
}
