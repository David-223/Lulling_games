// Single source of truth for all poker hands.
// Add new hands here — poker.html and poker-game.html both pick them up automatically.
const HANDS = [
  {
    id:    'royal_flush',
    rank:  'Rang I',
    tier:  'S',
    name:  'Royaler Flush',
    en:    'Royal Flush',
    cards: [
      { v: 'A♠', r: false }, { v: 'K♠', r: false },
      { v: 'Q♠', r: false }, { v: 'J♠', r: false }, { v: '10♠', r: false }
    ],
    desc: 'Ass, König, Dame, Bube, Zehn – alle in derselben Farbe.',
    def:  'Alle anderen trinken 5 Schlucke. Du bist unantastbar.',
  },
  {
    id:    'straight_flush',
    rank:  'Rang II',
    tier:  'S',
    name:  'Straight Flush',
    en:    'Straight Flush',
    cards: [
      { v: '9♥', r: true }, { v: '8♥', r: true },
      { v: '7♥', r: true }, { v: '6♥', r: true }, { v: '5♥', r: true }
    ],
    desc: 'Fünf aufeinanderfolgende Karten in derselben Farbe.',
    def:  'Verteile 8 Schlucke frei auf beliebige Spieler.',
  },
  {
    id:    'four_of_a_kind',
    rank:  'Rang III',
    tier:  'A',
    name:  'Vierling',
    en:    'Four of a Kind',
    cards: [
      { v: 'A♠', r: false }, { v: 'A♥', r: true },
      { v: 'A♦', r: true  }, { v: 'A♣', r: false }, { v: 'K♠', r: false }
    ],
    desc: 'Vier Karten desselben Wertes.',
    def:  'Verteile 6 Schlucke frei. Du darfst eine Regel für diese Runde bestimmen.',
  },
  {
    id:    'full_house',
    rank:  'Rang IV',
    tier:  'A',
    name:  'Full House',
    en:    'Full House',
    cards: [
      { v: 'K♠', r: false }, { v: 'K♥', r: true },
      { v: 'K♦', r: true  }, { v: 'J♠', r: false }, { v: 'J♥', r: true }
    ],
    desc: 'Drei gleiche Karten und ein Paar.',
    def:  'Verteile 4 Schlucke und trink selbst 1 Schluck.',
  },
  {
    id:    'flush',
    rank:  'Rang V',
    tier:  'A',
    name:  'Flush',
    en:    'Flush',
    cards: [
      { v: 'A♣', r: false }, { v: 'J♣', r: false },
      { v: '8♣', r: false }, { v: '6♣', r: false }, { v: '3♣', r: false }
    ],
    desc: 'Fünf beliebige Karten in derselben Farbe.',
    def:  'Verteile 3 Schlucke frei.',
  },
  {
    id:    'straight',
    rank:  'Rang VI',
    tier:  'B',
    name:  'Straße',
    en:    'Straight',
    cards: [
      { v: '9♠', r: false }, { v: '8♥', r: true },
      { v: '7♦', r: true  }, { v: '6♣', r: false }, { v: '5♠', r: false }
    ],
    desc: 'Fünf aufeinanderfolgende Karten in verschiedenen Farben.',
    def:  'Spieler links und rechts trinken je 2 Schlucke.',
  },
  {
    id:    'three_of_a_kind',
    rank:  'Rang VII',
    tier:  'B',
    name:  'Drilling',
    en:    'Three of a Kind',
    cards: [
      { v: 'Q♠', r: false }, { v: 'Q♥', r: true },
      { v: 'Q♦', r: true  }, { v: '9♠', r: false }, { v: '4♥', r: true }
    ],
    desc: 'Drei Karten desselben Wertes.',
    def:  'Wähle einen Spieler aus – dieser trinkt 3 Schlucke.',
  },
  {
    id:    'two_pair',
    rank:  'Rang VIII',
    tier:  'B',
    name:  'Zwei Paare',
    en:    'Two Pair',
    cards: [
      { v: 'J♠', r: false }, { v: 'J♥', r: true },
      { v: '8♦', r: true  }, { v: '8♣', r: false }, { v: 'A♠', r: false }
    ],
    desc: 'Zwei verschiedene Paare.',
    def:  'Du trinkst 2 Schlucke.',
  },
  {
    id:    'one_pair',
    rank:  'Rang IX',
    tier:  'C',
    name:  'Ein Paar',
    en:    'One Pair',
    cards: [
      { v: '10♠', r: false }, { v: '10♥', r: true },
      { v: 'A♦',  r: true  }, { v: 'K♣',  r: false }, { v: 'Q♠', r: false }
    ],
    desc: 'Zwei Karten desselben Wertes.',
    def:  'Du trinkst 1 Schluck.',
  },
  {
    id:    'high_card',
    rank:  'Rang X',
    tier:  'C',
    name:  'Höchste Karte',
    en:    'High Card',
    cards: [
      { v: 'A♠', r: false }, { v: 'J♦', r: true },
      { v: '9♣', r: false }, { v: '7♥', r: true }, { v: '3♠', r: false }
    ],
    desc: 'Keine Kombination – die höchste Karte zählt.',
    def:  'Du trinkst 2 Schlucke. Pech gehabt.',
  },
];
