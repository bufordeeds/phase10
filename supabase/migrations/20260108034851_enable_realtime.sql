-- Enable Realtime for games and game_players tables
-- This allows clients to receive real-time updates when rows change

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_players;
