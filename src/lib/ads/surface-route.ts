export function isAdSurfaceRouteVisible(surface: string, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (surface === 'related') return /^\/(?:app\/)?(?:post|video)\//.test(path) || path.startsWith('/posts/');
  return ['/', '/app', '/videos', '/shorts'].includes(path);
}
