import { describe, it, expect } from 'vitest';
import { validatePublicChatMedia, PUBLIC_CHAT_IMAGE_MAX_SIZE } from './public-chat-media';

const file = (name: string, type: string, size = 1024) => ({ name, type, size });

describe('validatePublicChatMedia', () => {
  it('refuses a PDF with a message pointing at direct messages', () => {
    const r = validatePublicChatMedia(file('report.pdf', 'application/pdf'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/direct messages/i);
  });

  it('refuses other documents and files with no type', () => {
    expect(validatePublicChatMedia(file('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).ok).toBe(false);
    expect(validatePublicChatMedia(file('a.bin', '')).ok).toBe(false);
  });

  it('accepts the image types the upload function takes', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
      expect(validatePublicChatMedia(file('x', type)).ok).toBe(true);
    }
  });

  it('refuses images the upload function would reject', () => {
    const r = validatePublicChatMedia(file('x.heic', 'image/heic'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/JPG, PNG, GIF or WebP/);
    expect(validatePublicChatMedia(file('x.svg', 'image/svg+xml')).ok).toBe(false);
  });

  it('refuses images over the size cap', () => {
    expect(validatePublicChatMedia(file('x.png', 'image/png', PUBLIC_CHAT_IMAGE_MAX_SIZE + 1)).ok).toBe(false);
  });
});
