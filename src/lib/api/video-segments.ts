/**
 * Client for the `video-segments` edge function.
 *
 * Reads are anonymous — the player skips for signed-out viewers too. Writes
 * carry the DeHub token; the function derives the submitter from it and
 * ignores anything we send, so there is no address in the body.
 *
 * Every write is a POST, removal included: the shared CORS headers allow GET,
 * POST and OPTIONS only, and a DELETE dies at the preflight in a browser while
 * working perfectly in curl.
 */
import { getAuthToken } from '@/lib/api/dehub/core';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I';

const FN_URL = `${SUPABASE_URL}/functions/v1/video-segments`;

export const SEGMENT_CATEGORIES = [
  'sponsor',
  'intro',
  'outro',
  'selfpromo',
  'interaction',
  'filler',
] as const;

export type SegmentCategory = (typeof SEGMENT_CATEGORIES)[number];

export const SEGMENT_LABELS: Record<SegmentCategory, string> = {
  sponsor: 'Sponsor',
  intro: 'Intro',
  outro: 'Outro',
  selfpromo: 'Self promo',
  interaction: 'Like & subscribe',
  filler: 'Filler',
};

export interface VideoSegment {
  id: string;
  token_id: number;
  category: SegmentCategory;
  start_seconds: number;
  end_seconds: number;
  address: string;
  votes_up: number;
  votes_down: number;
  created_at: string;
}

/** Thrown when the function is not deployed yet — the UI treats it as "no segments". */
export class SegmentsUnavailableError extends Error {
  constructor() {
    super('Video segments are not available yet');
    this.name = 'SegmentsUnavailableError';
  }
}

const anonHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

export async function fetchVideoSegments(tokenId: string | number): Promise<VideoSegment[]> {
  const res = await fetch(`${FN_URL}?token_id=${encodeURIComponent(String(tokenId))}`, {
    headers: anonHeaders,
  });

  if (res.status === 404) throw new SegmentsUnavailableError();
  if (!res.ok) throw new Error(`Could not load segments (${res.status})`);

  const data = await res.json();
  // Numeric columns come back as strings over PostgREST; the player does
  // arithmetic on them every timeupdate, so coerce once here.
  return (data?.segments ?? []).map((segment: VideoSegment) => ({
    ...segment,
    start_seconds: Number(segment.start_seconds),
    end_seconds: Number(segment.end_seconds),
  }));
}

async function post(body: Record<string, unknown>): Promise<any> {
  const token = getAuthToken();
  if (!token) throw new Error('Sign in first.');

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { ...anonHeaders, 'Content-Type': 'application/json', 'x-dehub-token': token },
    body: JSON.stringify(body),
  });

  if (res.status === 404) throw new SegmentsUnavailableError();

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}

export async function submitVideoSegment(input: {
  tokenId: string | number;
  category: SegmentCategory;
  startSeconds: number;
  endSeconds: number;
}): Promise<VideoSegment> {
  const data = await post({
    token_id: Number(input.tokenId),
    category: input.category,
    start_seconds: input.startSeconds,
    end_seconds: input.endSeconds,
  });
  return data.segment as VideoSegment;
}

/** 1 agrees, -1 disagrees, 0 withdraws your vote. */
export async function voteVideoSegment(segmentId: string, vote: 1 | -1 | 0): Promise<void> {
  await post({ segment_id: segmentId, vote });
}

export async function removeVideoSegment(segmentId: string): Promise<void> {
  await post({ remove_segment_id: segmentId });
}
