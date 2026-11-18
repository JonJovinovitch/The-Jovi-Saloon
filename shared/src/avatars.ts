/**
 * The cast.
 *
 * Every seat at the table is a western character. Rather than shipping sixteen
 * hand-drawn images (which a Discord activity cannot load from anywhere else
 * anyway), each one is a set of parameters that the client draws as inline SVG.
 * Same file feeds the picker, the seats and the server-side validation.
 */

export type HatStyle =
  | 'tengallon'
  | 'wide'
  | 'bowler'
  | 'flat'
  | 'cavalry'
  | 'plumed'
  | 'headscarf'
  | 'headband'
  | 'none';

export type HairStyle = 'short' | 'long' | 'wavy' | 'braids' | 'bun' | 'bald' | 'slick';

export type FacialHair = 'none' | 'mustache' | 'handlebar' | 'beard' | 'bigbeard' | 'goatee' | 'stubble' | 'chops';

export type Neckwear = 'none' | 'bandana' | 'kerchief' | 'bolo' | 'ribbon' | 'collar';

export type Accessory =
  | 'none'
  | 'badge'
  | 'cigar'
  | 'toothpick'
  | 'eyepatch'
  | 'specs'
  | 'monocle'
  | 'maskUp'
  | 'feather'
  | 'scar';

export interface AvatarLook {
  bg: string;
  skin: string;
  hair: string;
  shirt: string;
  vest: string | null;
  hat: HatStyle;
  hatColor: string;
  hatBand: string | null;
  hairStyle: HairStyle;
  facial: FacialHair;
  neck: Neckwear;
  neckColor: string;
  accessory: Accessory;
}

export interface AvatarDef {
  id: string;
  name: string;
  tagline: string;
  look: AvatarLook;
  /** Optional transparent portrait asset for special guest characters. */
  portrait?: string;
}

/* A dusty frontier palette, reused across the cast so it reads as one set. */
const C = {
  night: '#2a1f2d',
  dusk: '#3d2a35',
  sage: '#37432f',
  clay: '#5a3a2c',
  denim: '#2f4257',
  rust: '#6d3225',
  gold: '#7a5a24',
  slate: '#333b45',
  plum: '#412b40',
  moss: '#2e4038',
  sand: '#5c4a30',
  ash: '#2c2c30',
};

const SKIN = {
  deep: '#5c3a26',
  brown: '#7a4f31',
  tan: '#a3703f',
  olive: '#c08a55',
  fair: '#dda878',
  pale: '#e8c39a',
};

const HAIR = {
  black: '#181418',
  darkBrown: '#3a2418',
  brown: '#5c3a22',
  auburn: '#7a3a1e',
  grey: '#8e8a84',
  white: '#d6d2cb',
  sandy: '#a67c46',
};

export const AVATARS: AvatarDef[] = [
  {
    id: 'jonjonjovi',
    name: 'JonJonJovi',
    tagline: 'The saloon’s most unmistakable high roller.',
    portrait: '/characters/jonjonjovi.png',
    look: {
      bg: C.plum, skin: SKIN.tan, hair: HAIR.sandy, shirt: '#b02b87', vest: null,
      hat: 'none', hatColor: '#3c204a', hatBand: null, hairStyle: 'long', facial: 'none', neck: 'none', neckColor: '#b02b87', accessory: 'none',
    },
  },
  {
    id: 'chef-boy-are-you-jovi',
    name: 'Chef Boy Are You Jovi',
    tagline: 'The sauce is secret. The bluff is not.',
    portrait: '/characters/chef-boy-are-you-jovi.png',
    look: { bg: C.rust, skin: SKIN.olive, hair: HAIR.darkBrown, shirt: '#efe9dd', vest: null, hat: 'none', hatColor: '#efe9dd', hatBand: null, hairStyle: 'wavy', facial: 'mustache', neck: 'kerchief', neckColor: '#b13227', accessory: 'specs' },
  },
  {
    id: 'cowjovi',
    name: 'CowJovi',
    tagline: 'Saddles up, calls down, never backs down.',
    portrait: '/characters/cowjovi.png',
    look: { bg: C.sand, skin: SKIN.tan, hair: HAIR.sandy, shirt: '#5c3a22', vest: '#4a2e1e', hat: 'wide', hatColor: '#5b3821', hatBand: '#c9a24a', hairStyle: 'long', facial: 'beard', neck: 'bandana', neckColor: '#6d3225', accessory: 'badge' },
  },
  {
    id: 'crocojovi',
    name: 'CrocoJovi',
    tagline: 'Cold-blooded at the felt. Warm-hearted nowhere else.',
    portrait: '/characters/crocojovi.png',
    look: { bg: C.moss, skin: SKIN.olive, hair: HAIR.darkBrown, shirt: '#7a372c', vest: '#3a2a1c', hat: 'none', hatColor: '#6d3225', hatBand: null, hairStyle: 'wavy', facial: 'handlebar', neck: 'kerchief', neckColor: '#6d3225', accessory: 'specs' },
  },
  {
    id: 'gijovi',
    name: 'GI Jovi',
    tagline: 'Never leaves a chip behind.',
    portrait: '/characters/gijovi.png',
    look: { bg: C.moss, skin: SKIN.tan, hair: HAIR.sandy, shirt: '#465335', vest: '#354026', hat: 'cavalry', hatColor: '#465335', hatBand: '#1d281a', hairStyle: 'short', facial: 'none', neck: 'none', neckColor: '#465335', accessory: 'none' },
  },
  {
    id: 'goojovi',
    name: 'GooJovi',
    tagline: 'Keeps a straight face, somehow.',
    portrait: '/characters/goojovi.png',
    look: { bg: C.clay, skin: SKIN.olive, hair: HAIR.darkBrown, shirt: '#8a817d', vest: null, hat: 'none', hatColor: C.clay, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.clay, accessory: 'none' },
  },
  {
    id: 'gremjovi',
    name: 'GremJovi',
    tagline: 'Small ears. Enormous raises.',
    portrait: '/characters/gremjovi.png',
    look: { bg: C.dusk, skin: SKIN.tan, hair: HAIR.brown, shirt: '#72523a', vest: null, hat: 'none', hatColor: C.dusk, hatBand: null, hairStyle: 'long', facial: 'stubble', neck: 'bolo', neckColor: '#c9a24a', accessory: 'none' },
  },
  {
    id: 'jovitater',
    name: 'Jovi Tater',
    tagline: 'Spud you like to call?',
    portrait: '/characters/jovitater.png',
    look: { bg: C.sand, skin: SKIN.olive, hair: HAIR.sandy, shirt: '#9a7040', vest: null, hat: 'none', hatColor: C.sand, hatBand: null, hairStyle: 'short', facial: 'mustache', neck: 'none', neckColor: C.sand, accessory: 'none' },
  },
  {
    id: 'jovo',
    name: 'Jovo',
    tagline: 'The original table face.',
    portrait: '/characters/jovo.png',
    look: { bg: C.rust, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.rust, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.rust, accessory: 'none' },
  },
  {
    id: 'jovibonah',
    name: 'Jovi Bonah',
    tagline: 'Blue-sky confidence, frontier nerve.',
    portrait: '/characters/jovibonah.png',
    look: { bg: C.denim, skin: SKIN.tan, hair: HAIR.black, shirt: '#336db1', vest: '#274f85', hat: 'wide', hatColor: '#51361e', hatBand: '#b67d31', hairStyle: 'short', facial: 'beard', neck: 'bandana', neckColor: '#a73b2c', accessory: 'badge' },
  },
  {
    id: 'joviglo',
    name: 'Jovi Glo',
    tagline: 'Glitters brighter after a big pot.',
    portrait: '/characters/joviglo.png',
    look: { bg: C.plum, skin: SKIN.olive, hair: HAIR.darkBrown, shirt: '#bd4e86', vest: null, hat: 'none', hatColor: C.plum, hatBand: null, hairStyle: 'bun', facial: 'stubble', neck: 'bolo', neckColor: '#c9a24a', accessory: 'specs' },
  },
  {
    id: 'jovilamp',
    name: 'Jovi Lamp',
    tagline: 'The bright idea at every late-night table.',
    portrait: '/characters/jovilamp.png',
    look: { bg: C.plum, skin: SKIN.olive, hair: HAIR.sandy, shirt: '#b82378', vest: null, hat: 'plumed', hatColor: '#d72884', hatBand: '#c9a24a', hairStyle: 'long', facial: 'stubble', neck: 'ribbon', neckColor: '#e43b95', accessory: 'feather' },
  },
  {
    id: 'jacuzzijovi',
    name: 'Jacuzzi Jovi',
    tagline: 'Stays calm while the pot keeps bubbling.',
    portrait: '/characters/jacuzzijovi.png',
    look: { bg: C.denim, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.denim, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.denim, accessory: 'none' },
  },
  {
    id: 'janjanjovi',
    name: 'JanJanJovi',
    tagline: 'Twice the Jan, twice the nerve.',
    portrait: '/characters/janjanjovi.png',
    look: { bg: C.plum, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.plum, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.plum, accessory: 'none' },
  },
  {
    id: 'johnnyjovi5',
    name: 'Johnny Jovi 5',
    tagline: 'Input: chips. Output: more chips.',
    portrait: '/characters/johnnyjovi5.png',
    look: { bg: C.dusk, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.dusk, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.dusk, accessory: 'none' },
  },
  {
    id: 'jonbongjovi',
    name: 'Jon Bong Jovi',
    tagline: 'Living on a prayer and a pocket pair.',
    portrait: '/characters/jonbongjovi.png',
    look: { bg: C.moss, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.moss, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.moss, accessory: 'none' },
  },
  {
    id: 'jonjonjovi2',
    name: 'JonJonJovi II',
    tagline: 'The high roller returns.',
    portrait: '/characters/jonjonjovi2.png',
    look: { bg: C.plum, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.plum, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.plum, accessory: 'none' },
  },
  {
    id: 'jonjonjovi3',
    name: 'JonJonJovi III',
    tagline: 'Third time, same unbeatable face.',
    portrait: '/characters/jonjonjovi3.png',
    look: { bg: C.rust, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.rust, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.rust, accessory: 'none' },
  },
  {
    id: 'jovipop',
    name: 'Jovi Pop',
    tagline: 'Goes off the moment the river hits.',
    portrait: '/characters/jovipop.png',
    look: { bg: C.sand, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.sand, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.sand, accessory: 'none' },
  },
  {
    id: 'jovireserve',
    name: 'Jovi Reserve',
    tagline: 'Aged to perfection, poured all in.',
    portrait: '/characters/jovireserve.png',
    look: { bg: C.clay, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.clay, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.clay, accessory: 'none' },
  },
  {
    id: 'jovislowpoke',
    name: 'Jovi Slowpoke',
    tagline: 'Slow to act. Fast to scoop.',
    portrait: '/characters/jovislowpoke.png',
    look: { bg: C.sand, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.sand, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.sand, accessory: 'none' },
  },
  {
    id: 'leonardojovinci',
    name: 'Leonardo Jovinci',
    tagline: 'Every bluff a masterpiece.',
    portrait: '/characters/leonardojovinci.png',
    look: { bg: C.rust, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.rust, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.rust, accessory: 'none' },
  },
  {
    id: 'liljovi',
    name: 'Lil Jovi',
    tagline: 'Short stack, big attitude.',
    portrait: '/characters/liljovi.png',
    look: { bg: C.dusk, skin: SKIN.tan, hair: HAIR.darkBrown, shirt: '#8b8a8a', vest: null, hat: 'none', hatColor: C.dusk, hatBand: null, hairStyle: 'short', facial: 'beard', neck: 'none', neckColor: C.dusk, accessory: 'none' },
  },
];

export const AVATAR_BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

export const DEFAULT_AVATAR_ID = AVATARS[0].id;

export function isAvatarId(id: string): boolean {
  return AVATAR_BY_ID.has(id);
}

export function getAvatar(id: string): AvatarDef {
  return AVATAR_BY_ID.get(id) ?? AVATARS[0];
}

/**
 * Pick a character nobody in the room is using yet. Starts from a stable
 * offset derived from the user id so the same person tends to get the same
 * character, then walks forward until it finds a free one.
 */
export function pickFreeAvatar(userId: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  const start = hash % AVATARS.length;
  for (let i = 0; i < AVATARS.length; i++) {
    const cand = AVATARS[(start + i) % AVATARS.length];
    if (!used.has(cand.id)) return cand.id;
  }
  return AVATARS[start].id;
}
