import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ActionLogEntry } from '../stores/gameStore';

interface GameLogProps {
  entries: ActionLogEntry[];
  isDark?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

const ACTION_ICONS: Record<ActionLogEntry['action'], string> = {
  draw: 'hand-grab-o',
  discard: 'arrow-down',
  lay_down: 'th-large',
  hit: 'plus-circle',
  skip: 'ban',
  round_end: 'flag-checkered',
  game_start: 'play',
};

const ACTION_COLORS: Record<ActionLogEntry['action'], string> = {
  draw: '#007AFF',
  discard: '#FF9500',
  lay_down: '#34C759',
  hit: '#5856D6',
  skip: '#FF3B30',
  round_end: '#AF52DE',
  game_start: '#00C7BE',
};

export function GameLog({ entries, isDark, expanded, onToggle }: GameLogProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (expanded && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [entries.length, expanded]);

  const recentEntries = entries.slice(-10);

  if (!expanded) {
    // Collapsed view - just show last action
    const lastEntry = entries[entries.length - 1];
    return (
      <Pressable
        style={[styles.collapsedContainer, isDark && styles.collapsedContainerDark]}
        onPress={onToggle}
      >
        <View style={styles.collapsedHeader}>
          <FontAwesome name="list" size={14} color={isDark ? '#999' : '#666'} />
          <Text style={[styles.collapsedTitle, isDark && styles.textDark]}>
            Game Log
          </Text>
          <FontAwesome name="chevron-down" size={12} color={isDark ? '#999' : '#666'} />
        </View>
        {lastEntry && (
          <Text style={[styles.lastAction, isDark && styles.subtitleDark]} numberOfLines={1}>
            {lastEntry.details}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Pressable style={styles.header} onPress={onToggle}>
        <FontAwesome name="list" size={14} color={isDark ? '#999' : '#666'} />
        <Text style={[styles.title, isDark && styles.textDark]}>Game Log</Text>
        <FontAwesome name="chevron-up" size={12} color={isDark ? '#999' : '#666'} />
      </Pressable>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {recentEntries.length === 0 ? (
          <Text style={[styles.emptyText, isDark && styles.subtitleDark]}>
            No actions yet
          </Text>
        ) : (
          recentEntries.map((entry) => (
            <View key={entry.id} style={styles.entry}>
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: ACTION_COLORS[entry.action] + '20' },
                ]}
              >
                <FontAwesome
                  name={ACTION_ICONS[entry.action] as any}
                  size={12}
                  color={ACTION_COLORS[entry.action]}
                />
              </View>
              <View style={styles.entryContent}>
                <Text style={[styles.entryText, isDark && styles.textDark]}>
                  <Text style={styles.playerName}>{entry.playerName}</Text>
                  {': '}
                  {entry.details}
                </Text>
                <Text style={[styles.timestamp, isDark && styles.subtitleDark]}>
                  {formatTime(entry.timestamp)}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  containerDark: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
  },
  collapsedContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  collapsedContainerDark: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
  },
  collapsedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  collapsedTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  lastAction: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 6,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  textDark: {
    color: '#fff',
  },
  subtitleDark: {
    color: '#999',
  },
  scrollView: {
    maxHeight: 150,
  },
  scrollContent: {
    padding: 8,
    gap: 6,
  },
  emptyText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    padding: 16,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  entryContent: {
    flex: 1,
  },
  entryText: {
    fontSize: 12,
    color: '#333',
    lineHeight: 16,
  },
  playerName: {
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
});
