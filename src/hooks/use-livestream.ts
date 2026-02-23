/**
 * Livestream Hooks
 * ================
 * React hooks wrapping the DeHub livestream API endpoints.
 * Provides data-fetching, mutations, and state management for live streams.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLiveStream,
  getUserLiveStreams,
  getUserScheduledStreams,
  getStreamKey,
  getStreamIngestUrl,
  getStreamActivities,
  likeLiveStream,
  sendLiveStreamGift,
  endLiveStream,
  type LiveStream as ApiLiveStream,
  type StreamKeyInfo,
  type StreamActivity,
  type SendGiftData,
} from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';

// Re-export API types for consumers
export type { ApiLiveStream, StreamKeyInfo, StreamActivity, SendGiftData };

/**
 * Fetch a single live stream's details by ID.
 */
export function useLiveStreamDetails(streamId: string | null) {
  const [stream, setStream] = useState<ApiLiveStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!streamId) {
      setStream(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await getLiveStream(streamId);
      setStream(res.result);
    } catch (err) {
      console.error('[Livestream] Failed to fetch stream:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stream');
    } finally {
      setIsLoading(false);
    }
  }, [streamId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { stream, isLoading, error, refetch: fetch };
}

/**
 * Fetch a user's live streams by wallet address.
 */
export function useUserLiveStreams(address: string | null) {
  const [streams, setStreams] = useState<ApiLiveStream[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!address) {
      setStreams([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await getUserLiveStreams(address);
      setStreams(res.result || []);
    } catch (err) {
      console.error('[Livestream] Failed to fetch user streams:', err);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { streams, isLoading, refetch: fetch };
}

/**
 * Fetch a user's scheduled (upcoming) streams.
 */
export function useUserScheduledStreams(address: string | null) {
  const [streams, setStreams] = useState<ApiLiveStream[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!address) {
      setStreams([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await getUserScheduledStreams(address);
      setStreams(res.result || []);
    } catch (err) {
      console.error('[Livestream] Failed to fetch scheduled streams:', err);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { streams, isLoading, refetch: fetch };
}

/**
 * Fetch stream key info (key + ingest URL) for the stream owner.
 */
export function useStreamCredentials(streamId: string | null) {
  const [credentials, setCredentials] = useState<StreamKeyInfo | null>(null);
  const [ingestUrl, setIngestUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!streamId) return;
    setIsLoading(true);
    try {
      const [keyRes, ingestRes] = await Promise.all([
        getStreamKey(streamId),
        getStreamIngestUrl(streamId),
      ]);
      setCredentials(keyRes.result);
      setIngestUrl(ingestRes.result?.ingestUrl || null);
    } catch (err) {
      console.error('[Livestream] Failed to fetch credentials:', err);
    } finally {
      setIsLoading(false);
    }
  }, [streamId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { credentials, ingestUrl, isLoading, refetch: fetch };
}

/**
 * Fetch the activity log (joins, gifts, likes, comments) for a stream.
 * Polls at the specified interval while enabled.
 */
export function useStreamActivities(streamId: string | null, pollInterval = 15000) {
  const [activities, setActivities] = useState<StreamActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async (showLoading = false) => {
    if (!streamId) return;
    if (showLoading) setIsLoading(true);
    try {
      const res = await getStreamActivities(streamId, { unit: 50 });
      setActivities(res.result || []);
    } catch (err) {
      console.error('[Livestream] Failed to fetch activities:', err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [streamId]);

  useEffect(() => {
    if (!streamId) {
      setActivities([]);
      return;
    }
    fetch(true);
    pollRef.current = setInterval(() => fetch(false), pollInterval);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [streamId, fetch, pollInterval]);

  return { activities, isLoading, refetch: () => fetch(false) };
}

/**
 * Mutation hooks for stream interactions: like, gift, end.
 */
export function useStreamActions() {
  const { isAuthenticated } = useAuth();
  const [isLiking, setIsLiking] = useState(false);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const like = useCallback(async (streamId: string) => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    setIsLiking(true);
    try {
      await likeLiveStream(streamId);
    } finally {
      setIsLiking(false);
    }
  }, [isAuthenticated]);

  const gift = useCallback(async (streamId: string, data: SendGiftData) => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    setIsSendingGift(true);
    try {
      await sendLiveStreamGift(streamId, data);
    } finally {
      setIsSendingGift(false);
    }
  }, [isAuthenticated]);

  const end = useCallback(async (streamId: string) => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    setIsEnding(true);
    try {
      await endLiveStream(streamId);
    } finally {
      setIsEnding(false);
    }
  }, [isAuthenticated]);

  return { like, gift, end, isLiking, isSendingGift, isEnding };
}
