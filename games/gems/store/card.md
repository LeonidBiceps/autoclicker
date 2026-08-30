# Карточка игры — Самоцветы

Готовые тексты для консоли разработчика. Копируются как есть.

---

## Русский

**Название**

```
Самоцветы
```

**Короткое описание** (~100 символов)

```
Собирайте ряды из трёх самоцветов и ловите комбо. Без ограничения по времени.
```

**Полное описание**

```
Меняйте местами соседние камни, чтобы собрать ряд из трёх и больше. Поле само
досыпается сверху — иногда одно движение запускает цепочку из нескольких
совпадений подряд, и это самое приятное чувство в игре.

Что есть внутри:
• Ряд из четырёх — камень-молния, сносит весь ряд или столбец. Ряд из пяти — бомба, сносит квадрат вокруг себя
• Бесконечный режим без ограничения по времени и без поражения
• Комбо: чем длиннее цепочка, тем больше очков за ход
• Подсказка хода, если долго думаете
• Удвоение очков и перемешивание поля — по желанию, за просмотр рекламы
• Таблица лидеров и облачное сохранение партии

Тупиковое поле — не ваша вина: игра сама бесплатно его пересоберёт.
```

**Теги**

```
три в ряд, match-3, головоломка, самоцветы, таймкиллер, казуальная, комбо, бомбы, спецкамни
```

**Категории**: головоломки, казуальные

**Возрастной рейтинг**: 0+

**Язык**: русский, английский

---

## English

**Title**

```
Gems
```

**Short description**

```
Match three or more gems and chain combos. No time limit, ever.
```

**Full description**

```
Swap neighboring gems to line up three or more. The board refills itself from
above — sometimes one move sets off a chain of several matches in a row, and
that is the best feeling in the game.

Inside:
• Match four in a row for a lightning gem that clears a whole row or column. Match five for a bomb that clears a square around it
• Endless mode — no timer, no losing state
• Combos: longer chains score more per move
• A hint appears if you take a while to move
• Double points and a board reshuffle — optional, for watching an ad
• Leaderboard and cloud save

A dead-end board is never your fault: the game reshuffles it for free.
```

**Tags**

```
match-3, puzzle, gems, time killer, casual, combo, swap, bombs, power-ups
```

---

## Ассеты

| Файл | Размер | Назначение |
| --- | --- | --- |
| `icon-512.png` | 512×512 | иконка |
| `cover-800x470.png` | 800×470 | обложка каталога |
| `screenshot-1..3-1280x720.png` | 1280×720 | скриншоты |

Скриншоты собраны из настоящей модели игры (через прямой вызов хода в dev-сборке,
минуя анимацию) — расклад камней и счёт реальные. **Сверьте размеры с
требованиями в консоли перед загрузкой.**

Пересобрать:

```bash
npm run assets -- gems
```

## Технический чек-лист перед отправкой

- [ ] В консоли создан лидерборд с техническим именем `bestScore`, сортировка
      по убыванию
- [ ] Загружен архив из `build/gems-v0.1.0.zip`
- [ ] На тестовой ссылке: своп работает и тапом, и перетаскиванием, rewarded
      доходит до награды, сейв (расклад поля + счёт) переживает перезагрузку
- [ ] Возрастной рейтинг 0+
- [ ] Указаны оба языка игры
