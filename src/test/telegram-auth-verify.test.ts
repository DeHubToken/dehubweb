import { describe, expect, it } from 'vitest';
import {
  authDateIsFresh,
  buildDataCheckString,
  decodeTgAuthResult,
  parseBotToken,
  signDataCheckString,
  verifyTelegramPayload,
} from '../../supabase/functions/telegram-auth/verify';
import { sameOriginPath } from '../lib/safe-redirect';

/** Shaped like a BotFather token; never issued, and only ever used here. */
const BOT_TOKEN = '7788990011:AAG-test-token-not-a-real-secret';

/** Sign a payload the way Telegram would, so the test has something genuine. */
async function sign(fields: Record<string, unknown>) {
  const hash = await signDataCheckString(buildDataCheckString(fields), BOT_TOKEN);
  return { ...fields, hash };
}

const FULL = {
  id: 123456789,
  first_name: 'Ada',
  last_name: 'Lovelace',
  username: 'ada',
  photo_url: 'https://t.me/i/userpic/320/ada.jpg',
  auth_date: 1770000000,
};

describe('telegram-auth signature check', () => {
  it('accepts a payload signed with the bot token', async () => {
    await expect(verifyTelegramPayload(await sign(FULL), BOT_TOKEN)).resolves.toBe(true);
  });

  /**
   * The failure mode this whole file exists for. Roughly a third of Telegram
   * accounts have no @username and many have no picture; if absent fields were
   * padded into the data check string as empty values, every one of those
   * logins would fail while the complete ones passed — which reads exactly
   * like a bad bot token.
   */
  it('accepts an account with no username and no photo', async () => {
    const sparse = { id: 42, first_name: 'Ada', auth_date: 1770000000 };
    expect(buildDataCheckString(sparse)).toBe('auth_date=1770000000\nfirst_name=Ada\nid=42');
    await expect(verifyTelegramPayload(await sign(sparse), BOT_TOKEN)).resolves.toBe(true);
  });

  it('orders the data check string by key, not by the order the fields arrived', () => {
    expect(buildDataCheckString(FULL).split('\n')).toEqual([
      'auth_date=1770000000',
      'first_name=Ada',
      'id=123456789',
      'last_name=Lovelace',
      'photo_url=https://t.me/i/userpic/320/ada.jpg',
      'username=ada',
    ]);
  });

  it('rejects a payload whose fields were edited after signing', async () => {
    const signed = await sign(FULL);
    await expect(verifyTelegramPayload({ ...signed, id: 987654321 }, BOT_TOKEN)).resolves.toBe(false);
    await expect(verifyTelegramPayload({ ...signed, username: 'someone_else' }, BOT_TOKEN)).resolves.toBe(false);
  });

  it('rejects a payload signed with a different bot token', async () => {
    const signed = await sign(FULL);
    await expect(verifyTelegramPayload(signed, `${BOT_TOKEN}x`)).resolves.toBe(false);
  });

  // An unsigned object is the shape an attacker can produce for free, so the
  // absent/short/garbage hash cases matter as much as the wrong-hash one.
  it('rejects a missing, short or non-hex hash without hashing anything', async () => {
    for (const hash of [undefined, '', 'abc', 'z'.repeat(64), '0'.repeat(63)]) {
      await expect(verifyTelegramPayload({ ...FULL, hash }, BOT_TOKEN)).resolves.toBe(false);
    }
  });

  it('accepts the hash in either case', async () => {
    const signed = await sign(FULL);
    const upper = { ...signed, hash: String(signed.hash).toUpperCase() };
    await expect(verifyTelegramPayload(upper, BOT_TOKEN)).resolves.toBe(true);
  });
});

describe('telegram-auth bot token parsing', () => {
  it('reads a clean token', () => {
    expect(parseBotToken('8123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw')).toEqual({
      token: '8123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',
      botId: '8123456789',
    });
  });

  /**
   * What actually happens when somebody configures this: BotFather delivers
   * the token inside a paragraph, and the paragraph is what gets pasted. The
   * old code took everything before the first colon as the bot id, so the
   * public config endpoint served "Done! Congratulations on your new bot…"
   * as a bot id and every login died at Telegram.
   */
  it('pulls the token out of the whole BotFather message', () => {
    const blob = [
      'Done! Congratulations on your new bot. You will find it at t.me/DeHub_Signup_Bot.',
      'You can now add a description, about section and profile picture for your bot, see /help.',
      '',
      'Use this token to access the HTTP API:',
      '8123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',
      'Keep your token secure and store it safely, it can be used by anyone to control your bot.',
    ].join('\n');
    expect(parseBotToken(blob)).toEqual({
      token: '8123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',
      botId: '8123456789',
    });
  });

  it('tolerates surrounding whitespace and quotes', () => {
    expect(parseBotToken('  "8123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"  ')?.botId).toBe('8123456789');
  });

  // Null is what keeps the button off the sheet. Anything that is not a token
  // has to read as "not configured", never as "configured badly".
  it('returns null for anything that is not a token', () => {
    for (const raw of [
      undefined,
      null,
      '',
      '   ',
      'not-a-token',
      'DeHub_Signup_Bot',
      'https://t.me/DeHub_Signup_Bot',
      '123:short',
      'abc:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',
    ]) {
      expect(parseBotToken(raw)).toBeNull();
    }
  });
});

describe('telegram-auth payload decoding', () => {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

  it('reads a non-ASCII name back intact', () => {
    const payload = { id: 7, first_name: 'Данила', last_name: '陳', auth_date: 1770000000 };
    expect(decodeTgAuthResult(encode(payload))).toEqual(payload);
  });

  it('reads base64url, which is what lands in a URL fragment', () => {
    const payload = { id: 7, first_name: 'Ada', photo_url: 'https://t.me/i/a?b=c+d/e' };
    const url = encode(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeTgAuthResult(url)).toEqual(payload);
  });

  it('returns null for anything that is not a JSON object', () => {
    expect(decodeTgAuthResult('not base64 at all !!')).toBeNull();
    expect(decodeTgAuthResult(encode([1, 2, 3]))).toBeNull();
    expect(decodeTgAuthResult(encode('a string'))).toBeNull();
  });
});

describe('telegram-auth freshness', () => {
  const NOW = 1770000000;

  it('accepts a payload from a moment ago and refuses one from two days ago', () => {
    expect(authDateIsFresh(NOW - 5, NOW)).toBe(true);
    expect(authDateIsFresh(NOW - 86399, NOW)).toBe(true);
    expect(authDateIsFresh(NOW - 172800, NOW)).toBe(false);
  });

  it('tolerates a clock a few minutes fast but not a payload from the future', () => {
    expect(authDateIsFresh(NOW + 60, NOW)).toBe(true);
    expect(authDateIsFresh(NOW + 3600, NOW)).toBe(false);
  });

  it('refuses a missing or nonsense auth_date', () => {
    for (const value of [undefined, null, 0, -1, 'soon', NaN]) {
      expect(authDateIsFresh(value, NOW)).toBe(false);
    }
  });
});

/**
 * The return path both auth landing pages take. It reads `?next=` out of a URL
 * somebody else wrote, so an off-site value has to land on /app rather than
 * navigate there — backslash spellings included, which the obvious
 * startsWith('/') check lets straight through.
 */
describe('sameOriginPath', () => {
  it('keeps a path on this origin, with its query and hash', () => {
    expect(sameOriginPath('/app/messages?tab=1#top')).toBe('/app/messages?tab=1#top');
    expect(sameOriginPath(`${window.location.origin}/app/stores`)).toBe('/app/stores');
  });

  it('sends anything off-site to /app', () => {
    for (const next of [
      'https://evil.com/steal',
      '//evil.com',
      '/\\evil.com',
      '\\\\evil.com',
      'https:/evil.com',
      'javascript:alert(1)',
    ]) {
      expect(sameOriginPath(next)).toBe('/app');
    }
  });

  // A percent-encoded backslash is NOT a path separator, so this one resolves
  // to a (meaningless) path on our own origin and is safe to return as-is.
  // Asserted so a future "tighten the check" rewrite has to stay deliberate
  // about the difference rather than discovering it as a bug.
  it('leaves a percent-encoded backslash as an on-origin path', () => {
    const resolved = sameOriginPath('/%5Cevil.com');
    expect(new URL(resolved, window.location.origin).origin).toBe(window.location.origin);
  });

  it('sends an absent or unparseable value to /app', () => {
    expect(sameOriginPath(null)).toBe('/app');
    expect(sameOriginPath('')).toBe('/app');
  });
});
