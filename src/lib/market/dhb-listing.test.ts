import { describe, expect, it } from 'vitest';
import { isDhbListingQuery, isValidListingEmail } from './dhb-listing';

describe('isDhbListingQuery', () => {
  it('matches the DHB cashtags and the bare ticker', () => {
    expect(isDhbListingQuery('$DHB')).toBe(true);
    expect(isDhbListingQuery('$dhb')).toBe(true);
    expect(isDhbListingQuery('$DEHUB')).toBe(true);
    expect(isDhbListingQuery('  dhb ')).toBe(true);
  });

  it('matches a DHB contract address in any case', () => {
    expect(isDhbListingQuery('0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c')).toBe(true);
    expect(isDhbListingQuery('0xd20ab1015f6a2de4a6fddebab270113f689c2f7c')).toBe(true);
  });

  it('leaves other searches alone', () => {
    expect(isDhbListingQuery('dehub')).toBe(false); // brand search for @d
    expect(isDhbListingQuery('$BTC')).toBe(false);
    expect(isDhbListingQuery('$DHBX')).toBe(false);
    expect(isDhbListingQuery('')).toBe(false);
  });
});

describe('isValidListingEmail', () => {
  it('accepts real addresses and rejects junk and synthetic ones', () => {
    expect(isValidListingEmail('a@b.co')).toBe(true);
    expect(isValidListingEmail(' Mal@Example.com ')).toBe(true);
    expect(isValidListingEmail('not-an-email')).toBe(false);
    expect(isValidListingEmail('x@phone.dehub.internal')).toBe(false);
  });
});
