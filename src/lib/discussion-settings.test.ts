import { describe, expect, it } from 'vitest';
import { resolveDiscussionSettings, DEFAULT_DISCUSSION_SETTINGS } from './discussion-settings';

const MINTER = '0xAbCdEf0000000000000000000000000000000001';
const STRANGER = '0x9999999999999999999999999999999999999999';

describe('resolveDiscussionSettings', () => {
  it('returns the defaults when there is no row', () => {
    expect(resolveDiscussionSettings([], MINTER)).toEqual(DEFAULT_DISCUSSION_SETTINGS);
    expect(resolveDiscussionSettings(null, MINTER)).toEqual(DEFAULT_DISCUSSION_SETTINGS);
    expect(resolveDiscussionSettings(undefined, MINTER)).toEqual(DEFAULT_DISCUSSION_SETTINGS);
  });

  it('returns the defaults until the minter is known', () => {
    const rows = [{ token_id: 1, creator_address: MINTER.toLowerCase(), common_ground: true }];
    expect(resolveDiscussionSettings(rows, null)).toEqual(DEFAULT_DISCUSSION_SETTINGS);
    expect(resolveDiscussionSettings(rows, '')).toEqual(DEFAULT_DISCUSSION_SETTINGS);
    expect(resolveDiscussionSettings(rows, '   ')).toEqual(DEFAULT_DISCUSSION_SETTINGS);
  });

  it("honours the creator's own row, whatever the casing", () => {
    const rows = [{ token_id: 1, creator_address: MINTER.toLowerCase(), common_ground: true }];
    expect(resolveDiscussionSettings(rows, MINTER)).toEqual({ commonGround: true });
    expect(resolveDiscussionSettings(rows, MINTER.toUpperCase())).toEqual({ commonGround: true });
    expect(resolveDiscussionSettings(rows, ` ${MINTER} `)).toEqual({ commonGround: true });
  });

  it("ignores a row written against somebody else's post", () => {
    const rows = [{ token_id: 1, creator_address: STRANGER, common_ground: true }];
    expect(resolveDiscussionSettings(rows, MINTER)).toEqual(DEFAULT_DISCUSSION_SETTINGS);
  });

  it("picks the creator's row when a stranger's row sits beside it", () => {
    const rows = [
      { token_id: 1, creator_address: STRANGER, common_ground: true },
      { token_id: 1, creator_address: MINTER.toLowerCase(), common_ground: false },
    ];
    expect(resolveDiscussionSettings(rows, MINTER)).toEqual({ commonGround: false });
  });

  it('treats anything but a true flag as off', () => {
    const rows = [{ token_id: 1, creator_address: MINTER, common_ground: 'yes' as unknown as boolean }];
    expect(resolveDiscussionSettings(rows, MINTER)).toEqual({ commonGround: false });
  });

  it('survives a malformed row', () => {
    const rows = [null as unknown as { token_id: number; creator_address: string; common_ground: boolean }, { token_id: 1, creator_address: 42 as unknown as string, common_ground: true }];
    expect(resolveDiscussionSettings(rows, MINTER)).toEqual(DEFAULT_DISCUSSION_SETTINGS);
  });
});
