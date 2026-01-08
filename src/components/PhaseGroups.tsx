import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Card as CardType, PhaseRequirement } from '@/src/types/database';
import Card from './Card';
import { getRequirementDescription } from '@/src/utils/phaseValidation';

interface CardGroup {
  cards: CardType[];
  requirement: PhaseRequirement;
}

interface PhaseGroupsProps {
  playerName: string;
  groups: CardGroup[];
  isCurrentPlayer?: boolean;
  canHit?: boolean;
  onHitGroup?: (groupIndex: number) => void;
  isDark?: boolean;
}

export default function PhaseGroups({
  playerName,
  groups,
  isCurrentPlayer,
  canHit,
  onHitGroup,
  isDark,
}: PhaseGroupsProps) {
  if (groups.length === 0) return null;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.playerName, isDark && styles.textDark, isCurrentPlayer && styles.currentPlayer]}>
        {playerName}'s Phase
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.groups}>
          {groups.map((group, groupIndex) => (
            <Pressable
              key={groupIndex}
              style={[
                styles.group,
                isDark && styles.groupDark,
                canHit && styles.groupHittable,
              ]}
              onPress={() => canHit && onHitGroup?.(groupIndex)}
              disabled={!canHit}
            >
              <Text style={[styles.groupLabel, isDark && styles.subtitleDark]}>
                {getRequirementDescription(group.requirement)}
              </Text>
              <View style={styles.groupCards}>
                {group.cards.map((card, cardIndex) => (
                  <View
                    key={card.id}
                    style={[styles.groupCard, { marginLeft: cardIndex === 0 ? 0 : -25 }]}
                  >
                    <Card card={card} size="small" disabled />
                  </View>
                ))}
              </View>
              {canHit && (
                <Text style={styles.hitHint}>Tap to hit</Text>
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// Table showing all players' laid down phases
interface PhaseTableProps {
  players: Array<{
    id: string;
    username: string;
    groups: CardGroup[];
    isCurrentPlayer: boolean;
  }>;
  canHit: boolean;
  onHitGroup: (playerId: string, groupIndex: number) => void;
  isDark?: boolean;
}

export function PhaseTable({ players, canHit, onHitGroup, isDark }: PhaseTableProps) {
  const playersWithPhases = players.filter((p) => p.groups.length > 0);

  if (playersWithPhases.length === 0) {
    return (
      <View style={[styles.emptyTable, isDark && styles.containerDark]}>
        <Text style={[styles.emptyText, isDark && styles.subtitleDark]}>
          No phases laid down yet
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.table} showsVerticalScrollIndicator={false}>
      {playersWithPhases.map((player) => (
        <PhaseGroups
          key={player.id}
          playerName={player.username}
          groups={player.groups}
          isCurrentPlayer={player.isCurrentPlayer}
          canHit={canHit}
          onHitGroup={(groupIndex) => onHitGroup(player.id, groupIndex)}
          isDark={isDark}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  containerDark: {
    backgroundColor: '#1a1a1a',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  textDark: {
    color: '#fff',
  },
  subtitleDark: {
    color: '#999',
  },
  currentPlayer: {
    color: '#007AFF',
  },
  groups: {
    flexDirection: 'row',
    gap: 16,
  },
  group: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    minWidth: 120,
  },
  groupDark: {
    backgroundColor: '#2a2a2a',
  },
  groupHittable: {
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  groupLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 6,
    textAlign: 'center',
  },
  groupCards: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  groupCard: {
    // Overlap handled by marginLeft
  },
  hitHint: {
    fontSize: 10,
    color: '#007AFF',
    textAlign: 'center',
    marginTop: 4,
  },
  table: {
    maxHeight: 200,
  },
  emptyTable: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
});
