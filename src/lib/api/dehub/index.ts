/**
 * DeHub API - Barrel Re-export
 * ============================
 * All domain modules are re-exported here for backward compatibility.
 * Consumer files continue importing from '@/lib/api/dehub' unchanged.
 */

export * from './core';
export * from './types';
export * from './auth';
export * from './users';
export * from './feed';
export * from './social';
export * from './comments';
export * from './notifications';
export * from './reports';
export * from './dm';
export * from './livestream';
export * from './content';
export * from './subscriptions';
export * from './livechat';
export * from './leaderboard';
export * from './blocks';
export * from './push';
// Both ./notifications and ./push declare NotificationCategory; the notifications
// one is the canonical public type, so re-export it explicitly to disambiguate.
export type { NotificationCategory } from './notifications';
export * from './sessions';
export * from './payments';
export * from './bookmarks';
export * from './pins';
export * from './polls';
export * from './og-image';
export * from './solana';
export * from './admin';
export * from './superpowers';
