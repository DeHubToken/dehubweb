
# Live Streaming Fix Plan

## Problem Summary
The "Go Live" feature was implemented but isn't working correctly due to API integration issues and unclear user flow.

## Issues to Fix

### Issue 1: API Flow Correction
The current implementation calls `POST /api/live/start` directly, but the DeHub API requires a two-step process:
1. First call `POST /api/live` to **create** a stream and get a `streamId`
2. Then call `POST /api/live/start` with that `streamId` to **start broadcasting**

**Fix:** Update `GoLiveModal` to use the correct API flow:
- Step 1: Call `createLiveStream()` with title, description, category
- Step 2: Use the returned `streamId` to call `startLiveStream({ streamId })`
- Step 3: Display the `streamKey`, `ingestUrl`, and `playbackUrl` to the user

### Issue 2: Better Error Handling
Add proper error handling with user-friendly messages:
- Show toast when API calls fail
- Handle 401 (expired token) with a prompt to re-login
- Validate required fields before API call

### Issue 3: Make "Go Live" More Discoverable
The current flow requires navigating through a drawer. Consider:
- Keep current flow in StoriesBar (it works)
- Ensure PostActionBar correctly opens the modal

## Implementation Steps

### Step 1: Update GoLiveModal API Flow
**File:** `src/components/app/modals/GoLiveModal.tsx`

Changes:
```typescript
const handleStartStream = async () => {
  if (!title.trim()) {
    toast.error('Please enter a stream title');
    return;
  }

  setIsLoading(true);
  try {
    // Step 1: Create the stream first
    const createResponse = await createLiveStream({
      title: title.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
    });
    
    const streamId = createResponse.result?.streamId || createResponse.result?.id;
    
    if (!streamId) {
      throw new Error('Failed to create stream - no stream ID returned');
    }
    
    // Step 2: Start the stream to get RTMP credentials
    const startResponse = await startLiveStream({
      streamId,
    });

    setStreamData(startResponse.result);
    setStep('ready');
    toast.success('Stream created! Copy your stream key to start broadcasting.');
  } catch (error) {
    console.error('Failed to start stream:', error);
    toast.error(error instanceof Error ? error.message : 'Failed to create stream');
  } finally {
    setIsLoading(false);
  }
};
```

### Step 2: Add Import for createLiveStream
**File:** `src/components/app/modals/GoLiveModal.tsx`

Change import:
```typescript
import { startLiveStream, createLiveStream, type StartLiveStreamResponse } from '@/lib/api/dehub';
```

### Step 3: Improve Error Messages
Add better error handling in the API layer for common issues:
- 401: "Session expired. Please log in again."
- 400: "Invalid request. Please check your input."
- 500: "Server error. Please try again later."

## Testing Flow
After implementation:
1. Navigate to the Home feed
2. Click the "Live/Story" button at the top of the feed
3. Select "Go Live" from the drawer
4. Enter a stream title (required)
5. Optionally add description and category
6. Click "Go Live" button
7. Modal should transition to "Ready to Stream" view with:
   - Stream Key (masked, copyable)
   - Server/Ingest URL (copyable)
   - Playback URL (shareable)
   - Instructions for OBS setup

## Alternative Entry Point
Users can also access live streaming from:
1. Open Post Modal (click the + button in bottom nav)
2. Click the Radio icon in the action bar
3. Select "Video" or "Audio Only" mode
4. Click "Go Live" button

## Summary of File Changes
| File | Change |
|------|--------|
| `src/components/app/modals/GoLiveModal.tsx` | Fix API flow to create stream first, then start it |
