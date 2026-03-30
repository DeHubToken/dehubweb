

# Drop RLS Policy on audio_spaces

Run a single migration to drop the policy `"Anyone can view live audio spaces"` from `public.audio_spaces`.

This removes the SELECT restriction that only shows spaces where `status = 'live'`, allowing all audio spaces to be queried regardless of status.

