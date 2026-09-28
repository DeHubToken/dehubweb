/**
 * Where DeHub Builder apps live.
 *
 * Builds are started from Messages now — @assistant calls the builder-api
 * function on the user's behalf — so the web client no longer talks to it. What
 * is left is the public address a generated app is served from, which the
 * /builder/preview/:id renderer needs.
 */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://aigxuutjaqsywioxjefr.supabase.co";

/** Public Storage directory the generated files live in (trailing slash). */
export function builderStorageBase(projectId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/builder-apps/${projectId}/`;
}
