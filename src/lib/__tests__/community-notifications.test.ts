import { describe, it, expect } from 'vitest';
import {
  communityNotificationMatches,
  communityNotificationPath,
  communityNotificationPreview,
  communityNotificationRefs,
  communityNotificationSentence,
  isCommunityJoinRequest,
  isCommunityNotificationType,
} from '@/lib/community-notifications';
import type { DeHubNotification } from '@/lib/api/dehub/notifications';

/** The i18next call shape, standing in for a locale that has none of the keys. */
const untranslated = (key: string) => key;

// The community types live outside the API's NotificationType union, which is
// the point of the module under test — so the fixture is typed loosely.
function row(overrides: Record<string, unknown> = {}): DeHubNotification {
  return {
    _id: 'custom_1',
    id: 'custom_1',
    address: '0xowner',
    type: 'community_join',
    category: 'engagement',
    content: 'joined your community',
    read: false,
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
    actorAddress: '0xactor',
    _customReferenceId: 'dehub-whales',
    _customReferenceTitle: 'DeHub Whales',
    ...overrides,
  } as unknown as DeHubNotification;
}

describe('community notification types', () => {
  it('claims exactly the three community types', () => {
    expect(isCommunityNotificationType('community_join')).toBe(true);
    expect(isCommunityNotificationType('community_mention')).toBe(true);
    expect(isCommunityNotificationType('community_here')).toBe(true);
    expect(isCommunityNotificationType('like')).toBe(false);
    expect(isCommunityNotificationType(undefined)).toBe(false);
  });
});

describe('matching a row to its community', () => {
  const community = { id: '4B90ED80-E073-4A0B-9789-61200B1BDB32', slug: 'dehub-whales' };

  // The join trigger has stored both forms, so both have to resolve — matching
  // only one is what silently emptied the Communities page's Activity tab.
  it('matches on the slug and on the uuid, either case', () => {
    expect(communityNotificationMatches('dehub-whales', community)).toBe(true);
    expect(communityNotificationMatches('4b90ed80-e073-4a0b-9789-61200b1bdb32', community)).toBe(true);
    expect(communityNotificationMatches('DeHub-Whales', community)).toBe(true);
  });

  it('does not match another community, or nothing at all', () => {
    expect(communityNotificationMatches('dehub-assassins', community)).toBe(false);
    expect(communityNotificationMatches(null, community)).toBe(false);
    expect(communityNotificationMatches('dehub-whales', null)).toBe(false);
  });

  it('offers both forms for an `in (…)` filter, lowercased', () => {
    expect(communityNotificationRefs(community)).toEqual([
      'dehub-whales',
      '4b90ed80-e073-4a0b-9789-61200b1bdb32',
    ]);
    expect(communityNotificationRefs({ slug: 'solo' })).toEqual(['solo']);
    expect(communityNotificationRefs(null)).toEqual([]);
  });
});

describe('where a community row goes', () => {
  it('opens the community it names', () => {
    expect(communityNotificationPath('dehub-whales')).toBe('/app/communities/dehub-whales');
  });

  it('falls back to the list rather than a broken URL', () => {
    expect(communityNotificationPath(undefined)).toBe('/app/communities');
  });
});

describe('join requests', () => {
  it('reads the predicate the trigger stores', () => {
    expect(isCommunityJoinRequest(row({ content: 'requested to join your community' }))).toBe(true);
    expect(isCommunityJoinRequest(row({ content: 'joined your community' }))).toBe(false);
    expect(isCommunityJoinRequest(row({ type: 'community_mention', content: 'requested to join your community' }))).toBe(false);
  });
});

describe('the sentence a row renders', () => {
  // A locale with none of these keys must still print English, not the key.
  it('falls back to English and interpolates it', () => {
    expect(communityNotificationSentence(row(), 'alice', untranslated))
      .toBe('alice joined “DeHub Whales”');
  });

  it('names the action a request rather than a join', () => {
    expect(communityNotificationSentence(row({ content: 'requested to join your community' }), 'alice', untranslated))
      .toBe('alice asked to join “DeHub Whales”');
  });

  it('drops the community when the surface already names it', () => {
    expect(communityNotificationSentence(row(), 'alice', untranslated, { withCommunity: false }))
      .toBe('alice joined your community');
  });

  // These used to fall through the bell's default branch and render the bare
  // chat message with no subject.
  it('gives mentions and @here a subject', () => {
    expect(communityNotificationSentence(row({ type: 'community_mention', content: 'hey @bob' }), 'alice', untranslated))
      .toBe('alice mentioned you in “DeHub Whales”');
    expect(communityNotificationSentence(row({ type: 'community_here', content: 'raid at 8' }), 'alice', untranslated))
      .toBe('alice messaged everyone in “DeHub Whales”');
  });

  it('uses a translation when the locale has one', () => {
    const t = (key: string, opts?: Record<string, unknown>) =>
      key === 'notifications.community.joinedNamed' ? `${opts?.name} ist ${opts?.community} beigetreten` : key;
    expect(communityNotificationSentence(row(), 'alice', t)).toBe('alice ist DeHub Whales beigetreten');
  });
});

describe('the quoted preview under the sentence', () => {
  it('carries the chat message for mentions and @here', () => {
    expect(communityNotificationPreview(row({ type: 'community_mention', content: 'hey @bob' }))).toBe('hey @bob');
    expect(communityNotificationPreview(row({ type: 'community_here', content: 'raid at 8' }))).toBe('raid at 8');
  });

  // A join's content is the predicate the sentence already spent, and every
  // other type's content belongs to the bell's own resolver.
  it('is empty for joins and for anything that is not a community row', () => {
    expect(communityNotificationPreview(row())).toBeUndefined();
    expect(communityNotificationPreview(row({ type: 'like', content: 'alice reacted to your post' }))).toBeUndefined();
  });
});
