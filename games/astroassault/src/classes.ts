/**
 * Классы персонажа — выбираются перед забегом, задают базовые множители.
 * Оружие даёт разницу в стрельбе, класс — в выживаемости и стиле игры.
 */

export type ClassId = 'assault' | 'sniper' | 'heavy';

export interface ClassDef {
  id: ClassId;
  icon: string;
  color: string;
  /** Более тёмный оттенок того же цвета — нижний слой брони на рендере. */
  colorDark: string;
  hpMult: number;
  speedMult: number;
  damageMult: number;
  jumpMult: number;
}

export const CLASSES: readonly ClassDef[] = [
  {
    id: 'assault',
    icon: '🪖',
    color: '#7aa2f7',
    colorDark: '#4a63a8',
    hpMult: 1,
    speedMult: 1,
    damageMult: 1,
    jumpMult: 1,
  },
  {
    id: 'sniper',
    icon: '🎖️',
    color: '#c9a8ff',
    colorDark: '#8a6bc4',
    hpMult: 0.75,
    speedMult: 1.1,
    damageMult: 1.3,
    jumpMult: 1.1,
  },
  {
    id: 'heavy',
    icon: '🛡️',
    color: '#ff9f5a',
    colorDark: '#c96f30',
    hpMult: 1.5,
    speedMult: 0.8,
    damageMult: 0.9,
    jumpMult: 0.85,
  },
];

export const classById = (id: ClassId): ClassDef =>
  CLASSES.find((c) => c.id === id) ?? (CLASSES[0] as ClassDef);
