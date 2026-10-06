/**
 * Runs game-facing physics hooks (pre/post-step callbacks, sensor listeners)
 * so that one throwing hook cannot take the physics world down with it.
 *
 * A bug in a game's trigger handler is ordinary JavaScript failure: it is
 * logged and the step continues. The one error that is NOT swallowed is a
 * poisoned Rapier borrow ("recursive use of an object"), which surfaces from
 * any Rapier call a hook makes; it is rethrown so the caller's halt latch sees
 * it, because every later Rapier call would fail the same way.
 */

const POISONED_BORROW = 'recursive use of an object';

/** Minimum gap between two logs for the same hook label. */
const LOG_INTERVAL_MS = 5000;

const lastLogAt = new Map<string, number>();
const suppressed = new Map<string, number>();

/** True when `error` is Rapier reporting a poisoned WASM borrow. */
export function isPoisonedRapierBorrow(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes(POISONED_BORROW);
}

/**
 * Call `fn`; log and continue if it throws, unless the error is a poisoned
 * Rapier borrow. Logs are rate-limited per `label`, so a hook that throws on
 * every substep produces one line every few seconds instead of a flood.
 */
export function invokeGuarded(label: string, fn: () => void): void {
    try {
        fn();
    } catch (error) {
        if (isPoisonedRapierBorrow(error)) throw error;
        const now = Date.now();
        const last = lastLogAt.get(label);
        if (last !== undefined && now - last < LOG_INTERVAL_MS) {
            suppressed.set(label, (suppressed.get(label) ?? 0) + 1);
            return;
        }
        const skipped = suppressed.get(label) ?? 0;
        suppressed.delete(label);
        lastLogAt.set(label, now);
        const repeat = skipped > 0 ? ` (${skipped} more since the last report)` : '';
        console.error(`[physics] ${label} threw; physics continues${repeat}`, error);
    }
}

/** Forget the rate-limit state. Tests use it; an engine reload may too. */
export function resetGuardedInvokeLog(): void {
    lastLogAt.clear();
    suppressed.clear();
}
