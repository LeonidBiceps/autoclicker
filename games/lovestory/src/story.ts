/**
 * Формат сценария: главы — графы реплик с редкими развилками. Развилка не
 * ветвит сюжет целиком (это бы умножало объём текста на каждый выбор) — она
 * даёт／отнимает симпатию и на пару реплик меняет тон ответа, а затем сюжет
 * сходится обратно в общий узел. Это стандартный приём жанра: игрок чувствует
 * выбор, а сценарист пишет один сюжет, а не дерево.
 */

import type { CharacterId } from './characters';

export type Expression = 'neutral' | 'smile' | 'shy' | 'surprised' | 'laugh' | 'sad';

export interface DialogueLine {
  speaker: 'narrator' | CharacterId | 'player';
  text: string;
  expression?: Expression;
}

export interface Choice {
  text: string;
  delta: number;
  next: string;
}

export interface DialogueNode {
  id: string;
  lines: DialogueLine[];
  choices?: Choice[];
  /** Следующий узел, если развилки нет. Отсутствует — конец главы. */
  next?: string;
}

/** Место действия — определяет фон сцены (см. scene.ts). */
export type Location = 'hallway' | 'cafeteria' | 'rooftop' | 'observatory';

export interface Chapter {
  id: string;
  characterId: CharacterId;
  title: string;
  location: Location;
  energyCost: number;
  coinReward: number;
  startNode: string;
  nodes: Record<string, DialogueNode>;
}

const artem1: Chapter = {
  id: 'artem-1',
  characterId: 'artem',
  title: 'Глава 1. Опоздание',
  location: 'hallway',
  energyCost: 1,
  coinReward: 15,
  startNode: 'n1',
  nodes: {
    n1: {
      id: 'n1',
      lines: [
        { speaker: 'narrator', text: 'Звонок уже прозвенел. Ты влетаешь в класс — и врезаешься прямо в него.' },
        { speaker: 'artem', text: 'Ого. Ты как пушечное ядро.', expression: 'surprised' },
      ],
      next: 'n2',
    },
    n2: {
      id: 'n2',
      lines: [{ speaker: 'artem', text: 'Всё в порядке? Ничего не сломала — ни себя, ни меня?', expression: 'smile' }],
      choices: [
        { text: 'Прости, я спешила...', delta: 2, next: 'n3a' },
        { text: 'Сам виноват — стоишь посреди прохода.', delta: 3, next: 'n3b' },
      ],
    },
    n3a: {
      id: 'n3a',
      lines: [
        { speaker: 'player', text: 'Прости, я спешила...' },
        { speaker: 'artem', text: 'Да ладно, я не со зла. Бывает.', expression: 'smile' },
      ],
      next: 'n4',
    },
    n3b: {
      id: 'n3b',
      lines: [
        { speaker: 'player', text: 'Сам виноват — стоишь посреди прохода.' },
        { speaker: 'artem', text: 'Ха! А ты за словом в карман не лезешь.', expression: 'laugh' },
      ],
      next: 'n4',
    },
    n4: {
      id: 'n4',
      lines: [
        { speaker: 'artem', text: 'Кстати, я тебя раньше не видел. Новенькая?', expression: 'neutral' },
        { speaker: 'narrator', text: 'Он поднимает с пола твою упавшую тетрадь и протягивает её тебе.' },
      ],
      next: 'n5',
    },
    n5: {
      id: 'n5',
      lines: [
        {
          speaker: 'artem',
          text: 'Держи. И — если что, в столовой после третьего урока свободно место рядом со мной.',
          expression: 'smile',
        },
      ],
      choices: [
        { text: 'Заметано.', delta: 3, next: 'end' },
        { text: 'Посмотрим на моё настроение.', delta: 1, next: 'end' },
      ],
    },
    end: {
      id: 'end',
      lines: [
        { speaker: 'narrator', text: 'Звонок на урок. Он уходит, на ходу оборачиваясь — и улыбается.' },
        { speaker: 'artem', text: 'До встречи, пушечное ядро.', expression: 'laugh' },
      ],
    },
  },
};

const artem2: Chapter = {
  id: 'artem-2',
  characterId: 'artem',
  title: 'Глава 2. Столовая',
  location: 'cafeteria',
  energyCost: 1,
  coinReward: 18,
  startNode: 'n1',
  nodes: {
    n1: {
      id: 'n1',
      lines: [
        { speaker: 'narrator', text: 'В столовой шумно. Ты ищешь его глазами — и он машет тебе рукой издалека.' },
        { speaker: 'artem', text: 'Держала слово! Не думал, что правда придёшь.', expression: 'smile' },
      ],
      next: 'n2',
    },
    n2: {
      id: 'n2',
      lines: [{ speaker: 'artem', text: 'Садись. Тут только я и вечно недожаренная картошка.', expression: 'smile' }],
      choices: [
        { text: 'А ты, значит, скучал по компании?', delta: 3, next: 'n3a' },
        { text: 'Главное, что не подгоревшая.', delta: 2, next: 'n3b' },
      ],
    },
    n3a: {
      id: 'n3a',
      lines: [
        { speaker: 'player', text: 'А ты, значит, скучал по компании?' },
        { speaker: 'artem', text: 'Может, самую малость.', expression: 'shy' },
      ],
      next: 'n4',
    },
    n3b: {
      id: 'n3b',
      lines: [
        { speaker: 'player', text: 'Главное, что не подгоревшая.' },
        { speaker: 'artem', text: 'Философия выживания в нашей столовой. Уважаю.', expression: 'laugh' },
      ],
      next: 'n4',
    },
    n4: {
      id: 'n4',
      lines: [
        { speaker: 'artem', text: 'Слушай, а ты вообще на тренировки заходишь? У нас в четверг открытый заплыв.', expression: 'neutral' },
        { speaker: 'narrator', text: 'Он говорит небрежно, но смотрит внимательно — ждёт ответа.' },
      ],
      choices: [
        { text: 'Приду поболеть.', delta: 4, next: 'end' },
        { text: 'Посмотрим по расписанию.', delta: 1, next: 'end' },
      ],
    },
    end: {
      id: 'end',
      lines: [{ speaker: 'artem', text: 'Буду искать тебя взглядом с бортика. Не пропадай.', expression: 'smile' }],
    },
  },
};

const daniil1: Chapter = {
  id: 'daniil-1',
  characterId: 'daniil',
  title: 'Глава 1. Крыша',
  location: 'rooftop',
  energyCost: 1,
  coinReward: 16,
  startNode: 'n1',
  nodes: {
    n1: {
      id: 'n1',
      lines: [
        { speaker: 'narrator', text: 'На лестнице пахнет пылью и августом. Дверь на крышу приоткрыта — и оттуда доносится тихий перебор струн.' },
        { speaker: 'narrator', text: 'Ты выходишь наружу. Он сидит на бортике вентиляции спиной к городу и не сразу замечает тебя.' },
      ],
      next: 'n2',
    },
    n2: {
      id: 'n2',
      lines: [
        { speaker: 'daniil', text: 'О. Меня обычно тут не находят.', expression: 'surprised' },
        { speaker: 'daniil', text: 'Это либо комплимент моей скрытности, либо ты просто заблудилась.', expression: 'neutral' },
      ],
      choices: [
        { text: 'Услышала музыку и пошла на звук.', delta: 3, next: 'n3a' },
        { text: 'Заблудилась. Признаю.', delta: 2, next: 'n3b' },
      ],
    },
    n3a: {
      id: 'n3a',
      lines: [
        { speaker: 'player', text: 'Услышала музыку и пошла на звук.' },
        { speaker: 'daniil', text: 'Значит, комплимент. Ладно, тогда садись — только осторожно, тут только один нормальный бортик.', expression: 'smile' },
      ],
      next: 'n4',
    },
    n3b: {
      id: 'n3b',
      lines: [
        { speaker: 'player', text: 'Заблудилась. Признаю.' },
        { speaker: 'daniil', text: 'Честно — уже плюс. Обычно мне врут про случайность.', expression: 'laugh' },
      ],
      next: 'n4',
    },
    n4: {
      id: 'n4',
      lines: [
        { speaker: 'narrator', text: 'Он подвигается, освобождая место рядом. Гитара остаётся у него на коленях, пальцы не отрываются от струн.' },
        { speaker: 'daniil', text: 'Я сюда прихожу, когда в комнате слишком много слов. Здесь их можно не говорить.', expression: 'neutral' },
      ],
      next: 'n5',
    },
    n5: {
      id: 'n5',
      lines: [{ speaker: 'daniil', text: 'Хочешь дослушать? Или тебе тоже иногда нужно молчать?', expression: 'shy' }],
      choices: [
        { text: 'Хочу дослушать.', delta: 3, next: 'end' },
        { text: 'Просто помолчим вместе.', delta: 4, next: 'end' },
      ],
    },
    end: {
      id: 'end',
      lines: [
        { speaker: 'narrator', text: 'Он снова опускает пальцы на струны. Мелодия тихая, не для чужих ушей — но он не просит тебя уйти.' },
        { speaker: 'daniil', text: 'Приходи ещё, если найдёшь дорогу.', expression: 'smile' },
      ],
    },
  },
};

const daniil2: Chapter = {
  id: 'daniil-2',
  characterId: 'daniil',
  title: 'Глава 2. Новая песня',
  location: 'rooftop',
  energyCost: 1,
  coinReward: 19,
  startNode: 'n1',
  nodes: {
    n1: {
      id: 'n1',
      lines: [
        { speaker: 'narrator', text: 'Ты нашла дорогу во второй раз — уже без блужданий по лестнице.' },
        { speaker: 'daniil', text: 'Ты быстро учишься. Подозрительно быстро.', expression: 'smile' },
      ],
      next: 'n2',
    },
    n2: {
      id: 'n2',
      lines: [
        { speaker: 'daniil', text: 'Я тут кое-что дописал. Ещё сырое — но ты первая, кому вообще показываю.', expression: 'shy' },
      ],
      choices: [
        { text: 'Почему именно мне?', delta: 3, next: 'n3a' },
        { text: 'Тогда не тяни, играй.', delta: 2, next: 'n3b' },
      ],
    },
    n3a: {
      id: 'n3a',
      lines: [
        { speaker: 'player', text: 'Почему именно мне?' },
        { speaker: 'daniil', text: 'Потому что ты не спросила, зачем мне это. Остальные всегда спрашивают «зачем».', expression: 'neutral' },
      ],
      next: 'n4',
    },
    n3b: {
      id: 'n3b',
      lines: [
        { speaker: 'player', text: 'Тогда не тяни, играй.' },
        { speaker: 'daniil', text: 'Требовательная. Мне нравится.', expression: 'laugh' },
      ],
      next: 'n4',
    },
    n4: {
      id: 'n4',
      lines: [
        { speaker: 'narrator', text: 'Он играет — коротко, три куплета. Голос тише, чем обычная речь, будто песня не рассчитана на то, чтобы её услышали до конца.' },
        { speaker: 'daniil', text: 'Ну как. Честно.', expression: 'neutral' },
      ],
      next: 'n5',
    },
    n5: {
      id: 'n5',
      lines: [{ speaker: 'daniil', text: 'Она вообще-то про одного человека, с которым я недавно разговаривал на крыше.', expression: 'shy' }],
      choices: [
        { text: 'Это ведь про меня, да?', delta: 5, next: 'end' },
        { text: 'Надеюсь, у него хороший вкус.', delta: 3, next: 'end' },
      ],
    },
    end: {
      id: 'end',
      lines: [
        { speaker: 'daniil', text: 'Узнаем со временем.', expression: 'smile' },
        { speaker: 'narrator', text: 'Он отводит взгляд к городу, но улыбка остаётся — и явно не только из-за песни.' },
      ],
    },
  },
};

const ruslan1: Chapter = {
  id: 'ruslan-1',
  characterId: 'ruslan',
  title: 'Глава 1. Съёмка',
  location: 'observatory',
  energyCost: 1,
  coinReward: 16,
  startNode: 'n1',
  nodes: {
    n1: {
      id: 'n1',
      lines: [
        { speaker: 'narrator', text: 'Дверь астрономического кружка открыта. Внутри — штатив, телескоп и Руслан, что-то бормочущий сам себе перед камерой.' },
        { speaker: 'ruslan', text: '...и если направить его чуть левее — а, привет! Ты вовремя, у меня тут кризис кадра.', expression: 'surprised' },
      ],
      next: 'n2',
    },
    n2: {
      id: 'n2',
      lines: [{ speaker: 'ruslan', text: 'Подержишь отражатель? Мне нужны обе руки и ещё одна на всякий случай.', expression: 'neutral' }],
      choices: [
        { text: 'Конечно, командуй.', delta: 3, next: 'n3a' },
        { text: 'А что я получу за помощь?', delta: 2, next: 'n3b' },
      ],
    },
    n3a: {
      id: 'n3a',
      lines: [
        { speaker: 'player', text: 'Конечно, командуй.' },
        { speaker: 'ruslan', text: 'Идеальный ассистент. Беру на постоянную ставку — зарплата в звёздах.', expression: 'laugh' },
      ],
      next: 'n4',
    },
    n3b: {
      id: 'n3b',
      lines: [
        { speaker: 'player', text: 'А что я получу за помощь?' },
        { speaker: 'ruslan', text: 'Упоминание в титрах. Между «спасибо маме» и «спасибо кофеину».', expression: 'smile' },
      ],
      next: 'n4',
    },
    n4: {
      id: 'n4',
      lines: [
        { speaker: 'narrator', text: 'Ты держишь отражатель, пока он выставляет кадр. Он на секунду забывает про камеру и смотрит прямо на тебя.' },
        { speaker: 'ruslan', text: 'Знаешь, в кадре ты смотришься лучше, чем Сатурн. А у меня стандарты высокие.', expression: 'shy' },
      ],
      next: 'n5',
    },
    n5: {
      id: 'n5',
      lines: [{ speaker: 'ruslan', text: 'Хочешь сказать пару слов на камеру? Подписчики оценят свежее лицо — оно и симпатичнее моего.', expression: 'smile' }],
      choices: [
        { text: 'Давай, не растеряюсь.', delta: 4, next: 'end' },
        { text: 'Ни за что, я стесняюсь камер.', delta: 2, next: 'end' },
      ],
    },
    end: {
      id: 'end',
      lines: [
        { speaker: 'narrator', text: 'Съёмка затягивается на час дольше, чем планировал Руслан — и, кажется, он совсем не против.' },
        { speaker: 'ruslan', text: 'Спасибо. Правда. Приходи ещё — тут всегда не хватает рук и хорошей компании.', expression: 'smile' },
      ],
    },
  },
};

const ruslan2: Chapter = {
  id: 'ruslan-2',
  characterId: 'ruslan',
  title: 'Глава 2. Звёздное небо',
  location: 'observatory',
  energyCost: 1,
  coinReward: 19,
  startNode: 'n1',
  nodes: {
    n1: {
      id: 'n1',
      lines: [
        { speaker: 'narrator', text: 'Он написал вечером: «Сегодня чистое небо и Сатурн виден идеально. Приходи, если не спишь».' },
        { speaker: 'ruslan', text: 'Ты пришла. Я почти не надеялся — обычно на «приходи смотреть на планету» никто не соглашается дважды.', expression: 'surprised' },
      ],
      next: 'n2',
    },
    n2: {
      id: 'n2',
      lines: [{ speaker: 'ruslan', text: 'Смотри в окуляр. Только медленно — от вида иногда сбивает с ног.', expression: 'neutral' }],
      choices: [
        { text: 'Ого. Кольца настоящие!', delta: 4, next: 'n3a' },
        { text: 'А оно точно не нарисовано на линзе?', delta: 2, next: 'n3b' },
      ],
    },
    n3a: {
      id: 'n3a',
      lines: [
        { speaker: 'player', text: 'Ого. Кольца настоящие!' },
        { speaker: 'ruslan', text: 'Вот за эту реакцию я и зову людей смотреть в телескоп. Ради неё всё это стоит того.', expression: 'smile' },
      ],
      next: 'n4',
    },
    n3b: {
      id: 'n3b',
      lines: [
        { speaker: 'player', text: 'А оно точно не нарисовано на линзе?' },
        { speaker: 'ruslan', text: 'Ха! Каждый второй так шутит. Но нет — это настоящий свет, который летел до нас больше часа.', expression: 'laugh' },
      ],
      next: 'n4',
    },
    n4: {
      id: 'n4',
      lines: [
        { speaker: 'narrator', text: 'Вы стоите рядом в темноте, и единственный свет — от приложения со звёздной картой на его телефоне.' },
        { speaker: 'ruslan', text: 'Знаешь, обычно я смотрю на небо один. Так лучше.', expression: 'shy' },
      ],
      next: 'n5',
    },
    n5: {
      id: 'n5',
      lines: [{ speaker: 'ruslan', text: 'Не жди, что я буду каждый раз ждать ясного неба ради компании. Хотя... сегодня, кажется, буду.', expression: 'shy' }],
      choices: [
        { text: 'Тогда буду проверять прогноз погоды вместе с тобой.', delta: 5, next: 'end' },
        { text: 'Звучит как первый шаг к звёздной зависимости.', delta: 3, next: 'end' },
      ],
    },
    end: {
      id: 'end',
      lines: [
        { speaker: 'ruslan', text: 'Договорились. Следующий ясный вечер — твой.', expression: 'smile' },
        { speaker: 'narrator', text: 'Сатурн в окуляре давно забыт — вы оба смотрите друг на друга дольше, чем на небо.' },
      ],
    },
  },
};

export const CHAPTERS: readonly Chapter[] = [artem1, artem2, daniil1, daniil2, ruslan1, ruslan2];

export const chaptersFor = (characterId: CharacterId): Chapter[] =>
  CHAPTERS.filter((c) => c.characterId === characterId);
