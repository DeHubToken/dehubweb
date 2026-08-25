/**
 * Client for the `transcript-corrections` edge function.
 *
 * Reads are anonymous — a corrected caption is for everyone watching, signed
 * in or not. Writes carry the DeHub token and the function derives the author
 * from it. Every write is a POST, removal included: the shared CORS headers
 * allow GET, POST and OPTIONS only.
 */
import { getAuthToken } from '@/lib/api/dehub/core';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I';

const FN_URL = `${SUPABASE_URL}/functions/v1/transcript-corrections`;

export type CorrectionStatus = 'suggested' | 'accepted';

export interface TranscriptCorrection {
  id: string;
  transcript_id: string;
  segment_index: number;
  text: string;
  address: string;
  votes_up: number;
  votes_down: number;
  status: CorrectionStatus;
  created_at: string;
}

/** Thrown when the function is not deployed yet — treated as "no corrections". */
export class CorrectionsUnavailableError extends Error {
  constructor() {
    super('Caption corrections are not available yet');
    this.name = 'CorrectionsUnavailableError';
  }
}

const anonHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

export async function fetchTranscriptCorrections(transcriptId: string): Promise<TranscriptCorrection[]> {
  const res = await fetch(`${FN_URL}?transcript_id=${encodeURIComponent(transcriptId)}`, {
    headers: anonHeaders,
  });

  if (res.status === 404) throw new CorrectionsUnavailableError();
  if (!res.ok) throw new Error(`Could not load corrections (${res.status})`);

  const data = await res.json();
  return (data?.corrections ?? []) as TranscriptCorrection[];
}

async function post(body: Record<string, unknown>): Promise<any> {
  const token = getAuthToken();
  if (!token) throw new Error('Sign in first.');

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { ...anonHeaders, 'Content-Type': 'application/json', 'x-dehub-token': token },
    body: JSON.stringify(body),
  });

  if (res.status === 404) throw new CorrectionsUnavailableError();

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}

export async function submitTranscriptCorrection(input: {
  transcriptId: string;
  segmentIndex: number;
  text: string;
  originalText: string;
}): Promise<TranscriptCorrection> {
  const data = await post({
    transcript_id: input.transcriptId,
    segment_index: input.segmentIndex,
    text: input.text,
    original_text: input.originalText,
  });
  return data.correction as TranscriptCorrection;
}

/** 1 agrees, -1 disagrees, 0 withdraws your vote. */
export async function voteTranscriptCorrection(correctionId: string, vote: 1 | -1 | 0): Promise<void> {
  await post({ correction_id: correctionId, vote });
}

export async function removeTranscriptCorrection(correctionId: string): Promise<void> {
  await post({ remove_correction_id: correctionId });
}
