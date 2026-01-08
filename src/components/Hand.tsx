import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Card as CardType } from '@/src/types/database';
import Card from './Card';

interface HandProps {
  cards: CardType[];
  selectedCards: string[];
  disabled?: boolean;
  onCardPress?: (cardId: string) => void;
}

export default function Hand({ cards, selectedCards, disabled, onCardPress }: HandProps) {
  // Calculate overlap based on number of cards
  const cardWidth = 60;
  const minOverlap = -35; // How much cards overlap (negative = more overlap)
  const maxOverlap = 8;   // Maximum spacing when few cards

  // Dynamic overlap based on card count
  const getOverlap = () => {
    if (cards.length <= 5) return maxOverlap;
    if (cards.length <= 8) return 0;
    if (cards.length <= 10) return -15;
    return minOverlap;
  };

  const overlap = getOverlap();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.container}
    >
      <View style={styles.hand}>
        {cards.map((card, index) => (
          <View
            key={card.id}
            style={[
              styles.cardWrapper,
              { marginLeft: index === 0 ? 0 : overlap },
              { zIndex: index },
            ]}
          >
            <Card
              card={card}
              selected={selectedCards.includes(card.id)}
              disabled={disabled}
              size="medium"
              onPress={() => onCardPress?.(card.id)}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 100,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  hand: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  cardWrapper: {
    // Shadow for depth effect
  },
});
