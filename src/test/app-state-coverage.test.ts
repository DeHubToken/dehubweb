import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATED_SURFACES = [
  'src/components/app/feeds/HomeFeed.tsx',
  'src/components/app/feeds/ImagesFeed.tsx',
  'src/components/app/feeds/VideosFeed.tsx',
  'src/components/app/feeds/ShortsFeed.tsx',
  'src/components/app/bookmarks/BookmarksEmptyContent.tsx',
  'src/components/app/profile/ProfileEmptyState.tsx',
  'src/components/app/communities/CommunityChat.tsx',
  'src/components/app/communities/CommunityEvents.tsx',
  'src/components/app/communities/CommunityMembers.tsx',
  'src/components/app/communities/manage/MembersTab.tsx',
  'src/components/app/chat/DirectMessageChat.tsx',
  'src/components/app/chat/PublicChat.tsx',
  'src/pages/app/MessagesPage.tsx',
  'src/pages/app/BridgePage.tsx',
  'src/pages/app/Top100CryptosPage.tsx',
];

describe('universal app state coverage', () => {
  it('keeps high-traffic empty and error surfaces on AppState', () => {
    for (const file of MIGRATED_SURFACES) {
      const source = readFileSync(resolve(__dirname, '../..', file), 'utf8');
      expect(source, file).toContain('<AppState');
    }
  });

  it('defines the accessibility and size contracts centrally', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/components/app/AppState.tsx'),
      'utf8',
    );
    for (const kind of ['empty', 'search-empty', 'error', 'restricted']) {
      expect(source).toContain(`'${kind}'`);
    }
    for (const size of ['page', 'section', 'drawer', 'compact']) {
      expect(source).toContain(`'${size}'`);
    }
    expect(source).toContain("role={isError ? 'alert' : 'status'}");
  });
});
