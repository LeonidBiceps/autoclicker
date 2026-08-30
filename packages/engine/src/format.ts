/**
 * Форматирование больших чисел.
 *
 * В idle-играх счёт уходит в миллиарды за первый час, и `toLocaleString`
 * превращает интерфейс в кашу из цифр. Нужны короткие суффиксы, которые
 * читаются с одного взгляда.
 */

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag'];

export function formatShort(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '∞';
  if (value < 0) return `-${formatShort(-value, digits)}`;
  if (value < 1000) {
    // До тысячи дробная часть только мешает — кроме самых первых значений.
    return value < 10 && value % 1 !== 0 ? value.toFixed(1) : String(Math.floor(value));
  }

  const tier = Math.min(Math.floor(Math.log10(value) / 3), SUFFIXES.length - 1);
  const scaled = value / 1000 ** tier;
  // 12.34K, но 123K — три значащие цифры выглядят ровнее в столбце.
  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : digits;
  return `${scaled.toFixed(decimals)}${SUFFIXES[tier]}`;
}

/** Длительность в компактном виде: `2 ч 15 мин`, `48 с`. */
export function formatDuration(seconds: number, labels = { h: 'ч', m: 'мин', s: 'с' }): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) return `${h} ${labels.h} ${m} ${labels.m}`;
  if (m > 0) return `${m} ${labels.m}`;
  return `${s} ${labels.s}`;
}
