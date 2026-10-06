/**
 * The engine's own version, known at run time.
 *
 * Engine releases are `3.<run_number>` of the deploy workflow. The committed value is
 * 'dev'; that workflow stamps the real one (`game/scripts/stamp-engine-version.mjs`)
 * before it builds the Creator image and packs the engine tarball, so the Creator, every
 * CLI project that vendors the engine and every game published from either carry the
 * version they were built from. A local or unreleased build says 'dev'.
 *
 * Until the engine has semver (W6.4 of the open-source plan), "one engine version" means
 * one tagged `3.x` release (decision D23).
 */
export const ENGINE_VERSION: string = '3.1287';

/** True for a build that came from a tagged engine release rather than a local checkout. */
export function isReleasedEngineVersion(version: string = ENGINE_VERSION): boolean {
    return /^\d+\.\d+/.test(version);
}
