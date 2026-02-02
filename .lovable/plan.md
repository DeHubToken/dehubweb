

# Stories API - Backend API for Mobile App Integration

## Overview
Create a comprehensive REST API for the Stories feature using Supabase Edge Functions. This will allow the other developer to integrate Stories into the mobile app with full backwards compatibility.

---

## API Endpoints to Create

### 1. `stories-api` - Main Stories Endpoint

A single edge function that handles all story operations via different HTTP methods and paths:

| Method | Action | Description |
|--------|--------|-------------|
| `GET /` | List Stories | Get all active (non-expired) stories |
| `GET /?wallet_address=xxx` | User Stories | Get stories for a specific user |
| `GET /?id=xxx` | Single Story | Get a specific story by ID |
| `POST /` | Create Story | Create a new story record |
| `DELETE /?id=xxx` | Delete Story | Delete own story |

---

## API Response Format

Following the DeHub API pattern for consistency:

```json
{
  "status": true,
  "result": { ... },
  "message": "Success"
}
```

**Story Object:**
```json
{
  "id": "uuid",
  "wallet_address": "0x...",
  "username": "@erwin",
  "avatar": "https://...",
  "video_url": "https://...",
  "thumbnail_url": "https://...",
  "created_at": "2026-02-02T10:00:00Z",
  "expires_at": "2026-02-03T10:00:00Z"
}
```

---

## Authentication

The API will use wallet-based authentication via the `x-wallet-address` header (matching your existing pattern with `get_request_wallet_address` DB function):

```
Headers:
  x-wallet-address: 0x1234...
  Authorization: Bearer <dehub-jwt-token> (optional, for verified actions)
```

For **create** and **delete** operations, the wallet address is required and verified.

---

## Implementation Details

### File to Create
```
supabase/functions/stories-api/index.ts
```

### Core Logic

**GET - List Stories:**
- Query `stories` table where `expires_at > now()`
- Order by `created_at DESC`
- Optional filter by `wallet_address`

**POST - Create Story:**
- Validate required fields: `wallet_address`, `video_url`
- Auto-generate `expires_at` (24 hours from now)
- Insert into `stories` table
- Return created story

**DELETE - Delete Story:**
- Verify `wallet_address` header matches story owner
- Delete from `stories` table
- Return success/error

---

## Mobile Developer Integration Guide

The API will be documented for easy integration:

```bash
# Base URL
https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/stories-api

# List all active stories
GET /stories-api

# Get user's stories  
GET /stories-api?wallet_address=0x123...

# Create story (mobile app uploads video first, then creates record)
POST /stories-api
Headers: x-wallet-address: 0x123...
Body: {
  "video_url": "https://...",
  "thumbnail_url": "https://...",
  "username": "@username",
  "avatar": "https://..."
}

# Delete own story
DELETE /stories-api?id=story-uuid
Headers: x-wallet-address: 0x123...
```

---

## File Upload Strategy

For video/thumbnail uploads, the mobile app can either:
1. **Use Supabase Storage directly** - Upload to the `stories` bucket, then call the API with the public URL
2. **Use their existing CDN** - Upload elsewhere and pass the URL to the API

The API is storage-agnostic - it just stores URLs.

---

## Config Update

Add to `supabase/config.toml`:
```toml
[functions.stories-api]
verify_jwt = false
```

---

## Summary

| What | Details |
|------|---------|
| **New Edge Function** | `supabase/functions/stories-api/index.ts` |
| **Base URL** | `https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/stories-api` |
| **Auth Method** | `x-wallet-address` header |
| **Response Format** | JSON matching DeHub API pattern |

This creates a clean, documented API that your mobile developer can integrate without touching your web app code.

