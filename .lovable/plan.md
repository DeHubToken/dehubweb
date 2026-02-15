
# Fix Live Tab Not Loading

## Root Cause

The Live feed uses **0-based pagination** (`page: 0`) but the DeHub API expects **1-based pagination** (`page: 1`). Sending `page=0` returns an empty result, causing the "No Live Streams" empty state to show permanently.

Other feeds that work correctly (Videos, Notifications, Profile content) all use `initialPageParam: 1`.

## Changes

### 1. `src/hooks/use-dehub-feed.ts` -- Fix the `useDeHubLive` hook

- Change `initialPageParam: 0` to `initialPageParam: 1`
- Update `getNextPageParam` to increment from 1 instead of 0

### 2. `src/hooks/use-feed-prefetch.ts` -- Fix the prefetch call

- Change `getLiveStreams({ page: 0, ... })` to `page: 1`
- Update the cached `pageParams` from `[0]` to `[1]` and `page: 0` to `page: 1`

### 3. `src/hooks/use-nebula-prefetch.ts` -- No changes needed

The nebula prefetch doesn't cache live data, so no fix required there.

## Summary

Two lines changed, two files touched. The Live feed will immediately start returning real data from the API.
