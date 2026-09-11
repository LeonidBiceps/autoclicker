# autoclicker

Монорепозиторий с несколькими независимыми продуктами:

- **[`desktop-clicker/`](desktop-clicker/README.md)** — «МультиТул», desktop-автокликер на Electron
  (Windows): мышь/клавиатура, макросы, триггеры по цвету/тексту/картинке, запись экрана и другое.
  Основной платный продукт, есть готовый `.exe` в
  [релизах](https://github.com/LeonidBiceps/autoclicker/releases/latest).
- **[`extensions/`](extensions/README.md)** — шесть расширений для Chrome: `clicker` (браузерная
  версия автокликера, платный Pro), `distraction-blocker`, `text-counter`, `price-tracker`,
  `ai-summarizer`, `ai-rewriter`.
- **[`games/`](games/README.md)** — побочный проект, не связанный с автокликером: портфель
  HTML5-игр для Яндекс Игр на общем движке (`packages/engine`, `packages/ysdk`).

`desktop-clicker` и `extensions/clicker` — один и тот же автокликер в двух формах (десктоп и
браузер), с общим форматом лицензионного ключа. `games/` — независимый побочный проект в том же
репозитории, подробности в его собственном README.
