/**
 * Модальные окна и таблица лидеров.
 *
 * Общие для всей студии: они нужны буквально каждой игре, и расходиться в
 * мелочах (что закрывается по тапу в фон, блокируется ли кнопка на время
 * рекламы) им незачем.
 *
 * Интерфейс намеренно на DOM, а не в канвасе: нативные кнопки дают доступность,
 * корректный фокус и правильные размеры тач-целей бесплатно. От разметки нужен
 * единственный элемент — `<div id="overlay" hidden>`; классы описаны в стилях
 * игры.
 */

export interface ModalAction {
  label: string;
  /** `reward` — кнопка, ведущая к рекламе за награду; она визуально выделена. */
  kind?: 'primary' | 'ghost' | 'reward';
  onClick: () => void | Promise<void>;
}

export interface ModalOptions {
  title: string;
  /** Крупное число под заголовком — счёт, награда. */
  result?: string;
  text?: string;
  /** Произвольная разметка между текстом и кнопками. */
  body?: HTMLElement;
  actions: ModalAction[];
  /** Разрешить закрытие тапом по фону. */
  dismissible?: boolean;
  onDismiss?: () => void;
}

let overlayEl: HTMLDivElement | null = null;
let currentDismiss: (() => void) | null = null;

function overlay(): HTMLDivElement {
  if (overlayEl) return overlayEl;

  const el = document.getElementById('overlay');
  if (!(el instanceof HTMLDivElement)) {
    throw new Error('в разметке нет <div id="overlay" hidden>');
  }
  overlayEl = el;

  el.addEventListener('pointerdown', (e) => {
    if (e.target !== el || !currentDismiss) return;
    const dismiss = currentDismiss;
    hideModal();
    dismiss();
  });

  return el;
}

export function hideModal(): void {
  const el = overlay();
  el.hidden = true;
  el.replaceChildren();
  currentDismiss = null;
}

export function isModalOpen(): boolean {
  return !overlay().hidden;
}

export function showModal(options: ModalOptions): void {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const h2 = document.createElement('h2');
  h2.textContent = options.title;
  modal.appendChild(h2);

  if (options.result !== undefined) {
    const result = document.createElement('div');
    result.className = 'result';
    result.textContent = options.result;
    modal.appendChild(result);
  }

  if (options.text) {
    const p = document.createElement('p');
    p.textContent = options.text;
    modal.appendChild(p);
  }

  if (options.body) modal.appendChild(options.body);

  // Все кнопки модалки блокируются на время ЛЮБОГО незавершённого действия,
  // а не только нажатой — иначе пока одна кнопка ждёт рекламу (секунды), вторая
  // остаётся кликабельной и может выполниться поверх ещё не пришедшего
  // результата первой (двойная выдача награды, откат поверх нового состояния).
  const buttons: HTMLButtonElement[] = [];
  for (const action of options.actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'btn' +
      (action.kind === 'ghost' ? ' btn-ghost' : action.kind === 'reward' ? ' btn-reward' : '');
    btn.textContent = action.label;
    btn.onclick = () => {
      for (const b of buttons) b.disabled = true;
      void Promise.resolve(action.onClick()).finally(() => {
        for (const b of buttons) b.disabled = false;
      });
    };
    buttons.push(btn);
    modal.appendChild(btn);
  }

  const el = overlay();
  el.replaceChildren(modal);
  el.hidden = false;

  currentDismiss = options.dismissible ? (options.onDismiss ?? hideModal) : null;
}

export interface LeaderEntry {
  rank: number;
  score: number;
  name: string;
  isMe: boolean;
}

/** Строит таблицу лидеров из ответа платформы. */
export function buildLeaderList(
  entries: LeaderEntry[],
  options: { emptyText: string; fallbackName: string; formatScore: (n: number) => string },
): HTMLElement {
  const list = document.createElement('div');
  list.className = 'leader-list';

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = options.emptyText;
    list.appendChild(empty);
    return list;
  }

  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'leader-row' + (entry.isMe ? ' me' : '');

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = String(entry.rank);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name || options.fallbackName;

    const score = document.createElement('span');
    score.textContent = options.formatScore(entry.score);

    row.append(rank, name, score);
    list.appendChild(row);
  }

  return list;
}
