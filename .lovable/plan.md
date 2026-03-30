

# End All Live Audio Spaces

Run a single SQL statement to set all currently-live audio spaces to `ended`:

```sql
UPDATE public.audio_spaces
SET status = 'ended', ended_at = now()
WHERE status = 'live';
```

This is a data update (not a schema change), so it will be executed via the data operation tool.

