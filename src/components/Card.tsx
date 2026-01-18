import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Card as CardType } from '@/src/types/database';

interface CardProps {
  card: CardType;
  selected?: boolean;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  onPress?: () => void;
}

const CARD_COLORS: Record<string, string> = {
  red: '#E53935',
  blue: '#1E88E5',
  green: '#43A047',
  yellow: '#FDD835',
  wild: '#9C27B0',
  skip: '#424242',
};

export default function Card({ card, selected, disabled, size = 'medium', onPress }: CardProps) {
  const isWild = card.isWild;
  const isSkip = card.isSkip;
  const cardColor = isWild ? CARD_COLORS.wild : isSkip ? CARD_COLORS.skip : CARD_COLORS[card.color] || '#666';

  const dimensions = {
    small: { width: 45, height: 65, fontSize: 16, labelSize: 8 },
    medium: { width: 60, height: 85, fontSize: 22, labelSize: 10 },
    large: { width: 80, height: 115, fontSize: 30, labelSize: 12 },
  }[size];

  const renderCardContent = () => {
    if (isWild) {
      return (
        <>
          <Text style={[styles.wildLabel, { fontSize: dimensions.labelSize }]}>WILD</Text>
          <Text style={[styles.cardValue, { fontSize: dimensions.fontSize, color: '#fff' }]}>W</Text>
        </>
      );
    }

    if (isSkip) {
      return (
        <>
          <Text style={[styles.skipLabel, { fontSize: dimensions.labelSize }]}>SKIP</Text>
          <Text style={[styles.cardValue, { fontSize: dimensions.fontSize, color: '#fff' }]}>S</Text>
        </>
      );
    }

    return (
      <Text style={[styles.cardValue, { fontSize: dimensions.fontSize, color: '#fff' }]}>
        {card.value}
      </Text>
    );
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        {
          width: dimensions.width,
          height: dimensions.height,
          backgroundColor: cardColor,
        },
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.cardInner}>
        {/* Top-left value */}
        <Text style={[styles.cornerValue, { fontSize: dimensions.labelSize + 2 }]}>
          {isWild ? 'W' : isSkip ? 'S' : card.value}
        </Text>

        {/* Center content */}
        <View style={styles.centerContent}>
          {renderCardContent()}
        </View>

        {/* Bottom-right value (rotated) */}
        <Text style={[styles.cornerValueBottom, { fontSize: dimensions.labelSize + 2 }]}>
          {isWild ? 'W' : isSkip ? 'S' : card.value}
        </Text>
      </View>
    </Pressable>
  );
}

// Card back for face-down cards
export function CardBack({ size = 'medium' }: { size?: 'small' | 'medium' | 'large' }) {
  const dimensions = {
    small: { width: 45, height: 65 },
    medium: { width: 60, height: 85 },
    large: { width: 80, height: 115 },
  }[size];

  return (
    <View style={[styles.cardBack, { width: dimensions.width, height: dimensions.height }]}>
      <View style={styles.cardBackPattern}>
        <Text style={styles.cardBackText}>P10</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  cardInner: {
    flex: 1,
    padding: 4,
  },
  selected: {
    borderWidth: 3,
    borderColor: '#FFD700',
    transform: [{ translateY: -8 }],
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  cornerValue: {
    color: '#fff',
    fontWeight: 'bold',
    position: 'absolute',
    top: 4,
    left: 6,
  },
  cornerValueBottom: {
    color: '#fff',
    fontWeight: 'bold',
    position: 'absolute',
    bottom: 4,
    right: 6,
    transform: [{ rotate: '180deg' }],
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardValue: {
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  wildLabel: {
    color: '#fff',
    fontWeight: '600',
    marginBottom: 2,
  },
  skipLabel: {
    color: '#fff',
    fontWeight: '600',
    marginBottom: 2,
  },
  cardBack: {
    borderRadius: 8,
    backgroundColor: '#1a237e',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBackPattern: {
    width: '80%',
    height: '80%',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#3949ab',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBackText: {
    color: '#5c6bc0',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
