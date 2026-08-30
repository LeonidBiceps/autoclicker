/**
 * Достижения — общий модуль на все игры студии.
 *
 * Текст достижений локализован в каждой игре отдельно (как и правила в
 * `i18n.ts`), а этот модуль отвечает только за учёт: что уже открыто,
 * что открылось только что, и как это показать — всплывающим тостом и
 * списком в общем стиле с таблицей лидеров.
 */

export interface AchievementDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
}

export class Achievements {
  private unlocked: Set<string>;

  constructor(
    private readonly defs: readonly AchievementDef[],
    unlockedIds: readonly string[] = [],
  ) {
    this.unlocked = new Set(unlockedIds);
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  /** Открывает достижение. `true` — открыто впервые (стоит показать тост). */
  unlock(id: string): boolean {
    if (this.unlocked.has(id)) return false;
    if (!this.defs.some((d) => d.id === id)) return false;
    this.unlocked.add(id);
    return true;
  }

  get unlockedIds(): string[] {
    return [...this.unlocked];
  }

  get all(): readonly AchievementDef[] {
    return this.defs;
  }

  get progress(): { done: number; total: number } {
    return { done: this.unlocked.size, total: this.defs.length };
  }
}

/**
 * Всплывающий тост об открытии достижения.
 *
 * Стили — инлайновые, а не классы из `style.css` игры: тост должен одинаково
 * выглядеть в любой игре студии без дублирования CSS в каждой из них.
 */
export function showAchievementToast(def: AchievementDef, label: string): void {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.style.cssText = [
    'position:fixed',
    'top:calc(12px + env(safe-area-inset-top, 0px))',
    'left:50%',
    'transform:translateX(-50%) translateY(-140%)',
    'z-index:80',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'max-width:min(360px, calc(100vw - 24px))',
    'padding:10px 16px',
    'border-radius:14px',
    'background:rgba(20,18,30,0.92)',
    'backdrop-filter:blur(6px)',
    'box-shadow:0 12px 30px rgba(0,0,0,0.35)',
    'color:#f9f6f2',
    'font:600 13px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    'pointer-events:none',
    'transition:transform 0.32s cubic-bezier(0.2,0.9,0.3,1.2), opacity 0.32s ease',
    'opacity:0',
  ].join(';');

  const icon = document.createElement('span');
  icon.textContent = def.icon;
  icon.style.cssText = 'font-size:24px;line-height:1';

  const text = document.createElement('span');
  const title = document.createElement('div');
  title.textContent = `${label}: ${def.name}`;
  title.style.cssText = 'font-weight:800;font-size:13px';
  const desc = document.createElement('div');
  desc.textContent = def.desc;
  desc.style.cssText = 'opacity:0.75;font-weight:500;font-size:12px;margin-top:1px';
  text.append(title, desc);

  el.append(icon, text);
  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.transform = 'translateX(-50%) translateY(0)';
    el.style.opacity = '1';
  });

  setTimeout(() => {
    el.style.transform = 'translateX(-50%) translateY(-140%)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
  }, 3200);
}

/** Список достижений для модалки — тот же приём, что `buildLeaderList`. */
export function buildAchievementList(defs: readonly AchievementDef[], unlockedIds: readonly string[]): HTMLElement {
  const unlocked = new Set(unlockedIds);
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin:4px 0 14px;text-align:left';

  for (const def of defs) {
    const isDone = unlocked.has(def.id);
    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:10px',
      'padding:8px 10px',
      'border-radius:10px',
      `background:${isDone ? 'rgba(255,209,102,0.12)' : 'rgba(255,255,255,0.05)'}`,
      `opacity:${isDone ? '1' : '0.55'}`,
    ].join(';');

    const icon = document.createElement('span');
    icon.textContent = isDone ? def.icon : '🔒';
    icon.style.cssText = 'font-size:20px;flex:0 0 auto';

    const text = document.createElement('span');
    text.style.cssText = 'display:flex;flex-direction:column;min-width:0';
    const name = document.createElement('span');
    name.textContent = def.name;
    name.style.cssText = 'font-weight:700;font-size:14px';
    const desc = document.createElement('span');
    desc.textContent = def.desc;
    desc.style.cssText = 'font-size:12px;opacity:0.75';
    text.append(name, desc);

    row.append(icon, text);
    list.appendChild(row);
  }

  return list;
}
