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
    def:  'Nächste Runde alle Domain Expansions aktiv.',
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
    def:  'Alle anderen exen ihr Getränk.',
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
    def:  'Verteile 6 Schlucke frei. Du darfst eine Regel für diese Runde bestimmen. +1 Domain-Münze 🪙',
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
    def:  'Gewinner darf eine neue Regel hinzufügen.',
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
    def:  'Eine Regel nach Wahl entfernen.',
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
    def:  'Zweimal am Glücksrad drehen.',
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
    def:  'Einen Eintrag zum Glücksrad hinzufügen.',
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
    def:  'Binding Vow auf eine Person wirken (max. 2 aktiv).',
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
    def:  'Glücksrad drehen.',
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
    def:  'Eine Person aussuchen, die das knuggelige Rad drehen muss.',
  },
  {
    id:    'sixty_seven',
    rank:  'Sonderhand',
    tier:  'C',
    name:  '6-7',
    en:    '6-7',
    cards: [
      { v: '6♠', r: false }, { v: '7♥', r: true }
    ],
    desc: 'Starthand 6-7 – die Glückshand.',
    def:  'Einen Eintrag zum knuggeligen Rad hinzufügen.',
  },
  {
    id:    'seventy_two',
    rank:  'Sonderhand',
    tier:  'C',
    name:  '7-2',
    en:    '7-2',
    cards: [
      { v: '7♠', r: false }, { v: '2♦', r: true }
    ],
    desc: 'Starthand 7-2 – die schlechteste Hand im Poker.',
    def:  'Alle anderen trinken 1 Shot.',
  },
];
