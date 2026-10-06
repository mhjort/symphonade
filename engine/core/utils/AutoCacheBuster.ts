/**
 * Retired, kept as an empty module.
 *
 * Engines before this change imported it from GameTemplate for its side effect: registering
 * `/sw-cache-buster.js`, a service worker meant to keep `work/` modules fresh on localhost. Its
 * fallbacks never ran or threw, the worker was not needed (GenreLoader's `?t=` already makes every
 * load unique, and the dev servers send no-store/no-cache), and it spread into every export lane.
 *
 * The path stays because CLIs older than the minimum-CLI gate (W0.10) require `core/` in the
 * engine bundle (`assertEngineBundleComplete`), and the scaffold's `core` alias points here. It
 * goes, with `core/`, once the minimum CLI treats the directory as optional.
 */
export {};
