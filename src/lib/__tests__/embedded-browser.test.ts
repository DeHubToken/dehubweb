import { describe, expect, it } from 'vitest';
import { embeddedBrowserApp, systemBrowserUrl } from '../embedded-browser';

const UA = {
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 12; SM-A515F Build/SP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/108.0.5359.128 Mobile Safari/537.36 Instagram 262.0.0.20.109 Android',
  facebookIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 [FBAN/FBIOS;FBAV/446.0.0.35.108;]',
  tiktok: 'Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 trill_330004 BytedanceWebview/d8a21c6',
  xIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 Twitter for iPhone/10.31',
  plainWebView: 'Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};

describe('embedded browser detection', () => {
  it('names the social app whose browser this is', () => {
    expect(embeddedBrowserApp(UA.instagramAndroid)).toBe('Instagram');
    expect(embeddedBrowserApp(UA.facebookIos)).toBe('Facebook');
    expect(embeddedBrowserApp(UA.tiktok)).toBe('TikTok');
    expect(embeddedBrowserApp(UA.xIos)).toBe('X');
    expect(embeddedBrowserApp(UA.plainWebView)).toBe('');
  });

  it('leaves real browsers alone', () => {
    for (const ua of [UA.chromeAndroid, UA.samsung, UA.safariIos, UA.desktop]) {
      expect(embeddedBrowserApp(ua)).toBeNull();
    }
  });
});

describe('opening the real browser', () => {
  it('hands Android an intent that falls back to the same page', () => {
    expect(systemBrowserUrl('https://dehub.io/app?x=1', UA.instagramAndroid)).toBe(
      'intent://dehub.io/app?x=1#Intent;scheme=https;S.browser_fallback_url=https%3A%2F%2Fdehub.io%2Fapp%3Fx%3D1;end',
    );
  });

  it('asks iOS for Safari', () => {
    expect(systemBrowserUrl('https://dehub.io/app', UA.facebookIos)).toBe('x-safari-https://dehub.io/app');
  });

  it('has nothing to offer on desktop', () => {
    expect(systemBrowserUrl('https://dehub.io/app', UA.desktop)).toBeNull();
  });
});
