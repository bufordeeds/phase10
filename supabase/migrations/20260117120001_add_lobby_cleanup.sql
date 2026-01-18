-- Function to clean up old/stale lobbies
-- Deletes games that:
-- 1. Are still in 'lobby' status and older than 2 hours
-- 2. Are 'abandoned' status

create or replace function public.cleanup_stale_lobbies()
returns integer as $$
declare
  deleted_count integer;
begin
  with deleted as (
    delete from public.games
    where
      -- Old lobbies (more than 2 hours)
      (status = 'lobby' and created_at < now() - interval '2 hours')
      -- Abandoned games
      or status = 'abandoned'
    returning id
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$$ language plpgsql security definer;

-- Allow authenticated users to call this function
grant execute on function public.cleanup_stale_lobbies() to authenticated;

-- Also add a function for host to delete their own lobby
create or replace function public.delete_my_lobby(game_id uuid)
returns boolean as $$
begin
  delete from public.games
  where id = game_id
    and host_id = auth.uid()
    and status = 'lobby';

  return found;
end;
$$ language plpgsql security definer;

grant execute on function public.delete_my_lobby(uuid) to authenticated;

-- Add delete policy for games (host can delete their lobby)
create policy "Host can delete lobby" on public.games
  for delete using (host_id = auth.uid() and status = 'lobby');
