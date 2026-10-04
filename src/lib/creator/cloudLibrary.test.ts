import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCloudGeneration } from './cloudLibrary';
import type { GenerationJob } from '@/store/generationStore';

const { invoke, upload } = vi.hoisted(() => ({ invoke: vi.fn(), upload: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke }, storage: { from: () => ({ uploadToSignedUrl: upload }) } },
}));
vi.mock('@/lib/api/dehub/core', () => ({ ensureFreshToken: async () => 'test-token' }));

const job: GenerationJob = {
  id: 'mesh-result', kind: 'model3d', prompt: 'A chair', resolvedPrompt: 'A chair',
  model: 'tripo-2.5', modelName: 'Tripo 2.5', aspect: '1:1', status: 'done', stage: '', createdAt: 1,
  url: 'https://media.example/chair.glb', posterUrl: 'https://media.example/chair.webp', sourceImage: 'private-reference',
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('saving a mesh with its preview', () => {
  it('keeps the poster in account metadata while uploading the original mesh', async () => {
    invoke.mockResolvedValueOnce({ data: { path: 'account/mesh-result/original', token: 'upload-token' } })
      .mockResolvedValueOnce({ data: { saved: true } });
    upload.mockResolvedValue({ error: null });
    const bytes = new Blob(['mesh'], { type: 'model/gltf-binary' });
    const fetchMedia = vi.fn().mockResolvedValue({ ok: true, blob: async () => bytes });
    vi.stubGlobal('fetch', fetchMedia);

    await saveCloudGeneration('account', job);

    const metadata = invoke.mock.calls[0][1].body.metadata;
    expect(metadata.posterUrl).toBe(job.posterUrl);
    expect(metadata).not.toHaveProperty('sourceImage');
    expect(metadata).not.toHaveProperty('url');
    expect(fetchMedia).toHaveBeenCalledExactlyOnceWith(job.url);
    expect(upload).toHaveBeenCalledWith('account/mesh-result/original', 'upload-token', bytes, { contentType: 'model/gltf-binary' });
    expect(invoke.mock.calls[1][1].body).toEqual({ action: 'complete', id: job.id });
  });

  it('updates previews on an already saved result without uploading the mesh again', async () => {
    invoke.mockResolvedValueOnce({ data: { saved: true } });
    const fetchMedia = vi.fn();
    vi.stubGlobal('fetch', fetchMedia);
    await saveCloudGeneration('account', job);
    expect(invoke.mock.calls[0][1].body.metadata.posterUrl).toBe(job.posterUrl);
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});
