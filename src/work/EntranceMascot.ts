import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import { NpcIdleBehavior } from 'engine/npc/behaviors/NpcIdleBehavior.js';
import { NpcSpeechBubble } from 'engine/npc/utils/NpcSpeechBubble.js';

const NPC_ID = 'entrance_seal_mascot';
const POSITION = new THREE.Vector3(-10.8, .02, 14.7);

class MascotBehavior extends NpcIdleBehavior {
    constructor() { super({ lookAtPlayer: false, randomIdleMotions: false }); }
    override update(): THREE.Vector3 | null { return null; }
    override clone(): MascotBehavior { return new MascotBehavior(); }
    override getName(): string { return 'Welcome mascot'; }
}

/** Soft seal costume with a shoulder-pivoted flipper and an entry greeting. */
export class EntranceMascot {
    private readonly costume = new THREE.Group();
    private readonly flipper = new THREE.Group();
    private bubble: NpcSpeechBubble | null = null;
    private elapsed = 0;
    private waveUntil = 0;
    private inside = false;
    private outsideTime = 3;
    private readonly geometries = new Set<THREE.BufferGeometry>();
    private readonly materials = new Map<number, THREE.MeshStandardMaterial>();

    constructor(private readonly engine: EngineLike) {}

    private oval(name: string, color: number, position: [number, number, number], scale: [number, number, number], parent = this.costume): THREE.Mesh {
        let material = this.materials.get(color);
        if (!material) {
            material = new THREE.MeshStandardMaterial({ color, roughness: .92 });
            this.materials.set(color, material);
        }
        // The block renderer owns mesh.scale for its anti-z-fighting offsets.
        const geometry = new THREE.SphereGeometry(1, 24, 16).scale(...scale);
        this.geometries.add(geometry);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.position.set(position[0], position[1], position[2]);
        mesh.castShadow = true; mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }

    async load(): Promise<void> {
        const white = 0xf5f3ed, muzzle = 0xfffdf5, black = 0x161c23;
        this.costume.name = 'White seal welcome mascot';
        this.costume.rotation.y = -Math.PI / 2;
        this.oval('Plush pear-shaped body', white, [0, .9, 0], [.57, .9, .43]);
        this.oval('Rounded seal head', white, [0, 1.76, .015], [.43, .53, .38]);
        this.oval('Open smiling mouth', black, [0, 1.64, .358], [.255, .24, .06]);
        this.oval('Little pink tongue', 0xc58387, [0, 1.465, .407], [.09, .035, .018]);
        for (const side of [-1, 1]) {
            this.oval('Blue eye white', muzzle, [side * .31, 1.91, .276], [.095, .128, .065]);
            this.oval('Blue iris', 0x3b83bd, [side * .32, 1.915, .329], [.052, .085, .028]);
            this.oval('Eye pupil', black, [side * .32, 1.915, .351], [.027, .056, .014]);
            this.oval('Eye glint', 0xffffff, [side * .32 - .012, 1.945, .363], [.013, .022, .008]);
            this.oval('Soft muzzle cheek', muzzle, [side * .13, 1.82, .369], [.17, .145, .12]);
            this.oval('Flat seal foot', white, [side * .28, .09, .12], [.29, .09, .38]);
        }
        this.oval('Wide charcoal nose', 0x45434a, [0, 1.937, .448], [.18, .062, .058]);
        this.oval('Nose seam', 0x45434a, [0, 1.84, .477], [.024, .082, .014]);
        this.flipper.name = 'Waving flipper';
        this.flipper.position.set(-.43, 1.38, 0);
        this.costume.add(this.flipper);
        this.oval('Raised flipper', white, [0, -.37, 0], [.20, .49, .13], this.flipper);
        this.oval('Resting flipper', white, [.46, .99, .25], [.22, .43, .16]).rotation.z = -.55;
        const manager = this.engine.registerNpc(NPC_ID, new MascotBehavior(), {
            // One soft suit has its own animation; native NPC physics keeps it solid.
            characterFactory: { createBlockCharacter: group => { group.add(this.costume); },
                getCharacterDimensions: () => ({ width: 1.05, height: 2.25, depth: .8 }) },
            importance: 'hero', damageable: { canDie: false },
        });
        await manager.spawn(POSITION.x, POSITION.z, 1.5);
        const npc = this.engine.getNpcRegistry?.()?.get(NPC_ID)?.getAllNpcs()[0];
        if (!npc) throw new Error('Entrance mascot failed to spawn');
        npc.teleportTo(POSITION.x, POSITION.y, POSITION.z);
        npc.setRetreatFromPlayerOverlap(false);
        npc.getCharacter().rotation.y = 0;
    }

    update(dt: number, player: THREE.Vector3): void {
        this.elapsed += dt;
        const inside = player.x > -16.3 && player.x < -6 && player.z > 10.2 && player.z < 15.8
            && player.y > -.5 && player.y < 2.5;
        if (inside && !this.inside && this.outsideTime >= 3) {
            this.waveUntil = this.elapsed + 6;
            this.bubble?.dispose();
            this.bubble = new NpcSpeechBubble(this.costume, this.engine, 'Welcome aboard', 6000,
                new THREE.Vector3(0, 2.5, 0));
        }
        this.outsideTime = inside ? 0 : this.outsideTime + dt;
        this.inside = inside;
        const target = this.elapsed < this.waveUntil ? -2.65 + Math.sin(this.elapsed * 7) * .30 : -.18;
        this.flipper.rotation.z = THREE.MathUtils.damp(this.flipper.rotation.z, target, 9, dt);
        if (inside) {
            const yaw = Math.atan2(player.x - POSITION.x, player.z - POSITION.z);
            const delta = Math.atan2(Math.sin(yaw - this.costume.rotation.y), Math.cos(yaw - this.costume.rotation.y));
            this.costume.rotation.y += delta * (1 - Math.exp(-3 * dt));
        }
    }

    dispose(): void {
        this.bubble?.dispose(); this.bubble = null;
        this.engine.getNpcRegistry?.()?.unregisterController(NPC_ID);
        this.costume.removeFromParent();
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials.values()) material.dispose();
    }
}
