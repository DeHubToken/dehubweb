/**
 * Client for the `film-reviews` edge function.
 *
 * Reads are anonymous. Writes carry the DeHub token; the function derives the
 * author from it and ignores any address we send, so there is no point putting
 * one in the body.
 */
import { getAuthToken } from '@/lib/api/dehub/core';
import type { ObjectType } from '@/lib/api/justwatch';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I';

const FN_URL = `${SUPABASE_URL}/functions/v1/film-reviews`;

export interface FilmReview {
  id: string;
  address: string;
  rating: number;
  body: string | null;
  created_at: string;
  updated_at: string;
}

export interface FilmReviewSummary {
  average: number | null;
  count: number;
  /** Counts for 1★ … 5★, in that order. */
  distribution: number[];
}

export interface FilmReviewsResponse {
  reviews: FilmReview[];
  summary: FilmReviewSummary;
}

/** Thrown when the function is not deployed yet — same pre-launch state the
 *  catalogue has, and rendered the same way. */
export class FilmReviewsUnavailableError extends Error {
  constructor() {
    super('Film reviews are not available yet');
    this.name = 'FilmReviewsUnavailableError';
  }
}

function target(justwatchId: string, objectType: ObjectType) {
  const params = new URLSearchParams({ justwatch_id: justwatchId, object_type: objectType });
  return `${FN_URL}?${params}`;
}

const anonHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

/**
 * fetch, with "could not reach the function at all" folded into the same
 * unavailable state as an explicit 404.
 *
 * Supabase's 404 for an undeployed function carries no CORS headers, so the
 * browser rejects it at the preflight and fetch REJECTS rather than resolving
 * — every `res.status === 404` check below is unreachable in a real browser
 * until the function exists. Checking the status looked correct, typechecked,
 * and only the console showed why it never fired.
 */
async function reach(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new FilmReviewsUnavailableError();
  }
  // Still checked, for the case where something between us and the function
  // answers with CORS headers and a 404 — an edge rule, a proxy, a rename.
  if (res.status === 404) throw new FilmReviewsUnavailableError();
  return res;
}

export async function fetchFilmReviews(
  justwatchId: string,
  objectType: ObjectType,
): Promise<FilmReviewsResponse> {
  const res = await reach(target(justwatchId, objectType), { headers: anonHeaders });

  if (!res.ok) throw new Error(`Could not load reviews (${res.status})`);

  return res.json();
}

export interface SaveFilmReviewInput {
  justwatchId: string;
  objectType: ObjectType;
  rating: number;
  body?: string;
  /** Snapshot so the review renders without a catalogue call. Required. */
  title: string;
  poster?: string | null;
  year?: number | null;
}

export async function saveFilmReview(input: SaveFilmReviewInput): Promise<FilmReview> {
  const token = getAuthToken();
  if (!token) throw new Error('Sign in to leave a review.');

  const res = await reach(target(input.justwatchId, input.objectType), {
    method: 'POST',
    headers: {
      ...anonHeaders,
      'Content-Type': 'application/json',
      'x-dehub-token': token,
    },
    body: JSON.stringify({
      rating: input.rating,
      body: input.body ?? '',
      title: input.title,
      poster: input.poster ?? null,
      year: input.year ?? null,
    }),
  });


  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Could not save your review (${res.status})`);

  return data.review as FilmReview;
}

export async function deleteFilmReview(
  justwatchId: string,
  objectType: ObjectType,
): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error('Sign in to manage your review.');

  const res = await reach(target(justwatchId, objectType), {
    method: 'DELETE',
    headers: { ...anonHeaders, 'x-dehub-token': token },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Could not remove your review (${res.status})`);
  }
}
