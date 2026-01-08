import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PhaseRequirement } from '@/src/types/database';
import { getPhaseDescription, getRequirementDescription } from '@/src/utils/phaseValidation';

interface PhaseDisplayProps {
  phaseNumber: number;
  requirements: PhaseRequirement[];
  hasLaidDown: boolean;
  isDark?: boolean;
  compact?: boolean;
}

export default function PhaseDisplay({
  phaseNumber,
  requirements,
  hasLaidDown,
  isDark,
  compact,
}: PhaseDisplayProps) {
  if (compact) {
    return (
      <View style={[styles.compactContainer, isDark && styles.containerDark]}>
        <Text style={[styles.compactPhaseNumber, isDark && styles.textDark]}>
          Phase {phaseNumber}
        </Text>
        <Text
          style={[styles.compactDescription, isDark && styles.subtitleDark]}
          numberOfLines={1}
        >
          {getPhaseDescription(requirements)}
        </Text>
        {hasLaidDown && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedText}>Done</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Text style={[styles.phaseNumber, isDark && styles.textDark]}>
          Phase {phaseNumber}
        </Text>
        {hasLaidDown && (
          <View style={styles.completedBadge}>
            <Text style={styles.completedText}>Completed</Text>
          </View>
        )}
      </View>
      <View style={styles.requirements}>
        {requirements.map((req, index) => (
          <View key={index} style={styles.requirement}>
            <View style={[styles.bullet, hasLaidDown && styles.bulletCompleted]} />
            <Text style={[styles.requirementText, isDark && styles.subtitleDark]}>
              {getRequirementDescription(req)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Mini phase tracker showing all players' progress
interface PhaseTrackerProps {
  players: Array<{
    id: string;
    username: string;
    phaseIndex: number;
    hasLaidDown: boolean;
    isCurrentPlayer: boolean;
  }>;
  totalPhases: number;
  isDark?: boolean;
}

export function PhaseTracker({ players, totalPhases, isDark }: PhaseTrackerProps) {
  return (
    <View style={[styles.tracker, isDark && styles.trackerDark]}>
      {players.map((player) => (
        <View key={player.id} style={styles.trackerPlayer}>
          <Text
            style={[
              styles.trackerName,
              isDark && styles.textDark,
              player.isCurrentPlayer && styles.trackerNameActive,
            ]}
            numberOfLines={1}
          >
            {player.username}
          </Text>
          <View style={styles.trackerProgress}>
            {Array.from({ length: totalPhases }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.trackerDot,
                  i < player.phaseIndex && styles.trackerDotCompleted,
                  i === player.phaseIndex && player.hasLaidDown && styles.trackerDotCurrent,
                ]}
              />
            ))}
          </View>
          <Text style={[styles.trackerPhase, isDark && styles.subtitleDark]}>
            {player.phaseIndex + 1}/{totalPhases}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
  },
  containerDark: {
    backgroundColor: '#2a2a2a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  phaseNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  textDark: {
    color: '#fff',
  },
  subtitleDark: {
    color: '#999',
  },
  completedBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  completedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  requirements: {
    gap: 6,
  },
  requirement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
  bulletCompleted: {
    backgroundColor: '#34C759',
  },
  requirementText: {
    fontSize: 14,
    color: '#666',
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 8,
    gap: 8,
  },
  compactPhaseNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  compactDescription: {
    flex: 1,
    fontSize: 12,
    color: '#666',
  },
  // Tracker styles
  tracker: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  trackerDark: {
    backgroundColor: '#2a2a2a',
  },
  trackerPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackerName: {
    width: 80,
    fontSize: 12,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  trackerNameActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  trackerProgress: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  trackerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ddd',
  },
  trackerDotCompleted: {
    backgroundColor: '#34C759',
  },
  trackerDotCurrent: {
    backgroundColor: '#007AFF',
  },
  trackerPhase: {
    fontSize: 12,
    color: '#666',
    minWidth: 30,
  },
});
