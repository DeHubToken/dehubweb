/** Preserve card props across page appends; refreshed rows get new props. */
export function memoizeFeedRow<T extends object, R>(map: (row: T, index: number) => R) {
  const cache = new WeakMap<T, { index: number; minute: number; value: R }>();
  return (row: T, index: number): R => {
    // Mappers include relative timestamps, so allow those to age on a later
    // feed update without rebuilding every card for each pagination render.
    const minute = Math.floor(Date.now() / 60_000);
    const previous = cache.get(row);
    if (previous?.index === index && previous.minute === minute) return previous.value;
    const value = map(row, index);
    cache.set(row, { index, minute, value });
    return value;
  };
}
