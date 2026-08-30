# Карточка игры — Башня

Готовые тексты для консоли разработчика. Копируются как есть.

---

## Русский

**Название**

```
Башня
```

**Короткое описание** (~100 символов)

```
Ловите момент и роняйте блоки максимально ровно — чем выше, тем быстрее.
```

**Полное описание**

```
Блок едет туда-сюда над башней — тапните в нужный момент, чтобы уронить его.
Чем точнее он ляжет на предыдущий, тем меньше отрежется. Идеальное попадание
сохраняет всю ширину блока и приносит больше очков — и следующий блок ловить
снова легче.

Что есть внутри:
• Простое управление в одно касание — суть жанра без лишнего
• Идеальные попадания дают бонус к очкам и серию комбо
• То, что не легло на башню, красиво отваливается и падает — просто зрелище
• Одно продолжение за рекламу, если башня всё-таки рухнула
• Таблица лидеров по высоте и облачное сохранение рекорда

С каждым этажом блоки едут быстрее — вопрос не в том, упадёт ли башня,
а в том, какой рекорд вы успеете поставить.
```

**Теги**

```
аркада, башня, стек, казуальная, реакция, таймкиллер, одним касанием
```

**Категории**: аркады, казуальные

**Возрастной рейтинг**: 0+

**Язык**: русский, английский

---

## English

**Title**

```
Tower
```

**Short description**

```
Time it right and drop blocks as evenly as you can — the higher you go, the faster it gets.
```

**Full description**

```
A block slides back and forth above your tower — tap at the right moment to
drop it. The more precisely it lands on the block below, the less gets cut
off. A perfect hit keeps the full width and scores more — and makes the next
catch easier too.

Inside:
• One-tap controls — the genre distilled to its essence
• Perfect hits score bonus points and build a combo streak
• Whatever misses the tower breaks off and falls — just for show
• One ad-powered continue if the tower falls
• Leaderboard by height and cloud-saved best score

Every floor makes the blocks move faster — the question isn't whether the
tower falls, it's how high you get before it does.
```

**Tags**

```
arcade, tower, stacker, casual, reflex, time killer, one tap
```

---

## Ассеты

| Файл | Размер | Назначение |
| --- | --- | --- |
| `icon-512.png` | 512×512 | иконка |
| `cover-800x470.png` | 800×470 | обложка каталога |
| `screenshot-1..3-1280x720.png` | 1280×720 | скриншоты |

Скриншоты собраны из настоящего рендерера игры (через `window.__debug.renderPreview`
в dev-сборке — отдельная башня на офскрин-канвасе, реальный забег игрока не
трогается) — сама башня, цвета блоков и летящий блок настоящие. **Сверьте
размеры с требованиями в консоли перед загрузкой.**

Пересобрать:

```bash
npm run assets -- towerstack
```

## Технический чек-лист перед отправкой

- [ ] В консоли создан лидерборд с техническим именем `bestHeight`, сортировка
      по убыванию
- [ ] Загружен архив из `build/towerstack-v0.1.0.zip`
- [ ] На тестовой ссылке: тап роняет блок, идеальное попадание не обрезает
      ширину, промах корректно завершает забег, rewarded-продолжение доходит
      до награды, сейв (рекорд, серия идеальных, ачивки) переживает перезагрузку
- [ ] Возрастной рейтинг 0+
- [ ] Указаны оба языка игры
