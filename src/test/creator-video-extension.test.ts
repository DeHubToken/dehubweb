import { expect, it } from 'vitest';
import { CREATOR_FAL_VIDEO_MODELS } from '../../supabase/functions/_shared/creator-fal-catalog';
import { buildCreatorFalVideoRequest } from '../../supabase/functions/_shared/creator-fal-input';
import { quotePriceDhb } from '../../supabase/functions/_shared/ai-pricing';
import { VIDEO_MODELS, getVideoCostUsd, snapVideoDuration } from '../constants/video-models.constants';

it('extends in either direction with a bounded four-second addition and a full stitched provider output contract', () => {
  for (const direction of ['forward', 'backward']) {
    const id = `ltx-extend-${direction}`, model = CREATOR_FAL_VIDEO_MODELS[id];
    for (const aspectRatio of ['16:9', '9:16']) {
      const request = buildCreatorFalVideoRequest(id, { prompt: 'Continue across the coast', videoUrls: ['https://media.test/source.mp4'], duration: 4, aspectRatio });
      expect(request.appId).toBe('fal-ai/ltx-2.3-quality/extend-video');
      expect(request.durationSeconds).toBe(4);
      expect(request.input).toMatchObject({ video_url: 'https://media.test/source.mp4', extend_direction: direction, num_frames: 121, num_context_frames: 25, frames_per_second: 24, match_input_fps: false, video_strength: 1, enable_prompt_expansion: false, enable_safety_checker: true });
      expect((Number(request.input.num_frames) - Number(request.input.num_context_frames)) / Number(request.input.frames_per_second)).toBe(4);
      const size = request.input.resolution as { width: number; height: number };
      expect(size.width * size.height).toBe(1280 * 720);
      expect(model.baseCostUsd).toBeGreaterThanOrEqual(Math.ceil(size.width * size.height * 121 / 1000000) * 0.0024075);
      expect(quotePriceDhb('video', id, { durationSeconds: 4 })).toBe(324);
      expect(getVideoCostUsd(VIDEO_MODELS[id], 4)).toBeCloseTo(0.324);
      expect(snapVideoDuration(VIDEO_MODELS[id], 30)).toBe(4);
    }
    for (const invalid of [{ videoUrls: [] }, { videoUrls: ['a', 'b'] }, { sourceImage: 'image' }, { endFrameUrl: 'image' }, { duration: 30 }, { resolution: '1080p' }, { aspectRatio: '1:1' }, { audioUrls: ['sound'] }, { seed: 2 }]) {
      expect(() => buildCreatorFalVideoRequest(id, { prompt: 'Continue', videoUrls: ['https://media.test/source.mp4'], ...invalid })).toThrow();
    }
  }
});
