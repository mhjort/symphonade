import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import { getAssetUrlById } from 'types/game.js';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';

/** The solo act uses the shared listener and mute bus, with a short audible range. */
export class TroubadourMusic {
    private source: AudioBufferSourceNode | null = null;
    private gain: GainNode | null = null;
    private panner: PannerNode | null = null;
    private context: AudioContext | null = null;
    private disposed = false;
    private readonly abort = new AbortController();
    private readonly listener = new THREE.Vector3();
    private readonly onState = (): void => this.update(this.listener);

    constructor(private readonly engine: EngineLike, private readonly position: THREE.Vector3) {
        getGameStateManager().addListener(this.onState);
    }

    async load(): Promise<void> {
        const url = getAssetUrlById(this.engine.getGameData?.() ?? null, 'troubadour-acoustic');
        const context = this.engine.getAudioContext?.();
        const destination = this.engine.getAudioDestination?.();
        if (!url || !context || !destination) throw new Error('Troubadour requires the acoustic track and engine audio');
        this.context = context;
        try {
            const response = await fetch(url, { signal: this.abort.signal });
            if (!response.ok) throw new Error(`Acoustic track download failed (${response.status})`);
            const buffer = await context.decodeAudioData(await response.arrayBuffer());
            if (this.disposed) return;
            this.source = context.createBufferSource();
            this.source.buffer = buffer;
            this.source.loop = true;
            this.panner = context.createPanner();
            this.panner.panningModel = 'HRTF';
            this.panner.distanceModel = 'inverse';
            this.panner.refDistance = 2;
            this.panner.rolloffFactor = 1;
            this.panner.positionX.value = this.position.x;
            this.panner.positionY.value = this.position.y;
            this.panner.positionZ.value = this.position.z;
            this.gain = context.createGain();
            this.gain.gain.value = 0;
            this.source.connect(this.panner);
            this.panner.connect(this.gain);
            this.gain.connect(destination);
            this.source.start();
            this.update(this.listener);
        } catch (error) {
            if (!this.disposed) throw error;
        }
    }

    update(listener: THREE.Vector3): void {
        this.listener.copy(listener);
        if (!this.gain || !this.context) return;
        const distance = listener.distanceTo(this.position);
        const fade = 1 - THREE.MathUtils.smoothstep(distance, 7, 13);
        const playing = getGameStateManager().isState(GameState.PLAYING);
        this.gain.gain.setTargetAtTime(playing ? 0.32 * fade : 0, this.context.currentTime, 0.15);
    }

    dispose(): void {
        this.disposed = true;
        this.abort.abort();
        getGameStateManager().removeListener(this.onState);
        this.source?.stop(); this.source?.disconnect();
        this.panner?.disconnect(); this.gain?.disconnect();
        this.source = null;
    }
}
