import { describe, expect, it } from 'vitest';
import { applyNavOrder, mergeNavOrder, sanitiseNavOrder } from '@/lib/nav-order';
import { NAV_ITEMS } from '@/constants/app.constants';
import { navItemId } from '@/components/app/navigation/nav-item-id';

const id = (s: string) => s;

describe('nav order', () => {
  it('keeps the default order when nothing is saved', () => {
    expect(applyNavOrder(['a', 'b', 'c'], [], id)).toEqual(['a', 'b', 'c']);
  });

  it('applies a saved order and slots new items after their default neighbour', () => {
    expect(applyNavOrder(['a', 'b', 'new', 'c'], ['c', 'a', 'b'], id)).toEqual(['c', 'a', 'b', 'new']);
    expect(applyNavOrder(['first', 'a', 'b'], ['b', 'a'], id)).toEqual(['first', 'b', 'a']);
  });

  it('ignores saved ids that no longer exist', () => {
    expect(applyNavOrder(['a', 'b'], ['gone', 'b', 'a'], id)).toEqual(['b', 'a']);
  });

  it('keeps hidden ids in place when saving a filtered drag', () => {
    // "x" was hidden (kids mode / other platform) between a and b.
    expect(mergeNavOrder(['a', 'x', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'x', 'b']);
    expect(mergeNavOrder(['x', 'a', 'b'], ['b', 'a'])).toEqual(['x', 'b', 'a']);
  });

  it('sanitises junk from the account blob', () => {
    expect(sanitiseNavOrder(['a', 'a', 3, '', null, 'b'])).toEqual(['a', 'b']);
    expect(sanitiseNavOrder('nope')).toEqual([]);
  });

  it('gives every menu destination its own id', () => {
    const ids = NAV_ITEMS.map(navItemId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
