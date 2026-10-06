import * as THREE from 'three';

/**
 * Encoded files larger than this are treated as long (music, ambience): their compressed
 * bytes are cached, and they are decoded only when played. A 3-minute stereo track decodes
 * to about 69 MB of float PCM, which must not sit in memory just because it was preloaded.
 */
const LONG_ENCODED_BYTES = 512 * 1024;
/** Decoded buffers (short clips) kept across plays, least recently used first out. */
const DECODED_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;
/** Compressed bytes of long files kept so a replay does not refetch. */
const ENCODED_CACHE_BUDGET_BYTES = 32 * 1024 * 1024;

interface MusicTrack {
    source: AudioBufferSourceNode;
    gain: GainNode;
    url: string;
    targetVolume: number;
}

/** A Map used as an LRU: re-inserting on use keeps the oldest first. */
class ByteBudgetCache<V> {
    private readonly entries = new Map<string, { value: V; bytes: number }>();
    private total = 0;

    constructor(private readonly budget: number) {}

    get(key: string): V | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.value;
    }

    set(key: string, value: V, bytes: number): void {
        if (bytes > this.budget) return;
        this.delete(key);
        this.entries.set(key, { value, bytes });
        this.total += bytes;
        for (const [oldest, entry] of this.entries) {
            if (this.total <= this.budget) break;
            this.entries.delete(oldest);
            this.total -= entry.bytes;
        }
    }

    delete(key: string): void {
        const entry = this.entries.get(key);
        if (!entry) return;
        this.entries.delete(key);
        this.total -= entry.bytes;
    }

    clear(): void {
        this.entries.clear();
        this.total = 0;
    }
}

/**
 * Plays audio asset files (e.g. opus/ogg) via the Web Audio API.
 *
 * Uses a THREE.AudioListener attached to the active camera so the AudioContext
 * is shared with any THREE.Audio usage and so PokiIntegration's
 * listener.setMasterVolume() mute path works during commercial breaks.
 *
 * Routing: sfxGain, musicGain -> listener.getInput() -> destination
 *
 * - SFX are fire-and-forget and can overlap.
 * - Only one music track plays at a time; playMusic cross-fades on the audio
 *   clock. A newer playMusic/stopMusic supersedes an older call still loading.
 * - Memory: short clips stay decoded in an LRU cache with a byte budget; long
 *   files (see LONG_ENCODED_BYTES) keep only their compressed bytes and are
 *   decoded per play, so a playing track holds the only copy of its PCM.
 * - All errors are caught and logged; gameplay never breaks on audio failure.
 */
export class AudioPlayer {
    private listener: THREE.AudioListener;
    private camera: THREE.Camera;
    private sfxGain: GainNode;
    private musicGain: GainNode;
    private decodedCache = new ByteBudgetCache<AudioBuffer>(DECODED_CACHE_BUDGET_BYTES);
    private encodedCache = new ByteBudgetCache<ArrayBuffer>(ENCODED_CACHE_BUDGET_BYTES);
    private pendingLoads = new Map<string, Promise<AudioBuffer | null>>();
    private currentMusic: MusicTrack | null = null;
    /** Tracks fading out after a crossfade or stop; dispose() must reach them too. */
    private fadingMusic = new Set<MusicTrack>();
    /** Bumped by every playMusic/stopMusic/dispose; an older playMusic that sees it move gives up. */
    private musicGeneration = 0;
    private disposed = false;

    constructor(camera: THREE.Camera) {
        this.camera = camera;
        this.listener = new THREE.AudioListener();
        camera.add(this.listener);

        const ctx = this.listener.context;
        this.sfxGain = ctx.createGain();
        this.sfxGain.gain.value = 1;
        this.sfxGain.connect(this.listener.getInput());

        this.musicGain = ctx.createGain();
        this.musicGain.gain.value = 1;
        this.musicGain.connect(this.listener.getInput());

        // iOS 17+: unless the page opts into the 'playback' audio session
        // category, the phone's ringer/silent switch mutes ALL Web Audio
        // output — invisibly, with nothing in the console. Not yet in TS
        // lib.dom, so feature-detect through a structural type.
        try {
            const nav = navigator as unknown as { audioSession?: { type: string } };
            if (nav.audioSession) nav.audioSession.type = 'playback';
        } catch { /* audioSession unsupported or read-only */ }
    }

    /**
     * Play a one-shot sound effect. Returns immediately; failures are logged.
     * Multiple SFX can overlap.
     */
    playSound(url: string, opts?: { volume?: number }): void {
        if (this.disposed) return;
        const volume = opts?.volume ?? 1;
        this.loadBuffer(url).then((buffer) => {
            if (!buffer || this.disposed) return;
            this.resumeContext();
            const ctx = this.listener.context;
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            const gain = ctx.createGain();
            gain.gain.value = volume;
            source.connect(gain);
            gain.connect(this.sfxGain);
            source.start(0);
            source.onended = () => {
                source.disconnect();
                gain.disconnect();
            };
        }).catch((err) => {
            console.warn(`[AudioPlayer] playSound failed for ${url}:`, err);
        });
    }

    /**
     * Play a music track. Only one music track plays at a time — calling this
     * while another track is playing cross-fades: the old track fades out over
     * `fadeIn` while the new one fades in. Resolves when the new track has
     * started. If another playMusic or stopMusic arrives while this one is still
     * loading, this one gives up and never starts.
     */
    async playMusic(url: string, opts?: { loop?: boolean; fadeIn?: number; volume?: number }): Promise<void> {
        if (this.disposed) return;
        const loop = opts?.loop ?? true;
        const fadeIn = opts?.fadeIn ?? 0.5;
        const volume = opts?.volume ?? 1;
        const generation = ++this.musicGeneration;

        const buffer = await this.loadBuffer(url);
        if (!buffer || generation !== this.musicGeneration || this.disposed) return;

        // Cross-fade out any existing music track, on the audio clock.
        if (this.currentMusic) {
            this.fadeOutTrack(this.currentMusic, fadeIn);
            this.currentMusic = null;
        }

        this.resumeContext();
        const ctx = this.listener.context;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;

        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(this.musicGain);

        const now = ctx.currentTime;
        if (fadeIn > 0) {
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(volume, now + fadeIn);
        } else {
            gain.gain.setValueAtTime(volume, now);
        }

        source.start(0);
        const track: MusicTrack = { source, gain, url, targetVolume: volume };
        this.currentMusic = track;

        source.onended = () => {
            // Only clear if this is still the active track (natural end for non-looping).
            if (this.currentMusic === track) {
                source.disconnect();
                gain.disconnect();
                this.currentMusic = null;
            }
        };
    }

    /**
     * Fade out and stop the current music track, if any, and cancel a playMusic
     * still loading. Resolves after the fade completes.
     */
    async stopMusic(opts?: { fadeOut?: number }): Promise<void> {
        const fadeOut = opts?.fadeOut ?? 0.5;
        this.musicGeneration++;
        const music = this.currentMusic;
        if (!music) return;
        this.currentMusic = null;
        this.fadeOutTrack(music, fadeOut);
        if (fadeOut > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, fadeOut * 1000));
        }
    }

    /**
     * Ramp a track to silence and stop it at the end of the ramp, both scheduled on the
     * audio clock so nothing depends on a timer firing. The track stays reachable from
     * `fadingMusic` until it has stopped, so dispose() can cut it short.
     */
    private fadeOutTrack(track: MusicTrack, fadeOut: number): void {
        const { gain, source } = track;
        const now = this.listener.context.currentTime;
        if (fadeOut <= 0) {
            AudioPlayer.releaseTrack(track);
            return;
        }
        this.fadingMusic.add(track);
        const currentValue = gain.gain.value;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(currentValue, now);
        gain.gain.linearRampToValueAtTime(0, now + fadeOut);
        source.onended = () => {
            this.fadingMusic.delete(track);
            source.disconnect();
            gain.disconnect();
        };
        try {
            source.stop(now + fadeOut);
        } catch {
            // Already stopped.
            this.fadingMusic.delete(track);
            AudioPlayer.releaseTrack(track);
        }
    }

    /** Stop a track's nodes and release them. Tolerates an already-stopped source. */
    private static releaseTrack(track: { source: AudioBufferSourceNode; gain: GainNode }): void {
        try {
            track.source.stop();
        } catch {
            // Already stopped.
        }
        track.source.disconnect();
        track.gain.disconnect();
    }

    /**
     * Set volume on one or more buses. 0 = silent, 1 = full.
     * `master` controls the THREE.AudioListener gain (affects THREE.Audio too).
     */
    setVolume(opts: { master?: number; sfx?: number; music?: number }): void {
        if (opts.master !== undefined) this.listener.setMasterVolume(opts.master);
        if (opts.sfx !== undefined) this.sfxGain.gain.value = opts.sfx;
        if (opts.music !== undefined) this.musicGain.gain.value = opts.music;
    }

    /**
     * Return the shared AudioContext.
     * Templates that use the Web Audio API directly should use this context so that
     * engine.setAudioVolume() and AudioContext suspension on mute take effect.
     */
    getContext(): AudioContext {
        return this.listener.context as AudioContext;
    }

    /**
     * Return the master gain input node (THREE.AudioListener's gain).
     * Connect Web Audio API source nodes here to route them through the master
     * volume, ensuring engine.setAudioVolume({ master: 0 }) silences them.
     */
    getInput(): AudioNode {
        return this.listener.getInput();
    }

    /**
     * Detach the listener from its current camera and attach to a new one.
     * GameEngine.setRenderCamera calls this when it swaps cameras.
     */
    setCamera(camera: THREE.Camera): void {
        if (camera === this.camera) return;
        this.camera.remove(this.listener);
        this.camera = camera;
        camera.add(this.listener);
    }

    dispose(): void {
        this.disposed = true;
        this.musicGeneration++;
        if (this.currentMusic) {
            AudioPlayer.releaseTrack(this.currentMusic);
            this.currentMusic = null;
        }
        for (const track of this.fadingMusic) AudioPlayer.releaseTrack(track);
        this.fadingMusic.clear();
        this.sfxGain.disconnect();
        this.musicGain.disconnect();
        this.decodedCache.clear();
        this.encodedCache.clear();
        this.pendingLoads.clear();
        this.camera.remove(this.listener);
        // Do not close listener.context — THREE.AudioListener owns it and may
        // be recreated; closing would also kill any future THREE.Audio usage.
    }

    private resumeContext(): void {
        const ctx = this.listener.context;
        // `!== 'running'` rather than `=== 'suspended'`: after a phone call,
        // Siri, screen lock, or a getUserMedia mic session, iOS Safari parks
        // the context in the non-standard 'interrupted' state, which a
        // 'suspended'-only check never recovers from. (The TS
        // AudioContextState union doesn't include 'interrupted', so this is
        // also the only comparison that typechecks.) Note this alone is not
        // enough on iOS — resume() only sticks inside a user-gesture call
        // stack, which GameEngine's window-level unlock listeners provide.
        if (ctx.state !== 'running') {
            ctx.resume().catch(() => { /* ignore */ });
        }
    }

    /**
     * Prepare a file so the first playSound()/playMusic() for it doesn't stall. A short
     * clip is fetched and decoded into the cache; a long file (music) is only fetched,
     * and its compressed bytes kept, so preloading a level's music costs megabytes, not
     * tens of megabytes of PCM per track. Used by level preloading; idempotent.
     */
    async preload(url: string): Promise<void> {
        if (this.disposed || this.decodedCache.get(url) || this.encodedCache.get(url)) return;
        const pending = this.pendingLoads.get(url);
        if (pending) {
            await pending;
            return;
        }
        const bytes = await this.fetchBytes(url);
        if (!bytes || this.disposed) return;
        if (bytes.byteLength > LONG_ENCODED_BYTES) {
            this.encodedCache.set(url, bytes, bytes.byteLength);
            return;
        }
        await this.loadBuffer(url, bytes);
    }

    /**
     * The decoded buffer for a URL. Short clips are cached decoded; a long file's buffer
     * goes only to the caller (it lives as long as the source playing it), and its
     * compressed bytes are cached instead. `prefetched` skips the fetch.
     */
    private loadBuffer(url: string, prefetched?: ArrayBuffer): Promise<AudioBuffer | null> {
        const cached = this.decodedCache.get(url);
        if (cached) return Promise.resolve(cached);

        const pending = this.pendingLoads.get(url);
        if (pending) return pending;

        const promise = (async (): Promise<AudioBuffer | null> => {
            const bytes = prefetched ?? this.encodedCache.get(url) ?? await this.fetchBytes(url);
            if (!bytes) return null;
            const long = bytes.byteLength > LONG_ENCODED_BYTES;
            // decodeAudioData detaches its argument, so a cached copy must stay intact.
            const buffer = await this.decode(url, long ? bytes.slice(0) : bytes);
            if (!buffer || this.disposed) return buffer;
            if (long) {
                this.encodedCache.set(url, bytes, bytes.byteLength);
            } else {
                this.decodedCache.set(url, buffer, buffer.length * buffer.numberOfChannels * 4);
            }
            return buffer;
        })().finally(() => {
            this.pendingLoads.delete(url);
        });
        this.pendingLoads.set(url, promise);
        return promise;
    }

    private async fetchBytes(url: string): Promise<ArrayBuffer | null> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`[AudioPlayer] fetch failed for ${url}: ${response.status}`);
                return null;
            }
            return await response.arrayBuffer();
        } catch (err) {
            console.warn(`[AudioPlayer] fetch failed for ${url}:`, err);
            return null;
        }
    }

    private async decode(url: string, bytes: ArrayBuffer): Promise<AudioBuffer | null> {
        try {
            return await this.listener.context.decodeAudioData(bytes);
        } catch (err) {
            console.warn(`[AudioPlayer] decode failed for ${url}:`, err);
            return null;
        }
    }
}
