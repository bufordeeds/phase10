-- Enable REPLICA IDENTITY FULL for games table to ensure realtime broadcasts work
-- This ensures UPDATE events include the full row data for realtime subscriptions

ALTER TABLE public.games REPLICA IDENTITY FULL;
ALTER TABLE public.game_players REPLICA IDENTITY FULL;
