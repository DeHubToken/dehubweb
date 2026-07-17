// Returns the current launchpad base path so the same pages work
// at both /launchpad and /app/launchpad.
export function getLaunchpadBase(pathname: string): string {
  return pathname.startsWith('/app/launchpad') ? '/app/launchpad' : '/launchpad';
}
