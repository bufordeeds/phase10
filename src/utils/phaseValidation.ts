import { Card, PhaseRequirement, PhaseRequirementType } from '../types/database';

export interface ValidationResult {
  valid: boolean;
  groups: Card[][]; // How cards were grouped to satisfy requirements
  error?: string;
}

/**
 * Validate if a set of cards satisfies all requirements for a phase
 */
export function validatePhase(
  cards: Card[],
  requirements: PhaseRequirement[]
): ValidationResult {
  // Calculate total cards needed
  const totalNeeded = requirements.reduce(
    (sum, req) => sum + req.size * req.quantity,
    0
  );

  if (cards.length !== totalNeeded) {
    return {
      valid: false,
      groups: [],
      error: `Need exactly ${totalNeeded} cards, got ${cards.length}`,
    };
  }

  // Try to find valid assignment using backtracking
  return tryAssignCards(cards, requirements, []);
}

/**
 * Recursive backtracking to assign cards to requirements
 */
function tryAssignCards(
  remainingCards: Card[],
  remainingRequirements: PhaseRequirement[],
  assignedGroups: Card[][]
): ValidationResult {
  // Base case: all requirements satisfied
  if (remainingRequirements.length === 0) {
    return { valid: true, groups: assignedGroups };
  }

  const [currentReq, ...otherReqs] = remainingRequirements;

  // Expand quantity > 1 into individual requirements
  if (currentReq.quantity > 1) {
    const expanded: PhaseRequirement[] = [
      { ...currentReq, quantity: 1 },
      { ...currentReq, quantity: currentReq.quantity - 1 },
      ...otherReqs,
    ];
    return tryAssignCards(remainingCards, expanded, assignedGroups);
  }

  // Find all valid groups of the required size/type from remaining cards
  const possibleGroups = findValidGroups(
    remainingCards,
    currentReq.type,
    currentReq.size
  );

  // Try each possible group
  for (const group of possibleGroups) {
    const newRemaining = removeCards(remainingCards, group);
    const result = tryAssignCards(newRemaining, otherReqs, [
      ...assignedGroups,
      group,
    ]);
    if (result.valid) return result;
  }

  return {
    valid: false,
    groups: [],
    error: `Cannot satisfy ${currentReq.type} of ${currentReq.size}`,
  };
}

/**
 * Find all valid groups of cards that satisfy a requirement type and size
 */
function findValidGroups(
  cards: Card[],
  type: PhaseRequirementType,
  size: number
): Card[][] {
  const groups: Card[][] = [];
  const combinations = getCombinations(cards, size);

  for (const combo of combinations) {
    if (isValidGroup(combo, type)) {
      groups.push(combo);
    }
  }
  return groups;
}

/**
 * Check if a group of cards satisfies a requirement type
 */
export function isValidGroup(cards: Card[], type: PhaseRequirementType): boolean {
  const wilds = cards.filter((c) => c.isWild);
  const nonWilds = cards.filter((c) => !c.isWild && !c.isSkip);

  // Skip cards cannot be used in phases
  if (cards.some((c) => c.isSkip)) {
    return false;
  }

  switch (type) {
    case 'set':
      return isValidSet(nonWilds, wilds.length);
    case 'run':
      return isValidRun(nonWilds, wilds.length, cards.length);
    case 'color':
      return isValidColor(nonWilds, wilds.length);
    default:
      return false;
  }
}

/**
 * Check if cards form a valid set (all same value)
 */
function isValidSet(nonWilds: Card[], wildCount: number): boolean {
  if (nonWilds.length === 0) return true; // All wilds is valid

  // All non-wilds must have the same value
  const values = [...new Set(nonWilds.map((c) => c.value))];
  return values.length <= 1;
}

/**
 * Check if cards form a valid run (consecutive sequence)
 */
function isValidRun(nonWilds: Card[], wildCount: number, targetSize: number): boolean {
  if (nonWilds.length === 0) return true; // All wilds is valid

  const values = nonWilds.map((c) => c.value).sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];

  // Check for duplicates (can't have two 5s in a run)
  if (new Set(values).size !== values.length) return false;

  // Check if span is achievable with wilds
  const span = max - min + 1;
  if (span > targetSize) return false;

  // Check if we have enough cards to fill the gaps
  const gaps = span - nonWilds.length;
  const extraNeeded = targetSize - span;

  // We need wilds to fill gaps AND potentially extend the run
  return gaps <= wildCount && extraNeeded >= 0 && gaps + extraNeeded <= wildCount;
}

/**
 * Check if cards form a valid color group (all same color)
 */
function isValidColor(nonWilds: Card[], wildCount: number): boolean {
  if (nonWilds.length === 0) return true; // All wilds is valid

  // All non-wilds must be the same color
  const colors = [...new Set(nonWilds.map((c) => c.color))];
  return colors.length <= 1;
}

/**
 * Remove specific cards from an array (by reference)
 */
function removeCards(cards: Card[], toRemove: Card[]): Card[] {
  const removeIds = new Set(toRemove.map((c) => c.id));
  return cards.filter((c) => !removeIds.has(c.id));
}

/**
 * Generate all combinations of k items from an array
 */
function getCombinations<T>(array: T[], k: number): T[][] {
  const result: T[][] = [];

  function backtrack(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }

    for (let i = start; i < array.length; i++) {
      current.push(array[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

/**
 * Check if a card can be added to an existing laid down group (for hitting)
 */
export function canHitOnGroup(
  card: Card,
  group: Card[],
  type: PhaseRequirementType
): boolean {
  // Skip cards cannot be used for hitting
  if (card.isSkip) return false;

  // Wild cards can always hit
  if (card.isWild) return true;

  const nonWilds = group.filter((c) => !c.isWild);

  switch (type) {
    case 'set':
      // Card must match the value of the set
      if (nonWilds.length === 0) return true; // All wilds, any card works
      return card.value === nonWilds[0].value;

    case 'run':
      // Card must extend the run at either end
      const values = nonWilds.map((c) => c.value).sort((a, b) => a - b);
      if (values.length === 0) return true;

      const min = values[0];
      const max = values[values.length - 1];
      const wildsInGroup = group.filter((c) => c.isWild).length;

      // Check if card extends the sequence
      // The run might have gaps filled by wilds, so we need to check
      // if the card value is adjacent to the theoretical bounds
      const runLength = group.length;
      const theoreticalMin = max - runLength + 1;
      const theoreticalMax = min + runLength - 1;

      return card.value === theoreticalMin - 1 || card.value === theoreticalMax + 1;

    case 'color':
      // Card must match the color of the group
      if (nonWilds.length === 0) return true; // All wilds, any card works
      return card.color === nonWilds[0].color;

    default:
      return false;
  }
}

/**
 * Get the standard Phase 10 phases
 */
export function getStandardPhases(): PhaseRequirement[][] {
  return [
    [{ type: 'set', size: 3, quantity: 2 }], // 1. 2 sets of 3
    [{ type: 'set', size: 3, quantity: 1 }, { type: 'run', size: 4, quantity: 1 }], // 2. 1 set of 3 + 1 run of 4
    [{ type: 'set', size: 4, quantity: 1 }, { type: 'run', size: 4, quantity: 1 }], // 3. 1 set of 4 + 1 run of 4
    [{ type: 'run', size: 7, quantity: 1 }], // 4. 1 run of 7
    [{ type: 'run', size: 8, quantity: 1 }], // 5. 1 run of 8
    [{ type: 'run', size: 9, quantity: 1 }], // 6. 1 run of 9
    [{ type: 'set', size: 4, quantity: 2 }], // 7. 2 sets of 4
    [{ type: 'color', size: 7, quantity: 1 }], // 8. 7 cards of 1 color
    [{ type: 'set', size: 5, quantity: 1 }, { type: 'set', size: 2, quantity: 1 }], // 9. 1 set of 5 + 1 set of 2
    [{ type: 'set', size: 5, quantity: 1 }, { type: 'set', size: 3, quantity: 1 }], // 10. 1 set of 5 + 1 set of 3
  ];
}

/**
 * Get human-readable description of a phase requirement
 */
export function getPhaseDescription(requirements: PhaseRequirement[]): string {
  return requirements
    .map((req) => {
      const typeNames: Record<PhaseRequirementType, string> = {
        set: 'set',
        run: 'run',
        color: 'cards of 1 color',
      };

      if (req.type === 'color') {
        return `${req.size} ${typeNames[req.type]}`;
      }

      const plural = req.quantity > 1 ? 's' : '';
      return `${req.quantity} ${typeNames[req.type]}${plural} of ${req.size}`;
    })
    .join(' + ');
}

/**
 * Determine the type of an existing group based on its cards
 * Used when hitting to know what type of group we're adding to
 */
export function determineGroupType(group: Card[]): PhaseRequirementType | null {
  const nonWilds = group.filter((c) => !c.isWild && !c.isSkip);

  if (nonWilds.length === 0) {
    // All wilds - could be anything, default to set
    return 'set';
  }

  // Check if it's a set (all same value)
  const values = new Set(nonWilds.map((c) => c.value));
  if (values.size === 1) {
    return 'set';
  }

  // Check if it's a color group (all same color)
  const colors = new Set(nonWilds.map((c) => c.color));
  if (colors.size === 1) {
    // Could be color or run - check if values are sequential
    const sortedValues = [...nonWilds.map((c) => c.value)].sort((a, b) => a - b);
    const isSequential = sortedValues.every(
      (v, i) => i === 0 || v === sortedValues[i - 1] + 1
    );

    // If sequential and size <= 9, likely a run; if size >= 7 and all same color, likely color
    // This is ambiguous, so we'll check both
    if (isSequential) {
      return 'run';
    }
    return 'color';
  }

  // Check if it's a run (consecutive values)
  const sortedValues = [...nonWilds.map((c) => c.value)].sort((a, b) => a - b);
  const minVal = sortedValues[0];
  const maxVal = sortedValues[sortedValues.length - 1];

  // If the span equals the count (no gaps), it's a run
  if (maxVal - minVal + 1 === nonWilds.length && new Set(sortedValues).size === nonWilds.length) {
    return 'run';
  }

  // If there are gaps but they could be filled by wilds, still a run
  const gaps = maxVal - minVal + 1 - nonWilds.length;
  const wildCount = group.length - nonWilds.length;
  if (gaps <= wildCount) {
    return 'run';
  }

  return null;
}
