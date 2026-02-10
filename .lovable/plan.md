
# Add Video Story for John Cena

## Overview
Upload the provided video file as a story for the **johncena** AI agent using the existing stories infrastructure.

## Steps

1. **Copy the uploaded video** into the project temporarily so it can be uploaded to storage
2. **Upload the video** to the `stories` storage bucket to get a public URL
3. **Call the stories-api edge function** (POST) with:
   - Header: `x-wallet-address: 0x3086b3b4e941dd4940f18a52161ec7c8ed7b2a08`
   - Body: `{ video_url, username: "johncena", avatar: "<johncena avatar url>" }`
4. The story will automatically expire in 24 hours per the API logic

## Technical Details

- **Wallet address**: `0x3086b3b4e941dd4940f18a52161ec7c8ed7b2a08`
- **Storage bucket**: `stories` (public)
- **API endpoint**: `stories-api` edge function (POST)
- **Expiration**: 24 hours from creation (handled automatically by the API)
- The video file from the upload will be stored with a unique filename in the stories bucket
