import { describe, expect, it } from 'vitest';
import { buildInviteSvg, fitInviteText, type InviteImageOptions } from '../../supabase/functions/affiliate-share-image/render';

const base: InviteImageOptions = {
  code: 'CFMVZEH2', name: 'mal', username: 'maldoteth',
  avatarDataUri: null, bannerDataUri: null, badgeDataUri: null, badgeName: null,
  qrPath: 'M0,0h1v1h-1z', qrCount: 25, width: 1200, height: 630,
};

describe('affiliate invitation layout', () => {
  it('keeps a short identity at its intended size and fits wide names into the badge-safe column', () => {
    expect(fitInviteText('mal', 708, 78, 44)).toMatchObject({ text: 'mal', fontSize: 78 });
    for (const name of ['W'.repeat(120), 'A very long display name with several words', '邀请'.repeat(60)]) {
      const result = fitInviteText(name, 708, 78, 44);
      expect(result.width).toBeLessThanOrEqual(708);
      expect(result.fontSize).toBeGreaterThanOrEqual(44);
      expect(366 + result.width + 10 + 64).toBeLessThanOrEqual(1148);
    }
    expect(fitInviteText('W'.repeat(120), 708, 78, 44).text).toMatch(/…$/);
  });

  it('aligns canonical badge artwork to the display-name baseline', () => {
    const svg = buildInviteSvg({ ...base, badgeDataUri: 'data:image/png;base64,abc', badgeName: 'Meglodon' });
    expect(svg).toContain('width="62.64" height="62.64"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it('never truncates a valid referral code, including the widest 40-character code', () => {
    for (const code of ['CFMVZEH2', 'W'.repeat(40), 'A_B-C'.repeat(8)]) {
      const label = `dehub.io/r/${code}`;
      const fitted = fitInviteText(label, 853, 36, 18);
      expect(fitted.text).toBe(label);
      expect(fitted.width).toBeLessThanOrEqual(853);
      expect(buildInviteSvg({ ...base, code })).toContain(`>${label}</text>`);
    }
  });

  it('escapes identity text and normalizes handle prefixes', () => {
    const svg = buildInviteSvg({ ...base, name: '<b>&mal', username: '@@mal&co' });
    expect(svg).toContain('&lt;b&gt;&amp;mal');
    expect(svg).toContain('@mal&amp;co');
    expect(svg).not.toContain('@@');
    expect(svg).not.toContain('<b>');
  });

  it('has a useful image without profile media or an invite code', () => {
    const svg = buildInviteSvg({ ...base, code: '', name: 'DeHub', username: null });
    expect(svg).toContain('You’re invited.');
    expect(svg).toContain('>dehub.io</text>');
    expect(svg).not.toContain('/r/INVITE');
    expect(svg).not.toContain('href=""');
  });

  it('scales the composition uniformly for alternate export sizes', () => {
    const svg = buildInviteSvg({ ...base, width: 600, height: 600 });
    expect(svg).toContain('width="600" height="600" viewBox="0 0 600 600"');
    expect(svg).toContain('viewBox="0 0 1200 630" preserveAspectRatio="xMidYMid meet"');
  });
});
