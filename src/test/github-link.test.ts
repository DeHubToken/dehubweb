import { describe, expect, it } from 'vitest';
import { verifiedGithubUrl } from '../../server/profile-fields.js';
import { githubProfileUrl, verifiedGithubLogin } from '@/lib/github-link';

describe('verified GitHub on profiles', () => {
  it('takes only real GitHub logins', () => {
    expect(verifiedGithubLogin('octo-cat')).toBe('octo-cat');
    expect(verifiedGithubLogin('octo/../evil')).toBeUndefined();
    expect(verifiedGithubLogin('-octo')).toBeUndefined();
    expect(verifiedGithubLogin(42)).toBeUndefined();
    expect(githubProfileUrl('octocat')).toBe('https://github.com/octocat');
  });

  it('puts the verified GitHub on the server-rendered page from githubLogin only', () => {
    expect(verifiedGithubUrl({ githubLogin: 'octocat' })).toBe('https://github.com/octocat');
    expect(verifiedGithubUrl({ customs: { githubLogin: 'someone-else' } })).toBeNull();
    expect(verifiedGithubUrl({ githubLogin: 'https://evil.example' })).toBeNull();
    expect(verifiedGithubUrl(null)).toBeNull();
  });
});
