import { describe, expect, it, vi } from 'vitest';
import { sendPublicChatImage } from './public-chat-attachment';

describe('public chat attachment delivery', () => {
  it('does not upload or post a file that the room cannot accept', async () => {
    const upload = vi.fn();
    const send = vi.fn();
    await expect(sendPublicChatImage(new File(['pdf'], 'test.pdf', { type: 'application/pdf' }), 'caption', 'reply', upload, send)).rejects.toThrow();
    expect(upload).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not publish a message when the upload fails', async () => {
    const send = vi.fn();
    const upload = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(sendPublicChatImage(new File(['png'], 'test.png', { type: 'image/png' }), 'caption', 'reply', upload, send)).rejects.toThrow('offline');
    expect(send).not.toHaveBeenCalled();
  });

  it('waits for the upload and retains the caption and reply target', async () => {
    let finish!: (value: { url: string }) => void;
    const upload = vi.fn(() => new Promise<{ url: string }>(resolve => { finish = resolve; }));
    const send = vi.fn().mockResolvedValue(undefined);
    const file = new File(['gif'], 'test.gif', { type: 'image/gif' });
    const result = sendPublicChatImage(file, 'caption', 'reply', upload, send);
    expect(send).not.toHaveBeenCalled();
    finish({ url: 'https://cdn.example/test.gif' });
    await result;
    expect(upload).toHaveBeenCalledWith(file);
    expect(send).toHaveBeenCalledWith('caption', 'image', 'https://cdn.example/test.gif', 'reply');
  });
});
