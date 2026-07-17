INSERT INTO tv_channels_verified (id, name, stream_url, logo, country, category, is_active)
VALUES
  ('ps-aqsa-tv', 'Al-Aqsa TV', 'https://live.alaqsatv.ps/live/tv/playlist.m3u8', NULL, 'Palestine', 'General', true),
  ('ps-palestine-today', 'Palestine Today', 'https://live.palestinetoday.ps/live/tv/playlist.m3u8', NULL, 'Palestine', 'News', true),
  ('ps-maan-tv', 'Maan TV', 'https://mn-nl.mncdn.com/maantv/maantv_720p/playlist.m3u8', NULL, 'Palestine', 'News', true),
  ('ps-palestine-live', 'Palestine Live', 'https://d1x34t5g1w1elo.cloudfront.net/live/index.m3u8', NULL, 'Palestine', 'General', true)
ON CONFLICT (id) DO NOTHING;