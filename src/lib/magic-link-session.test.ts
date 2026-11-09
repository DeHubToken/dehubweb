import { describe, expect, it } from 'vitest';
import { accessTokenEmail, isSessionForEmail } from './magic-link-session';

const base64url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (claims: Record<string, unknown>) =>
  `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}.signature`;

describe('isSessionForEmail', () => {
  it('takes the session issued for the email this tab asked a link for', () => {
    expect(isSessionForEmail(token({ sub: 'u1', email: 'me@example.com' }), 'me@example.com')).toBe(true);
  });

  it('ignores letter case and spaces in the email', () => {
    expect(isSessionForEmail(token({ email: 'Me@Example.com' }), '  me@example.COM ')).toBe(true);
  });

  it('refuses a session for anyone else', () => {
    expect(isSessionForEmail(token({ sub: 'u2', email: 'someone@example.com' }), 'me@example.com')).toBe(false);
  });

  it('refuses a session that names no email', () => {
    expect(isSessionForEmail(token({ sub: 'u3', phone: '+15550000000' }), 'me@example.com')).toBe(false);
  });

  it('refuses anything that is not a token', () => {
    expect(isSessionForEmail('not-a-token', 'me@example.com')).toBe(false);
    expect(isSessionForEmail('a.%%%.b', 'me@example.com')).toBe(false);
    expect(isSessionForEmail(undefined, 'me@example.com')).toBe(false);
    expect(isSessionForEmail({ email: 'me@example.com' }, 'me@example.com')).toBe(false);
  });

  it('refuses when this tab asked for no email', () => {
    expect(isSessionForEmail(token({ email: 'me@example.com' }), '')).toBe(false);
    expect(isSessionForEmail(token({ email: 'me@example.com' }), null)).toBe(false);
  });
});

describe('accessTokenEmail', () => {
  it('reads tokens whose payload needs base64url padding', () => {
    expect(accessTokenEmail(token({ email: 'a@b.co' }))).toBe('a@b.co');
    expect(accessTokenEmail(token({ email: 'ab@b.co', x: 1 }))).toBe('ab@b.co');
  });
});
