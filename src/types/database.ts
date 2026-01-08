// Card types
export type CardColor = 'red' | 'blue' | 'green' | 'yellow';

export interface Card {
  id: string;
  color: CardColor;
  value: number; // 1-12, 0 for wild, -1 for skip
  isWild: boolean;
  isSkip: boolean;
}

// Phase requirement types
export type PhaseRequirementType = 'set' | 'run' | 'color';

export interface PhaseRequirement {
  type: PhaseRequirementType;
  size: number; // How many cards in the grouping
  quantity: number; // How many of this grouping needed
}

// Phase set (collection of phases)
export interface PhaseSet {
  id: string;
  name: string;
  creator_id: string | null; // null for built-in sets
  is_public: boolean;
  phases: PhaseRequirement[][]; // Array of phases, each phase is array of requirements
  created_at: string;
}

// User profile
export interface Profile {
  id: string;
  username: string;
  is_guest: boolean;
  games_played: number;
  games_won: number;
  phases_completed: number;
  created_at: string;
}

// Game settings
export interface GameSettings {
  maxPlayers: number; // 2-6
  skipOnPhaseComplete: boolean; // House rule variant
  allowLateJoin: boolean;
}

// Game status
export type GameStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';
export type TurnPhase = 'draw' | 'play' | 'discard';

// Game
export interface Game {
  id: string;
  code: string; // 6-character join code
  password: string | null; // null for public games
  host_id: string;
  phase_set_id: string;
  status: GameStatus;
  current_player_index: number;
  turn_phase: TurnPhase;
  draw_pile: Card[];
  discard_pile: Card[];
  settings: GameSettings;
  created_at: string;
  last_activity_at: string;
}

// Game player (join table with game state)
export interface GamePlayer {
  id: string;
  game_id: string;
  user_id: string;
  seat_index: number; // 0-5, determines turn order
  hand: Card[];
  current_phase_index: number; // 0-9 (or higher for custom)
  has_laid_down: boolean; // Has completed current phase this round
  laid_down_cards: Card[][]; // Groups laid down for phase
  hits: Card[]; // Cards played on others' laid down groups
  score: number;
  is_connected: boolean;
  last_seen_at: string;
}

// Database types for Supabase queries
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      phase_sets: {
        Row: PhaseSet;
        Insert: Omit<PhaseSet, 'id' | 'created_at'>;
        Update: Partial<Omit<PhaseSet, 'id' | 'created_at'>>;
      };
      games: {
        Row: Game;
        Insert: Omit<Game, 'id' | 'created_at' | 'last_activity_at'>;
        Update: Partial<Omit<Game, 'id' | 'created_at'>>;
      };
      game_players: {
        Row: GamePlayer;
        Insert: Omit<GamePlayer, 'id' | 'last_seen_at'>;
        Update: Partial<Omit<GamePlayer, 'id'>>;
      };
    };
  };
}
