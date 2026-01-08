-- Phase 10 Database Schema

-- Profiles table (extends auth.users)
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
  phases jsonb not null,
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

-- Game players
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

-- Indexes
create index idx_games_code on public.games(code);
create index idx_games_status on public.games(status);
create index idx_game_players_game on public.game_players(game_id);
create index idx_game_players_user on public.game_players(user_id);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.phase_sets enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;

-- Profiles policies
create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Phase sets policies
create policy "Public phase sets are viewable" on public.phase_sets
  for select using (is_public = true or creator_id = auth.uid());
create policy "Users can create phase sets" on public.phase_sets
  for insert with check (creator_id = auth.uid());
create policy "Users can update own phase sets" on public.phase_sets
  for update using (creator_id = auth.uid());
create policy "Users can delete own phase sets" on public.phase_sets
  for delete using (creator_id = auth.uid());

-- Games policies
create policy "Lobby games are viewable" on public.games
  for select using (
    status = 'lobby' and password is null
    or exists (select 1 from public.game_players where game_id = id and user_id = auth.uid())
  );
create policy "Authenticated users can create games" on public.games
  for insert with check (auth.uid() = host_id);
create policy "Host can update game" on public.games
  for update using (host_id = auth.uid());

-- Game players policies
create policy "Game players viewable by participants" on public.game_players
  for select using (
    exists (select 1 from public.game_players gp where gp.game_id = game_id and gp.user_id = auth.uid())
  );
create policy "Users can join games" on public.game_players
  for insert with check (user_id = auth.uid());
create policy "Users can update own player state" on public.game_players
  for update using (user_id = auth.uid());

-- Function to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, is_guest)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'Player_' || substr(new.id::text, 1, 8)),
    coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Insert standard phase set
insert into public.phase_sets (name, creator_id, is_public, phases) values (
  'Standard Phase 10',
  null,
  true,
  '[
    [{"type": "set", "size": 3, "quantity": 2}],
    [{"type": "set", "size": 3, "quantity": 1}, {"type": "run", "size": 4, "quantity": 1}],
    [{"type": "set", "size": 4, "quantity": 1}, {"type": "run", "size": 4, "quantity": 1}],
    [{"type": "run", "size": 7, "quantity": 1}],
    [{"type": "run", "size": 8, "quantity": 1}],
    [{"type": "run", "size": 9, "quantity": 1}],
    [{"type": "set", "size": 4, "quantity": 2}],
    [{"type": "color", "size": 7, "quantity": 1}],
    [{"type": "set", "size": 5, "quantity": 1}, {"type": "set", "size": 2, "quantity": 1}],
    [{"type": "set", "size": 5, "quantity": 1}, {"type": "set", "size": 3, "quantity": 1}]
  ]'::jsonb
);
