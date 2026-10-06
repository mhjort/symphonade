import * as THREE from 'three';
import type { EngineLike, WorldProfileData } from 'types/game.js';

export const FERRY_SOUNDS = {
    liftMotor: 'b841bb9a-42a7-4644-8abc-5cb4f4e2263f',
    liftArrival: '00678693-9d5d-4db9-a8cc-e1c47a12f11e',
    cardContact: '9b5a672c-f13f-4ea9-bb40-ea002dd2ff5f',
    cardAccepted: '8ea82f0f-6aba-4a34-89c0-5c2d0dfab828',
    cardRejected: 'b7fdee06-4850-4ee8-a15d-a39c6dbd29a6',
    doorSlide: '6e5f263c-b5ae-4d5a-995b-9b8bbada2571',
} as const;
export type FerrySound = keyof typeof FERRY_SOUNDS;
const VOLUME: Record<FerrySound, number> = {
    liftMotor: 0.4, liftArrival: 0.45, cardContact: 0.14,
    cardAccepted: 0.7, cardRejected: 0.23, doorSlide: 0.24,
};

/** Generated SFX through the engine's cached, recorded and muteable SFX bus. */
export class FerrySounds {
    private readonly doorStates = new Map<string, string>();
    constructor(private readonly engine: EngineLike, private readonly profile: WorldProfileData,
        private readonly playerPosition: () => THREE.Vector3) {}

    play(sound: FerrySound, position?: THREE.Vector3): void {
        const distance = position?.distanceTo(this.playerPosition()) ?? 0;
        // Close-up mechanisms stay clear; the other end of the ship stays quiet.
        const attenuation = Math.max(0, 1 - Math.max(0, distance - 2) / 14);
        if (attenuation <= 0) return;
        this.engine.playSound(FERRY_SOUNDS[sound], { volume: VOLUME[sound] * attenuation * attenuation });
    }

    updateDoors(): void {
        const doors = this.engine.getDoorSystem?.();
        if (!doors) return;
        for (const def of this.profile.doors ?? []) {
            const state = doors.getDoorState(def.id);
            if (!state) { this.doorStates.delete(def.id); continue; }
            const previous = this.doorStates.get(def.id);
            if (def.animation === 'slide' && previous && previous !== state && state === 'opening') {
                this.play('doorSlide', new THREE.Vector3(def.position.x, def.position.y, def.position.z));
            }
            this.doorStates.set(def.id, state);
        }
    }
}
