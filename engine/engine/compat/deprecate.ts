import { DEPRECATIONS, type Deprecation } from 'engine/compat/registry.js';

const warned = new Set<string>();

/**
 * Warn, once per page, that a deprecated symbol was used. Call it from the deprecated
 * member itself with its registry key; the warning says what to use instead and when the
 * symbol goes. An unknown key throws, so a deprecation cannot skip the registry.
 */
export function deprecate(key: string): void {
    if (warned.has(key)) return;
    const entry: Deprecation | undefined = DEPRECATIONS.find((d) => d.key === key);
    if (!entry) throw new Error(`deprecate('${key}'): no such entry in engine/compat/registry.ts`);
    warned.add(key);
    const when = entry.removeIn === 'next-release' ? 'the next engine release' : 'the first semver major of the engine';
    console.warn(`[deprecated] ${key.split('#')[1]} is deprecated and goes in ${when}. ${entry.note}`);
}
