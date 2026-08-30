# Карточка игры — Астроштурм

Готовые тексты для консоли разработчика. Копируются как есть.

---

## Русский

**Название**

```
Астроштурм
```

**Короткое описание** (~100 символов)

```
Отражайте волны врагов, прыгайте по платформам и прокачивайтесь между боями.
```

**Полное описание**

```
Волна за волной идут враги — стреляйте, прыгайте по платформам и зачищайте
арену. Между волнами открыт магазин: вкладывайте монеты в урон, скорострельность,
живучесть и скорость, чтобы продержаться дольше.

Что есть внутри:
• 5 видов оружия — от пистолета до ракетницы, у каждого свой почерк боя
• 3 класса персонажа с разными бонусами к бою
• Постоянные перки, которые остаются после смерти и усиливают все следующие забеги
• Автонаведение на ближайшего врага или ручной прицел мышью — как удобнее
• Возрождение за просмотр рекламы — забег не обрывается на середине
• Таблица лидеров по лучшей волне и облачное сохранение прогресса

Каждая новая волна сильнее предыдущей — вопрос не в том, победите ли вы,
а в том, докуда дойдёте.
```

**Теги**

```
шутер, аркада, экшн, волны врагов, платформер, прокачка, стрелялка
```

**Категории**: аркады, экшн

**Возрастной рейтинг**: 12+ (мультяшное насилие)

**Язык**: русский, английский

---

## English

**Title**

```
Astro Assault
```

**Short description**

```
Fight off waves of enemies, jump between platforms, and upgrade between fights.
```

**Full description**

```
Enemies come wave after wave — shoot, jump across platforms, and clear the
arena. A shop opens between waves: spend coins on damage, fire rate,
survivability, and speed to last longer.

Inside:
• 5 weapons, from a pistol to a rocket launcher, each with its own feel
• 3 character classes with different combat bonuses
• Permanent perks that survive death and boost every future run
• Auto-aim on the nearest enemy, or manual mouse aim — your choice
• Watch an ad to revive — a run doesn't end mid-fight
• Leaderboard by best wave reached, plus cloud save

Every new wave is tougher than the last — the question isn't whether you'll
win, it's how far you'll get.
```

**Tags**

```
shooter, arcade, action, wave defense, platformer, upgrades, run and gun
```

---

## Ассеты

| Файл | Размер | Назначение |
| --- | --- | --- |
| `icon-512.png` | 512×512 | иконка |
| `cover-800x470.png` | 800×470 | обложка каталога |
| `screenshot-1..3-1280x720.png` | 1280×720 | скриншоты |

Скриншоты собраны из настоящего рендерера игры (через `window.__debug.renderPreview`
в dev-сборке — отдельная арена на офскрин-канвасе, реальный забег игрока не
трогается) — персонаж, враги и платформы настоящие. **Сверьте размеры с
требованиями в консоли перед загрузкой.**

Пересобрать:

```bash
npm run assets -- astroassault
```

## Технический чек-лист перед отправкой

- [ ] В консоли создан лидерборд с техническим именем `bestWave`, сортировка
      по убыванию
- [ ] Загружен архив из `build/astroassault-v0.1.0.zip`
- [ ] На тестовой ссылке: стрельба и прыжок отвечают, прицел мышью не залипает
      при выходе курсора за пределы поля, rewarded-возрождение доходит до
      награды, сейв (перки, оружие, лучшая волна) переживает перезагрузку
- [ ] Возрастной рейтинг подобран верно (мультяшное насилие — не 0+)
- [ ] Указаны оба языка игры
