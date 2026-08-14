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
    id: 'sheriff',
    name: 'The Sheriff',
    tagline: 'Keeps the peace. Rarely bluffs, and everyone knows it.',
    look: {
      bg: C.denim,
      skin: SKIN.tan,
      hair: HAIR.darkBrown,
      shirt: '#4a6b8a',
      vest: '#3d2c1f',
      hat: 'tengallon',
      hatColor: '#8a6a42',
      hatBand: '#2f2118',
      hairStyle: 'short',
      facial: 'handlebar',
      neck: 'kerchief',
      neckColor: '#b34b3a',
      accessory: 'badge',
    },
  },
  {
    id: 'outlaw',
    name: 'The Outlaw',
    tagline: 'Wanted in three territories. Raises with absolutely nothing.',
    look: {
      bg: C.ash,
      skin: SKIN.fair,
      hair: HAIR.black,
      shirt: '#33333a',
      vest: '#1d1d22',
      hat: 'wide',
      hatColor: '#26232a',
      hatBand: '#5a1f1a',
      hairStyle: 'short',
      facial: 'none',
      neck: 'none',
      neckColor: '#8a2f28',
      accessory: 'maskUp',
    },
  },
  {
    id: 'cardsharp',
    name: 'The Card Sharp',
    tagline: 'Counts every card and wants you to know it.',
    look: {
      bg: C.plum,
      skin: SKIN.pale,
      hair: HAIR.black,
      shirt: '#e8e2d4',
      vest: '#5c2740',
      hat: 'bowler',
      hatColor: '#2b2529',
      hatBand: '#6b5a2c',
      hairStyle: 'slick',
      facial: 'mustache',
      neck: 'bolo',
      neckColor: '#c9a24a',
      accessory: 'monocle',
    },
  },
  {
    id: 'prospector',
    name: 'The Prospector',
    tagline: 'Been down the mine forty years. Calls with anything shiny.',
    look: {
      bg: C.sand,
      skin: SKIN.olive,
      hair: HAIR.grey,
      shirt: '#8a7148',
      vest: '#5b4526',
      hat: 'wide',
      hatColor: '#6b5535',
      hatBand: '#3d3020',
      hairStyle: 'long',
      facial: 'bigbeard',
      neck: 'kerchief',
      neckColor: '#8a6a3a',
      accessory: 'toothpick',
    },
  },
  {
    id: 'songbird',
    name: 'The Songbird',
    tagline: 'Sings for the house and reads the room better than the cards.',
    look: {
      bg: C.rust,
      skin: SKIN.brown,
      hair: HAIR.black,
      shirt: '#c4536b',
      vest: null,
      hat: 'plumed',
      hatColor: '#8d2f47',
      hatBand: '#e0c07a',
      hairStyle: 'wavy',
      facial: 'none',
      neck: 'ribbon',
      neckColor: '#1c1c22',
      accessory: 'feather',
    },
  },
  {
    id: 'marshal',
    name: 'The Marshal',
    tagline: 'Rode in on the noon stage. Plays every pot like a manhunt.',
    look: {
      bg: C.slate,
      skin: SKIN.deep,
      hair: HAIR.black,
      shirt: '#5b6570',
      vest: '#2c2f36',
      hat: 'cavalry',
      hatColor: '#4a4438',
      hatBand: '#c9a24a',
      hairStyle: 'short',
      facial: 'stubble',
      neck: 'kerchief',
      neckColor: '#3f5f78',
      accessory: 'badge',
    },
  },
  {
    id: 'bountyhunter',
    name: 'The Bounty Hunter',
    tagline: 'Paid by the head. Waits all night for one hand.',
    look: {
      bg: C.dusk,
      skin: SKIN.tan,
      hair: HAIR.darkBrown,
      shirt: '#4a3a2c',
      vest: '#2e2319',
      hat: 'wide',
      hatColor: '#3e3226',
      hatBand: '#231b14',
      hairStyle: 'long',
      facial: 'beard',
      neck: 'bandana',
      neckColor: '#6d3225',
      accessory: 'eyepatch',
    },
  },
  {
    id: 'preacher',
    name: 'The Preacher',
    tagline: 'Says he only plays for the collection plate.',
    look: {
      bg: C.night,
      skin: SKIN.pale,
      hair: HAIR.grey,
      shirt: '#1e1e24',
      vest: '#121216',
      hat: 'flat',
      hatColor: '#17171c',
      hatBand: '#0d0d10',
      hairStyle: 'short',
      facial: 'none',
      neck: 'collar',
      neckColor: '#efe9dd',
      accessory: 'none',
    },
  },
  {
    id: 'doc',
    name: 'The Doc',
    tagline: 'Steady hands, terrible cough, worse pot odds.',
    look: {
      bg: C.moss,
      skin: SKIN.fair,
      hair: HAIR.sandy,
      shirt: '#d9d2c2',
      vest: '#3f4a3c',
      hat: 'bowler',
      hatColor: '#3a3128',
      hatBand: '#241d17',
      hairStyle: 'short',
      facial: 'goatee',
      neck: 'bolo',
      neckColor: '#8a7a4a',
      accessory: 'specs',
    },
  },
  {
    id: 'rancher',
    name: 'The Rancher',
    tagline: 'Owns the biggest spread in the county. Bets like it.',
    look: {
      bg: C.sage,
      skin: SKIN.olive,
      hair: HAIR.brown,
      shirt: '#7d8a5a',
      vest: '#4a3826',
      hat: 'tengallon',
      hatColor: '#9c7c4e',
      hatBand: '#4a3826',
      hairStyle: 'short',
      facial: 'stubble',
      neck: 'kerchief',
      neckColor: '#c4913f',
      accessory: 'none',
    },
  },
  {
    id: 'rustler',
    name: 'The Rustler',
    tagline: 'Nobody has ever seen them buy cattle.',
    look: {
      bg: C.clay,
      skin: SKIN.brown,
      hair: HAIR.black,
      shirt: '#7a5236',
      vest: null,
      hat: 'headscarf',
      hatColor: '#8f4638',
      hatBand: null,
      hairStyle: 'short',
      facial: 'goatee',
      neck: 'bandana',
      neckColor: '#3f4a58',
      accessory: 'toothpick',
    },
  },
  {
    id: 'banker',
    name: 'The Banker',
    tagline: 'Holds the paper on half the town. Never on tilt.',
    look: {
      bg: C.gold,
      skin: SKIN.pale,
      hair: HAIR.grey,
      shirt: '#efe7d6',
      vest: '#7a6224',
      hat: 'bowler',
      hatColor: '#2f2a26',
      hatBand: '#c9a24a',
      hairStyle: 'bald',
      facial: 'chops',
      neck: 'bolo',
      neckColor: '#2a2a30',
      accessory: 'specs',
    },
  },
  {
    id: 'barkeep',
    name: 'The Barkeep',
    tagline: 'Pours the whiskey, hears everything, folds most of it.',
    look: {
      bg: C.dusk,
      skin: SKIN.deep,
      hair: HAIR.black,
      shirt: '#e2dccb',
      vest: '#4a2f2a',
      hat: 'none',
      hatColor: '#000000',
      hatBand: null,
      hairStyle: 'slick',
      facial: 'mustache',
      neck: 'bolo',
      neckColor: '#6b2f2a',
      accessory: 'none',
    },
  },
  {
    id: 'trailscout',
    name: 'The Trail Scout',
    tagline: 'Knows every canyon between here and the coast.',
    look: {
      bg: C.moss,
      skin: SKIN.brown,
      hair: HAIR.darkBrown,
      shirt: '#8a7550',
      vest: '#5e4a30',
      hat: 'wide',
      hatColor: '#7a6244',
      hatBand: '#3f3324',
      hairStyle: 'long',
      facial: 'none',
      neck: 'kerchief',
      neckColor: '#6a7a4a',
      accessory: 'scar',
    },
  },
  {
    id: 'blacksmith',
    name: 'The Blacksmith',
    tagline: 'Shoulders like an anvil. Shoves like one too.',
    look: {
      bg: C.ash,
      skin: SKIN.tan,
      hair: HAIR.auburn,
      shirt: '#6b5a4a',
      vest: '#3a2a20',
      hat: 'headband',
      hatColor: '#5a4230',
      hatBand: null,
      hairStyle: 'short',
      facial: 'bigbeard',
      neck: 'none',
      neckColor: '#000000',
      accessory: 'none',
    },
  },
  {
    id: 'undertaker',
    name: 'The Undertaker',
    tagline: 'Measures you for a box while you count your outs.',
    look: {
      bg: C.night,
      skin: SKIN.pale,
      hair: HAIR.white,
      shirt: '#1a1a1f',
      vest: '#0f0f13',
      hat: 'flat',
      hatColor: '#111115',
      hatBand: '#3a2a2a',
      hairStyle: 'long',
      facial: 'goatee',
      neck: 'collar',
      neckColor: '#c9c3b6',
      accessory: 'cigar',
    },
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
