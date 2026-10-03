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
 * Hidden tabs do not poll. Check at boot and on return, then keep watching
 * for later deploys. Only an explicit dismissal suppresses that deploy's notice;
 * mounting a toast is not proof that the user saw it.
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
/** Poll visible pages once a minute; boot and foreground return check sooner. */
const POLL_MS = 60_000;
/** Floor between two network checks, so tab-switching can't turn into a spam loop. */
const MIN_GAP_MS = 15_000;
const DISMISSED_KEY = 'version-dismissed-id';
/** The deploy id this session already reloaded itself onto, so it never loops. */
const RELOADED_KEY = 'version-reloaded-id';

/**
 * The newer deploy the watcher has seen, if any. Kept apart from the toast's
 * presentation: the toast can be dismissed or never noticed on a phone, and a tab
 * that lives for days in a mobile browser then keeps drawing last week's pages.
 */
let newerDeployId: string | null = null;

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

/** The build id compiled into the bundle this tab is running. '' when unbuilt. */
export function getRunningBuildId(): string {
  return RUNNING_ID;
}

/** Only the user's close action dismisses a notice, never a temporary unmount. */
export function dismissVersionUpdate(id: string): void {
  try { sessionStorage.setItem(DISMISSED_KEY, id); } catch { /* Storage is optional. */ }
}

/**
 * Is this tab running a build the deploy has already moved past?
 *
 * `null` means unanswerable — dev, no compiled id, or the manifest didn't load
 * — and callers must treat that as "don't know" rather than "no". The watcher
 * above asks the same question on a timer to nag about updates; this asks it on
 * demand, at the moment something has just failed, so that a failure caused by
 * week-old code in a long-lived tab can be named as such instead of blamed on
 * the user. This check is independent of notice delivery and dismissal.
 */
export async function isRunningStaleBuild(): Promise<boolean | null> {
  if (typeof window === 'undefined') return null;
  if (!import.meta.env.PROD) return null;
  if (!RUNNING_ID) return null;

  const deployed = await fetchDeployedVersion();
  if (!deployed) return null;

  return deployed.id !== RUNNING_ID;
}

/**
 * Starts watching for newer deploys. Notify once per observed id in this mount,
 * and keep watching for subsequent deploys. Returns a cleanup that stops it.
 */
export function startVersionWatch(onUpdate: (version: BuildVersion) => void): () => void {
  const noop = () => {};
  if (typeof window === 'undefined') return noop;
  // Dev serves no manifest, and the id would be a working-tree sha anyway.
  if (!import.meta.env.PROD) return noop;
  if (!RUNNING_ID) return noop;

  let stopped = false;
  let lastCheck = -Infinity;
  let inFlight = false;
  let notifiedId = '';
  let timer = 0;

  function stop() {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onVisibilityChange);
    window.removeEventListener('online', onVisibilityChange);
  }

  async function check() {
    if (stopped || inFlight) return;
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastCheck < MIN_GAP_MS) return;
    lastCheck = Date.now();
    inFlight = true;
    const deployed = await fetchDeployedVersion();
    inFlight = false;
    if (stopped || !deployed || deployed.id === RUNNING_ID) return;
    newerDeployId = deployed.id;

    if (notifiedId === deployed.id) return;
    try {
      if (sessionStorage.getItem(DISMISSED_KEY) === deployed.id) return;
    } catch {
      // Private mode / storage disabled — notify anyway.
    }
    notifiedId = deployed.id;
    onUpdate(deployed);
  }

  function onVisibilityChange() {
    void check();
  }

  timer = window.setInterval(() => void check(), POLL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onVisibilityChange);
  window.addEventListener('online', onVisibilityChange);
  void check();

  return stop;
}

/**
 * Should this navigation load the page fresh instead of rendering it with the
 * old build? True once per newer deploy the watcher has seen. Moving between
 * pages is the moment a reload costs nothing: the old page is going away anyway
 * and nothing typed on it survives the route change either. Returns false after
 * the first time for a given deploy, so an edge that still serves the old HTML
 * cannot turn every tap into a reload.
 */
export function takeStaleReload(): boolean {
  if (!newerDeployId) return false;
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === newerDeployId) return false;
    sessionStorage.setItem(RELOADED_KEY, newerDeployId);
  } catch {
    // No storage means no loop guard across the reload: skip it, the toast
    // still offers the refresh.
    return false;
  }
  return true;
}
