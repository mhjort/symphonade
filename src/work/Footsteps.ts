import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import type { VoxelPlayerController } from './VoxelPlayerController.js';

/** Distance-driven shoe impacts, with a dragging, uneven gait while dizzy. */
export class Footsteps {
    private readonly previous = new THREE.Vector3();
    private initialized = false;
    private distance = 0;
    private stride = .25;
    private right = false;
    private cooldown = 0;
    private noise: AudioBuffer | null = null;
    private readonly active = new Set<() => void>();

    constructor(private readonly engine: EngineLike) {}

    update(dt: number, player: VoxelPlayerController, dizziness: number): void {
        this.cooldown = Math.max(0, this.cooldown - Math.max(0, dt));
        const position = player.getPosition();
        const moved = this.initialized ? Math.hypot(position.x - this.previous.x, position.z - this.previous.z) : 0;
        this.previous.copy(position);
        this.initialized = true;
        if (!getGameStateManager().isState(GameState.PLAYING) || !player.getControlsEnabled()
            || player.isSeated?.() || player.isPlayerInVehicle() || !player.isGrounded
            || player.moveDirection.lengthSq() < .001 || dt <= 0 || dt > .2
            || moved < .001 || moved > 1.5) {
            this.distance = 0;
            this.stride = .25;
            // Let the short shoe envelope finish instead of cutting it into a click.
            if (!getGameStateManager().isState(GameState.PLAYING)) this.stop();
            return;
        }
        this.distance += moved;
        if (this.distance < this.stride || this.cooldown > 0) return;
        this.distance %= this.stride;
        const severity = THREE.MathUtils.clamp(dizziness, 0, 1);
        this.right = !this.right;
        this.stride = 1.4 * (1 + (this.right ? .28 : -.22) * severity);
        this.cooldown = .32;
        this.play(severity);
    }

    private play(severity: number): void {
        const ctx = this.engine.getAudioContext?.();
        const destination = this.engine.getAudioDestination?.();
        if (!ctx || !destination || ctx.state !== 'running') return;
        if (!this.noise) {
            this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .4), ctx.sampleRate);
            const samples = this.noise.getChannelData(0);
            for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        }
        const now = ctx.currentTime;
        const duration = .14 + severity * .16;
        const volume = .065 + severity * .015;
        const frequency = (this.right ? 78 : 84) * (1 - severity * .25);
        const thud = ctx.createOscillator();
        thud.frequency.setValueAtTime(frequency, now);
        thud.frequency.exponentialRampToValueAtTime(60, now + .14);
        const impact = ctx.createGain();
        impact.gain.setValueAtTime(0, now);
        impact.gain.linearRampToValueAtTime(volume, now + .025);
        impact.gain.exponentialRampToValueAtTime(.001, now + .15);
        impact.gain.linearRampToValueAtTime(0, now + .17);
        thud.connect(impact); impact.connect(destination);
        const shoe = ctx.createBufferSource();
        shoe.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 750 - severity * 250;
        filter.Q.value = .5;
        const scuff = ctx.createGain();
        scuff.gain.setValueAtTime(0, now);
        scuff.gain.linearRampToValueAtTime(volume * .5, now + .03);
        scuff.gain.exponentialRampToValueAtTime(.001, now + duration);
        scuff.gain.linearRampToValueAtTime(0, now + duration + .02);
        shoe.connect(filter); filter.connect(scuff); scuff.connect(destination);
        const cleanup = (): void => {
            thud.disconnect(); impact.disconnect(); shoe.disconnect(); filter.disconnect(); scuff.disconnect();
            this.active.delete(cleanup);
        };
        this.active.add(cleanup);
        shoe.onended = cleanup;
        thud.start(now); thud.stop(now + .18);
        shoe.start(now); shoe.stop(now + Math.max(duration + .03, .18));
        this.engine.logSoundEvent?.(severity > 0 ? 'footstep-dizzy' : 'footstep', {
            dur: Math.max(duration + .03, .18), layers: [
                { wave: 'sine', freq: [frequency, 60], gain: [volume, 0] },
                { wave: 'noise', freq: filter.frequency.value, gain: [volume * .5, 0] },
            ],
        });
    }

    private stop(): void { for (const cleanup of this.active) cleanup(); }
    dispose(): void { this.stop(); this.noise = null; }
}
