/**
 * A profile's RSS feed, as the worker serves it (server/rss-feeds.js).
 *
 * Written out here rather than imported from the worker module, which would
 * otherwise ride the boot path with every profile page for one URL.
 * src/test/rss-feeds.test.ts holds the two to the same output.
 */
export function profileFeedUrl(handle: string): string {
  return `https://dehub.io/${encodeURIComponent(String(handle).replace(/^@/, ''))}.rss`;
}
