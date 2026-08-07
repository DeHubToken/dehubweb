/**
 * Deployed-version watcher
 * ========================
 * Notices when the live deploy has moved on from the build this tab is running,
 * so a long-lived session can be told to refresh instead of quietly running
 * week-old code until a dead chunk forces the issue.
 *
 * Each build writes dist/version.json (see vite.config's build-version plugin)
 * and compiles its own id in as `__BUILD_ID__`. A mismatch between the two means
 * a newer build is live. The manifest also carries that build's one-line summary
 * and its GitHub link, which is why the toast can say what changed — those
 * fields describe the NEW build, so they have to come off the wire.
 *
 * Deliberately quiet:
 *   - hidden tabs never poll, and the first check is a full interval after boot
 *     (a tab that just loaded is by definition running what was live).
 *   - one notification per session. Having been told once, a user who keeps
 *     browsing has made their choice; a second deploy will not re-nag them.
 *   - a build with no id disables the whole thing rather than prompting for a
 *     refresh that could never satisfy the comparison.
 *
 * @module lib/version-check
 */

export type BuildVersion = {
  /** Short commit sha of the deployed build. */
  id: string;
  /** One-line summary — the merged PR's title, or the commit subject. */
  note: string;
  /** GitHub URL for the PR that shipped it, or the commit if there wasn't one. */
  url: string;
};

/**
 * `typeof` rather than a bare read: vitest.config doesn't load the plugin that
 * defines this, so under test the identifier does not exist at all.
 */
const RUNNING_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '';

const MANIFEST_URL = '/version.json';
/**
 * Gap between polls in a visible tab, and — since the first tick is a full
 * interval after boot — the worst-case delay before a desktop tab hears about a
 * deploy. A tab that is switched away from and back finds out sooner, because
 * the visibility check fires immediately; at 15 minutes a desktop tab nobody
 * touches was effectively waiting on that tab switch instead.
 */
const POLL_MS = 3 * 60_000;
/** Floor between two network checks, so tab-switching can't turn into a spam loop. */
const MIN_GAP_MS = 60_000;
const NOTIFIED_KEY = 'version-notified-id';

async function fetchDeployedVersion(): Promise<BuildVersion | null> {
  try {
    // Cache-busting param AND no-store. public/_headers already marks this file
    // no-store, but a cached manifest is indistinguishable from "you're up to
    // date" — which is the one answer this request exists to disprove — so it
    // is worth being unambiguous at both ends.
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<BuildVersion> | null;
    if (!data || typeof data.id !== 'string' || !data.id) return null;
    return {
      id: data.id,
      note: typeof data.note === 'string' ? data.note : '',
      url: typeof data.url === 'string' ? data.url : '',
    };
  } catch {
    // Offline, or the SPA catch-all answered with index.html and the JSON parse
    // threw. Neither is worth surfacing — the next poll tries again.
    return null;
  }
}

/**
 * Starts watching for a newer deploy. `onUpdate` fires at most once, with the
 * newly deployed build's details. Returns a cleanup that stops the watch.
 */
export function startVersionWatch(onUpdate: (version: BuildVersion) => void): () => void {
  const noop = () => {};
  if (typeof window === 'undefined') return noop;
  // Dev serves no manifest, and the id would be a working-tree sha anyway.
  if (!import.meta.env.PROD) return noop;
  if (!RUNNING_ID) return noop;

  let stopped = false;
  let lastCheck = 0;
  let timer = 0;

  function stop() {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  async function check() {
    if (stopped) return;
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastCheck < MIN_GAP_MS) return;
    lastCheck = Date.now();

    const deployed = await fetchDeployedVersion();
    if (stopped || !deployed || deployed.id === RUNNING_ID) return;

    // Stop before notifying: this is a one-shot, and the caller shows a toast
    // that stays up until it's acted on.
    stop();

    try {
      // Survives an SPA-level remount of the watcher within the same session.
      if (sessionStorage.getItem(NOTIFIED_KEY) === deployed.id) return;
      sessionStorage.setItem(NOTIFIED_KEY, deployed.id);
    } catch {
      // Private mode / storage disabled — notify anyway, the watch has stopped.
    }

    onUpdate(deployed);
  }

  function onVisibilityChange() {
    void check();
  }

  timer = window.setInterval(() => void check(), POLL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return stop;
}
