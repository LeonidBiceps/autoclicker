# Карточка игры — Клуб Свиданий

Готовые тексты для консоли разработчика. Копируются как есть.

---

## Русский

**Название**

```
Клуб Свиданий
```

**Короткое описание** (~100 символов)

```
Выбирайте, с кем из ребят продолжить историю, и завоёвывайте их сердца.
```

**Полное описание**

```
Визуальная новелла о свиданиях: три парня, у каждого своя история и свой
характер — капитан сборной по плаванию, гитарист с крыши общаги и блогер
о космосе. Проходите главы, выбирайте реплики в диалогах и наблюдайте,
как растут отношения.

Что есть внутри:
• 3 доступных персонажа и ещё один на подходе — истории пополняются
• Развилки в диалогах — от выбора зависит, как относится к вам персонаж
• Подарки — дарите кофе, цветы или открытку, чтобы сблизиться быстрее
• Система энергии восстанавливается сама или ускоряется за рекламу
• Достижения и таблица лидеров по количеству завоёванных сердец
• Облачное сохранение — прогресс не потеряется при смене устройства

Кто вам ближе — капитан, музыкант или мечтатель о звёздах? Решать вам.
```

**Теги**

```
визуальная новелла, свидания, история, отношения, романтика, диалоги, персонажи
```

**Категории**: казуальные, для девочек

**Возрастной рейтинг**: 12+

**Язык**: русский, английский

---

## English

**Title**

```
Dating Club
```

**Short description**

```
Pick who to continue the story with, and win their hearts.
```

**Full description**

```
A dating visual novel: three guys, each with their own story and personality
— a swim team captain, a rooftop guitarist, and a space blogger. Play through
chapters, choose your lines in dialogue, and watch the relationship grow.

Inside:
• 3 playable characters, with more stories on the way
• Branching dialogue — your choices shape how each character feels about you
• Gifts — coffee, flowers, or a card to grow closer faster
• An energy system that refills on its own, or instantly via an ad
• Achievements and a leaderboard by hearts won
• Cloud save — your progress follows you across devices

Who's it going to be — the captain, the musician, or the stargazer? Your call.
```

**Tags**

```
visual novel, dating sim, story, romance, relationships, dialogue, characters
```

---

## Ассеты

| Файл | Размер | Назначение |
| --- | --- | --- |
| `icon-512.png` | 512×512 | иконка |
| `cover-800x470.png` | 800×470 | обложка каталога |
| `screenshot-1..3-1280x720.png` | 1280×720 | скриншоты |

Скриншоты собраны из настоящего рендерера портрета/сцены игры (через
`window.__debug.renderPreview` в dev-сборке, на отдельном канвасе — реальный
DOM-диалог не трогается) — персонажи, фон и стиль настоящие. **Сверьте
размеры с требованиями в консоли перед загрузкой.**

Пересобрать:

```bash
npm run assets -- lovestory
```

## Технический чек-лист перед отправкой

- [ ] В консоли создан лидерборд с техническим именем `totalHearts`,
      сортировка по убыванию
- [ ] Загружен архив из `build/lovestory-v0.1.0.zip`
- [ ] На тестовой ссылке: печать текста и выбор реплик работают, подарки и
      магазин открываются, rewarded для энергии доходит до награды, сейв
      (отношения, пройденные главы) переживает перезагрузку
- [ ] Возрастной рейтинг 12+
- [ ] Указаны оба языка игры
