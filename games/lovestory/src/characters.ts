/**
 * Персонажи клуба. `available: false` — тизер «скоро»: карточка видна в хабе,
 * но глав пока нет. Так ростер выглядит полным с первого дня, а контент можно
 * дописывать по одному персонажу за раз.
 */

export type CharacterId = 'artem' | 'daniil' | 'ruslan' | 'lev' | 'mark';

/** Силуэт причёски. 'curly' — плотные завитки кластерами, а не гладкая чёлка,
 * читается издалека даже на маленькой миниатюре в хабе. 'undercut' — бритые
 * виски и растрёпанный верх торчком, самый резкий из силуэтов. */
export type HairStyle = 'short' | 'long' | 'swept' | 'curly' | 'undercut';

/** Силуэт одежды — задаёт другой воротник/крой поверх тех же плеч. */
export type OutfitStyle = 'tee' | 'jacket' | 'hoodie';

export type Gender = 'male' | 'female';

/**
 * Необязательная деталь поверх лица — усиливает характер персонажа, а не
 * только палитру. Такие метки читаются мгновенно, даже на маленькой
 * миниатюре в хабе, где форма лица и оттенок волос теряются.
 */
export type Accessory = 'glasses' | 'earring' | 'beautyMark' | 'scar';

/**
 * Форма лица — самое сильное «кто есть кто» на портрете, сильнее цвета волос.
 * Без него все парни делят один контур и различаются только палитрой.
 * 'square' — широкая, обрубленный подбородок (спортивный типаж).
 * 'lean' — узкая и вытянутая (утончённый типаж).
 * 'round' — мягкие полные щёки (дружелюбный типаж).
 * 'sharp' — высокие скулы, острый подбородок (драматичный типаж).
 */
export type FaceShape = 'square' | 'lean' | 'round' | 'sharp';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  age: number;
  tagline: string;
  available: boolean;
  /** Все персонажи клуба сейчас — парни; поле задел на будущих героинь (подруги, соперницы). */
  gender: Gender;
  skin: string;
  hair: string;
  hairDark: string;
  eyes: string;
  outfit: string;
  outfitDark: string;
  hairStyle: HairStyle;
  outfitStyle: OutfitStyle;
  faceShape: FaceShape;
  accessory?: Accessory;
  /** Ширина плеч относительно базового силуэта — лёгкая вариация комплекции. */
  build: number;
}

export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: 'artem',
    name: 'Артём',
    age: 19,
    tagline: 'Капитан сборной по плаванию. Улыбается чаще, чем говорит.',
    available: true,
    gender: 'male',
    skin: '#f5c99a',
    hair: '#6b4a30',
    hairDark: '#2c1c12',
    eyes: '#5b8def',
    outfit: '#e0574b',
    outfitDark: '#a83e35',
    hairStyle: 'short',
    outfitStyle: 'tee',
    faceShape: 'square',
    build: 1.08,
  },
  {
    id: 'daniil',
    name: 'Даниил',
    age: 20,
    tagline: 'Играет на гитаре по вечерам на крыше общаги.',
    available: true,
    gender: 'male',
    skin: '#f2d3b0',
    hair: '#3a3c52',
    hairDark: '#151620',
    eyes: '#8a6bc4',
    outfit: '#4a4f6b',
    outfitDark: '#2f3347',
    hairStyle: 'long',
    outfitStyle: 'jacket',
    faceShape: 'lean',
    accessory: 'earring',
    build: 0.94,
  },
  {
    id: 'ruslan',
    name: 'Руслан',
    age: 21,
    tagline: 'Ведёт научный канал о космосе. 40 тысяч подписчиков.',
    available: true,
    gender: 'male',
    skin: '#8a5a3a',
    hair: '#241f1c',
    hairDark: '#0f0d0b',
    eyes: '#4fb286',
    outfit: '#2e86de',
    outfitDark: '#1f5c9a',
    hairStyle: 'swept',
    outfitStyle: 'hoodie',
    accessory: 'glasses',
    faceShape: 'round',
    build: 1,
  },
  {
    id: 'lev',
    name: 'Лев',
    age: 20,
    tagline: 'Играет главные роли в театральной студии. Из образа выходит не сразу.',
    available: false,
    gender: 'male',
    skin: '#c98a5e',
    hair: '#8a3a2e',
    hairDark: '#3a1712',
    eyes: '#d4923e',
    outfit: '#2a2430',
    outfitDark: '#16121a',
    hairStyle: 'curly',
    outfitStyle: 'jacket',
    faceShape: 'sharp',
    accessory: 'beautyMark',
    build: 1.02,
  },
  {
    id: 'mark',
    name: 'Марк',
    age: 20,
    tagline: 'Чинит мотоциклы в гараже отца. Из школы выгоняли трижды.',
    available: false,
    gender: 'male',
    skin: '#d9a06a',
    hair: '#b0b0ba',
    hairDark: '#6e6e78',
    eyes: '#7a8896',
    outfit: '#1c1c1e',
    outfitDark: '#0a0a0b',
    hairStyle: 'undercut',
    outfitStyle: 'jacket',
    faceShape: 'square',
    accessory: 'scar',
    build: 1.15,
  },
];

export const characterById = (id: CharacterId): CharacterDef =>
  CHARACTERS.find((c) => c.id === id) ?? (CHARACTERS[0] as CharacterDef);
