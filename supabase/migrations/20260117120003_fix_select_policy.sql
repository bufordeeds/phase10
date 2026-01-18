-- Fix the games SELECT policy - the subquery into game_players was being blocked by RLS

-- Drop the problematic policy
drop policy if exists "Games are viewable by participants or public lobbies" on public.games;
drop policy if exists "Lobby games are viewable" on public.games;

-- Create a simpler SELECT policy using a security definer function
create or replace function public.is_game_participant(game_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.game_players
    where game_players.game_id = $1
    and game_players.user_id = auth.uid()
  );
end;
$$ language plpgsql security definer stable;

-- Grant execute to authenticated users
grant execute on function public.is_game_participant(uuid) to authenticated;

-- New SELECT policy using the function
create policy "Games viewable by participants or public lobbies" on public.games
  for select using (
    -- User is the host
    host_id = auth.uid()
    -- OR user is a participant (checked via security definer function)
    or public.is_game_participant(id)
    -- OR it's a public lobby
    or (status = 'lobby' and password is null)
  );
