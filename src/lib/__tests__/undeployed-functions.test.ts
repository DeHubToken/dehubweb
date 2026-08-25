/**
 * Two features ship their client ahead of their edge function — sponsor
 * segments and caption corrections — and both are meant to read as "nothing
 * marked here yet" during the window in between, not as an error.
 *
 * The trap this pins is the one #581 found in the film-reviews client:
 * Supabase's 404 for an undeployed function carries no CORS headers, so a
 * browser rejects it at the preflight and `fetch` REJECTS rather than
 * resolving with a 404. A status check alone therefore never fires in a real
 * browser, typechecks perfectly, and only the console says why.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchVideoSegments, SegmentsUnavailableError } from '../api/video-segments';
import {
  fetchTranscriptCorrections,
  CorrectionsUnavailableError,
} from '../api/transcript-corrections';

describe('undeployed edge functions read as "not live yet"', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a rejected fetch to Unavailable for segments — the browser case', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    return expect(fetchVideoSegments(123)).rejects.toBeInstanceOf(SegmentsUnavailableError);
  });

  it('maps a CORS-carrying 404 to Unavailable for segments — the proxy case', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );
    return expect(fetchVideoSegments(123)).rejects.toBeInstanceOf(SegmentsUnavailableError);
  });

  it('maps a rejected fetch to Unavailable for corrections', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    return expect(
      fetchTranscriptCorrections('11111111-1111-1111-1111-111111111111'),
    ).rejects.toBeInstanceOf(CorrectionsUnavailableError);
  });

  it('still reports a real server error as an error, not as "not live yet"', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    return expect(fetchVideoSegments(123)).rejects.not.toBeInstanceOf(SegmentsUnavailableError);
  });
});
