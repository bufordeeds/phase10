-- Drop conflicting update policies and recreate properly
drop policy if exists "Host can update game" on public.games;
drop policy if exists "Participants can update game during play" on public.games;

-- Single comprehensive update policy for games
create policy "Game participants can update" on public.games
  for update
  using (
    -- Must be a participant in the game
    exists (select 1 from public.game_players where game_id = id and user_id = auth.uid())
  )
  with check (
    -- Allow any updates (the USING clause already verified permission)
    true
  );

-- Create a secure function to start the game (bypasses RLS for dealing cards)
create or replace function public.start_game(
  p_game_id uuid,
  p_hands jsonb,
  p_draw_pile jsonb,
  p_discard_pile jsonb
)
returns boolean as $$
declare
  v_game record;
  v_players record;
  v_hand jsonb;
  v_index integer := 0;
begin
  -- Verify caller is the host
  select * into v_game from public.games where id = p_game_id;

  if v_game is null then
    raise exception 'Game not found';
  end if;

  if v_game.host_id != auth.uid() then
    raise exception 'Only the host can start the game';
  end if;

  if v_game.status != 'lobby' then
    raise exception 'Game is not in lobby status';
  end if;

  -- Deal cards to each player (in seat order)
  for v_players in
    select * from public.game_players
    where game_id = p_game_id
    order by seat_index
  loop
    v_hand := p_hands->v_index;

    update public.game_players
    set hand = v_hand
    where id = v_players.id;

    v_index := v_index + 1;
  end loop;

  -- Update game state
  update public.games
  set
    status = 'playing',
    draw_pile = p_draw_pile,
    discard_pile = p_discard_pile,
    current_player_index = 0,
    turn_phase = 'draw',
    last_activity_at = now()
  where id = p_game_id;

  return true;
end;
$$ language plpgsql security definer;

grant execute on function public.start_game(uuid, jsonb, jsonb, jsonb) to authenticated;
