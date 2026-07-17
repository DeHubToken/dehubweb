UPDATE public.audio_spaces
SET status = 'ended', ended_at = now()
WHERE status = 'live';