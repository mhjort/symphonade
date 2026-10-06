import { isI18nInitialized, t } from 'engine/i18n/index.js';

/**
 * `t(key)`, or `english` when there is no translation yet (or no window): i18n initialises
 * asynchronously, and before it does i18next answers with the key itself, which must
 * never reach the player.
 */
export function tOr(key: string, english: string): string {
    // No window (a worker, or a node test) means no i18n state to read.
    if (typeof window === 'undefined' || !isI18nInitialized()) return english;
    const value = t(key);
    return value === key ? english : value;
}

/**
 * A label a game may override: the engine's English default is translated, anything the
 * game set is shown as given. Lets an exported DEFAULT_* keep its English value (code may
 * read it) while players see their own language.
 */
export function localizedDefault(value: string, englishDefault: string, key: string): string {
    return value === englishDefault ? tOr(key, englishDefault) : value;
}
