import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import { useGameStore } from '@/src/stores/gameStore';
import { useAuthStore } from '@/src/stores/authStore';
import { supabase } from '@/src/lib/supabase';
import { Card as CardType, Profile, PhaseRequirement } from '@/src/types/database';
import { validatePhase, getPhaseDescription } from '@/src/utils/phaseValidation';
import { sortCards } from '@/src/utils/deck';
import { Card, Hand, GamePiles, PhaseDisplay, PhaseTable } from '@/src/components';
import FontAwesome from '@expo/vector-icons/FontAwesome';

interface PlayerInfo {
  id: string;
  username: string;
  phaseIndex: number;
  hasLaidDown: boolean;
  cardCount: number;
  score: number;
  isCurrentTurn: boolean;
}

export default function GameScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { user } = useAuthStore();
  const {
    game,
    players,
    currentPlayer,
    phaseSet,
    selectedCards,
    loading,
    error,
    loadGame,
    drawCard,
    layDownPhase,
    hitOnGroup,
    discardCard,
    selectCard,
    deselectCard,
    clearSelection,
    setError,
  } = useGameStore();

  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [showLayDownModal, setShowLayDownModal] = useState(false);
  const [showHitModal, setShowHitModal] = useState(false);
  const [hitTargetPlayer, setHitTargetPlayer] = useState<string | null>(null);
  const [hitTargetGroup, setHitTargetGroup] = useState<number | null>(null);

  // Load game on mount
  useEffect(() => {
    if (gameId) {
      loadGame(gameId);
    }
  }, [gameId]);

  // Load player profiles
  useEffect(() => {
    async function loadProfiles() {
      if (!players.length) return;

      const profilesMap: Record<string, Profile> = {};
      for (const player of players) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', player.user_id)
          .single();

        if (data) {
          profilesMap[player.user_id] = data as unknown as Profile;
        }
      }
      setProfiles(profilesMap);
    }

    loadProfiles();
  }, [players]);

  // Redirect if game ends
  useEffect(() => {
    if (game?.status === 'finished') {
      Alert.alert(
        'Game Over',
        'The game has ended!',
        [{ text: 'OK', onPress: () => router.replace('/(main)') }]
      );
    }
  }, [game?.status]);

  // Sort players by seat index
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => a.seat_index - b.seat_index);
  }, [players]);

  // Current turn player
  const turnPlayer = useMemo(() => {
    if (!game) return null;
    return sortedPlayers[game.current_player_index] || null;
  }, [game, sortedPlayers]);

  // Is it current user's turn?
  const isMyTurn = turnPlayer?.user_id === user?.id;

  // Current phase requirements
  const currentPhaseRequirements = useMemo((): PhaseRequirement[] => {
    if (!currentPlayer || !phaseSet) return [];
    return phaseSet.phases[currentPlayer.current_phase_index] || [];
  }, [currentPlayer, phaseSet]);

  // Player info for display
  const playerInfoList = useMemo((): PlayerInfo[] => {
    return sortedPlayers.map((player) => ({
      id: player.id,
      username: profiles[player.user_id]?.username || 'Unknown',
      phaseIndex: player.current_phase_index,
      hasLaidDown: player.has_laid_down,
      cardCount: player.hand.length,
      score: player.score,
      isCurrentTurn: turnPlayer?.id === player.id,
    }));
  }, [sortedPlayers, profiles, turnPlayer]);

  // Get cards from selected IDs
  const getSelectedCards = useCallback((): CardType[] => {
    if (!currentPlayer) return [];
    return currentPlayer.hand.filter((card) => selectedCards.includes(card.id));
  }, [currentPlayer, selectedCards]);

  // Sorted hand for display
  const sortedHand = useMemo(() => {
    if (!currentPlayer) return [];
    return sortCards(currentPlayer.hand);
  }, [currentPlayer]);

  // Handle card selection
  const handleCardPress = (cardId: string) => {
    if (selectedCards.includes(cardId)) {
      deselectCard(cardId);
    } else {
      selectCard(cardId);
    }
  };

  // Handle draw from deck
  const handleDrawFromDeck = async () => {
    if (!isMyTurn || game?.turn_phase !== 'draw') return;

    const success = await drawCard('draw');
    if (!success && error) {
      Alert.alert('Error', error);
    }
  };

  // Handle draw from discard
  const handleDrawFromDiscard = async () => {
    if (!isMyTurn || game?.turn_phase !== 'draw') return;

    const topDiscard = game.discard_pile[game.discard_pile.length - 1];
    if (topDiscard?.color === 'skip') {
      Alert.alert('Error', 'Cannot draw a Skip card');
      return;
    }

    const success = await drawCard('discard');
    if (!success && error) {
      Alert.alert('Error', error);
    }
  };

  // Handle lay down phase
  const handleLayDown = async () => {
    if (!currentPlayer || currentPlayer.has_laid_down) return;

    const cards = getSelectedCards();
    if (cards.length === 0) {
      Alert.alert('Error', 'Select cards to lay down');
      return;
    }

    // Validate phase
    const result = validatePhase(cards, currentPhaseRequirements);
    if (!result.valid) {
      Alert.alert('Invalid Phase', result.error || 'Cards do not satisfy phase requirements');
      return;
    }

    // Use the validated groups
    const success = await layDownPhase(result.groups);
    if (success) {
      setShowLayDownModal(false);
    } else if (error) {
      Alert.alert('Error', error);
    }
  };

  // Handle discard
  const handleDiscard = async () => {
    if (!isMyTurn || game?.turn_phase !== 'play') return;

    if (selectedCards.length !== 1) {
      Alert.alert('Error', 'Select exactly one card to discard');
      return;
    }

    const card = getSelectedCards()[0];
    const success = await discardCard(card);
    if (!success && error) {
      Alert.alert('Error', error);
    }
  };

  // Handle hit on group
  const handleHit = async () => {
    if (!currentPlayer?.has_laid_down) {
      Alert.alert('Error', 'Must lay down phase first');
      return;
    }

    if (selectedCards.length !== 1) {
      Alert.alert('Error', 'Select exactly one card to hit');
      return;
    }

    if (!hitTargetPlayer || hitTargetGroup === null) {
      Alert.alert('Error', 'Select a group to hit on');
      return;
    }

    const card = getSelectedCards()[0];
    const success = await hitOnGroup(hitTargetPlayer, hitTargetGroup, card);
    if (success) {
      setShowHitModal(false);
      setHitTargetPlayer(null);
      setHitTargetGroup(null);
    } else if (error) {
      Alert.alert('Error', error);
    }
  };

  // Open hit modal
  const openHitModal = () => {
    if (selectedCards.length !== 1) {
      Alert.alert('Error', 'Select exactly one card to hit');
      return;
    }
    setShowHitModal(true);
  };

  // Clear error on dismiss
  const dismissError = () => setError(null);

  if (loading && !game) {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" />
        <Text style={[styles.loadingText, isDark && styles.subtitleDark]}>
          Loading game...
        </Text>
      </View>
    );
  }

  if (!game || !currentPlayer) {
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
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Top bar - Players and scores */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.playersBar}
        contentContainerStyle={styles.playersBarContent}
      >
        {playerInfoList.map((player) => (
          <View
            key={player.id}
            style={[
              styles.playerChip,
              isDark && styles.playerChipDark,
              player.isCurrentTurn && styles.playerChipActive,
            ]}
          >
            <Text
              style={[
                styles.playerName,
                isDark && styles.textDark,
                player.isCurrentTurn && styles.playerNameActive,
              ]}
              numberOfLines={1}
            >
              {player.username}
            </Text>
            <Text style={[styles.playerStats, isDark && styles.subtitleDark]}>
              P{player.phaseIndex + 1} | {player.cardCount} cards
            </Text>
            {player.hasLaidDown && (
              <FontAwesome name="check-circle" size={12} color="#34C759" style={styles.checkIcon} />
            )}
          </View>
        ))}
      </ScrollView>

      {/* Turn indicator */}
      <View style={[styles.turnIndicator, isDark && styles.turnIndicatorDark]}>
        <Text style={[styles.turnText, isDark && styles.textDark]}>
          {isMyTurn ? "Your turn" : `${profiles[turnPlayer?.user_id || '']?.username || 'Unknown'}'s turn`}
        </Text>
        <Text style={[styles.phaseText, isDark && styles.subtitleDark]}>
          {game.turn_phase === 'draw' ? 'Draw a card' : 'Play or discard'}
        </Text>
      </View>

      {/* Phase info */}
      <View style={styles.phaseSection}>
        <PhaseDisplay
          phaseNumber={currentPlayer.current_phase_index + 1}
          requirements={currentPhaseRequirements}
          hasLaidDown={currentPlayer.has_laid_down}
          isDark={isDark}
          compact
        />
      </View>

      {/* Game table - Piles and laid down phases */}
      <View style={styles.tableArea}>
        <GamePiles
          drawPileCount={game.draw_pile.length}
          discardPile={game.discard_pile}
          isDrawPhase={isMyTurn && game.turn_phase === 'draw'}
          onDrawFromDeck={handleDrawFromDeck}
          onDrawFromDiscard={handleDrawFromDiscard}
        />

        {/* Laid down phases */}
        <PhaseTable
          players={sortedPlayers.map((p) => ({
            id: p.id,
            username: profiles[p.user_id]?.username || 'Unknown',
            groups: (p.laid_down_cards || []).map((cards, idx) => ({
              cards: cards as CardType[],
              requirement: phaseSet?.phases[p.current_phase_index]?.[idx] || { type: 'set', size: 3, quantity: 1 },
            })),
            isCurrentPlayer: p.user_id === user?.id,
          }))}
          canHit={isMyTurn && game.turn_phase === 'play' && currentPlayer.has_laid_down && selectedCards.length === 1}
          onHitGroup={(playerId, groupIndex) => {
            setHitTargetPlayer(playerId);
            setHitTargetGroup(groupIndex);
            handleHit();
          }}
          isDark={isDark}
        />
      </View>

      {/* Player's hand */}
      <View style={[styles.handArea, isDark && styles.handAreaDark]}>
        <Hand
          cards={sortedHand}
          selectedCards={selectedCards}
          disabled={!isMyTurn}
          onCardPress={handleCardPress}
        />
      </View>

      {/* Action buttons */}
      {isMyTurn && game.turn_phase === 'play' && (
        <View style={styles.actionBar}>
          {!currentPlayer.has_laid_down && (
            <Pressable
              style={[styles.actionButton, styles.layDownButton]}
              onPress={() => setShowLayDownModal(true)}
              disabled={selectedCards.length === 0}
            >
              <FontAwesome name="th-large" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Lay Down</Text>
            </Pressable>
          )}

          {currentPlayer.has_laid_down && (
            <Pressable
              style={[styles.actionButton, styles.hitButton]}
              onPress={openHitModal}
              disabled={selectedCards.length !== 1}
            >
              <FontAwesome name="plus-circle" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Hit</Text>
            </Pressable>
          )}

          <Pressable
            style={[styles.actionButton, styles.discardButton]}
            onPress={handleDiscard}
            disabled={selectedCards.length !== 1}
          >
            <FontAwesome name="arrow-down" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>Discard</Text>
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.clearButton]}
            onPress={clearSelection}
          >
            <FontAwesome name="times" size={18} color="#666" />
          </Pressable>
        </View>
      )}

      {/* Lay Down Modal */}
      <Modal
        visible={showLayDownModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLayDownModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, isDark && styles.modalDark]}>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>Lay Down Phase</Text>
            <Text style={[styles.modalSubtitle, isDark && styles.subtitleDark]}>
              {getPhaseDescription(currentPhaseRequirements)}
            </Text>

            <View style={styles.selectedCardsPreview}>
              {getSelectedCards().map((card) => (
                <Card key={card.id} card={card} size="small" disabled />
              ))}
            </View>

            <Text style={[styles.modalHint, isDark && styles.subtitleDark]}>
              {selectedCards.length} cards selected
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowLayDownModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleLayDown}
              >
                <Text style={styles.confirmButtonText}>Lay Down</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Error display */}
      {error && (
        <Pressable style={styles.errorBanner} onPress={dismissError}>
          <Text style={styles.errorBannerText}>{error}</Text>
          <FontAwesome name="times" size={16} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
  // Players bar
  playersBar: {
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  playersBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  playerChip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerChipDark: {
    backgroundColor: '#2a2a2a',
  },
  playerChipActive: {
    backgroundColor: '#007AFF20',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    maxWidth: 80,
  },
  playerNameActive: {
    color: '#007AFF',
  },
  playerStats: {
    fontSize: 12,
    color: '#666',
  },
  checkIcon: {
    marginLeft: 4,
  },
  // Turn indicator
  turnIndicator: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  turnIndicatorDark: {
    backgroundColor: '#1a1a1a',
  },
  turnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  phaseText: {
    fontSize: 12,
    color: '#666',
  },
  // Phase section
  phaseSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  // Table area
  tableArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  // Hand area
  handArea: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  handAreaDark: {
    backgroundColor: '#1a1a1a',
    borderTopColor: '#333',
  },
  // Action bar
  actionBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  layDownButton: {
    backgroundColor: '#34C759',
  },
  hitButton: {
    backgroundColor: '#5856D6',
  },
  discardButton: {
    backgroundColor: '#FF9500',
  },
  clearButton: {
    flex: 0,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalDark: {
    backgroundColor: '#2a2a2a',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  selectedCardsPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 16,
  },
  modalHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#34C759',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Error banner
  errorBanner: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorBannerText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
});
