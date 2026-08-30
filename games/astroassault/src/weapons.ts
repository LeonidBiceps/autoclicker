/**
 * Арсенал — типы оружия с разным ощущением стрельбы, не просто числовые
 * апгрейды поверх одной пушки. Каждое открывается за медали (постоянная
 * валюта) и выбирается перед забегом в Арсенале.
 */

export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'sniper' | 'rocket';

export interface WeaponDef {
  id: WeaponId;
  icon: string;
  /** 0 — открыто всем сразу, дальше — цена в медалях. */
  cost: number;
  damage: number;
  /** Секунд между выстрелами. */
  fireInterval: number;
  bulletSpeed: number;
  /** Дробовик выпускает несколько пуль веером за выстрел. */
  pellets: number;
  /** Разброс веера в радианах (для дробовика). */
  spread: number;
  /** Снайперская пуля пробивает N врагов насквозь. */
  pierce: number;
  /** Ракета наносит урон по площади радиусом (в игровых px, до масштаба). */
  splashRadius: number;
}

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'pistol',
    icon: '🔫',
    cost: 0,
    damage: 10,
    fireInterval: 0.36,
    bulletSpeed: 780,
    pellets: 1,
    spread: 0,
    pierce: 0,
    splashRadius: 0,
  },
  {
    id: 'smg',
    icon: '💥',
    cost: 15,
    damage: 5,
    fireInterval: 0.12,
    bulletSpeed: 820,
    pellets: 1,
    spread: 0.05,
    pierce: 0,
    splashRadius: 0,
  },
  {
    id: 'shotgun',
    icon: '🎯',
    cost: 25,
    damage: 7,
    fireInterval: 0.62,
    bulletSpeed: 700,
    pellets: 5,
    spread: 0.32,
    pierce: 0,
    splashRadius: 0,
  },
  {
    id: 'sniper',
    icon: '🔭',
    cost: 35,
    damage: 34,
    fireInterval: 0.95,
    bulletSpeed: 1100,
    pellets: 1,
    spread: 0,
    pierce: 2,
    splashRadius: 0,
  },
  {
    id: 'rocket',
    icon: '🚀',
    cost: 50,
    damage: 22,
    fireInterval: 1.1,
    bulletSpeed: 560,
    pellets: 1,
    spread: 0,
    pierce: 0,
    splashRadius: 70,
  },
];

export const weaponById = (id: WeaponId): WeaponDef =>
  WEAPONS.find((w) => w.id === id) ?? (WEAPONS[0] as WeaponDef);
