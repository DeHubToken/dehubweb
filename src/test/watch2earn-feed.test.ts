import { describe, expect, it, vi } from 'vitest';
import { mapToVideoItem, type UnifiedFeedItem } from '@/hooks/use-unified-feed';
import { mapNFTToVideoItem } from '@/hooks/use-dehub-feed';
import type { DeHubNFT } from '@/lib/api/dehub';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({}) }));

// The feed API returns streamInfo, without the legacy is_w2e alias.
const bounty = {
  tokenId: 742,
  name: 'The Island',
  postType: 'video',
  createdAt: '2023-08-14T01:31:26.051Z',
  streamInfo: {
    isAddBounty: true,
    addBountyAmount: 7500,
    addBountyTokenSymbol: 'DHB',
    addBountyFirstXViewers: '15',
    addBountyFirstXComments: '15',
  },
};

describe('Watch2Earn feed metadata', () => {
  for (const [name, map] of [
    ['unified feed', (item: unknown) => mapToVideoItem(item as UnifiedFeedItem, 0)],
    ['video feed', (item: unknown) => mapNFTToVideoItem(item as DeHubNFT, 0)],
  ] as const) {
    it(`${name} preserves the bounty flag and reward details`, () => {
      expect(map(bounty)).toMatchObject({
        isW2E: true,
        bountyAmount: 7500,
        bountyCurrency: 'DHB',
        bountyViews: 15,
        bountyComments: 15,
      });
    });

    it(`${name} recognises the legacy flag without marking ordinary videos`, () => {
      expect(map({ ...bounty, streamInfo: undefined, is_w2e: true }).isW2E).toBe(true);
      expect(map({ ...bounty, streamInfo: undefined }).isW2E).toBe(false);
    });
  }
});
