import { describe, expect, it } from 'vitest';
import { profileFieldLinks } from '../../server/profile-fields.js';

describe('profile field links for rel="me"', () => {
  it('lists the https links among the fields and nothing else', () => {
    expect(
      profileFieldLinks({
        profileFields: [
          { name: 'Mastodon', value: 'https://mastodon.social/@alice' },
          { name: 'Pronouns', value: 'she/her' },
          { name: 'Old site', value: 'http://alice.example' },
          { name: 'Site', value: 'https://alice.example/' },
        ],
      }),
    ).toEqual(['https://mastodon.social/@alice', 'https://alice.example/']);
  });

  it('copes with an account that has no fields, or none at all', () => {
    expect(profileFieldLinks({})).toEqual([]);
    expect(profileFieldLinks(null)).toEqual([]);
    expect(profileFieldLinks({ profileFields: 'nope' })).toEqual([]);
  });
});
