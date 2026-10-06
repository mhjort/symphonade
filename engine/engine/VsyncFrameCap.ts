/**
 * The render loop's frame cap, timed on the display's VSYNC clock.
 *
 * WHY THE rAF TIMESTAMP AND NOT `performance.now()`. The cap used to compare
 * `performance.now()`, read when the callback STARTS, against a 16.67 ms grid
 * set once and never re-synced to the display. The callback starts a jittery
 * 0.75-7.7 ms (p10-p99) after the vsync it belongs to, varying with GPU load, so
 * a tick that belonged to the right vsync read as "a hair early" and was thrown
 * away — the previous frame stayed up for two vsyncs. Measured on a GPU-bound
 * game (Squall Riders, M3 Max, DPR 2): ~350 rejected on-time vsyncs a minute,
 * 45-60 fps "at times choppy"; with the cap on the vsync clock, 53 → 59 fps and
 * frames over 25 ms 12.8% → 1.9%. On a 120 Hz panel the chosen ticks wandered
 * between 2- and 3-vsync gaps (21% of frames off cadence in simulation). In
 * Chromium and Firefox the requestAnimationFrame timestamp is the vsync time of
 * the frame the callback renders — identical for every callback of that frame,
 * whenever it runs — so a decision taken on it cannot be fooled by callback
 * jitter. WebKit (Safari, and so every iOS browser) is understood to pass the
 * start of its rendering update instead, which carries main-thread jitter: the
 * cap tolerates up to about half a display period of it, and in simulation stays
 * ahead of the callback-start timing beyond that.
 *
 * The same timestamp is the frame's time for `FrameTimer`: the simulation delta
 * is then the display interval since the last rendered frame — what the player
 * sees — rather than callback-start jitter on top of it (a frame shown exactly
 * one vsync after the last used to simulate anywhere from 12 to 21 ms).
 *
 * THE RULE. A tick renders unless the NEXT vsync would still be on time: it is
 * skipped only while less than `interval − period/2` has passed since the grid
 * slot of the last rendered frame, so each slot of the 60 (or 30) fps grid goes
 * to its nearest vsync. The grid then advances by whole intervals, which keeps
 * the average at the cap on refresh rates the cap does not divide (144 Hz still
 * averages 60, alternating 2- and 3-vsync frames). After each rendered frame the
 * grid is pulled a fraction of the way onto the vsync it rendered on, so on 60,
 * 120 and 240 Hz it rides the display clock: panel drift (±100 ppm) can never
 * walk a slot onto the point halfway between two vsyncs, where a plain grid
 * would drop one. A gap the grid cannot place within half a period — a tab
 * return, a render-gate reopening, a stall — restarts it on this vsync.
 *
 * THE DISPLAY PERIOD is learned from every tick of the rAF chain, including the
 * ones the engine's gates hold (recorder backpressure, render gate, backend not
 * ready), so a held frame is still a measured vsync, not a gap in the estimate.
 * A delta well under the estimate judges its own tick at once (were it real, a
 * stale estimate would pass that very vsync early) but enters the estimate only
 * when the next delta agrees, so one jittery timestamp cannot collapse it. And
 * each timed tick re-checks the last frame's grid slot against the period it is
 * judged with: that slot was placed under the estimate of its own frame, which
 * can have been several vsyncs long (a GPU-bound 120 Hz game re-seeds it from
 * 16.7 and 25 ms deltas), and a slot left more than half a period behind its
 * frame would pass the very next vsync as a one-vsync frame.
 *
 * A DIRECT CALL (no timestamp — `loadGame`'s first frame, or a wrapper that drops
 * the argument) has no vsync to snap to, so it is timed the way the loop always
 * was: on `performance.now()` with the strict whole-interval test. The two
 * readings share one time origin but are NOT ordered: the first rAF tick after a
 * direct call can carry a vsync time EARLIER than the call's `performance.now()`
 * (measured in Chromium: 14% of trials, by up to 8 ms), because its frame began
 * before the call ran. So the frame time can step back once there; `FrameTimer`
 * and the quality sampler's gap read that step as zero.
 *
 * Timestamps are passed in rather than read here, for the reason `FrameTimer`
 * states: only a fabricated frame stream can prove the cadence.
 */

/** The display period assumed until the first two ticks measure it (60 Hz). */
export const DEFAULT_DISPLAY_PERIOD_MS = 1000 / 60;

/** A tick-to-tick delta outside (MIN, MAX) is not a refresh period: below, the
 *  same frame twice; above (25 Hz), a hitch, a hidden tab or a held chain. */
const MIN_PERIOD_MS = 2;
const MAX_PERIOD_MS = 40;

/** Weight of one in-band delta in the running mean — smooths timestamp jitter. */
const PERIOD_SMOOTHING = 0.1;

/**
 * A delta this many times the estimate or more is a MISSED vsync (the callback
 * overran one), not a slower display, and is kept out of the mean: a 120 Hz
 * estimate dragged toward 16.7 ms by missed vsyncs would let a one-vsync tick
 * through the cap.
 */
const MISSED_VSYNC_FACTOR = 1.5;

/** Below this fraction of the estimate, a delta says ticks come faster than it
 *  does (a 120 Hz panel after a startup seeded on a missed vsync, the window
 *  moved to a faster screen) — or it is one jittery timestamp. Real ones arrive
 *  at half the estimate or less; 0.6 leaves timestamp jitter room. */
const FASTER_FACTOR = 0.6;

/** Two consecutive faster deltas within this fraction of each other confirm a
 *  faster display, and the estimate adopts their mean. A jittery timestamp makes
 *  one short delta followed by a long one, which never confirms. */
const FASTER_AGREEMENT = 0.25;

/** This many consecutive missed-vsync-sized deltas mean the display (or the
 *  rate the browser serves this page) really is slower: adopt it. */
const SLOWER_RESEED_TICKS = 30;

/**
 * Fraction of a rendered frame's offset from its grid slot that the grid moves
 * onto the vsync. Small enough that the 2-/3-vsync alternation on refresh rates
 * the cap does not divide still averages the cap; large enough that display
 * drift (a few µs a frame) leaves the grid within tens of µs of the vsync.
 */
const GRID_PULL = 0.1;

export class VsyncFrameCap {
    private period = DEFAULT_DISPLAY_PERIOD_MS;
    /** False until a first in-band delta seeds `period`; the default is a guess. */
    private measured = false;
    /** Consecutive missed-vsync-sized deltas (see SLOWER_RESEED_TICKS). */
    private slowerRun = 0;
    /** The last delta if it was faster than the estimate, awaiting the next to confirm it. */
    private fasterCandidate: number | null = null;
    /** The display period the tick being judged is judged with: the estimate, or an
     *  unconfirmed faster delta. */
    private tickPeriod = DEFAULT_DISPLAY_PERIOD_MS;
    /** rAF timestamp of the previous tick; null after a direct call or at start. */
    private lastTickMs: number | null = null;
    /** Whether the tick being judged carried a vsync timestamp. */
    private timed = false;
    /** Grid slot of the last rendered frame. 0 at start, so the first frame
     *  always renders (and reads as a long gap — see `elapsedMs`). */
    private gridMs = 0;
    /** Frame time of the last frame a timed tick rendered; null after a direct call. */
    private lastFrameMs: number | null = null;

    /**
     * The frame time of this tick — its rAF timestamp, or `nowMs` for a direct
     * call — and, for a timed tick, one more sample of the display period.
     * Call on EVERY tick of the chain, before any early return.
     */
    frameTime(rafTs: number | undefined, nowMs: number): number {
        if (typeof rafTs !== 'number') {
            // Not a vsync: neither a period sample nor the baseline of the next one.
            this.timed = false;
            this.lastTickMs = null;
            this.fasterCandidate = null;
            return nowMs;
        }
        this.tickPeriod = this.lastTickMs !== null ? this.observeDelta(rafTs - this.lastTickMs) : this.period;
        this.lastTickMs = rafTs;
        this.timed = true;
        return rafTs;
    }

    /** Milliseconds from the last rendered frame's grid slot to `frameMs`. */
    elapsedMs(frameMs: number): number {
        return frameMs - this.gridMs;
    }

    /**
     * Whether the tick last passed to `frameTime` (at `frameMs`) renders under a
     * cap of `intervalMs`. On yes the grid advances to this frame; on no nothing
     * changes, beyond the re-check of the last frame's slot.
     */
    admit(frameMs: number, intervalMs: number): boolean {
        if (!this.timed) {
            const elapsed = this.elapsedMs(frameMs);
            if (elapsed < intervalMs) return false;
            this.gridMs = frameMs - (elapsed % intervalMs);
            this.lastFrameMs = null;
            return true;
        }
        const half = this.tickPeriod / 2;
        // The snap below, re-applied with the period this tick is judged with. A no-op
        // unless the period has shrunk since that frame (a pulled grid sits within
        // 0.9 × half of its frame).
        if (this.lastFrameMs !== null && Math.abs(this.lastFrameMs - this.gridMs) > half) {
            this.gridMs = this.lastFrameMs;
        }
        const elapsed = this.elapsedMs(frameMs);
        if (elapsed < intervalMs - half) return false;
        this.lastFrameMs = frameMs;
        // More than one slot since the last frame is a gap — the first frame, a
        // tab return, a held chain, a stall — with no phase worth keeping.
        if (Math.round(elapsed / intervalMs) > 1) {
            this.gridMs = frameMs;
            return true;
        }
        this.gridMs += intervalMs;
        const offset = frameMs - this.gridMs;
        if (Math.abs(offset) > half) this.gridMs = frameMs;
        else this.gridMs += offset * GRID_PULL;
        return true;
    }

    /** The display refresh period currently assumed, ms. */
    get displayPeriodMs(): number {
        return this.period;
    }

    /** Fold one tick-to-tick delta into the estimate; returns the period to judge this tick with. */
    private observeDelta(d: number): number {
        if (!(d > MIN_PERIOD_MS && d < MAX_PERIOD_MS)) {
            this.fasterCandidate = null;
            return this.period;
        }
        if (!this.measured) {
            this.adopt(d);
            return this.period;
        }
        if (d < this.period * FASTER_FACTOR) {
            const first = this.fasterCandidate;
            if (first !== null && Math.abs(d - first) <= FASTER_AGREEMENT * Math.max(d, first)) {
                this.adopt((d + first) / 2);
                return this.period;
            }
            // Unconfirmed: judge this tick by it — were it real, the estimate would
            // pass this very vsync early — but keep it out of the estimate.
            this.fasterCandidate = d;
            this.slowerRun = 0;
            return d;
        }
        this.fasterCandidate = null;
        if (d < this.period * MISSED_VSYNC_FACTOR) {
            this.period += (d - this.period) * PERIOD_SMOOTHING;
            this.slowerRun = 0;
        } else if (++this.slowerRun >= SLOWER_RESEED_TICKS) {
            this.adopt(d);
        }
        return this.period;
    }

    private adopt(d: number): void {
        this.period = d;
        this.measured = true;
        this.slowerRun = 0;
        this.fasterCandidate = null;
    }
}
