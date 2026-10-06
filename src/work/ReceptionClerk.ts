import type * as THREE from 'three';
import { NpcIdleBehavior } from 'engine/npc/behaviors/NpcIdleBehavior.js';

/** Preserve the check-in callback when the NPC manager clones its behavior. */
export class ReceptionClerk extends NpcIdleBehavior {
    constructor(private readonly checkIn: () => void) {
        super({ lookAtPlayer: true, lookAtRange: 8, randomIdleMotions: false });
    }

    // A desk attendant has no walking target, even if the spawn resolver
    // initially chose a wider spot before placement in the staff aisle.
    override update(_dt: number, _position: THREE.Vector3, _target: THREE.Vector3 | null): THREE.Vector3 | null { return null; }

    override clone(): ReceptionClerk { return new ReceptionClerk(this.checkIn); }
    override getName(): string { return 'Information clerk'; }
    override onPlayerInteract(): boolean {
        this.checkIn();
        return true;
    }
}
