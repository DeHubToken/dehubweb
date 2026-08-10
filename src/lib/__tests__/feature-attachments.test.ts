import { describe, it, expect } from 'vitest';
import {
  featureAttachments,
  isVideoAttachment,
  MAX_FEATURE_ATTACHMENTS,
} from '@/lib/feature-attachments';

describe('featureAttachments', () => {
  it('returns the full list when image_urls is set', () => {
    expect(featureAttachments({ image_url: 'a.png', image_urls: ['a.png', 'b.png'] }))
      .toEqual(['a.png', 'b.png']);
  });

  // Rows written before the column existed carry only the single URL.
  it('falls back to image_url', () => {
    expect(featureAttachments({ image_url: 'a.png' })).toEqual(['a.png']);
    expect(featureAttachments({ image_url: 'a.png', image_urls: null })).toEqual(['a.png']);
  });

  // An empty array is what a client that cleared the attachments writes; it must
  // not resurrect the mirrored image_url.
  it('prefers image_urls but ignores an empty one', () => {
    expect(featureAttachments({ image_url: 'a.png', image_urls: [] })).toEqual(['a.png']);
  });

  it('drops null and empty entries', () => {
    expect(featureAttachments({ image_urls: ['a.png', '', null as unknown as string] }))
      .toEqual(['a.png']);
  });

  it('returns nothing for a request with no media', () => {
    expect(featureAttachments({ image_url: null, image_urls: null })).toEqual([]);
    expect(featureAttachments(null)).toEqual([]);
    expect(featureAttachments(undefined)).toEqual([]);
  });
});

describe('isVideoAttachment', () => {
  it('detects video extensions', () => {
    expect(isVideoAttachment('https://x/y.mp4')).toBe(true);
    expect(isVideoAttachment('https://x/y.MOV')).toBe(true);
    expect(isVideoAttachment('https://x/y.webm')).toBe(true);
  });

  // Supabase public URLs can carry a cache-busting query, which the old
  // end-anchored check treated as "not a video" and rendered in an <img>.
  it('detects a video behind a query string or fragment', () => {
    expect(isVideoAttachment('https://x/y.mp4?token=abc')).toBe(true);
    expect(isVideoAttachment('https://x/y.mp4#t=1')).toBe(true);
  });

  it('leaves images alone', () => {
    expect(isVideoAttachment('https://x/y.png')).toBe(false);
    expect(isVideoAttachment('https://x/mp4.png')).toBe(false);
  });
});

describe('attachment limits', () => {
  // Mirrors the cardinality bound in
  // supabase/migrations/20260810000000_feature_request_multiple_attachments.sql;
  // raising one without the other makes the submit fail at the database.
  it('caps at six', () => {
    expect(MAX_FEATURE_ATTACHMENTS).toBe(6);
  });
});
