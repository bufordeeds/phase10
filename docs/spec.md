# Phase 10 Mobile App - Technical Specification

## Overview

A mobile multiplayer Phase 10 card game with robust reconnection support and custom phase creation. Players can host public or private games, invite others via code/link, and play with standard or custom phase sets.

### Core Differentiators

-   **Reconnection-first architecture**: Players can rejoin games after disconnection without losing progress
-   **Custom phase builder**: Hosts can create and save custom phase sets beyond the standard 10
-   **Password-protected lobbies**: Families can reuse the same password for easy recurring games

---

## Tech Stack

| Layer            | Technology                | Rationale                                                  |
| ---------------- | ------------------------- | ---------------------------------------------------------- |
| Mobile Framework | React Native + Expo       | Cross-platform, matches existing expertise                 |
| Backend/Database | Supabase                  | Auth, Postgres, Realtime subscriptions, Row Level Security |
| Realtime         | Supabase Realtime         | WebSocket-based game state sync                            |
| Hosting          | Expo EAS + Supabase Cloud | Managed infrastructure, easy deployment                    |
| State Management | Zustand                   | Lightweight, works well with realtime updates              |

---

## Data Models

### Card

```typescript
interface Card {
	id: string;
	color: 'red' | 'blue' | 'green' | 'yellow';
	value: number; // 1-12, 0 for wild, -1 for skip
	isWild: boolean;
	isSkip: boolean;
}
```

### Phase Requirement

```typescript
interface PhaseRequirement {
	type: 'set' | 'run' | 'color';
	size: number; // How many cards in the grouping
	quantity: number; // How many of this grouping needed
}

// Examples:
// "2 sets of 3" = { type: 'set', size: 3, quantity: 2 }
// "1 run of 7" = { type: 'run', size: 7, quantity: 1 }
// "9 cards of 1 color" = { type: 'color', size: 9, quantity: 1 }
```

### Phase Set

```typescript
interface PhaseSet {
	id: string;
	name: string;
	creatorId: string | null; // null for built-in sets
	isPublic: boolean;
	phases: PhaseRequirement[][]; // Array of phases, each phase is array of requirements
}
```

### User

```typescript
interface User {
	id: string;
	username: string;
	isGuest: boolean;
	createdAt: timestamp;
	stats: {
		gamesPlayed: number;
		gamesWon: number;
		phasesCompleted: number;
	};
}
```

### Game

```typescript
interface Game {
	id: string;
	code: string; // 6-character join code
	password: string | null; // null for public games
	hostId: string;
	phaseSetId: string;
	status: 'lobby' | 'playing' | 'finished' | 'abandoned';
	currentPlayerIndex: number;
	turnPhase: 'draw' | 'play' | 'discard';
	drawPile: Card[];
	discardPile: Card[];
	direction: 1 | -1; // For potential reverse cards/house rules
	createdAt: timestamp;
	lastActivityAt: timestamp;
	settings: GameSettings;
}

interface GameSettings {
	maxPlayers: number; // 2-6
	skipOnPhaseComplete: boolean; // House rule variant
	allowLateJoin: boolean;
}
```

### Game Player

```typescript
interface GamePlayer {
  id visão: string;
  gameId: string;
  userId: string;
  seatIndex: number;      // 0-5, determines turn order
  hand: Card[];
  currentPhaseIndex: number;  // 0-9 (or higher for custom)
  hasLaidDown: boolean;   // Has completed current phase this round
  laidDownCards: Card[][]; // Groups laid down for phase
  hits: Card[];           // Cards played on others' laid down groups
  score: number;
  isConnected: boolean;
  lastSeenAt: timestamp;
}
```

---

## Database Schema (Supabase/Postgres)

```sql
-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  is_guest boolean default false,
  games_played integer default 0,
  games_won integer default 0,
  phases_completed integer default 0,
  created_at timestamptz default now()
);

-- Phase sets (custom and built-in)
create table public.phase_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  creator_id uuid references public.profiles,
  is_public boolean default false,
  phases jsonb not null,  -- Array of phase requirement arrays
  created_at timestamptz default now()
);

-- Games
create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  password text,
  host_id uuid references public.profiles not null,
  phase_set_id uuid references public.phase_sets not null,
  status text default 'lobby' check (status in ('lobby', 'playing', 'finished', 'abandoned')),
  current_player_index integer default 0,
  turn_phase text default 'draw' check (turn_phase in ('draw', 'play', 'discard')),
  draw_pile jsonb not null default '[]',
  discard_pile jsonb not null default '[]',
  settings jsonb not null default '{}',
  created_at timestamptz default now(),
  last_activity_at timestamptz default now()
);

-- Game players (join table with game state)
create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games on delete cascade not null,
  user_id uuid references public.profiles not null,
  seat_index integer not null,
  hand jsonb not null default '[]',
  current_phase_index integer default 0,
  has_laid_down boolean default false,
  laid_down_cards jsonb default '[]',
  hits jsonb default '[]',
  score integer default 0,
  is_connected boolean default true,
  last_seen_at timestamptz default now(),
  unique(game_id, user_id),
  unique(game_id, seat_index)
);

-- Indexes for common queries
create index idx_games_code on public.games(code);
create index idx_games_status on public.games(status);
create index idx_game_players_game on public.game_players(game_id);
create index idx_game_players_user on public.game_players(user_id);
```

---

## Phase Validation Algorithm

The validator checks if a set of cards satisfies all requirements for a phase.

```typescript
interface ValidationResult {
	valid: boolean;
	groups: Card[][]; // How cards were grouped to satisfy requirements
	error?: string;
}

function validatePhase(
	cards: Card[],
	requirements: PhaseRequirement[]
): ValidationResult {
	// 1. Calculate total cards needed
	const totalNeeded = requirements.reduce(
		(sum, req) => sum + req.size * req.quantity,
		0
	);

	if (cards.length !== totalNeeded) {
		return {
			valid: false,
			groups: [],
			error: `Need exactly ${totalNeeded} cards, got ${cards.length}`
		};
	}

	// 2. Try to find valid assignment using backtracking
	const result = tryAssignCards(cards, requirements, []);
	return result;
}

function tryAssignCards(
	remainingCards: Card[],
	remainingRequirements: PhaseRequirement[],
	assignedGroups: Card[][]
): ValidationResult {
	// Base case: all requirements satisfied
	if (remainingRequirements.length === 0) {
		return { valid: true, groups: assignedGroups };
	}

	const [currentReq, ...otherReqs] = remainingRequirements;

	// Expand quantity > 1 into individual requirements
	if (currentReq.quantity > 1) {
		const expanded = [
			{ ...currentReq, quantity: 1 },
			{ ...currentReq, quantity: currentReq.quantity - 1 },
			...otherReqs
		];
		return tryAssignCards(remainingCards, expanded, assignedGroups);
	}

	// Find all valid groups of the required size/type from remaining cards
	const possibleGroups = findValidGroups(
		remainingCards,
		currentReq.type,
		currentReq.size
	);

	// Try each possible group
	for (const group of possibleGroups) {
		const newRemaining = removeCards(remainingCards, group);
		const result = tryAssignCards(newRemaining, otherReqs, [
			...assignedGroups,
			group
		]);
		if (result.valid) return result;
	}

	return {
		valid: false,
		groups: [],
		error: `Cannot satisfy ${currentReq.type} of ${currentReq.size}`
	};
}

function findValidGroups(cards: Card[], type: string, size: number): Card[][] {
	const groups: Card[][] = [];
	const combinations = getCombinations(cards, size);

	for (const combo of combinations) {
		if (isValidGroup(combo, type)) {
			groups.push(combo);
		}
	}
	return groups;
}

function isValidGroup(cards: Card[], type: string): boolean {
	const wilds = cards.filter((c) => c.isWild);
	const nonWilds = cards.filter((c) => !c.isWild);

	switch (type) {
		case 'set':
			// All non-wilds must have same value
			const values = [...new Set(nonWilds.map((c) => c.value))];
			return values.length <= 1;

		case 'run':
			// Must form consecutive sequence (wilds fill gaps)
			return isValidRun(nonWilds, wilds.length);

		case 'color':
			// All non-wilds must be same color
			const colors = [...new Set(nonWilds.map((c) => c.color))];
			return colors.length <= 1;

		default:
			return false;
	}
}

function isValidRun(nonWilds: Card[], wildCount: number): boolean {
	if (nonWilds.length === 0) return true; // All wilds is valid

	const values = nonWilds.map((c) => c.value).sort((a, b) => a - b);
	const min = values[0];
	const max = values[values.length - 1];
	const targetSize = nonWilds.length + wildCount;

	// Check if span is achievable with wilds
	const span = max - min + 1;
	if (span > targetSize) return false;

	// Check for duplicates (can't have two 5s in a run)
	if (new Set(values).size !== values.length) return false;

	// Check if wilds can fill the gaps
	const gaps = span - nonWilds.length;
	const extraNeeded = targetSize - span;

	return gaps <= wildCount && extraNeeded >= 0;
}
```

---

## Reconnection Architecture

### Design Principles

1. **Server is source of truth**: All game state lives in Supabase
2. **Clients are stateless viewers**: Can reconstruct full state from server at any time
3. **Optimistic updates with reconciliation**: Show immediate feedback, reconcile with server state

### Connection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      INITIAL JOIN                                │
├─────────────────────────────────────────────────────────────────┤
│  1. Player opens game (via code/link)                           │
│  2. Client authenticates (or creates guest session)             │
│  3. Client calls joinGame(gameId, password?)                    │
│  4. Server validates & adds player to game_players              │
│  5. Client subscribes to realtime channel: game:{gameId}        │
│  6. Server sends full game state                                │
│  7. Client renders game                                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      DISCONNECTION                               │
├─────────────────────────────────────────────────────────────────┤
│  1. WebSocket disconnects (detected by Supabase)                │
│  2. Server updates game_players.is_connected = false            │
│  3. Server updates game_players.last_seen_at = now()            │
│  4. Other players see "Player X disconnected" indicator         │
│  5. Game continues (disconnected player's turn is skipped       │
│     after 30 second timeout)                                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      RECONNECTION                                │
├─────────────────────────────────────────────────────────────────┤
│  1. Client detects it's back online                             │
│  2. Client re-authenticates if needed                           │
│  3. Client calls rejoinGame(gameId)                             │
│  4. Server validates player was in game                         │
│  5. Server updates is_connected = true                          │
│  6. Client resubscribes to realtime channel                     │
│  7. Server sends full current game state                        │
│  8. Client reconciles local state with server state             │
│  9. Game continues normally                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Realtime Subscriptions

```typescript
// Subscribe to game state changes
const gameSubscription = supabase
  .channel(`game:${gameId}`)
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
    (payload) => handleGameUpdate(payload)
  )
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
    (payload) => handlePlayerUpdate(payload)
  )
  .on('presence', { event: 'sync' }, () => handlePresenceSync())
  .subscribe();

// Presence for real-time connection status
const presenceSubscription = supabase
  .channel(`game:${gameId}`)
  .on('presence', { event: 'join' }, ({ key, newPresences }) => {
    // Player came online
  })
  .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    // Player went offline
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await supabase.channel(`game:${gameId}`).track({ odessa
        odessa userId: currentUser.id,
        online_at: new Date().toISOString(),
      });
    }
  });
```

### Abandoned Game Cleanup

```sql
-- Supabase scheduled function (pg_cron) runs every 5 minutes
create or replace function cleanup_abandoned_games()
returns void as $$
begin
  -- Mark games as abandoned if no activity for 30 minutes
  update public.games
  set status = 'abandoned'
  where status = 'playing'
    and last_activity_at < now() - interval '30 minutes';

  -- Delete lobby games older than 2 hours
  delete from public.games
  where status = 'lobby'
    and created_at < now() - interval '2 hours';
end;
$$ language plpgsql;
```

---

## Game Actions (Server Functions)

All game actions are implemented as Supabase Edge Functions or Database Functions with Row Level Security.

```typescript
// Core game actions - all validate permissions & update game state atomically

interface GameActions {
	// Lobby phase
	createGame(
		hostId: string,
		phaseSetId: string,
		settings: GameSettings
	): Game;
	joinGame(gameId: string, userId: string, password?: string): GamePlayer;
	leaveGame(gameId: string, userId: string): void;
	startGame(gameId: string, hostId: string): void;

	// Gameplay phase
	drawFromPile(
		gameId: string,
		playerId: string,
		pile: 'draw' | 'discard'
	): Card;
	layDownPhase(
		gameId: string,
		playerId: string,
		cardGroups: Card[][]
	): ValidationResult;
	hitOnGroup(
		gameId: string,
		playerId: string,
		targetPlayerId: string,
		groupIndex: number,
		card: Card
	): void;
	discard(gameId: string, playerId: string, card: Card): void;

	// Utility
	rejoinGame(
		gameId: string,
		userId: string
	): { game: Game; player: GamePlayer };
	transferHost(
		gameId: string,
		currentHostId: string,
		newHostId: string
	): void;
}
```

### Example: Draw from Pile

```typescript
// Supabase Edge Function
export async function drawFromPile(
	gameId: string,
	playerId: string,
	pile: 'draw' | 'discard'
): Promise<Card> {
	const { data: game, error } = await supabase
		.from('games')
		.select('*, game_players(*)')
		.eq('id', gameId)
		.single();

	// Validate it's this player's turn and correct turn phase
	const currentPlayer = game.game_players[game.current_player_index];
	if (currentPlayer.user_id !== playerId) {
		throw new Error('Not your turn');
	}
	if (game.turn_phase !== 'draw') {
		throw new Error('Already drew this turn');
	}

	let card: Card;
	let newDrawPile = [...game.draw_pile];
	let newDiscardPile = [...game.discard_pile];

	if (pile === 'draw') {
		// Reshuffle if draw pile empty
		if (newDrawPile.length === 0) {
			const topDiscard = newDiscardPile.pop();
			newDrawPile = shuffle(newDiscardPile);
			newDiscardPile = [topDiscard];
		}
		card = newDrawPile.pop();
	} else {
		card = newDiscardPile.pop();
	}

	// Update game state atomically
	const newHand = [...currentPlayer.hand, card];

	await supabase.rpc('draw_card', {
		p_game_id: gameId,
		p_player_id: playerId,
		p_draw_pile: newDrawPile,
		p_discard_pile: newDiscardPile,
		p_new_hand: newHand
	});

	return card;
}
```

---

## Screen-by-Screen Breakdown

### 1. Home Screen

**Route:** `/`

**Components:**

-   Logo and title
-   "Play as Guest" button
-   "Sign In" button
-   "Create Account" button
-   Stats display (if logged in)

**State:**

-   Auth status
-   User profile (if logged in)

---

### 2. Main Menu (Authenticated)

**Route:** `/menu`

**Components:**

-   User greeting + avatar
-   "Host Game" button → `/host`
-   "Join Game" button → `/join`
-   "Browse Lobbies" button → `/lobbies`
-   "My Phase Sets" button → `/phase-sets`
-   "Settings" button → `/settings`
-   Stats card (games played, won, phases completed)

---

### 3. Host Game Screen

**Route:** `/host`

**Components:**

-   Phase set selector (dropdown with preview)
-   Player count slider (2-6)
-   Privacy toggle (Public / Private)
-   Password input (if private)
-   "Create Game" button

**Actions:**

-   On create: Generate game code, navigate to `/lobby/{gameId}`

---

### 4. Join Game Screen

**Route:** `/join`

**Components:**

-   Game code input (6 characters)
-   "Join" button
-   Recent games list (games you've played before)
-   QR code scanner button

**Validation:**

-   Check code exists
-   Check game not full
-   Check password if required

---

### 5. Lobby Browser Screen

**Route:** `/lobbies`

**Components:**

-   Search/filter bar
-   Lobby list with:
    -   Host name
    -   Player count (e.g., "3/6")
    -   Phase set name
    -   Public/Private indicator
-   Pull to refresh
-   "Host Game" FAB

**Filters:**

-   Phase set
-   Available slots
-   Hide full games
-   Hide private games

---

### 6. Game Lobby Screen

**Route:** `/lobby/{gameId}`

**Components:**

-   Game code display (tap to copy)
-   Share button (generates link)
-   Player list with:
    -   Avatar
    -   Username
    -   Ready status
    -   Host crown icon
    -   Kick button (host only)
-   Phase set preview (tap to see all phases)
-   "Start Game" button (host only, requires 2+ players)
-   "Leave" button
-   Chat (optional v2 feature)

**Realtime:**

-   Subscribe to game_players changes
-   Subscribe to presence for live connection status

---

### 7. Game Screen

**Route:** `/game/{gameId}`

**Components:**

**Header:**

-   Current phase display for each player (scrollable)
-   Round number
-   Menu button (pause, rules, leave)

**Play Area:**

-   Discard pile (tap to draw)
-   Draw pile (tap to draw)
-   Current player indicator
-   Turn timer (30 seconds)

**Laid Down Area:**

-   All players' laid down phase cards
-   Hittable groups highlighted during play phase

**Hand:**

-   Scrollable card row
-   Selected cards highlighted
-   "Lay Down Phase" button (when valid selection)
-   "Hit" button (when card selected + target group)

**Actions Panel:**

-   Context-sensitive based on turn phase
-   Draw phase: "Draw from deck" / "Draw from discard"
-   Play phase: "Lay down" / "Hit" / "Skip to discard"
-   Discard phase: "Discard selected card"

**Overlays:**

-   Phase completion celebration
-   Round end summary
-   Game end results

---

### 8. Phase Set Manager

**Route:** `/phase-sets`

**Components:**

-   List of saved phase sets
-   "Create New" button
-   Built-in sets section (not editable)
-   My sets section (editable)
-   Each set shows name, phase count, preview

---

### 9. Phase Set Editor

**Route:** `/phase-sets/edit/{phaseSetId?}`

**Components:**

-   Name input
-   Phase list (drag to reorder)
-   Each phase row:
    -   Phase number
    -   Requirements summary (e.g., "2 sets of 3")
    -   Edit button
    -   Delete button
-   "Add Phase" button
-   Phase requirement editor modal:
    -   Requirement type dropdown (set/run/color)
    -   Size input (number of cards)
    -   Quantity input (how many groups)
    -   "Add Requirement" button
    -   Preview of what player needs

**Validation:**

-   Minimum 1 phase
-   Maximum 20 phases
-   Each phase must have at least 1 requirement
-   Total cards per phase: 3-13 (reasonable hand size)

---

### 10. Settings Screen

**Route:** `/settings`

**Components:**

-   Account section:
    -   Username edit
    -   Convert guest to full account
    -   Sign out
-   Game defaults:
    -   Default player count
    -   Sound effects toggle
    -   Vibration toggle
    -   Card animation speed
-   Notifications:
    -   Game invites
    -   Turn reminders
-   About:
    -   Version
    -   Rules reference
    -   Credits

---

## Navigation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    ┌──────────┐                                                 │
│    │  Splash  │                                                 │
│    └────┬─────┘                                                 │
│         │                                                       │
│         ▼                                                       │
│    ┌──────────┐      ┌──────────┐                              │
│    │  Home    │─────▶│  Auth    │                              │
│    └────┬─────┘      └────┬─────┘                              │
│         │                 │                                     │
│         └────────┬────────┘                                     │
│                  ▼                                              │
│    ┌─────────────────────────┐                                 │
│    │       Main Menu         │                                 │
│    └─────────────────────────┘                                 │
│         │    │    │    │                                       │
│    ┌────┘    │    │    └────┐                                  │
│    ▼         ▼    ▼         ▼                                  │
│ ┌──────┐ ┌──────┐ ┌────────┐ ┌──────────┐                     │
│ │ Host │ │ Join │ │Lobbies │ │Phase Sets│                     │
│ └──┬───┘ └──┬───┘ └───┬────┘ └────┬─────┘                     │
│    │        │         │           │                            │
│    └────────┴────┬────┘           │                            │
│                  ▼                ▼                             │
│           ┌──────────┐    ┌─────────────┐                      │
│           │  Lobby   │    │Phase Editor │                      │
│           └────┬─────┘    └─────────────┘                      │
│                │                                                │
│                ▼                                                │
│           ┌──────────┐                                         │
│           │   Game   │                                         │
│           └────┬─────┘                                         │
│                │                                                │
│                ▼                                                │
│           ┌──────────┐                                         │
│           │ Results  │──────▶ Back to Main Menu                │
│           └──────────┘                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Built-in Phase Sets

### Standard Phase 10

```typescript
const standardPhases: PhaseRequirement[][] = [
	[{ type: 'set', size: 3, quantity: 2 }], // 1. 2 sets of 3
	[
		{ type: 'set', size: 3, quantity: 1 },
		{ type: 'run', size: 4, quantity: 1 }
	], // 2. 1 set of 3 + 1 run of 4
	[
		{ type: 'set', size: 4, quantity: 1 },
		{ type: 'run', size: 4, quantity: 1 }
	], // 3. 1 set of 4 + 1 run of 4
	[{ type: 'run', size: 7, quantity: 1 }], // 4. 1 run of 7
	[{ type: 'run', size: 8, quantity: 1 }], // 5. 1 run of 8
	[{ type: 'run', size: 9, quantity: 1 }], // 6. 1 run of 9
	[{ type: 'set', size: 4, quantity: 2 }], // 7. 2 sets of 4
	[{ type: 'color', size: 7, quantity: 1 }], // 8. 7 cards of 1 color
	[
		{ type: 'set', size: 5, quantity: 1 },
		{ type: 'set', size: 2, quantity: 1 }
	], // 9. 1 set of 5 + 1 set of 2
	[
		{ type: 'set', size: 5, quantity: 1 },
		{ type: 'set', size: 3, quantity: 1 }
	] // 10. 1 set of 5 + 1 set of 3
];
```

### Family Extended Set (Phases 11-20)

```typescript
const familyExtendedPhases: PhaseRequirement[][] = [
	[{ type: 'set', size: 2, quantity: 4 }], // 11. 4 sets of 2
	[
		{ type: 'set', size: 4, quantity: 1 },
		{ type: 'run', size: 5, quantity: 1 }
	], // 12. 1 set of 4 + 1 run of 5
	[
		{ type: 'set', size: 5, quantity: 1 },
		{ type: 'run', size: 5, quantity: 1 }
	], // 13. 1 set of 5 + 1 run of 5
	[
		{ type: 'run', size: 4, quantity: 1 },
		{ type: 'color', size: 4, quantity: 1 }
	], // 14. 1 run of 4 + 4 cards of 1 color
	[
		{ type: 'run', size: 5, quantity: 1 },
		{ type: 'color', size: 4, quantity: 1 }
	], // 15. 1 run of 5 + 4 cards of 1 color
	[{ type: 'run', size: 10, quantity: 1 }], // 16. 1 run of 10
	[
		{ type: 'set', size: 4, quantity: 1 },
		{ type: 'set', size: 5, quantity: 1 }
	], // 17. 1 set of 4 + 1 set of 5
	[{ type: 'color', size: 9, quantity: 1 }], // 18. 9 cards of 1 color
	[
		{ type: 'set', size: 6, quantity: 1 },
		{ type: 'set', size: 2, quantity: 1 }
	], // 19. 1 set of 6 + 1 set of 2
	[
		{ type: 'set', size: 6, quantity: 1 },
		{ type: 'set', size: 3, quantity: 1 }
	] // 20. 1 set of 6 + 1 set of 3
];
```

---

## API Endpoints Summary

### Authentication

| Method | Endpoint              | Description                   |
| ------ | --------------------- | ----------------------------- |
| POST   | `/auth/guest`         | Create guest session          |
| POST   | `/auth/signup`        | Create account                |
| POST   | `/auth/login`         | Login                         |
| POST   | `/auth/convert-guest` | Convert guest to full account |

### Games

| Method | Endpoint             | Description             |
| ------ | -------------------- | ----------------------- |
| POST   | `/games`             | Create new game         |
| GET    | `/games/lobbies`     | List public lobbies     |
| GET    | `/games/{code}`      | Get game by code        |
| POST   | `/games/{id}/join`   | Join game               |
| POST   | `/games/{id}/leave`  | Leave game              |
| POST   | `/games/{id}/start`  | Start game (host only)  |
| POST   | `/games/{id}/rejoin` | Rejoin after disconnect |

### Game Actions

| Method | Endpoint               | Description           |
| ------ | ---------------------- | --------------------- |
| POST   | `/games/{id}/draw`     | Draw card             |
| POST   | `/games/{id}/lay-down` | Lay down phase        |
| POST   | `/games/{id}/hit`      | Hit on existing group |
| POST   | `/games/{id}/discard`  | Discard card          |

### Phase Sets

| Method | Endpoint           | Description                  |
| ------ | ------------------ | ---------------------------- |
| GET    | `/phase-sets`      | List all (built-in + user's) |
| POST   | `/phase-sets`      | Create custom set            |
| PUT    | `/phase-sets/{id}` | Update custom set            |
| DELETE | `/phase-sets/{id}` | Delete custom set            |

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

-   [ ] Project setup (Expo + Supabase)
-   [ ] Authentication (including guest flow)
-   [ ] Database schema + RLS policies
-   [ ] Basic navigation structure
-   [ ] User profile management

### Phase 2: Core Game Logic (Week 3-4)

-   [ ] Card deck utilities (shuffle, deal)
-   [ ] Phase validation algorithm
-   [ ] Game state management
-   [ ] Realtime subscriptions setup

### Phase 3: Lobby System (Week 5)

-   [ ] Create/join game flow
-   [ ] Game code generation
-   [ ] Lobby browser
-   [ ] Password protection
-   [ ] Host controls

### Phase 4: Gameplay UI (Week 6-8)

-   [ ] Game screen layout
-   [ ] Card rendering + animations
-   [ ] Turn flow implementation
-   [ ] Phase lay down interaction
-   [ ] Hitting mechanics
-   [ ] Round/game end flows

### Phase 5: Reconnection & Polish (Week 9-10)

-   [ ] Disconnection handling
-   [ ] Rejoin flow
-   [ ] Turn timeout for disconnected players
-   [ ] Abandoned game cleanup
-   [ ] Error handling + edge cases

### Phase 6: Custom Phases (Week 11)

-   [ ] Phase set editor UI
-   [ ] Validation for custom phases
-   [ ] Save/load custom sets

### Phase 7: Polish & Launch (Week 12)

-   [ ] Animations and sound effects
-   [ ] Performance optimization
-   [ ] Beta testing
-   [ ] App store prep

---

## Open Questions / Future Features

1. **Chat system?** In-game chat could be fun but adds moderation concerns
2. **Friends list?** Track favorite opponents, quick invite
3. **Ranked mode?** ELO-style matchmaking for competitive play
4. **Spectator mode?** Watch ongoing games
5. **Tournaments?** Bracket-style competitions
6. **House rules?** Skip cards, reverse direction, etc.
7. **Themes/skins?** Customizable card backs, table colors

---

## Card Asset Requirements

-   4 colors × 12 values × 2 copies = 96 number cards
-   8 Wild cards
-   4 Skip cards
-   Total: 108 cards

**Asset needs:**

-   Card face designs (108 unique + 1 card back)
-   Color palette: Red, Blue, Green, Yellow
-   Wild card design
-   Skip card design
-   Consider accessibility (colorblind-friendly patterns?)
