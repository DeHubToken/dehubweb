/**
 * Usernames that collide with app routes: profiles live at dehub.io/:username,
 * and react-router ranks static routes above the dynamic segment — a user who
 * claims one of these gets a profile page that is unreachable forever.
 * (Client-side guard; the server availability check does not reject these.)
 */
export const RESERVED_USERNAMES = new Set([
  'app', 'explore', 'videos', 'shorts', 'work', 'affiliate', 'features',
  'governance', 'stake', 'communities', 'jobs', 'glossary', 'docs', 'guide',
  'guides', 'premium', 'pricing', 'connect', 'mcp', 'prompt', 'creators',
  'creator', 'editor', 'admin', 'stage', 'launchpad', 'events', 'stores',
  'settings', 'wallet', 'messages', 'notifications', 'bookmarks', 'assistant',
  'leaderboard', 'profile', 'music', 'agents', 'tv', 'buy', 'bridge',
  'delete-account', 'mobile-preview', 'r', 'blog', 'post', 'video',
]);
