import { describe, expect, it } from 'vitest';
import { MOTION_TEMPLATE_PROMPT, TEMPLATE_FEATURED_IDS, VIRAL_MOTION_TEMPLATES, VIRAL_TEMPLATES } from '../lib/creator/viralTemplates';
import { buildCreatorFalVideoRequest } from '../../supabase/functions/_shared/creator-fal-input';
import { allowedReferenceVideo } from '../../supabase/functions/_shared/creator-reference-video';

describe('playable motion templates', () => {
  it('has unique clips and a playable featured selection', () => {
    expect(VIRAL_MOTION_TEMPLATES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(VIRAL_TEMPLATES.map(template => template.id)).size).toBe(VIRAL_TEMPLATES.length);
    for (const id of TEMPLATE_FEATURED_IDS) {
      expect(VIRAL_TEMPLATES.find(template => template.id === id)).toMatchObject({ preview: expect.stringMatching(/^https:/), poster: expect.stringMatching(/^https:/) });
    }
  });
  it('passes the actual source clip to motion control with the uploaded identity', () => {
    for (const template of VIRAL_MOTION_TEMPLATES) {
      const request = buildCreatorFalVideoRequest('kling-3-motion', {
        prompt: MOTION_TEMPLATE_PROMPT, sourceImage: 'https://example.com/person.jpg',
        videoUrls: [template.preview!], duration: Math.ceil(template.motionSeconds!), resolution: '1080p',
      });
      expect(template.motionSeconds).toBeGreaterThanOrEqual(3);
      expect(template.motionSeconds).toBeLessThanOrEqual(30);
      expect(allowedReferenceVideo(template.preview!, 'storage.example.com')).toBe(true);
      expect(request.appId).toBe('fal-ai/kling-video/v3/pro/motion-control');
      expect(request.input).toMatchObject({ image_url: 'https://example.com/person.jpg', video_url: template.preview, character_orientation: 'video', keep_original_sound: true });
      expect(request.input).not.toHaveProperty('effect');
    }
  });
  it('does not trust arbitrary files on a template host', () => {
    expect(allowedReferenceVideo('https://jeanphilai.com/private.mp4', 'storage.example.com')).toBe(false);
    expect(allowedReferenceVideo(VIRAL_MOTION_TEMPLATES[0].preview + '&redirect=http://127.0.0.1', 'storage.example.com')).toBe(false);
    expect(allowedReferenceVideo('http://127.0.0.1/clip.mp4', 'storage.example.com')).toBe(false);
  });
});
