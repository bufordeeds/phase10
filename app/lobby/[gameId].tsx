import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import { useGameStore } from '@/src/stores/gameStore';
import { useAuthStore } from '@/src/stores/authStore';
import { supabase } from '@/src/lib/supabase';
import { Profile } from '@/src/types/database';
import { getPhaseDescription } from '@/src/utils/phaseValidation';
import FontAwesome from '@expo/vector-icons/FontAwesome';

interface PlayerWithProfile {
  id: string;
  user_id: string;
  seat_index: number;
  profile?: Profile;
}

export default function GameLobbyScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { user } = useAuthStore();
  const { game, players, phaseSet, loading, error, loadGame, startGame, leaveGame } = useGameStore();

  const [playersWithProfiles, setPlayersWithProfiles] = useState<PlayerWithProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  // Load game when component mounts
  useEffect(() => {
    if (gameId) {
      loadGame(gameId);
    }
  }, [gameId]);

  // Load player profiles
  useEffect(() => {
    async function loadProfiles() {
      if (!players.length) {
        setLoadingProfiles(false);
        return;
      }

      const profilesData = await Promise.all(
        players.map(async (player) => {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', player.user_id)
            .single();

          return {
            ...player,
            profile: data as unknown as Profile,
          };
        })
      );

      setPlayersWithProfiles(profilesData);
      setLoadingProfiles(false);
    }

    loadProfiles();
  }, [players]);

  // Redirect to game when it starts
  useEffect(() => {
    if (game?.status === 'playing') {
      router.replace(`/game/${game.id}`);
    }
  }, [game?.status]);

  const isHost = game?.host_id === user?.id;
  const canStart = isHost && players.length >= 2;

  const handleStartGame = async () => {
    const success = await startGame();
    if (!success && error) {
      Alert.alert('Error', error);
    }
  };

  const handleLeaveGame = async () => {
    Alert.alert(
      'Leave Game',
      'Are you sure you want to leave this lobby?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await leaveGame();
            router.replace('/(main)');
          },
        },
      ]
    );
  };

  const handleShareCode = async () => {
    if (!game) return;

    try {
      await Share.share({
        message: `Join my Phase 10 game! Code: ${game.code}`,
      });
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  const handleCopyCode = () => {
    // React Native doesn't have clipboard by default, so we'll just show the code
    Alert.alert('Game Code', game?.code || '', [{ text: 'OK' }]);
  };

  if (loading || loadingProfiles) {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" />
        <Text style={[styles.loadingText, isDark && styles.subtitleDark]}>
          Loading lobby...
        </Text>
      </View>
    );
  }

  if (!game) {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <Text style={[styles.errorText, isDark && styles.textDark]}>Game not found</Text>
        <Pressable style={styles.backButton} onPress={() => router.replace('/(main)')}>
          <Text style={styles.backButtonText}>Back to Menu</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      contentContainerStyle={styles.content}
    >
      {/* Game Code */}
      <View style={[styles.codeCard, isDark && styles.codeCardDark]}>
        <Text style={[styles.codeLabel, isDark && styles.subtitleDark]}>Game Code</Text>
        <Pressable onPress={handleCopyCode}>
          <Text style={[styles.codeValue, isDark && styles.textDark]}>{game.code}</Text>
        </Pressable>
        <Pressable style={styles.shareButton} onPress={handleShareCode}>
          <FontAwesome name="share" size={16} color="#007AFF" />
          <Text style={styles.shareButtonText}>Share</Text>
        </Pressable>
      </View>

      {/* Players */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          Players ({players.length}/{game.settings?.maxPlayers || 6})
        </Text>
        <View style={styles.playersList}>
          {playersWithProfiles.map((player, index) => (
            <View
              key={player.id}
              style={[styles.playerCard, isDark && styles.playerCardDark]}
            >
              <View style={styles.playerInfo}>
                <View style={[styles.playerAvatar, { backgroundColor: getAvatarColor(index) }]}>
                  <Text style={styles.playerInitial}>
                    {(player.profile?.username || 'P')[0].toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.playerName, isDark && styles.textDark]}>
                    {player.profile?.username || 'Unknown'}
                  </Text>
                  {player.user_id === game.host_id && (
                    <Text style={styles.hostBadge}>Host</Text>
                  )}
                </View>
              </View>
              {player.user_id === game.host_id && (
                <FontAwesome name="star" size={16} color="#FFD700" />
              )}
            </View>
          ))}

          {/* Empty slots */}
          {Array.from({ length: (game.settings?.maxPlayers || 6) - players.length }).map((_, index) => (
            <View
              key={`empty-${index}`}
              style={[styles.playerCard, styles.emptySlot, isDark && styles.emptySlotDark]}
            >
              <Text style={[styles.emptySlotText, isDark && styles.subtitleDark]}>
                Waiting for player...
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Phase Set Preview */}
      {phaseSet && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            {phaseSet.name}
          </Text>
          <View style={[styles.phasePreview, isDark && styles.phasePreviewDark]}>
            {phaseSet.phases.slice(0, 3).map((phase, index) => (
              <Text key={index} style={[styles.phaseItem, isDark && styles.subtitleDark]}>
                {index + 1}. {getPhaseDescription(phase)}
              </Text>
            ))}
            {phaseSet.phases.length > 3 && (
              <Text style={[styles.morePhases, isDark && styles.subtitleDark]}>
                ...and {phaseSet.phases.length - 3} more phases
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {isHost ? (
          <Pressable
            style={[styles.startButton, !canStart && styles.buttonDisabled]}
            onPress={handleStartGame}
            disabled={!canStart}
          >
            <Text style={styles.startButtonText}>
              {players.length < 2 ? 'Need 2+ Players' : 'Start Game'}
            </Text>
          </Pressable>
        ) : (
          <View style={[styles.waitingCard, isDark && styles.waitingCardDark]}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={[styles.waitingText, isDark && styles.subtitleDark]}>
              Waiting for host to start...
            </Text>
          </View>
        )}

        <Pressable style={styles.leaveButton} onPress={handleLeaveGame}>
          <Text style={styles.leaveButtonText}>Leave Lobby</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const getAvatarColor = (index: number) => {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
  return colors[index % colors.length];
};

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
  content: {
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  textDark: {
    color: '#fff',
  },
  subtitleDark: {
    color: '#999',
  },
  backButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  codeCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  codeCardDark: {
    backgroundColor: '#2a2a2a',
  },
  codeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  codeValue: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 4,
    color: '#1a1a1a',
    marginBottom: 12,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  playersList: {
    gap: 8,
  },
  playerCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerCardDark: {
    backgroundColor: '#2a2a2a',
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  hostBadge: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  emptySlot: {
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: 'transparent',
    justifyContent: 'center',
  },
  emptySlotDark: {
    borderColor: '#444',
  },
  emptySlotText: {
    color: '#999',
    fontSize: 14,
  },
  phasePreview: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
  },
  phasePreviewDark: {
    backgroundColor: '#1a1a1a',
  },
  phaseItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  morePhases: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  startButton: {
    backgroundColor: '#34C759',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  waitingCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  waitingCardDark: {
    backgroundColor: '#2a2a2a',
  },
  waitingText: {
    fontSize: 16,
    color: '#666',
  },
  leaveButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  leaveButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});
