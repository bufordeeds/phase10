import { useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';

/**
 * Hook to access game store and manage cleanup
 */
export function useGame() {
  const store = useGameStore();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't reset the whole store on unmount, just unsubscribe
      // The game state should persist while navigating
    };
  }, []);

  return store;
}

/**
 * Hook to check if it's the current user's turn
 */
export function useIsMyTurn() {
  const { game, currentPlayer, players } = useGameStore();

  if (!game || !currentPlayer || game.status !== 'playing') {
    return false;
  }

  const sortedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);
  const currentTurnPlayer = sortedPlayers[game.current_player_index];

  return currentTurnPlayer?.user_id === currentPlayer.user_id;
}

/**
 * Hook to get the player whose turn it is
 */
export function useCurrentTurnPlayer() {
  const { game, players } = useGameStore();

  if (!game || game.status !== 'playing') {
    return null;
  }

  const sortedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);
  return sortedPlayers[game.current_player_index] || null;
}

/**
 * Hook to check if the current player can lay down their phase
 */
export function useCanLayDown() {
  const { game, currentPlayer } = useGameStore();

  if (!game || !currentPlayer) {
    return false;
  }

  return (
    game.status === 'playing' &&
    game.turn_phase === 'play' &&
    !currentPlayer.has_laid_down
  );
}

/**
 * Hook to check if the current player can hit on other players' groups
 */
export function useCanHit() {
  const { game, currentPlayer } = useGameStore();

  if (!game || !currentPlayer) {
    return false;
  }

  return (
    game.status === 'playing' &&
    game.turn_phase === 'play' &&
    currentPlayer.has_laid_down
  );
}
