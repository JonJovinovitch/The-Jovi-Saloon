/**
 * "How To Play" content, keyed by game id.
 *
 * This is shipped as data so the client can open a rules panel beside a live
 * hand — the whole point is learning while you play, not reading a wiki first.
 */

export interface HowToSection {
  title: string;
  /** Paragraphs. A line starting with "- " renders as a bullet. */
  body: string[];
}

export interface HowTo {
  gameId: string;
  tagline: string;
  /** 1 = pick it up in a hand, 3 = expect a few rough orbits. */
  difficulty: 1 | 2 | 3;
  learnIn: string;
  sections: HowToSection[];
  tips: string[];
}

/** Shown once, from the lobby — the stuff every game assumes you know. */
export const BASICS: HowToSection[] = [
  {
    title: 'The goal',
    body: [
      'Win chips. You do that two ways: showing down the best hand, or betting enough that everyone else folds. The second way is how most pots are actually won.',
    ],
  },
  {
    title: 'Standard hand rankings (best to worst)',
    body: [
      '- Royal Flush — A K Q J T, all one suit',
      '- Straight Flush — five in a row, all one suit',
      '- Four of a Kind — four cards of the same rank',
      '- Full House — three of a kind plus a pair',
      '- Flush — five cards of one suit',
      '- Straight — five in a row, mixed suits',
      '- Three of a Kind',
      '- Two Pair',
      '- One Pair',
      '- High Card',
      'Every hand is exactly five cards. Extra cards are "kickers" and break ties.',
    ],
  },
  {
    title: 'Your options when it is on you',
    body: [
      '- Check — pass, only when nobody has bet',
      '- Bet — put chips in when nobody has yet',
      '- Call — match the current bet',
      '- Raise — increase the current bet',
      '- Fold — throw the hand away and lose what you already put in',
      'If you run out of chips mid-pot you are all-in: you can still win the part of the pot you covered, and a side pot forms for everyone else.',
    ],
  },
  {
    title: 'Betting structures',
    body: [
      '- No Limit — you can bet anything up to your whole stack.',
      '- Pot Limit — the biggest legal bet is the size of the pot (including your call).',
      '- Fixed Limit — bets come in fixed increments, with a small bet on early streets and a big bet later. Usually capped at a bet plus three raises.',
    ],
  },
  {
    title: 'Position',
    body: [
      'The dealer button moves one seat left every hand. Acting last is a real advantage — you see what everyone did before you decide. In stud games there is no button; the exposed cards decide who acts first.',
    ],
  },
];

export const HOW_TO: Record<string, HowTo> = {
  nlhe: {
    gameId: 'nlhe',
    tagline: 'Two cards each, five shared. The game everyone means when they say "poker".',
    difficulty: 1,
    learnIn: '2 min',
    sections: [
      {
        title: 'How a hand runs',
        body: [
          'The two players left of the button post the small and big blind. Everyone gets two private cards.',
          'Four betting rounds: preflop (before any shared cards), then the flop (3 shared cards), the turn (a 4th), and the river (a 5th).',
          'At showdown you make your best five-card hand out of any combination of your two cards and the five on the board.',
        ],
      },
      {
        title: 'Using the board',
        body: [
          'There is no requirement to use your own cards. Both of them, one of them, or neither — whatever makes the best five. If the board is the best hand available to everyone, the pot is split.',
        ],
      },
      {
        title: 'Betting',
        body: [
          'No limit: any bet from the minimum up to your entire stack. A raise must be at least the size of the previous bet or raise.',
        ],
      },
    ],
    tips: [
      'Fold most hands preflop. Playing 20% of them from early position is already loose.',
      'Big pairs and big suited connectors go up in value; small offsuit junk almost never does.',
      'Position beats cards. A mediocre hand on the button is worth more than a good one under the gun.',
    ],
  },

  lhe: {
    gameId: 'lhe',
    tagline: "Hold'em on rails — every bet is a fixed size.",
    difficulty: 1,
    learnIn: '2 min',
    sections: [
      {
        title: 'What changes from No Limit',
        body: [
          'The hand plays identically. Only the betting differs: preflop and flop use the small bet, turn and river use the big bet (double). Each round allows a bet and three raises.',
        ],
      },
      {
        title: 'Why it feels different',
        body: [
          'You cannot price anyone out of a draw, so more hands go to showdown and small edges matter more than bluffs. Getting one extra bet in — or saving one — is the whole game.',
        ],
      },
    ],
    tips: [
      'Draws are much more playable here; the pot usually offers the odds.',
      'Bluffing works far less often. Value bet thin instead.',
    ],
  },

  plo: {
    gameId: 'plo',
    tagline: 'Four cards, but exactly two of them play. Enormous pots.',
    difficulty: 2,
    learnIn: '4 min',
    sections: [
      {
        title: 'The one rule people get wrong',
        body: [
          'You must use exactly two of your four hole cards and exactly three board cards. Always. Four hearts in your hand and three on the board is not a flush — you only have two hearts that can play.',
        ],
      },
      {
        title: 'How a hand runs',
        body: [
          "Same four streets as Hold'em: preflop, flop, turn, river. Blinds, button, all identical.",
        ],
      },
      {
        title: 'Pot limit betting',
        body: [
          'The maximum bet is the current pot plus all bets on the table plus the amount you would call. The table shows you the exact number — use the "Pot" button rather than doing the arithmetic.',
        ],
      },
    ],
    tips: [
      'Hand values shift hugely. Two pair is often no good; the nut flush and nut straights win pots.',
      'Cards that work together matter more than raw strength — A♠K♠J♥T♥ is a monster, A♠A♥7♣2♦ is not.',
      'Draw to the nuts. Second-best big hands are how stacks disappear in Omaha.',
    ],
  },

  plo8: {
    gameId: 'plo8',
    tagline: 'Omaha where the pot splits between the best high hand and the best low.',
    difficulty: 3,
    learnIn: '5 min',
    sections: [
      {
        title: 'The split',
        body: [
          'At showdown the pot is cut in half. The best high hand takes one half. The best qualifying low takes the other.',
          'A low only qualifies if it uses five cards all ranked eight or lower, with no pair. If nobody qualifies, the high hand takes the whole pot.',
        ],
      },
      {
        title: 'Reading a low hand',
        body: [
          'Aces are low. Straights and flushes do not matter for the low half. Read a low from the top down: 8-6-4-3-A beats 8-6-5-2-A because the fourth card is lower.',
          'The best possible low is 5-4-3-2-A, called "the wheel" — and it is also a straight, so it can win both halves.',
        ],
      },
      {
        title: 'Two hands at once',
        body: [
          'Exactly-two-hole-cards applies separately to each half. You can use A♦2♦ for the low and K♠Q♠ for the high out of the same four cards.',
        ],
      },
    ],
    tips: [
      'A-2 with a suited ace is the premium starting shape.',
      'Scooping (winning both halves) is where the money is. Splitting a pot three ways after calling all street loses chips.',
      'The board must contain three cards of eight-or-lower for any low to exist at all.',
    ],
  },

  bigo: {
    gameId: 'bigo',
    tagline: 'PLO Hi-Lo with five hole cards. Everything is bigger.',
    difficulty: 3,
    learnIn: '5 min',
    sections: [
      {
        title: 'Same as Omaha Hi-Lo, plus one card',
        body: [
          'Five hole cards instead of four. You still play exactly two of them plus exactly three board cards, and the pot still splits high/low with an eight-or-better qualifier.',
        ],
      },
      {
        title: 'What the extra card does',
        body: [
          'It makes everyone stronger. Nut lows get counterfeited more, nut flushes matter more, and the winning high hand is bigger than in four-card Omaha on the same board.',
        ],
      },
    ],
    tips: [
      'Raise your standards. A hand that would be fine in PLO8 is often a fold here.',
      'Value hands that make both a nut low and a nut high draw.',
    ],
  },

  pineapple: {
    gameId: 'pineapple',
    tagline: "Hold'em with three cards — pitch one after the flop.",
    difficulty: 1,
    learnIn: '2 min',
    sections: [
      {
        title: 'How a hand runs',
        body: [
          "Blinds and button as usual. Everyone gets three cards instead of two and plays a normal preflop betting round.",
          'The flop comes and is bet. Then every player still in the hand discards one card, leaving two.',
          "From there it is exactly Hold'em: turn, river, and the best five out of your two plus the board.",
        ],
      },
      {
        title: 'The discard',
        body: [
          'You discard after seeing the flop and after the flop betting, so it is a real decision with information. Everyone discards at the same time.',
        ],
      },
    ],
    tips: [
      'Three cards means everyone flops better. Top pair with a weak kicker is much thinner than usual.',
      'Hands that keep two suits and connected ranks flop the most playable combinations.',
    ],
  },

  shortdeck: {
    gameId: 'shortdeck',
    tagline: "36 cards, no deuces through fives, action every hand.",
    difficulty: 2,
    learnIn: '3 min',
    sections: [
      {
        title: 'The deck',
        body: [
          "Every 2, 3, 4 and 5 is removed — 36 cards. Everything else follows No Limit Hold'em.",
        ],
      },
      {
        title: 'Changed hand rankings',
        body: [
          'A flush beats a full house. With four fewer ranks there are far fewer flush combinations, so a flush is genuinely harder to make.',
          'The low straight is A-6-7-8-9. The ace still plays both high and low.',
        ],
      },
      {
        title: 'Why hands run hotter',
        body: [
          'A shorter deck means more connected boards, more flopped sets, and much closer all-in equities. Big pairs are less dominant than they look.',
        ],
      },
    ],
    tips: [
      'Suited hands go down in value; connected hands go up.',
      'Sets are much more common — so are set-over-set coolers.',
      'Many rooms use an ante-only structure with a button ante. This one uses standard blinds for familiarity.',
    ],
  },

  stud: {
    gameId: 'stud',
    tagline: 'No board, no button. Seven cards each, four of them face up.',
    difficulty: 2,
    learnIn: '4 min',
    sections: [
      {
        title: 'How a hand runs',
        body: [
          'Everyone antes. You get two cards face down and one face up ("third street").',
          'The lowest exposed card must open with the bring-in. Play continues around; from fourth street on, the highest exposed hand acts first.',
          'Fourth, fifth and sixth street each add one face-up card with a betting round. Seventh street ("the river") is dealt face down.',
          'Best five cards out of your seven wins. There is no shared board.',
        ],
      },
      {
        title: 'Betting',
        body: [
          'Fixed limit: small bet on third and fourth street, big bet from fifth street on. An open pair on fourth street lets anyone bet the big bet early.',
        ],
      },
      {
        title: 'Watching the board',
        body: [
          'Everyone can see four of your seven cards, and you can see theirs. Remembering folded up-cards is most of the skill — if three of your flush suit are dead, that draw is worthless.',
        ],
      },
    ],
    tips: [
      'Three to a flush or three big cards on third street are the standard starting hands.',
      'Rolled-up trips (three of a kind on third street) is the best possible start and is rare enough to slow-play.',
      'Track the dead cards. It is the whole game.',
    ],
  },

  stud8: {
    gameId: 'stud8',
    tagline: 'Seven Card Stud where the pot splits with a qualifying low.',
    difficulty: 3,
    learnIn: '5 min',
    sections: [
      {
        title: 'Same deal, split pot',
        body: [
          'The dealing and betting are exactly Seven Card Stud. At showdown the pot splits between the best high hand and the best low hand of eight-or-better.',
          'You choose any five of your seven cards for each half, and they can be different fives.',
        ],
      },
      {
        title: 'Low qualifying',
        body: [
          'Five unpaired cards, all eight or lower, aces low. Straights and flushes are ignored for the low. If nobody qualifies, high takes it all.',
        ],
      },
    ],
    tips: [
      'Start with three cards to a low, ideally with an ace — aces play both ways.',
      'Three low cards that also make a flush or straight draw are the hands that scoop.',
      'If your opponents are showing all low cards and you have a big pair, you are often freerolling the high half.',
    ],
  },

  razz: {
    gameId: 'razz',
    tagline: 'Seven Card Stud, upside down. The worst hand wins.',
    difficulty: 2,
    learnIn: '3 min',
    sections: [
      {
        title: 'The ranking',
        body: [
          'Lowest five cards win. Aces are always low. Straights and flushes do not count against you at all.',
          'The best hand is 5-4-3-2-A. Read hands from the highest card down: 8-6-5-3-2 beats 8-7-4-3-2.',
        ],
      },
      {
        title: 'How a hand runs',
        body: [
          'Antes, then two down and one up. Because low is good, the bring-in is on the HIGHEST exposed card, and from fourth street the LOWEST exposed hand acts first.',
          'Fourth, fifth, sixth face up; seventh face down. Fixed limit throughout.',
        ],
      },
    ],
    tips: [
      'Three cards to an eight or better is a playable start; three wheel cards is a raise.',
      'Pairing up is the disaster — a pair usually means you are drawing dead against a made low.',
      'Watch which low cards are dead. If every 4 and 5 is showing, your draw is much weaker than it looks.',
    ],
  },

  draw5: {
    gameId: 'draw5',
    tagline: 'The kitchen-table classic. Five cards, one draw, no information.',
    difficulty: 1,
    learnIn: '2 min',
    sections: [
      {
        title: 'How a hand runs',
        body: [
          'Blinds are posted. Everyone gets five cards face down and there is a betting round.',
          'Each player still in may discard any number of cards and be dealt replacements.',
          'One more betting round, then showdown. Standard high hand rankings.',
        ],
      },
      {
        title: 'What the draw tells you',
        body: [
          'The number of cards someone takes is nearly all the information in the game. Three cards means a pair. One card means two pair or a draw. Standing pat means a made straight, flush, or a bluff.',
        ],
      },
    ],
    tips: [
      'Do not draw to inside straights. The pot almost never pays enough.',
      'Occasionally break a pair and draw one to disguise your hand — but not often.',
      'Position matters more than usual: acting last after seeing everyone else draw is huge.',
    ],
  },

  td27: {
    gameId: 'td27',
    tagline: 'Draw three times for the worst possible hand. Aces are bad.',
    difficulty: 3,
    learnIn: '5 min',
    sections: [
      {
        title: 'The ranking',
        body: [
          'The LOWEST hand wins, but straights and flushes count AGAINST you and the ace is always high.',
          'The best hand is 7-5-4-3-2 with mixed suits ("a wheel" in this game, or "number one"). 2-3-4-5-6 is a straight and is nearly worthless.',
          'A pair of deuces is bad, but still beats any hand containing an ace or a king.',
        ],
      },
      {
        title: 'How a hand runs',
        body: [
          'Blinds, then five cards each and a betting round. Then three draw rounds, each followed by betting — four betting rounds total.',
          'Fixed limit: small bet before the first draw and after it, big bet after the second and third draws.',
        ],
      },
      {
        title: 'Standing pat',
        body: [
          'Taking zero cards means you have a made hand you like. Doing it with a rough hand is a standard bluff, especially on the last draw.',
        ],
      },
    ],
    tips: [
      'Any four cards to a 7 or an 8 is worth playing. Anything containing an ace usually is not.',
      'Drawing two cards is rarely correct after the first draw.',
      'Watch how many cards opponents take on each draw — a player who drew one twice and then stands pat probably got there.',
    ],
  },

  a5td: {
    gameId: 'a5td',
    tagline: 'Triple draw lowball where the ace is your friend.',
    difficulty: 2,
    learnIn: '4 min',
    sections: [
      {
        title: 'The ranking',
        body: [
          'Lowest hand wins. Aces are LOW and straights and flushes are ignored, so 5-4-3-2-A is the best possible hand — the same low ranking used by Razz and by the low half of hi-lo games.',
        ],
      },
      {
        title: 'How a hand runs',
        body: [
          'Identical structure to 2-7 Triple Draw: five cards, then three draws with a betting round after each.',
        ],
      },
    ],
    tips: [
      'Aces and deuces are premium cards here, the exact opposite of 2-7.',
      'A pat 8 is a strong hand; a pat 7 is usually the best hand at the table.',
    ],
  },

  badugi: {
    gameId: 'badugi',
    tagline: 'Four cards. All different suits, all different ranks, as low as you can.',
    difficulty: 2,
    learnIn: '4 min',
    sections: [
      {
        title: 'What a badugi is',
        body: [
          'A "badugi" is four cards with four different suits and four different ranks. Any badugi beats any hand that is not one.',
          'If cards duplicate a suit or a rank, they are discounted. A♣ 2♣ 5♦ 7♥ only counts as a three-card hand (one of the clubs is dead).',
          'Best hand: 4-3-2-A in four suits. Compare badugis from the highest card down, aces low.',
        ],
      },
      {
        title: 'How a hand runs',
        body: [
          'Blinds, four cards each, then a betting round and three draws — same rhythm as triple draw. Fixed limit.',
        ],
      },
      {
        title: 'Hand strength in practice',
        body: [
          'A three-card 5 (a "5-badugi minus one") is a normal drawing hand. A made 7-badugi is usually good enough to raise with. Anything under a 6 is a monster.',
        ],
      },
    ],
    tips: [
      'Drawing one card to a three-card 3 or 4 is the standard playable hand.',
      'Standing pat with a rough badugi against a one-card draw is often better than breaking it.',
      'Snowing (standing pat with garbage) works because so many hands never make a badugi at all.',
    ],
  },
};

export function getHowTo(gameId: string): HowTo | undefined {
  return HOW_TO[gameId];
}
