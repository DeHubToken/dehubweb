/// <reference types="vite/client" />

/**
 * Short commit sha of the running build, injected by vite.config's
 * build-version plugin. Empty string when the build couldn't resolve one.
 *
 * Read it through lib/version-check, never directly: vitest.config does not
 * load that plugin, so the identifier is genuinely undeclared under test and
 * only a `typeof` guard is safe.
 */
declare const __BUILD_ID__: string;
