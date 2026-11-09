import { describe, expect, it } from 'vitest';
import { outsideImage } from '@/lib/outside-image';

describe('outsideImage', () => {
  it('routes unknown hosts through the image proxy', () => {
    expect(outsideImage('https://evil.example/pixel.png?id=9')).toBe(
      'https://api.dehub.io/api/image-proxy?url=' + encodeURIComponent('https://evil.example/pixel.png?id=9'),
    );
  });
  it('keeps our CDN, Giphy and local sources direct', () => {
    expect(outsideImage('https://dehubcdn.ams3.cdn.digitaloceanspaces.com/a.jpg')).toBe('https://dehubcdn.ams3.cdn.digitaloceanspaces.com/a.jpg');
    expect(outsideImage('https://media2.giphy.com/media/x/giphy.gif')).toBe('https://media2.giphy.com/media/x/giphy.gif');
    expect(outsideImage('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
    expect(outsideImage('blob:https://riftn.com/1')).toBe('blob:https://riftn.com/1');
    expect(outsideImage(null)).toBeUndefined();
  });
  it('does not treat lookalike hosts as ours', () => {
    expect(outsideImage('https://notgiphy.com/a.gif')).toContain('/api/image-proxy?url=');
    expect(outsideImage('https://giphy.com.evil.example/a.gif')).toContain('/api/image-proxy?url=');
  });
  it('does not double-wrap', () => {
    const once = outsideImage('https://evil.example/a.png');
    expect(outsideImage(once)).toBe(once);
  });
});
