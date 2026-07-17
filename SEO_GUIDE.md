# DeHub Dynamic SEO/SSR Guide

This project now supports Server-Side Rendering (SSR) for **Profiles** and **Posts** to ensure rich link previews (Open Graph) when sharing on social media (X/Twitter, Telegram, Discord, etc.).

## Features
- **Profiles**: Title says "Join @username on DeHub today!" and uses their profile picture.
- **Media Posts**: Uses the post image/thumbnail and the post's actual title/description.
- **Text Posts**: Uses the author's profile picture as the image and the post content as the description.

## Setup Instructions

### 1. Deploy the Supabase Function

Deploy the SEO function to your Supabase project:

```bash
supabase functions deploy ssr-seo
```

### 2. Configure Cloudflare Worker

1.  Create a new Worker in the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2.  Copy the contents of `CLOUDFLARE_WORKER_SEO.js` into the Worker editor.
3.  Deploy the worker.
4.  In the Cloudflare "Routes" settings for your domain (`dehub.io`), add routes to trigger the worker:
    *   **Route**: `dehub.io/*` (Catch-all to handle both profiles and posts)
    *   **Worker**: Your new SEO Worker

### 3. Verification

You can test if it's working by using these tools:
- [Social Share Preview](https://socialsharepreview.com/)
- [OpenGraph.xyz](https://www.opengraph.xyz)

Or via command line to simulate a bot:
```bash
curl -H "User-Agent: twitterbot" https://dehub.io/@username
```

## How It Works
1.  The Cloudflare Worker sits in front of your site.
2.  When a **Bot** (like Twitter or Telegram) requests a page, the worker intercepts it and asks the **Supabase Edge Function** for the meta tags.
3.  The Edge Function fetches the latest data from `api.dehub.io` and returns a small HTML page with the correct `<meta>` tags.
4.  If a **Real User** visits, the worker lets them pass through to your standard React application.
