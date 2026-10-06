import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import shipLevel from './serenade.mesh-level.json';

export const STARLIGHT_MUSIC_ID = 'be9b7399-3fa5-47cc-86b8-f7299dbb7f1c';

/** A real world-space source, using the engine camera's shared audio listener. */
export class StarlightMusic {
    private source: AudioBufferSourceNode | null = null;
    private gain: GainNode | null = null;
    private filter: BiquadFilterNode | null = null;
    private panner: PannerNode | null = null;
    private context: AudioContext | null = null;
    private readonly abort = new AbortController();
    private disposed = false;
    private playing = getGameStateManager().isState(GameState.PLAYING);
    private readonly playerPosition = new THREE.Vector3();
    private readonly roomCenter: THREE.Vector3;
    private readonly roomHalfSize: THREE.Vector3;
    private readonly stagePosition: THREE.Vector3;
    private readonly onState = (state: GameState): void => {
        this.playing = state === GameState.PLAYING;
        this.update(this.playerPosition);
    };

    constructor(private readonly engine: EngineLike) {
        const room = shipLevel.volumes.find(volume => volume.name === 'Starlight');
        const stage = shipLevel.colliders.find(collider => collider.name === 'Starlight stage');
        if (!room || !stage) throw new Error('Starlight music requires the authored room and stage');
        const vector = (values: number[] | undefined): THREE.Vector3 => {
            const [x, y, z] = values ?? [];
            if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number'
                || ![x, y, z].every(Number.isFinite)) throw new Error('Invalid Starlight geometry');
            return new THREE.Vector3(x, y, z);
        };
        this.roomCenter = vector(room.position);
        this.roomHalfSize = vector(room.size).multiplyScalar(0.5);
        this.stagePosition = vector(stage.position);
        this.stagePosition.y += vector(stage.size).y / 2 + 1.5;
        getGameStateManager().addListener(this.onState);
    }

    async load(url: string): Promise<void> {
        const context = this.engine.getAudioContext?.();
        const destination = this.engine.getAudioDestination?.();
        if (!context || !destination) throw new Error('Starlight music requires engine audio');
        this.context = context;
        try {
            const response = await fetch(url, { signal: this.abort.signal });
            if (!response.ok) throw new Error(`Music download failed (${response.status})`);
            const buffer = await context.decodeAudioData(await response.arrayBuffer());
            if (this.disposed) return;
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            const panner = context.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = 7;
            panner.maxDistance = 38;
            panner.rolloffFactor = 1.15;
            panner.positionX.value = this.stagePosition.x;
            panner.positionY.value = this.stagePosition.y;
            panner.positionZ.value = this.stagePosition.z;
            const filter = context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 14000;
            filter.Q.value = 0.5;
            const gain = context.createGain();
            gain.gain.value = 0;
            source.connect(filter);
            filter.connect(panner);
            panner.connect(gain);
            gain.connect(destination);
            this.source = source; this.panner = panner; this.filter = filter; this.gain = gain;
            source.start();
            this.update(this.playerPosition);
        } catch (error) {
            if (!this.disposed) throw error;
        }
    }

    update(playerPosition: THREE.Vector3): void {
        this.playerPosition.copy(playerPosition);
        if (!this.gain || !this.filter || !this.context) return;
        const outside = Math.hypot(
            Math.max(0, Math.abs(playerPosition.x - this.roomCenter.x) - this.roomHalfSize.x),
            Math.max(0, Math.abs(playerPosition.y - this.roomCenter.y) - this.roomHalfSize.y),
            Math.max(0, Math.abs(playerPosition.z - this.roomCenter.z) - this.roomHalfSize.z),
        );
        // A short spill into the entrances, then quiet elsewhere on the ferry.
        // Inside, the PannerNode supplies stage-distance falloff and direction.
        const roomLevel = outside >= 8 ? 0 : Math.exp(-outside * 1.3);
        const target = this.playing ? 0.38 * roomLevel : 0;
        this.gain.gain.setTargetAtTime(target, this.context.currentTime, 0.18);
        this.filter.frequency.setTargetAtTime(900 + 13100 * roomLevel, this.context.currentTime, 0.18);
    }

    dispose(): void {
        this.disposed = true;
        this.abort.abort();
        getGameStateManager().removeListener(this.onState);
        this.source?.stop();
        this.source?.disconnect();
        this.filter?.disconnect();
        this.panner?.disconnect();
        this.gain?.disconnect();
        this.source = null;
    }
}
