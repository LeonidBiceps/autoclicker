// База карт Clash Royale: название + стоимость эликсира.
//
// Это просто факты об игре (числа и названия), а не графика — сюда осознанно не входят никакие
// изображения самой Supercell. Список составлен по памяти и может не содержать самые новые карты
// (игра регулярно пополняется) — если тут чего-то не хватает или стоимость эликсира изменилась в
// новом патче, поправь прямо в этом файле (формат: { id, name, elixir }, id — латиницей без
// пробелов, используется как имя файла иконки в clash-card-icons/<id>.png).
//
// Иконки карт сюда НЕ входят: при первом запуске функции для каждой карты без файла-иконки
// генерируется временная заглушка (см. ensureClashCardIcons в main.js) — просто цветной квадрат с
// подписью, чтобы движок сравнения картинок можно было проверить уже сейчас. Как только появятся
// настоящие иконки (скриншоты из своего клиента игры) — кладёшь файл с тем же id в
// clash-card-icons/, заглушка просто перезаписывается, код трогать не нужно.
//
// spawns — необязательное поле: id других карт из этого же списка, которых данная карта сама
// периодически или единоразово порождает на поле (например, Хижина гоблинов время от времени
// спавнит отдельного Гоблина с копьями — это НЕ значит, что противник только что разыграл ещё и
// его как отдельную карту). main.js использует это, чтобы не засчитывать такой спавн как новый
// самостоятельный розыгрыш карты, пока сам "спавнер" недавно был замечен поблизости — см.
// clashActiveSpawners в main.js. Список по памяти, не претендует на полноту — новые случаи можно
// дописывать сюда по мере обнаружения на практике (в том числе через "Разбор матча").
const CLASH_CARDS = [
  { id: "knight", name: "Рыцарь", elixir: 3 },
  { id: "archers", name: "Лучницы", elixir: 3 },
  { id: "arrows", name: "Стрелы", elixir: 3 },
  { id: "goblins", name: "Гоблины", elixir: 2, count: 3 },
  { id: "spear-goblins", name: "Гоблины с копьями", elixir: 2 },
  { id: "bomber", name: "Подрывник", elixir: 2 },
  { id: "minions", name: "Миньоны", elixir: 3 },
  { id: "skeletons", name: "Скелеты", elixir: 1, count: 3 },
  { id: "barbarians", name: "Варвары", elixir: 5, count: 5 },
  { id: "fire-spirits", name: "Огненные духи", elixir: 2 },
  { id: "ice-spirit", name: "Ледяной дух", elixir: 1 },
  { id: "giant-snowball", name: "Снежок", elixir: 2 },
  { id: "zap", name: "Разряд", elixir: 2 },
  { id: "tombstone", name: "Надгробие", elixir: 3, spawns: ["skeletons"] },
  { id: "cannon", name: "Пушка", elixir: 3 },
  { id: "mortar", name: "Мортира", elixir: 4 },
  { id: "musketeer", name: "Мушкетёр", elixir: 4 },
  { id: "valkyrie", name: "Валькирия", elixir: 4 },
  { id: "battle-ram", name: "Таран", elixir: 4 },
  { id: "bomb-tower", name: "Бомбическая башня", elixir: 4 },
  { id: "furnace", name: "Горн", elixir: 4, spawns: ["fire-spirits"] },
  { id: "goblin-hut", name: "Хижина гоблинов", elixir: 4, spawns: ["spear-goblins"] },
  { id: "ice-golem", name: "Ледяной голем", elixir: 2 },
  { id: "royal-giant", name: "Королевский великан", elixir: 6 },
  { id: "elixir-collector", name: "Сборщик эликсира", elixir: 6 },
  { id: "giant", name: "Великан", elixir: 5 },
  { id: "hog-rider", name: "Кабан", elixir: 4 },
  { id: "minion-horde", name: "Орда миньонов", elixir: 5, count: 6 }, // 6 миньонов сразу — не 6 отдельных розыгрышей
  { id: "wizard", name: "Волшебник", elixir: 5 },
  { id: "royal-recruits", name: "Королевские рекруты", elixir: 7, count: 6 },
  { id: "skeleton-army", name: "Армия скелетов", elixir: 3, count: 15 },
  { id: "baby-dragon", name: "Дракончик", elixir: 4 },
  { id: "prince", name: "Принц", elixir: 5 },
  { id: "witch", name: "Ведьма", elixir: 5, spawns: ["skeletons"] },
  { id: "balloon", name: "Воздушный шар", elixir: 5 },
  { id: "rage", name: "Ярость", elixir: 2 },
  { id: "freeze", name: "Заморозка", elixir: 4 },
  { id: "mirror", name: "Зеркало", elixir: 1 },
  { id: "barbarian-hut", name: "Хижина варваров", elixir: 6, spawns: ["barbarians"] },
  { id: "elite-barbarians", name: "Элитные варвары", elixir: 6 },
  { id: "fireball", name: "Огненный шар", elixir: 4 },
  { id: "goblin-gang", name: "Банда гоблинов", elixir: 3, spawns: ["goblins", "spear-goblins"] }, // 3 обычных + 3 с копьями сразу
  { id: "guards", name: "Стражи", elixir: 3, count: 3 },
  { id: "lumberjack", name: "Лесоруб", elixir: 4 },
  { id: "night-witch", name: "Ночная ведьма", elixir: 4, spawns: ["bats"] },
  { id: "poison", name: "Яд", elixir: 4 },
  { id: "rocket", name: "Ракета", elixir: 6 },
  { id: "tesla", name: "Тесла", elixir: 4 },
  { id: "three-musketeers", name: "Три мушкетёра", elixir: 9, count: 3 },
  { id: "tornado", name: "Торнадо", elixir: 3 },
  { id: "clone", name: "Клон", elixir: 3 },
  { id: "dark-prince", name: "Тёмный принц", elixir: 4 },
  { id: "electro-wizard", name: "Электро-маг", elixir: 4 },
  { id: "goblin-barrel", name: "Бочка гоблинов", elixir: 3 },
  { id: "inferno-tower", name: "Адская башня", elixir: 5 },
  { id: "lava-hound", name: "Лавовая гончая", elixir: 7 },
  { id: "mega-minion", name: "Мега-миньон", elixir: 3 },
  { id: "mini-pekka", name: "Мини П.Е.К.К.А", elixir: 4 },
  { id: "pekka", name: "П.Е.К.К.А", elixir: 7 },
  { id: "sparky", name: "Спарки", elixir: 6 },
  { id: "x-bow", name: "Икс-лук", elixir: 6 },
  { id: "bandit", name: "Бандитка", elixir: 3 },
  { id: "bowler", name: "Метатель ядер", elixir: 5 },
  { id: "executioner", name: "Палач", elixir: 5 },
  { id: "cannon-cart", name: "Пушечная тележка", elixir: 5 },
  { id: "electro-dragon", name: "Электро-дракон", elixir: 5 },
  { id: "firecracker", name: "Хлопушка", elixir: 3 },
  { id: "flying-machine", name: "Летающая машина", elixir: 4 },
  { id: "giant-skeleton", name: "Гигантский скелет", elixir: 6 },
  { id: "goblin-cage", name: "Клетка гоблинов", elixir: 4 },
  { id: "goblin-drill", name: "Бур гоблинов", elixir: 4, spawns: ["goblins"] },
  { id: "graveyard", name: "Кладбище", elixir: 5, spawns: ["skeletons"] }, // заклинание — скелеты появляются на территории противника в течение времени
  { id: "hunter", name: "Охотник", elixir: 4 },
  { id: "ice-wizard", name: "Ледяной маг", elixir: 3 },
  { id: "inferno-dragon", name: "Адский дракон", elixir: 4 },
  { id: "magic-archer", name: "Волшебный лучник", elixir: 4 },
  { id: "mega-knight", name: "Мега-рыцарь", elixir: 7 },
  { id: "miner", name: "Шахтёр", elixir: 3 },
  { id: "royal-ghost", name: "Королевский призрак", elixir: 3 },
  { id: "skeleton-barrel", name: "Бочка скелетов", elixir: 3 },
  { id: "wall-breakers", name: "Разрушители стен", elixir: 2 },
  { id: "barbarian-barrel", name: "Бочка варваров", elixir: 2 },
  { id: "battle-healer", name: "Боевой лекарь", elixir: 4 },
  { id: "bats", name: "Летучие мыши", elixir: 2 },
  { id: "dart-goblin", name: "Гоблин с духовой трубкой", elixir: 3 },
  { id: "earthquake", name: "Землетрясение", elixir: 3 },
  { id: "electro-giant", name: "Электро-великан", elixir: 8 },
  { id: "elixir-golem", name: "Эликсирный голем", elixir: 3 },
  { id: "fisherman", name: "Рыбак", elixir: 3 },
  { id: "golden-knight", name: "Золотой рыцарь", elixir: 4 },
  { id: "goblin-machine", name: "Машина гоблинов", elixir: 5 },
  { id: "little-prince", name: "Маленький принц", elixir: 3 },
  { id: "monk", name: "Монах", elixir: 5 },
  { id: "mother-witch", name: "Мать-ведьма", elixir: 4 },
  { id: "phoenix", name: "Феникс", elixir: 4 },
  { id: "royal-delivery", name: "Королевская доставка", elixir: 3 },
  { id: "royal-hogs", name: "Королевские кабаны", elixir: 5 },
  { id: "skeleton-dragons", name: "Драконы-скелеты", elixir: 4 },
  { id: "skeleton-king", name: "Король скелетов", elixir: 4, spawns: ["skeletons"] }, // призывает скелетов способностью, не постоянно
  { id: "void", name: "Пустота", elixir: 3 },
  { id: "archer-queen", name: "Королева лучниц", elixir: 5 },
  { id: "golem", name: "Голем", elixir: 8 },
  { id: "goblin-giant", name: "Гоблин-великан", elixir: 6 },
  { id: "rascals", name: "Хулиганы", elixir: 5 },
];

module.exports = { CLASH_CARDS };
