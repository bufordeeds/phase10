-- Fix RLS policies for game operations

-- Allow host to update all game_players in their game (needed for dealing cards)
create policy "Host can update all players in game" on public.game_players
  for update using (
    exists (
      select 1 from public.games
      where games.id = game_players.game_id
      and games.host_id = auth.uid()
    )
  );

-- Allow all participants to view games they're in (not just lobby games)
-- Drop the old restrictive policy and create a better one
drop policy if exists "Lobby games are viewable" on public.games;

create policy "Games are viewable by participants or public lobbies" on public.games
  for select using (
    -- User is a participant in the game
    exists (select 1 from public.game_players where game_id = id and user_id = auth.uid())
    -- OR it's a public lobby (no password, still in lobby status)
    or (status = 'lobby' and password is null)
  );

-- Allow participants to update game state during play (for game actions)
-- This is needed because players need to update draw_pile, discard_pile, etc.
create policy "Participants can update game during play" on public.games
  for update using (
    exists (select 1 from public.game_players where game_id = id and user_id = auth.uid())
  );
