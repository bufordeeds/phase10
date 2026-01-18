import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import { useGameStore } from '@/src/stores/gameStore';
import { supabase } from '@/src/lib/supabase';
import { Game, GameSettings, Profile } from '@/src/types/database';
import FontAwesome from '@expo/vector-icons/FontAwesome';

interface LobbyGame extends Game {
  host_profile?: Profile;
  player_count?: number;
}

export default function LobbiesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [lobbies, setLobbies] = useState<LobbyGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cleanupStaleLobbies = useCallback(async () => {
    try {
      await supabase.rpc('cleanup_stale_lobbies');
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  }, []);

  const loadLobbies = useCallback(async () => {
    try {
      // Clean up stale lobbies first
      await cleanupStaleLobbies();

      // Get public lobby games
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('status', 'lobby')
        .is('password', null)
        .order('created_at', { ascending: false });

      if (gamesError) throw gamesError;

      const games = (gamesData || []) as unknown as Game[];

      // Get player counts and host profiles for each game
      const lobbiesWithDetails: LobbyGame[] = await Promise.all(
        games.map(async (game) => {
          // Get player count
          const { count } = await supabase
            .from('game_players')
            .select('*', { count: 'exact', head: true })
            .eq('game_id', game.id);

          // Get host profile
          const { data: hostData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', game.host_id)
            .single();

          return {
            ...game,
            player_count: count || 0,
            host_profile: hostData as unknown as Profile,
          };
        })
      );

      setLobbies(lobbiesWithDetails);
    } catch (err) {
      console.error('Error loading lobbies:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLobbies();

    // Subscribe to lobby changes
    const channel = supabase
      .channel('lobbies')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: 'status=eq.lobby' },
        () => {
          loadLobbies();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [loadLobbies]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadLobbies();
  }, [loadLobbies]);

  const { joinGame } = useGameStore();
  const [joiningGameId, setJoiningGameId] = useState<string | null>(null);

  const handleJoinLobby = async (game: LobbyGame) => {
    setJoiningGameId(game.id);
    const success = await joinGame(game.code);
    setJoiningGameId(null);

    if (success) {
      router.push(`/lobby/${game.id}`);
    } else {
      const { error } = useGameStore.getState();
      Alert.alert('Error', error || 'Failed to join game');
    }
  };

  const renderLobbyItem = ({ item }: { item: LobbyGame }) => {
    const settings = item.settings as GameSettings;
    const maxPlayers = settings?.maxPlayers || 6;
    const isFull = (item.player_count || 0) >= maxPlayers;

    return (
      <Pressable
        style={[styles.lobbyCard, isDark && styles.lobbyCardDark, isFull && styles.lobbyCardFull]}
        onPress={() => !isFull && handleJoinLobby(item)}
        disabled={isFull || joiningGameId === item.id}
      >
        <View style={styles.lobbyHeader}>
          <Text style={[styles.hostName, isDark && styles.textDark]}>
            {item.host_profile?.username || 'Unknown'}'s Game
          </Text>
          <View style={[styles.playerBadge, isFull && styles.playerBadgeFull]}>
            <FontAwesome name="users" size={12} color={isFull ? '#FF3B30' : '#007AFF'} />
            <Text style={[styles.playerCount, isFull && styles.playerCountFull]}>
              {item.player_count}/{maxPlayers}
            </Text>
          </View>
        </View>

        <View style={styles.lobbyDetails}>
          <Text style={[styles.gameCode, isDark && styles.subtitleDark]}>
            Code: {item.code}
          </Text>
        </View>

        {isFull ? (
          <Text style={styles.fullLabel}>Full</Text>
        ) : joiningGameId === item.id ? (
          <Text style={styles.joiningLabel}>Joining...</Text>
        ) : (
          <Text style={styles.joinLabel}>Tap to join</Text>
        )}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <FlatList
        data={lobbies}
        renderItem={renderLobbyItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#fff' : '#000'}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FontAwesome name="search" size={48} color={isDark ? '#444' : '#ccc'} />
            <Text style={[styles.emptyText, isDark && styles.subtitleDark]}>
              No public games available
            </Text>
            <Text style={[styles.emptyHint, isDark && styles.subtitleDark]}>
              Host a game or enter a code to join
            </Text>
            <Pressable
              style={styles.hostButton}
              onPress={() => router.push('/(main)/host')}
            >
              <Text style={styles.hostButtonText}>Host Game</Text>
            </Pressable>
          </View>
        }
      />

      {/* FAB to host game */}
      {lobbies.length > 0 && (
        <Pressable
          style={styles.fab}
          onPress={() => router.push('/(main)/host')}
        >
          <FontAwesome name="plus" size={24} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  containerDark: {
    backgroundColor: '#121212',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
  },
  lobbyCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  lobbyCardDark: {
    backgroundColor: '#2a2a2a',
  },
  lobbyCardFull: {
    opacity: 0.6,
  },
  lobbyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  hostName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  textDark: {
    color: '#fff',
  },
  playerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  playerBadgeFull: {
    backgroundColor: '#FF3B3020',
  },
  playerCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  playerCountFull: {
    color: '#FF3B30',
  },
  lobbyDetails: {
    marginBottom: 8,
  },
  gameCode: {
    fontSize: 14,
    color: '#666',
  },
  subtitleDark: {
    color: '#999',
  },
  joinLabel: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  fullLabel: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '500',
  },
  joiningLabel: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
  },
  hostButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  hostButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
