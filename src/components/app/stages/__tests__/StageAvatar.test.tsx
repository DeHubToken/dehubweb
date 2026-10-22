import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { StageAvatar, stageAvatarSources } from '@/components/app/stages/StageAvatar';

const WALLET = '0xAbC0000000000000000000000000000000000001';
const CDN = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/';

describe('stageAvatarSources', () => {
  it('tries the resized picture, the original, then the wallet picture', () => {
    const urls = stageAvatarSources(WALLET, 'avatars/0xabc-1234.webp', 40);
    expect(urls[0]).toContain('/cdn-cgi/image/');
    expect(urls[0]).toContain(`${CDN}avatars/0xabc-1234.webp`);
    // The untouched file, straight from the CDN (it may carry a cache-buster).
    expect(urls[1].startsWith(`${CDN}avatars/0xabc-1234.webp`)).toBe(true);
    expect(urls[1]).not.toContain('/cdn-cgi/image/');
    expect(urls[urls.length - 1]).toContain(`${CDN}avatars/${WALLET.toLowerCase()}.jpg`);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('still has the wallet picture when nothing was stored', () => {
    const urls = stageAvatarSources(WALLET, null, 40);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain(`avatars/${WALLET.toLowerCase()}.jpg`);
  });

  it('never offers a dead blob: preview', () => {
    expect(stageAvatarSources(WALLET, 'blob:https://dehub.io/123', 40).some((u) => u.startsWith('blob:'))).toBe(false);
  });
});

describe('StageAvatar', () => {
  it('walks the ladder on errors and ends on the initial', () => {
    const { container, getByText } = render(
      <StageAvatar address={WALLET} avatar="avatars/0xabc-1234.webp" name="mal" size={40} />,
    );
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      const img = container.querySelector('img');
      if (!img) break;
      seen.push(img.getAttribute('src')!);
      fireEvent.error(img);
    }
    expect(seen).toEqual(stageAvatarSources(WALLET, 'avatars/0xabc-1234.webp', 40));
    expect(container.querySelector('img')).toBeNull();
    expect(getByText('M')).toBeTruthy();
  });

  it('hides the initial once a picture loads', () => {
    const { container, queryByText } = render(<StageAvatar address={WALLET} avatar={null} name="mal" size={24} />);
    expect(queryByText('M')).toBeTruthy();
    fireEvent.load(container.querySelector('img')!);
    expect(queryByText('M')).toBeNull();
  });

  it('shows two hex digits for a wallet with no name', () => {
    const { getByText, container } = render(<StageAvatar address={WALLET} avatar={null} size={24} />);
    fireEvent.error(container.querySelector('img')!);
    expect(getByText('AB')).toBeTruthy();
  });
});
