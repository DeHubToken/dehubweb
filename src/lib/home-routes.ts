/**
 * Home-feed routes
 * ================
 * The home feed is reachable under several paths — the marketing root, the app
 * root, and the two content shortcuts — all backed by the same cached HomePage
 * instance. Anything that has to treat "is the home feed on screen" as a single
 * question reads it from here.
 *
 * This lived in three places (AppLayout, FriendsOnStageBar, HomeFeed) behind a
 * "keep in sync" comment. It is one list.
 *
 * The gate matters beyond layout: PersistentPageCache never unmounts a visited
 * page, so a poll inside HomeFeed keeps running from every other page in the
 * app unless it checks the route.
 *
 * @module lib/home-routes
 */

/** '/app/' (trailing slash) renders the home feed too — routers hand it through as-is. */
export const HOME_FEED_ROUTES = new Set(['/', '/app', '/app/', '/videos', '/shorts']);

export const isHomeFeedRoute = (pathname: string | null | undefined): boolean =>
  !!pathname && HOME_FEED_ROUTES.has(pathname);
