import { describe, expect, it } from 'vitest';
import { collectWebDeviceInfo, parseUserAgent, scrubText } from '@/lib/device-info';

describe('request device info', () => {
  it('names browser and OS from common user agents', () => {
    expect(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'))
      .toEqual({ browser: 'Safari 17.4', os: 'iOS 17.4' });
    expect(parseUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'))
      .toEqual({ browser: 'Samsung Internet 25.0', os: 'Android 14' });
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'))
      .toEqual({ browser: 'Chrome 130.0.0.0', os: 'Windows 10/11' });
  });

  it('keeps query strings, tokens and long hex out of error text', () => {
    const out = scrubText('fetch https://api.riftn.com/x?token=abc failed eyJa.eyJb.sig 0x' + 'a'.repeat(64));
    expect(out).not.toContain('token=abc');
    expect(out).not.toContain('eyJa');
    expect(out).toContain('https://api.riftn.com/x');
  });

  it('never sends the page query string', () => {
    window.history.replaceState(null, '', '/app/features?secret=1#x');
    const info = collectWebDeviceInfo({ username: 'mal' });
    expect(String(info.page)).not.toContain('secret');
    expect(info.username).toBe('mal');
    expect(info.source).toBe('web');
  });
});
