export const BUY_PATHS = ['/app/buy', '/buy'];

export function isBuyRoute(pathname: string): boolean {
  return BUY_PATHS.includes(pathname.replace(/\/+$/, ''));
}
