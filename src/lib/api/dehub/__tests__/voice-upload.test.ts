import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authedUpload } from '../core';
import { addVoiceComment } from '../comments';
import { uploadLiveChatVoice } from '../livechat';
vi.mock('../core', () => ({ apiCall: vi.fn(), authedUpload: vi.fn(), DEHUB_API_BASE: 'https://api.dehub.io' }));

beforeEach(() => { vi.mocked(authedUpload).mockReset(); });
describe('voice reply upload contracts', () => {
  it.each(['audio/webm', 'audio/mp4', 'audio/ogg'])('uploads %s to live chat using the audio field', async type => {
    vi.mocked(authedUpload).mockResolvedValue({ url: 'livechat-audio/voice.m4a', duration: 1 });
    await uploadLiveChatVoice(new Blob(['audio'], { type }));
    const [endpoint, form] = vi.mocked(authedUpload).mock.calls[0];
    expect(endpoint).toBe('/api/livechat/upload-voice');
    const file = form.get('audio') as File;
    expect(file.type).toBe(type);
    expect([...form.keys()]).toEqual(['audio']);
    expect(file.name).toMatch(type === 'audio/mp4' ? /\.m4a$/ : type === 'audio/ogg' ? /\.ogg$/ : /\.webm$/);
  });

  it('preserves comment reply target and caption alongside MP4 audio', async () => {
    vi.mocked(authedUpload).mockResolvedValue({ result: true, commentId: 8, audioUrl: 'comments/voice.m4a', audioDuration: 1 });
    await addVoiceComment({ tokenId: 42, parentId: '7', content: 'A reply', audioFile: new Blob(['audio'], { type: 'audio/mp4' }) });
    const [endpoint, form] = vi.mocked(authedUpload).mock.calls[0];
    const url = new URL(endpoint, 'https://api.dehub.io');
    expect(url.pathname).toBe('/api/comment_audio');
    expect(url.searchParams.get('commentId')).toBe('7');
    expect(url.searchParams.get('streamTokenId')).toBe('42');
    expect(url.searchParams.get('content')).toBe('A reply');
    expect((form.get('file') as File).type).toBe('audio/mp4');
    expect((form.get('file') as File).name).toMatch(/\.m4a$/);
  });
});
