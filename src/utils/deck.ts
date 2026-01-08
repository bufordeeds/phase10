import { Card, CardColor } from '../types/database';

const COLORS: CardColor[] = ['red', 'blue', 'green', 'yellow'];
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WILD_COUNT = 8;
const SKIP_COUNT = 4;

/**
 * Generate a unique card ID
 */
function generateCardId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Create a standard Phase 10 deck (108 cards)
 * - 96 number cards (4 colors × 12 values × 2 copies)
 * - 8 Wild cards
 * - 4 Skip cards
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];

  // Add number cards (2 of each color/value combination)
  for (let copy = 0; copy < 2; copy++) {
    for (const color of COLORS) {
      for (const value of VALUES) {
        deck.push({
          id: generateCardId(),
          color,
          value,
          isWild: false,
          isSkip: false,
        });
      }
    }
  }

  // Add wild cards (8 total, color doesn't matter but we'll assign for display)
  for (let i = 0; i < WILD_COUNT; i++) {
    deck.push({
      id: generateCardId(),
      color: COLORS[i % 4], // Distribute colors evenly for visual variety
      value: 0, // 0 indicates wild
      isWild: true,
      isSkip: false,
    });
  }

  // Add skip cards (4 total)
  for (let i = 0; i < SKIP_COUNT; i++) {
    deck.push({
      id: generateCardId(),
      color: COLORS[i], // One of each color
      value: -1, // -1 indicates skip
      isWild: false,
      isSkip: true,
    });
  }

  return deck;
}

/**
 * Fisher-Yates shuffle algorithm
 * Creates a new shuffled array without mutating the original
 */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Deal cards from a deck
 * Returns [dealtCards, remainingDeck]
 */
export function dealCards(deck: Card[], count: number): [Card[], Card[]] {
  const dealt = deck.slice(0, count);
  const remaining = deck.slice(count);
  return [dealt, remaining];
}

/**
 * Deal hands to multiple players
 * Returns [playerHands, remainingDeck]
 */
export function dealHands(
  deck: Card[],
  playerCount: number,
  cardsPerPlayer: number = 10
): [Card[][], Card[]] {
  const hands: Card[][] = [];
  let remaining = [...deck];

  for (let i = 0; i < playerCount; i++) {
    const [hand, newRemaining] = dealCards(remaining, cardsPerPlayer);
    hands.push(hand);
    remaining = newRemaining;
  }

  return [hands, remaining];
}

/**
 * Create a shuffled deck ready for play
 */
export function createShuffledDeck(): Card[] {
  return shuffle(createDeck());
}

/**
 * Set up a new game: shuffle deck, deal hands, create discard pile
 * Returns { hands, drawPile, discardPile }
 */
export function setupGame(playerCount: number): {
  hands: Card[][];
  drawPile: Card[];
  discardPile: Card[];
} {
  const deck = createShuffledDeck();
  const [hands, remaining] = dealHands(deck, playerCount, 10);

  // Flip the top card to start discard pile
  // If it's a Skip card, put it back and draw another
  let drawPile = remaining;
  let discardPile: Card[] = [];

  while (drawPile.length > 0) {
    const [topCard, newDraw] = dealCards(drawPile, 1);
    if (topCard[0].isSkip) {
      // Put skip card at bottom of deck
      drawPile = [...newDraw, topCard[0]];
    } else {
      discardPile = topCard;
      drawPile = newDraw;
      break;
    }
  }

  return { hands, drawPile, discardPile };
}

/**
 * Calculate point value of a card (for scoring at end of round)
 * - Cards 1-9: 5 points
 * - Cards 10-12: 10 points
 * - Skip cards: 15 points
 * - Wild cards: 25 points
 */
export function getCardPoints(card: Card): number {
  if (card.isWild) return 25;
  if (card.isSkip) return 15;
  if (card.value >= 10) return 10;
  return 5;
}

/**
 * Calculate total points for a hand of cards
 */
export function calculateHandScore(hand: Card[]): number {
  return hand.reduce((total, card) => total + getCardPoints(card), 0);
}

/**
 * Get display string for a card
 */
export function getCardDisplayName(card: Card): string {
  if (card.isWild) return 'Wild';
  if (card.isSkip) return 'Skip';
  return `${card.color} ${card.value}`;
}

/**
 * Sort cards by color then value
 */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    // Wilds and skips at the end
    if (a.isWild && !b.isWild) return 1;
    if (!a.isWild && b.isWild) return -1;
    if (a.isSkip && !b.isSkip) return 1;
    if (!a.isSkip && b.isSkip) return -1;

    // Sort by color first
    const colorOrder = { red: 0, blue: 1, green: 2, yellow: 3 };
    const colorDiff = colorOrder[a.color] - colorOrder[b.color];
    if (colorDiff !== 0) return colorDiff;

    // Then by value
    return a.value - b.value;
  });
}

/**
 * Find a card in an array by ID
 */
export function findCardById(cards: Card[], cardId: string): Card | undefined {
  return cards.find(card => card.id === cardId);
}

/**
 * Remove a card from an array by ID
 * Returns [removedCard, remainingCards] or [undefined, originalCards] if not found
 */
export function removeCardById(cards: Card[], cardId: string): [Card | undefined, Card[]] {
  const index = cards.findIndex(card => card.id === cardId);
  if (index === -1) return [undefined, cards];

  const removed = cards[index];
  const remaining = [...cards.slice(0, index), ...cards.slice(index + 1)];
  return [removed, remaining];
}
