import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Game, GamePlayer, Card, PhaseSet, GameSettings } from '../types/database';
import { setupGame, shuffle, calculateHandScore, removeCardById, getCardDisplayName } from '../utils/deck';
import { validatePhase, canHitOnGroup, determineGroupType } from '../utils/phaseValidation';
import { RealtimeChannel } from '@supabase/supabase-js';

// Action log entry for in-game history
export interface ActionLogEntry {
  id: string;
  timestamp: Date;
  playerId: string;
  playerName: string;
  action: 'draw' | 'discard' | 'lay_down' | 'hit' | 'skip' | 'round_end' | 'game_start';
  details: string;
}

interface GameState {
  // Current game data
  game: Game | null;
  players: GamePlayer[];
  currentPlayer: GamePlayer | null;
  phaseSet: PhaseSet | null;

  // Local UI state
  selectedCards: string[]; // Card IDs selected for phase lay down
  loading: boolean;
  error: string | null;
  actionLog: ActionLogEntry[]; // In-game action history

  // Realtime channel
  channel: RealtimeChannel | null;
}

interface GameActions {
  // Game lifecycle
  createGame: (phaseSetId: string, settings: GameSettings, password?: string) => Promise<string | null>;
  joinGame: (code: string, password?: string) => Promise<boolean>;
  leaveGame: () => Promise<void>;
  startGame: () => Promise<boolean>;

  // Load/subscribe
  loadGame: (gameId: string) => Promise<boolean>;
  subscribeToGame: (gameId: string) => void;
  unsubscribeFromGame: () => void;

  // Game actions
  drawCard: (pile: 'draw' | 'discard') => Promise<boolean>;
  layDownPhase: (cardGroups: Card[][]) => Promise<boolean>;
  hitOnGroup: (targetPlayerId: string, groupIndex: number, card: Card) => Promise<boolean>;
  discardCard: (card: Card) => Promise<boolean>;

  // UI actions
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;

  // Action log
  addLogEntry: (action: ActionLogEntry['action'], details: string, playerName?: string) => void;

  // Utility
  setError: (error: string | null) => void;
  reset: () => void;
}

type GameStore = GameState & GameActions;

// Generate a 6-character game code
function generateGameCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Deduplicate cards by ID
function deduplicateCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  return cards.filter(card => {
    if (seen.has(card.id)) {
      console.warn('[STORE] Duplicate card filtered:', card.id);
      return false;
    }
    seen.add(card.id);
    return true;
  });
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  players: [],
  currentPlayer: null,
  phaseSet: null,
  selectedCards: [],
  loading: false,
  error: null,
  actionLog: [],
  channel: null,

  createGame: async (phaseSetId: string, settings: GameSettings, password?: string) => {
    set({ loading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const code = generateGameCode();

      const { data, error } = await supabase
        .from('games')
        .insert({
          code,
          password: password || null,
          host_id: user.id,
          phase_set_id: phaseSetId,
          status: 'lobby',
          settings,
          draw_pile: [],
          discard_pile: [],
        } as never)
        .select()
        .single();

      if (error) throw error;

      const game = data as unknown as Game;

      // Host automatically joins as first player
      const { error: joinError } = await supabase
        .from('game_players')
        .insert({
          game_id: game.id,
          user_id: user.id,
          seat_index: 0,
          hand: [],
        } as never);

      if (joinError) throw joinError;

      await get().loadGame(game.id);
      return game.id;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  joinGame: async (code: string, password?: string) => {
    set({ loading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Find game by code
      const { data, error: findError } = await supabase
        .from('games')
        .select('*')
        .eq('code', code.toUpperCase())
        .single();

      if (findError || !data) {
        throw new Error('Game not found');
      }

      const game = data as unknown as Game;

      if (game.status !== 'lobby') {
        throw new Error('Game has already started');
      }

      if (game.password && game.password !== password) {
        throw new Error('Invalid password');
      }

      // Check if already in game
      const { data: existingPlayer } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_id', game.id)
        .eq('user_id', user.id)
        .single();

      if (existingPlayer) {
        // Already in game, just load it
        await get().loadGame(game.id);
        return true;
      }

      // Get current player count for seat assignment
      const { data: playersData } = await supabase
        .from('game_players')
        .select('seat_index')
        .eq('game_id', game.id);

      const players = (playersData || []) as unknown as { seat_index: number }[];
      const maxPlayers = game.settings?.maxPlayers || 6;
      if (players.length >= maxPlayers) {
        throw new Error('Game is full');
      }

      const nextSeat = players.length > 0 ? Math.max(...players.map(p => p.seat_index)) + 1 : 0;

      // Join game
      const { error: joinError } = await supabase
        .from('game_players')
        .insert({
          game_id: game.id,
          user_id: user.id,
          seat_index: nextSeat,
          hand: [],
        } as never);

      if (joinError) throw joinError;

      await get().loadGame(game.id);
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  leaveGame: async () => {
    const { game, currentPlayer } = get();
    if (!game || !currentPlayer) return;

    try {
      await supabase
        .from('game_players')
        .delete()
        .eq('id', currentPlayer.id);

      get().unsubscribeFromGame();
      set({ game: null, players: [], currentPlayer: null, phaseSet: null });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  startGame: async () => {
    const { game, players } = get();
    if (!game || players.length < 2) return false;

    set({ loading: true, error: null });
    try {
      // Set up the deck and deal cards
      const { hands, drawPile, discardPile } = setupGame(players.length);

      console.log('Starting game with:', {
        gameId: game.id,
        playerCount: players.length,
        handsCount: hands.length,
        drawPileCount: drawPile.length,
        discardPileCount: discardPile.length,
      });

      // Use the secure database function to start the game
      // This handles dealing cards and updating game state atomically
      const { data, error } = await supabase.rpc('start_game', {
        p_game_id: game.id,
        p_hands: hands,
        p_draw_pile: drawPile,
        p_discard_pile: discardPile,
      });

      console.log('start_game RPC result:', { data, error });

      if (error) throw error;

      // Log game start
      get().addLogEntry('game_start', 'Game started! Good luck!', 'System');

      return true;
    } catch (err) {
      console.error('startGame error:', err);
      set({ error: (err as Error).message });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  loadGame: async (gameId: string) => {
    set({ loading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Load game
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();

      console.log('loadGame result:', {
        gameData,
        drawPileLength: gameData?.draw_pile?.length,
        discardPileLength: gameData?.discard_pile?.length,
        error: gameError,
      });

      if (gameError || !gameData) throw new Error('Game not found');

      const game = gameData as unknown as Game;

      // Load players
      const { data: playersData, error: playersError } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_id', gameId)
        .order('seat_index');

      if (playersError) throw playersError;

      const players = (playersData || []) as unknown as GamePlayer[];

      // Load phase set
      const { data: phaseSetData } = await supabase
        .from('phase_sets')
        .select('*')
        .eq('id', game.phase_set_id)
        .single();

      const currentPlayer = players.find(p => p.user_id === user.id) || null;
      const phaseSet = phaseSetData as unknown as PhaseSet | null;

      set({
        game,
        players,
        currentPlayer,
        phaseSet,
      });

      // Subscribe to updates
      get().subscribeToGame(gameId);

      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  subscribeToGame: (gameId: string) => {
    const { channel: existingChannel, game: existingGame } = get();

    // Don't create duplicate subscriptions for the same game
    if (existingChannel && existingGame?.id === gameId) {
      console.log('[REALTIME] Already subscribed to this game, skipping');
      return;
    }

    if (existingChannel) {
      console.log('[REALTIME] Unsubscribing from existing channel');
      supabase.removeChannel(existingChannel);
    }

    // Use a unique channel name to prevent conflicts
    const channelName = `game:${gameId}:${Date.now()}`;
    console.log('[REALTIME] Creating new subscription:', channelName);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          console.log('[REALTIME] Game update received:', {
            eventType: payload.eventType,
            turnPhase: (payload.new as Game)?.turn_phase,
            currentPlayerIndex: (payload.new as Game)?.current_player_index,
            discardPileLength: (payload.new as Game)?.discard_pile?.length,
          });
          if (payload.eventType === 'UPDATE') {
            set({ game: payload.new as Game });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const { currentPlayer: localCurrentPlayer } = get();
          const updatedPlayer = payload.new as GamePlayer;

          // Use the stored currentPlayer to determine if this is our own update
          // This avoids async issues with getUser()
          const isOwnUpdate = updatedPlayer?.user_id === localCurrentPlayer?.user_id;

          console.log('[REALTIME] Player update received:', {
            eventType: payload.eventType,
            updatedPlayerId: updatedPlayer?.user_id,
            localCurrentPlayerId: localCurrentPlayer?.user_id,
            isOwnUpdate,
            handLength: updatedPlayer?.hand?.length,
          });

          // Apply the realtime payload directly (server is source of truth)
          if (isOwnUpdate) {
            // This is our own player update - use the payload directly
            const deduplicatedHand = deduplicateCards(updatedPlayer.hand || []);
            const updatedCurrentPlayer = {
              ...updatedPlayer,
              hand: deduplicatedHand,
            };

            console.log('[REALTIME] Own player update applied, hand length:', deduplicatedHand.length);

            // Update our player in the players array
            const { players: currentPlayers } = get();
            const updatedPlayers = currentPlayers.map(p =>
              p.user_id === localCurrentPlayer?.user_id ? updatedCurrentPlayer : p
            );

            set({
              players: updatedPlayers as GamePlayer[],
              currentPlayer: updatedCurrentPlayer as GamePlayer,
            });
          } else {
            // Another player's update - handle INSERT vs UPDATE
            const { players: currentPlayers, currentPlayer, game } = get();

            // Workaround: Refetch game state when another player makes changes
            // This compensates for game realtime updates not always coming through
            if (payload.eventType === 'UPDATE' && game) {
              supabase
                .from('games')
                .select('*')
                .eq('id', game.id)
                .single()
                .then(({ data }) => {
                  if (data) {
                    console.log('[REALTIME] Refetched game state after other player update:', {
                      turnPhase: (data as Game).turn_phase,
                      currentPlayerIndex: (data as Game).current_player_index,
                      discardPileLength: (data as Game).discard_pile?.length,
                    });
                    set({ game: data as Game });
                  }
                });
            }

            if (payload.eventType === 'INSERT') {
              // New player joined - add them to the array
              console.log('[REALTIME] New player joined, adding to players array');
              const playerExists = currentPlayers.some(p => p.id === updatedPlayer.id);
              if (!playerExists && updatedPlayer.id) {
                // Ensure the new player has required fields
                const newPlayer: GamePlayer = {
                  ...updatedPlayer,
                  hand: updatedPlayer.hand || [],
                  laid_down_cards: updatedPlayer.laid_down_cards || [],
                  hits: updatedPlayer.hits || [],
                };
                const newPlayers = [...currentPlayers, newPlayer].sort(
                  (a, b) => a.seat_index - b.seat_index
                );
                set({
                  players: newPlayers,
                  currentPlayer,
                });
              }
            } else if (payload.eventType === 'UPDATE') {
              // Existing player updated - merge with existing data to preserve fields
              console.log('[REALTIME] Other player update, updating in players array');
              const updatedPlayers = currentPlayers.map(p => {
                if (p.id === updatedPlayer.id) {
                  // Merge the update with existing player data
                  return {
                    ...p,
                    ...updatedPlayer,
                    // Ensure arrays are never undefined
                    hand: updatedPlayer.hand ?? p.hand ?? [],
                    laid_down_cards: updatedPlayer.laid_down_cards ?? p.laid_down_cards ?? [],
                    hits: updatedPlayer.hits ?? p.hits ?? [],
                  };
                }
                return p;
              });
              set({
                players: updatedPlayers,
                currentPlayer,
              });
            } else if (payload.eventType === 'DELETE') {
              // Player left
              console.log('[REALTIME] Player left, removing from players array');
              const filteredPlayers = currentPlayers.filter(p => p.id !== (payload.old as GamePlayer)?.id);
              set({
                players: filteredPlayers,
                currentPlayer,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME] Subscription status:', status);
      });

    set({ channel });
  },

  unsubscribeFromGame: () => {
    const { channel } = get();
    if (channel) {
      console.log('[REALTIME] Unsubscribing from game channel');
      supabase.removeChannel(channel);
      set({ channel: null });
    }
  },

  drawCard: async (pile: 'draw' | 'discard') => {
    const { game, currentPlayer, players, loading } = get();

    console.log('[DRAW] Starting draw from:', pile);

    if (loading) {
      console.log('[DRAW] Error: Action already in progress');
      return false;
    }

    if (!game || !currentPlayer) {
      console.log('[DRAW] Error: No game or currentPlayer');
      return false;
    }

    // Validate it's this player's turn
    const sortedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);
    const currentTurnPlayer = sortedPlayers[game.current_player_index];

    if (currentTurnPlayer?.user_id !== currentPlayer.user_id) {
      console.log('[DRAW] Error: Not your turn');
      set({ error: 'Not your turn' });
      return false;
    }

    if (game.turn_phase !== 'draw') {
      console.log('[DRAW] Error: Already drew this turn');
      set({ error: 'Already drew this turn' });
      return false;
    }

    // Set loading to disable UI while we update
    set({ loading: true, error: null });

    try {
      // Calculate new state
      let card: Card;
      let newDrawPile = [...game.draw_pile];
      let newDiscardPile = [...game.discard_pile];

      if (pile === 'draw') {
        // Reshuffle if draw pile empty
        if (newDrawPile.length === 0) {
          if (newDiscardPile.length <= 1) {
            throw new Error('No cards left to draw');
          }
          const topDiscard = newDiscardPile.pop()!;
          newDrawPile = shuffle(newDiscardPile);
          newDiscardPile = [topDiscard];
        }
        card = newDrawPile.pop()!;
      } else {
        if (newDiscardPile.length === 0) {
          throw new Error('Discard pile is empty');
        }
        card = newDiscardPile.pop()!;
      }

      const newHand = [...currentPlayer.hand, card];

      console.log('[DRAW] Updating database...', {
        cardId: card.id,
        newHandLength: newHand.length,
      });

      // Update game state in database
      const { error: gameError } = await supabase
        .from('games')
        .update({
          draw_pile: newDrawPile,
          discard_pile: newDiscardPile,
          turn_phase: 'play',
          last_activity_at: new Date().toISOString(),
        } as never)
        .eq('id', game.id);

      if (gameError) {
        console.log('[DRAW] Error updating game:', gameError);
        throw gameError;
      }

      // Immediately apply game update locally (don't wait for realtime)
      const updatedGame: Game = {
        ...game,
        draw_pile: newDrawPile,
        discard_pile: newDiscardPile,
        turn_phase: 'play',
        last_activity_at: new Date().toISOString(),
      };
      console.log('[DRAW] Applying game update locally:', {
        turnPhase: updatedGame.turn_phase,
        drawPileLength: updatedGame.draw_pile?.length,
      });
      set({ game: updatedGame });

      // Update player hand in database
      const { error: playerError } = await supabase
        .from('game_players')
        .update({ hand: newHand } as never)
        .eq('id', currentPlayer.id);

      if (playerError) {
        console.log('[DRAW] Error updating player:', playerError);
        throw playerError;
      }

      // Immediately apply player update locally
      const deduplicatedHand = deduplicateCards(newHand);
      const updatedCurrentPlayer: GamePlayer = {
        ...currentPlayer,
        hand: deduplicatedHand,
      };
      const { players: currentPlayers } = get();
      const updatedPlayers = currentPlayers.map(p =>
        p.id === currentPlayer.id ? updatedCurrentPlayer : p
      );
      set({
        players: updatedPlayers,
        currentPlayer: updatedCurrentPlayer,
      });
      console.log('[DRAW] Applied player update locally, hand length:', deduplicatedHand.length);

      console.log('[DRAW] Database updated and local state applied');

      // Log the action
      const cardName = getCardDisplayName(card);
      get().addLogEntry('draw', `Drew ${cardName} from ${pile} pile`, 'You');

      return true;
    } catch (err) {
      console.log('[DRAW] Error:', err);
      set({ error: (err as Error).message });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  layDownPhase: async (cardGroups: Card[][]) => {
    const { game, currentPlayer, phaseSet, players, loading } = get();

    console.log('[LAY_DOWN] Starting lay down phase');

    if (loading) {
      console.log('[LAY_DOWN] Error: Action already in progress');
      return false;
    }

    if (!game || !currentPlayer || !phaseSet) {
      console.log('[LAY_DOWN] Error: No game, currentPlayer, or phaseSet');
      return false;
    }

    // Validate it's this player's turn and correct phase
    const sortedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);
    const currentTurnPlayer = sortedPlayers[game.current_player_index];
    if (currentTurnPlayer?.user_id !== currentPlayer.user_id) {
      set({ error: 'Not your turn' });
      return false;
    }

    if (game.turn_phase !== 'play') {
      set({ error: 'Cannot lay down during this phase' });
      return false;
    }

    if (currentPlayer.has_laid_down) {
      set({ error: 'Already laid down this round' });
      return false;
    }

    // Get current phase requirements
    const phaseIndex = currentPlayer.current_phase_index;
    const requirements = phaseSet.phases[phaseIndex];
    if (!requirements) {
      set({ error: 'Invalid phase' });
      return false;
    }

    // Flatten card groups for validation
    const allCards = cardGroups.flat();
    const result = validatePhase(allCards, requirements);

    if (!result.valid) {
      set({ error: result.error || 'Invalid phase' });
      return false;
    }

    set({ loading: true, error: null, selectedCards: [] });
    try {
      // Remove laid down cards from hand
      let newHand = [...currentPlayer.hand];
      for (const card of allCards) {
        const [, remaining] = removeCardById(newHand, card.id);
        newHand = remaining;
      }

      console.log('[LAY_DOWN] Updating database...', {
        newHandLength: newHand.length,
        cardGroupsCount: cardGroups.length,
        totalCardsLaidDown: allCards.length,
      });

      // Update player state in database
      const { error: playerError } = await supabase
        .from('game_players')
        .update({
          hand: newHand,
          has_laid_down: true,
          laid_down_cards: cardGroups,
        } as never)
        .eq('id', currentPlayer.id);

      if (playerError) {
        console.log('[LAY_DOWN] Error updating player:', playerError);
        throw playerError;
      }

      // Immediately apply player update locally
      const updatedCurrentPlayer: GamePlayer = {
        ...currentPlayer,
        hand: newHand,
        has_laid_down: true,
        laid_down_cards: cardGroups,
      };
      const { players: currentPlayers } = get();
      const updatedPlayers = currentPlayers.map(p =>
        p.id === currentPlayer.id ? updatedCurrentPlayer : p
      );
      set({
        players: updatedPlayers,
        currentPlayer: updatedCurrentPlayer,
      });
      console.log('[LAY_DOWN] Applied player update locally');

      console.log('[LAY_DOWN] Database updated and local state applied');

      // Log the action
      get().addLogEntry('lay_down', `Laid down Phase ${phaseIndex + 1} (${allCards.length} cards)`, 'You');

      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  hitOnGroup: async (targetPlayerId: string, groupIndex: number, card: Card) => {
    const { game, currentPlayer, players, loading } = get();

    console.log('[HIT] Starting hit on group:', { targetPlayerId, groupIndex, cardId: card.id });

    if (loading) {
      console.log('[HIT] Error: Action already in progress');
      return false;
    }

    if (!game || !currentPlayer) {
      console.log('[HIT] Error: No game or currentPlayer');
      return false;
    }

    // Validate turn
    const sortedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);
    const currentTurnPlayer = sortedPlayers[game.current_player_index];
    if (currentTurnPlayer?.user_id !== currentPlayer.user_id) {
      set({ error: 'Not your turn' });
      return false;
    }

    if (game.turn_phase !== 'play') {
      set({ error: 'Cannot hit during this phase' });
      return false;
    }

    if (!currentPlayer.has_laid_down) {
      set({ error: 'Must lay down phase first' });
      return false;
    }

    // Find target player
    const targetPlayer = players.find(p => p.id === targetPlayerId);
    if (!targetPlayer || !targetPlayer.has_laid_down) {
      set({ error: 'Invalid target player' });
      return false;
    }

    const targetGroup = targetPlayer.laid_down_cards[groupIndex];
    if (!targetGroup) {
      set({ error: 'Invalid group' });
      return false;
    }

    // Determine group type and validate hit
    const groupType = determineGroupType(targetGroup);
    if (!groupType || !canHitOnGroup(card, targetGroup, groupType)) {
      set({ error: 'Card cannot be added to this group' });
      return false;
    }

    set({ loading: true, error: null });
    try {
      // Remove card from hand
      const [, newHand] = removeCardById(currentPlayer.hand, card.id);

      // Add card to target group
      const newLaidDownCards = [...targetPlayer.laid_down_cards];
      newLaidDownCards[groupIndex] = [...targetGroup, card];

      console.log('[HIT] Updating database...', {
        newHandLength: newHand.length,
        targetPlayerNewGroupSize: newLaidDownCards[groupIndex].length,
      });

      // Update current player's hand
      const { error: handError } = await supabase
        .from('game_players')
        .update({ hand: newHand } as never)
        .eq('id', currentPlayer.id);

      if (handError) {
        console.log('[HIT] Error updating hand:', handError);
        throw handError;
      }

      // Update target player's laid down cards
      const { error: targetError } = await supabase
        .from('game_players')
        .update({ laid_down_cards: newLaidDownCards } as never)
        .eq('id', targetPlayer.id);

      if (targetError) {
        console.log('[HIT] Error updating target player:', targetError);
        throw targetError;
      }

      // Immediately apply updates locally
      const updatedCurrentPlayer: GamePlayer = {
        ...currentPlayer,
        hand: newHand,
      };
      const updatedTargetPlayerLocal: GamePlayer = {
        ...targetPlayer,
        laid_down_cards: newLaidDownCards,
      };

      const { players: currentPlayers } = get();
      const updatedPlayers = currentPlayers.map(p => {
        if (p.id === currentPlayer.id) return updatedCurrentPlayer;
        if (p.id === targetPlayer.id) return updatedTargetPlayerLocal;
        return p;
      });

      set({
        players: updatedPlayers,
        currentPlayer: updatedCurrentPlayer,
      });

      console.log('[HIT] Database updated and local state applied');

      // Log the action
      const cardName = getCardDisplayName(card);
      get().addLogEntry('hit', `Hit ${cardName} on group ${groupIndex + 1}`, 'You');

      // Clear selection after successful hit
      get().clearSelection();

      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  discardCard: async (card: Card) => {
    const { game, currentPlayer, players, phaseSet, loading } = get();

    console.log('[DISCARD] Starting discard:', { cardId: card.id, isSkip: card.isSkip });

    if (loading) {
      console.log('[DISCARD] Error: Action already in progress');
      return false;
    }

    if (!game || !currentPlayer) {
      console.log('[DISCARD] Error: No game or currentPlayer');
      return false;
    }

    // Validate turn
    const sortedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);
    const currentTurnPlayer = sortedPlayers[game.current_player_index];

    if (currentTurnPlayer?.user_id !== currentPlayer.user_id) {
      console.log('[DISCARD] Error: Not your turn');
      set({ error: 'Not your turn' });
      return false;
    }

    if (game.turn_phase !== 'play') {
      console.log('[DISCARD] Error: Must draw first');
      set({ error: 'Must draw first' });
      return false;
    }

    // Remove card from hand
    const [removedCard, newHand] = removeCardById(currentPlayer.hand, card.id);
    if (!removedCard) {
      console.log('[DISCARD] Error: Card not in hand');
      set({ error: 'Card not in hand' });
      return false;
    }

    // Set loading to disable UI
    set({ loading: true, error: null, selectedCards: [] });

    try {
      // Add to discard pile
      const newDiscardPile = [...game.discard_pile, removedCard];

      // Check if player went out (empty hand)
      const isRoundOver = newHand.length === 0;

      // Calculate next player index
      const nextPlayerIndex = (game.current_player_index + 1) % sortedPlayers.length;

      // Determine if the discarded card is a Skip (skips next player)
      let actualNextIndex = nextPlayerIndex;
      if (card.isSkip) {
        actualNextIndex = (nextPlayerIndex + 1) % sortedPlayers.length;
      }

      console.log('[DISCARD] Updating database...', {
        newHandLength: newHand.length,
        actualNextIndex,
        isRoundOver,
      });

      if (isRoundOver) {
        console.log('[DISCARD] Round is over, calling handleRoundEnd');
        await handleRoundEnd(game, players, currentPlayer, phaseSet!, newDiscardPile);
      } else {
        // Update game state in database
        const { error: gameError } = await supabase
          .from('games')
          .update({
            discard_pile: newDiscardPile,
            current_player_index: actualNextIndex,
            turn_phase: 'draw',
            last_activity_at: new Date().toISOString(),
          } as never)
          .eq('id', game.id);

        if (gameError) {
          console.log('[DISCARD] Error updating game:', gameError);
          throw gameError;
        }

        // Immediately apply game update locally
        const updatedGame: Game = {
          ...game,
          discard_pile: newDiscardPile,
          current_player_index: actualNextIndex,
          turn_phase: 'draw',
          last_activity_at: new Date().toISOString(),
        };
        console.log('[DISCARD] Applying game update locally:', {
          turnPhase: updatedGame.turn_phase,
          currentPlayerIndex: updatedGame.current_player_index,
        });
        set({ game: updatedGame });

        // Update player hand in database
        const { error: playerError } = await supabase
          .from('game_players')
          .update({ hand: newHand } as never)
          .eq('id', currentPlayer.id);

        if (playerError) {
          console.log('[DISCARD] Error updating player:', playerError);
          throw playerError;
        }

        // Immediately apply player update locally
        const updatedCurrentPlayer: GamePlayer = {
          ...currentPlayer,
          hand: newHand,
        };
        const { players: currentPlayers } = get();
        const updatedPlayers = currentPlayers.map(p =>
          p.id === currentPlayer.id ? updatedCurrentPlayer : p
        );
        set({
          players: updatedPlayers,
          currentPlayer: updatedCurrentPlayer,
        });
        console.log('[DISCARD] Applied player update locally, hand length:', newHand.length);
      }

      console.log('[DISCARD] Database updated and local state applied');

      // Log the action
      const cardName = getCardDisplayName(card);
      if (card.isSkip) {
        get().addLogEntry('skip', `Discarded ${cardName} - next player skipped!`, 'You');
      } else {
        get().addLogEntry('discard', `Discarded ${cardName}`, 'You');
      }

      return true;
    } catch (err) {
      console.log('[DISCARD] Error:', err);
      set({ error: (err as Error).message });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  selectCard: (cardId: string) => {
    const { selectedCards } = get();
    if (!selectedCards.includes(cardId)) {
      set({ selectedCards: [...selectedCards, cardId] });
    }
  },

  deselectCard: (cardId: string) => {
    const { selectedCards } = get();
    set({ selectedCards: selectedCards.filter(id => id !== cardId) });
  },

  clearSelection: () => {
    set({ selectedCards: [] });
  },

  addLogEntry: (action, details, playerName) => {
    const { currentPlayer, actionLog } = get();
    const entry: ActionLogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date(),
      playerId: currentPlayer?.user_id || 'system',
      playerName: playerName || 'System',
      action,
      details,
    };
    // Keep last 50 entries
    const newLog = [...actionLog, entry].slice(-50);
    set({ actionLog: newLog });
    console.log(`[ACTION LOG] ${entry.playerName}: ${entry.details}`);
  },

  setError: (error: string | null) => {
    set({ error });
  },

  reset: () => {
    get().unsubscribeFromGame();
    set({
      game: null,
      players: [],
      currentPlayer: null,
      phaseSet: null,
      selectedCards: [],
      loading: false,
      error: null,
      actionLog: [],
      channel: null,
    });
  },
}));

// Helper function to handle end of round
async function handleRoundEnd(
  game: Game,
  players: GamePlayer[],
  winner: GamePlayer,
  phaseSet: PhaseSet,
  finalDiscardPile: Card[]
) {
  // Score remaining cards in each player's hand
  for (const player of players) {
    const handScore = calculateHandScore(player.hand);
    const newScore = player.score + handScore;

    // Advance phase if they laid down
    const newPhaseIndex = player.has_laid_down
      ? player.current_phase_index + 1
      : player.current_phase_index;

    await supabase
      .from('game_players')
      .update({
        score: newScore,
        current_phase_index: newPhaseIndex,
        hand: [],
        has_laid_down: false,
        laid_down_cards: [],
        hits: [],
      } as never)
      .eq('id', player.id);
  }

  // Check if game is over (someone completed all phases)
  const maxPhase = phaseSet.phases.length;
  const gameWinner = players.find(
    p => p.has_laid_down && p.current_phase_index + 1 >= maxPhase
  );

  if (gameWinner) {
    // Game over
    await supabase
      .from('games')
      .update({
        status: 'finished',
        last_activity_at: new Date().toISOString(),
      } as never)
      .eq('id', game.id);

    // Update winner's profile stats (increment games_won)
    const { data: winnerProfile } = await supabase
      .from('profiles')
      .select('games_won')
      .eq('id', gameWinner.user_id)
      .single();

    if (winnerProfile) {
      const currentWins = (winnerProfile as unknown as { games_won: number }).games_won || 0;
      await supabase
        .from('profiles')
        .update({ games_won: currentWins + 1 } as never)
        .eq('id', gameWinner.user_id);
    }
  } else {
    // Start new round
    const { hands, drawPile, discardPile } = setupGame(players.length);
    const sortedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);

    for (let i = 0; i < sortedPlayers.length; i++) {
      await supabase
        .from('game_players')
        .update({ hand: hands[i] } as never)
        .eq('id', sortedPlayers[i].id);
    }

    await supabase
      .from('games')
      .update({
        draw_pile: drawPile,
        discard_pile: discardPile,
        current_player_index: 0,
        turn_phase: 'draw',
        last_activity_at: new Date().toISOString(),
      } as never)
      .eq('id', game.id);
  }

  // Update all players' profile stats
  for (const player of players) {
    // Increment games_played
    const { data: profileData } = await supabase
      .from('profiles')
      .select('games_played, phases_completed')
      .eq('id', player.user_id)
      .single();

    if (profileData) {
      const profile = profileData as unknown as { games_played: number; phases_completed: number };
      const updates: Record<string, number> = {
        games_played: (profile.games_played || 0) + 1,
      };

      if (player.has_laid_down) {
        updates.phases_completed = (profile.phases_completed || 0) + 1;
      }

      await supabase
        .from('profiles')
        .update(updates as never)
        .eq('id', player.user_id);
    }
  }
}
