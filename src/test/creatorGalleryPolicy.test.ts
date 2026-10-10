import { describe, expect, it } from 'vitest';
import { freePosterPng } from '../../supabase/functions/_shared/creator-gallery-policy';

const request = { bannerRenderer: 'template' };
const result = { success: true, renderer: 'template', imageUrl: 'data:image/png;base64,iVBORw0KGgo=' };

describe('public Creator gallery eligibility', () => {
  it('accepts free outputs completed by the DeHub Poster template renderer', () => {
    expect(freePosterPng(request, 0, result)).toBeInstanceOf(Uint8Array);
  });
  const excluded: Parameters<typeof freePosterPng>[] = [
    [{ bannerRenderer: 'scene' }, 0, result],
    [request, 25, result],
    [{ ...request, sourceImage: 'private image' }, 0, result],
    [{ ...request, referenceImageUrls: ['private image'] }, 0, result],
    [{}, 0, result],
    [request, 0, { ...result, renderer: 'scene' }],
    [request, 0, { ...result, success: false }],
    [request, 0, { ...result, imageUrl: 'https://example.com/private.png' }],
    [request, 0, { ...result, imageUrl: 'data:image/png;base64,bm90IGEgcG5n' }],
  ];
  it.each(excluded)('excludes paid, private, unproven and failed outputs (%j)', (body, price, output) => {
    expect(freePosterPng(body, price, output)).toBeNull();
  });
});
