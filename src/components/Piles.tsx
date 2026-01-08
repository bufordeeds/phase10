import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Card as CardType } from '@/src/types/database';
import Card, { CardBack } from './Card';

interface DrawPileProps {
  count: number;
  disabled?: boolean;
  onPress?: () => void;
}

export function DrawPile({ count, disabled, onPress }: DrawPileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pileContainer,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.pile}>
        {/* Stacked card backs for visual effect */}
        {count > 2 && (
          <View style={[styles.stackedCard, { top: 4, left: 4 }]}>
            <CardBack size="medium" />
          </View>
        )}
        {count > 1 && (
          <View style={[styles.stackedCard, { top: 2, left: 2 }]}>
            <CardBack size="medium" />
          </View>
        )}
        {count > 0 ? (
          <CardBack size="medium" />
        ) : (
          <View style={styles.emptyPile}>
            <Text style={styles.emptyText}>Empty</Text>
          </View>
        )}
      </View>
      <Text style={styles.pileLabel}>Draw ({count})</Text>
      {!disabled && <Text style={styles.tapHint}>Tap to draw</Text>}
    </Pressable>
  );
}

interface DiscardPileProps {
  topCard: CardType | null;
  count: number;
  disabled?: boolean;
  canDraw?: boolean;
  onPress?: () => void;
}

export function DiscardPile({ topCard, count, disabled, canDraw, onPress }: DiscardPileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !canDraw}
      style={({ pressed }) => [
        styles.pileContainer,
        pressed && !disabled && canDraw && styles.pressed,
      ]}
    >
      <View style={styles.pile}>
        {/* Show stacked effect if multiple cards */}
        {count > 2 && (
          <View style={[styles.stackedCard, { top: 4, left: 4 }]}>
            <View style={styles.discardPlaceholder} />
          </View>
        )}
        {count > 1 && (
          <View style={[styles.stackedCard, { top: 2, left: 2 }]}>
            <View style={styles.discardPlaceholder} />
          </View>
        )}
        {topCard ? (
          <Card card={topCard} size="medium" disabled />
        ) : (
          <View style={styles.emptyPile}>
            <Text style={styles.emptyText}>Discard</Text>
          </View>
        )}
      </View>
      <Text style={styles.pileLabel}>Discard ({count})</Text>
      {canDraw && !disabled && <Text style={styles.tapHint}>Tap to draw</Text>}
    </Pressable>
  );
}

// Combined piles component for the game table
interface GamePilesProps {
  drawPileCount: number;
  discardPile: CardType[];
  isDrawPhase: boolean;
  onDrawFromDeck: () => void;
  onDrawFromDiscard: () => void;
}

export function GamePiles({
  drawPileCount,
  discardPile,
  isDrawPhase,
  onDrawFromDeck,
  onDrawFromDiscard,
}: GamePilesProps) {
  const topDiscard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
  const canDrawFromDiscard = isDrawPhase && topDiscard && topDiscard.color !== 'skip';

  return (
    <View style={styles.gamePiles}>
      <DrawPile
        count={drawPileCount}
        disabled={!isDrawPhase}
        onPress={onDrawFromDeck}
      />
      <DiscardPile
        topCard={topDiscard}
        count={discardPile.length}
        disabled={!isDrawPhase}
        canDraw={canDrawFromDiscard || false}
        onPress={onDrawFromDiscard}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pileContainer: {
    alignItems: 'center',
    gap: 4,
  },
  pile: {
    position: 'relative',
    width: 60,
    height: 85,
  },
  stackedCard: {
    position: 'absolute',
  },
  emptyPile: {
    width: 60,
    height: 85,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  emptyText: {
    color: '#999',
    fontSize: 12,
  },
  discardPlaceholder: {
    width: 60,
    height: 85,
    borderRadius: 8,
    backgroundColor: '#ddd',
  },
  pileLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  tapHint: {
    fontSize: 10,
    color: '#007AFF',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  gamePiles: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 32,
    padding: 16,
  },
});
