# Free stock asset service

The editor works without provider secrets by searching Openverse and Wikimedia Commons. The Edge Function also supports two optional free catalogues:

```powershell
supabase secrets set PEXELS_API_KEY=your_key PIXABAY_API_KEY=your_key
supabase functions deploy free-stock-assets
```

- Pexels expands photos and videos.
- Pixabay expands photos, illustrations, videos, and motion backgrounds.
- Provider keys stay server-side. Do not expose them as `VITE_*` variables.
- Search responses are cached for 24 hours to satisfy Pixabay's API requirement.

Every normalized result includes its source page, creator, licence, and attribution text. The download proxy only accepts known provider hosts.
