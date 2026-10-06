/**
 * Runtime-AI request failures.
 *
 * Every non-OK game-server response is a `RuntimeAIError` carrying its HTTP status and
 * body, whichever request helper made it, so callers branch on `status`, never on the
 * message text. The one failure a caller can do something specific about is the server
 * saying "later": that is the subclass `RuntimeAIBackoffError`, which names how long, so
 * a caller that respects it stops burning its retry budget on requests that cannot
 * succeed. Timeouts and network errors stay ordinary `Error`s.
 */

/** Default wait when the server refuses without saying for how long. */
export const DEFAULT_BACKOFF_MS = 1000;

/** A game-server refusal: the HTTP status and the response body. */
export class RuntimeAIError extends Error {
    constructor(
        readonly status: number,
        /** The response body as the server sent it (often JSON, not guaranteed). */
        readonly body: string,
        message: string,
    ) {
        super(message);
        this.name = 'RuntimeAIError';
    }
}

export class RuntimeAIBackoffError extends RuntimeAIError {
    constructor(
        /** 429 (rate limit or budget) or 503 (provider overloaded / feature unavailable). */
        status: number,
        /** How long to wait before asking again. */
        readonly retryAfterMs: number,
        message: string,
        body: string = '',
    ) {
        super(status, body, message);
        this.name = 'RuntimeAIBackoffError';
    }
}

/**
 * The error for a non-OK response: a back-off for 429/503, a plain `RuntimeAIError`
 * otherwise. The message keeps the `<label> (status): body` shape callers have logged.
 */
export function runtimeAIErrorFor(status: number, body: string, label: string): RuntimeAIError {
    const message = `${label} (${status}): ${body}`;
    return isBackoffStatus(status)
        ? new RuntimeAIBackoffError(status, readRetryAfterMs(body), message, body)
        : new RuntimeAIError(status, body, message);
}

/** True for the statuses that mean "later", not "never" and not "your request was wrong". */
export function isBackoffStatus(status: number): boolean {
    return status === 429 || status === 503;
}

/**
 * The `retryAfterMs` a game-server puts in its refusal body, or the default. The
 * body is whatever the server sent, so it is parsed defensively and never thrown from.
 */
export function readRetryAfterMs(body: string): number {
    try {
        const parsed: unknown = JSON.parse(body);
        if (typeof parsed === 'object' && parsed !== null) {
            const value = (parsed as { retryAfterMs?: unknown }).retryAfterMs;
            if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
        }
    } catch {
        // Not JSON — the default wait is the right answer, not a failure.
    }
    return DEFAULT_BACKOFF_MS;
}
