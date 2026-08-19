-- stage-recordings: only the host can delete their own recording.
--
-- Measured on production before this migration:
--
--   policy  "Uploader can delete stage recordings"
--   cmd     DELETE
--   roles   {public}
--   qual    (bucket_id = 'stage-recordings'::text)
--
-- The name says uploader. The qual says "is this the right bucket" — nothing
-- more. Anyone holding the publishable key could delete every stage recording
-- on the platform, and the SELECT policy makes the bucket world-readable, so
-- finding them takes no effort either.
--
-- It was written that way for a reason rather than by accident: the Storage
-- client has no per-request header, so `get_request_wallet_address()` was
-- always empty on a storage call and any wallet check would have refused the
-- host too. src/lib/supabase-wallet-client.ts now builds a client with the
-- header set globally for exactly this call, so the policy can finally ask who
-- is deleting.
--
-- Recordings are written to `<stage uuid>/recording.<ext>` by both clients
-- (.webm from the browser's MediaRecorder, .mp4 from Agora's on-device
-- recorder), so the first path segment identifies the stage and the host comes
-- off the row.
--
-- ── Apply after the release carrying the matching client ──
-- Until the client ships, a host pressing delete removes the row through the
-- gated postgrest call but leaves the object behind — a leaked file, not a
-- broken feature. Applying it early is therefore recoverable, unlike the write
-- policies in 20260819180000, but there is no reason to.
--
-- Not addressed here, and worth being clear about: INSERT is still open, so the
-- publishable key can upload into this bucket. Closing that means streaming
-- recordings through an edge function, which is a much larger change than the
-- risk warrants — the bucket has a 500 MB object cap and an audio-only mime
-- allowlist.

DROP POLICY IF EXISTS "Uploader can delete stage recordings" ON storage.objects;

CREATE POLICY "Host can delete their stage recording"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'stage-recordings'
    AND EXISTS (
      SELECT 1 FROM public.audio_spaces s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND lower(s.host_wallet_address) = get_request_wallet_address()
    )
  );
