import * as THREE from 'three';
import type { ICharacterContext } from 'engine/character/ICharacterContext.js';
import type { EngineLike, GameData } from 'types/game.js';
import { NpcIdleBehavior } from 'engine/npc/behaviors/NpcIdleBehavior.js';
import type { NpcController } from 'engine/npc/core/NpcController.js';
import shipLevel from './serenade.mesh-level.json';

const deck = shipLevel.colliders.find(collider => collider.name === 'Starlight main deck')!;
const FLOOR_Y = deck.position![1]! + deck.size![1]! / 2;

const DANCERS = [
    { name: 'starlight_blonde_dancer', x: -2, z: 51.8, yaw: Math.PI - .3, speed: .967 },
    { name: 'starlight_bellied_dancer', x: 2, z: 52.5, yaw: Math.PI + .3, speed: 1.02 },
] as const;

class DiscoBehavior extends NpcIdleBehavior {
    private character: THREE.Object3D | null = null;
    private skinRoot: THREE.Object3D | null = null;
    private readonly shoes: { mesh: THREE.SkinnedMesh; vertices: number[] }[] = [];
    private readonly point = new THREE.Vector3();
    constructor() { super({ lookAtPlayer: false, randomIdleMotions: false }); }
    override initialize(context: ICharacterContext): void {
        super.initialize(context);
        this.character = context.getCharacter();
    }
    override update(): THREE.Vector3 | null { return null; }
    override clone(): DiscoBehavior { return new DiscoBehavior(); }
    override getName(): string { return 'Starlight dancer'; }
    override onPlayerInteract(): boolean { return false; }

    /** The generated shoe soles differ from the engine's generic foot bones.
     * Ground the rendered skin after posing, without moving the physics body. */
    onPoseUpdated(): void {
        if (!this.character) return;
        if (!this.skinRoot) {
            this.character.traverse(object => {
                if (!(object instanceof THREE.SkinnedMesh)) return;
                const indices = object.geometry.getAttribute('skinIndex');
                const weights = object.geometry.getAttribute('skinWeight');
                if (!indices || !weights) return;
                const footBones = new Set(object.skeleton.bones.flatMap((bone, index) => /foot|toe/i.test(bone.name) ? [index] : []));
                const vertices: number[] = [];
                for (let i = 0; i < indices.count; i++) {
                    let weight = 0;
                    for (let j = 0; j < 4; j++) if (footBones.has(indices.getComponent(i, j))) weight += weights.getComponent(i, j);
                    if (weight > .5) vertices.push(i);
                }
                if (!vertices.length) return;
                this.shoes.push({ mesh: object, vertices });
                let root: THREE.Object3D = object;
                while (root.parent && root.parent !== this.character) root = root.parent;
                this.skinRoot = root;
            });
        }
        const root = this.skinRoot;
        if (!root) return;
        let lowest = Infinity;
        for (const { mesh, vertices } of this.shoes) {
            mesh.skeleton.update();
            for (const vertex of vertices) {
                mesh.getVertexPosition(vertex, this.point).applyMatrix4(mesh.matrixWorld);
                lowest = Math.min(lowest, this.point.y);
            }
        }
        if (!Number.isFinite(lowest)) return;
        root.getWorldPosition(this.point);
        this.point.y += FLOOR_Y + .002 - lowest;
        if (root.parent) root.parent.worldToLocal(this.point);
        root.position.copy(this.point);
        root.updateMatrixWorld(true);
    }
}

/** Two ship passengers dance in place, leaving the central floor free for the player. */
export class StarlightDancers {
    private readonly npcs: NpcController[] = [];

    constructor(private readonly engine: EngineLike, private readonly gameData: GameData) {}

    async load(): Promise<void> {
        try {
            for (const dancer of DANCERS) {
                const asset = this.gameData.assets?.find(asset => asset.name === dancer.name && asset.type === 'character');
                if (!asset) throw new Error(`Missing Starlight character: ${dancer.name}`);
                const manager = this.engine.registerNpc(dancer.name, new DiscoBehavior(), {
                    characterAssetId: asset.id, importance: 'hero', damageable: { canDie: false },
                });
                await manager.spawn(dancer.x, dancer.z, 1.5);
                const npc = this.engine.getNpcRegistry?.()?.get(dancer.name)?.getAllNpcs()[0];
                if (!npc) throw new Error(`Starlight dancer did not spawn: ${dancer.name}`);
                this.npcs.push(npc);
                npc.teleportTo(dancer.x, .04, dancer.z);
                npc.getCharacter().rotation.y = dancer.yaw;
                npc.setRetreatFromPlayerOverlap(false);
                // Watching dancers must not steal E / touch from the player's own dance.
                npc.setInteractionEnabledOverride(() => false);
                const animation = npc.getAnimationController();
                if (!animation) throw new Error(`Missing dancer animation controller: ${dancer.name}`);
                await animation.loadCustomAnimation('mGenDance01', { normalizeRootMotion: true, loop: true });
                const played = animation.playCustomAnimation('mGenDance01', {
                    loop: true, speed: dancer.speed, fadeInDuration: .25,
                    applyRootMotion: false, interruptOnMovement: false,
                });
                if (!played.success) throw new Error(`Dance animation failed: ${dancer.name}`);
            }
        } catch (error) { this.dispose(); throw error; }
    }

    dispose(): void {
        for (const dancer of DANCERS) this.engine.getNpcRegistry?.()?.unregisterController(dancer.name);
        this.npcs.length = 0;
    }
}
