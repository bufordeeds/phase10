import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Game, GamePlayer, Card, PhaseSet, GameSettings } from '../types/database';
import { setupGame, shuffle, calculateHandScore, removeCardById } from '../utils/deck';
import { validatePhase, canHitOnGroup, determineGroupType } from '../utils/phaseValidation';
import { RealtimeChannel } from '@supabase/supabase-js';

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

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  players: [],
  currentPlayer: null,
  phaseSet: null,
  selectedCards: [],
  loading: false,
  error: null,
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
    const { channel: existingChannel } = get();
    if (existingChannel) {
      existingChannel.unsubscribe();
    }

    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            set({ game: payload.new as Game });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        async () => {
          // Reload players on any change
          const { data: playersData } = await supabase
            .from('game_players')
            .select('*')
            .eq('game_id', gameId)
            .order('seat_index');

          const players = (playersData || []) as unknown as GamePlayer[];

          const { data: { user } } = await supabase.auth.getUser();
          const currentPlayer = players.find(p => p.user_id === user?.id) || null;

          set({
            players,
            currentPlayer,
          });
        }
      )
      .subscribe();

    set({ channel });
  },

  unsubscribeFromGame: () => {
    const { channel } = get();
    if (channel) {
      channel.unsubscribe();
      set({ channel: null });
    }
  },

  drawCard: async (pile: 'draw' | 'discard') => {
    const { game, currentPlayer, players } = get();
    if (!game || !currentPlayer) return false;

    // Validate it's this player's turn
    const sortedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);
    const currentTurnPlayer = sortedPlayers[game.current_player_index];
    if (currentTurnPlayer?.user_id !== currentPlayer.user_id) {
      set({ error: 'Not your turn' });
      return false;
    }

    if (game.turn_phase !== 'draw') {
      set({ error: 'Already drew this turn' });
      return false;
    }

    set({ loading: true, error: null });
    try {
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

      // Update hand
      const newHand = [...currentPlayer.hand, card];

      // Update game state
      await supabase
        .from('games')
        .update({
          draw_pile: newDrawPile,
          discard_pile: newDiscardPile,
          turn_phase: 'play',
          last_activity_at: new Date().toISOString(),
        } as never)
        .eq('id', game.id);

      // Update player hand
      await supabase
        .from('game_players')
        .update({ hand: newHand } as never)
        .eq('id', currentPlayer.id);

      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  layDownPhase: async (cardGroups: Card[][]) => {
    const { game, currentPlayer, phaseSet, players } = get();
    if (!game || !currentPlayer || !phaseSet) return false;

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

    set({ loading: true, error: null });
    try {
      // Remove laid down cards from hand
      let newHand = [...currentPlayer.hand];
      for (const card of allCards) {
        const [, remaining] = removeCardById(newHand, card.id);
        newHand = remaining;
      }

      // Update player state
      await supabase
        .from('game_players')
        .update({
          hand: newHand,
          has_laid_down: true,
          laid_down_cards: cardGroups,
        } as never)
        .eq('id', currentPlayer.id);

      get().clearSelection();
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  hitOnGroup: async (targetPlayerId: string, groupIndex: number, card: Card) => {
    const { game, currentPlayer, players } = get();
    if (!game || !currentPlayer) return false;

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

      // Update current player's hand
      await supabase
        .from('game_players')
        .update({ hand: newHand } as never)
        .eq('id', currentPlayer.id);

      // Update target player's laid down cards
      await supabase
        .from('game_players')
        .update({ laid_down_cards: newLaidDownCards } as never)
        .eq('id', targetPlayer.id);

      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  discardCard: async (card: Card) => {
    const { game, currentPlayer, players, phaseSet } = get();
    if (!game || !currentPlayer) return false;

    // Validate turn
    const sortedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);
    const currentTurnPlayer = sortedPlayers[game.current_player_index];
    if (currentTurnPlayer?.user_id !== currentPlayer.user_id) {
      set({ error: 'Not your turn' });
      return false;
    }

    if (game.turn_phase !== 'play') {
      set({ error: 'Must draw first' });
      return false;
    }

    set({ loading: true, error: null });
    try {
      // Remove card from hand
      const [removedCard, newHand] = removeCardById(currentPlayer.hand, card.id);
      if (!removedCard) {
        throw new Error('Card not in hand');
      }

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

      if (isRoundOver) {
        // Round is over - score and reset
        await handleRoundEnd(game, players, currentPlayer, phaseSet!, newDiscardPile);
      } else {
        // Update game state
        await supabase
          .from('games')
          .update({
            discard_pile: newDiscardPile,
            current_player_index: actualNextIndex,
            turn_phase: 'draw',
            last_activity_at: new Date().toISOString(),
          } as never)
          .eq('id', game.id);

        // Update player hand
        await supabase
          .from('game_players')
          .update({ hand: newHand } as never)
          .eq('id', currentPlayer.id);
      }

      get().clearSelection();
      return true;
    } catch (err) {
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
