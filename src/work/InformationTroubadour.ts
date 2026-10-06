import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import { NpcIdleBehavior } from 'engine/npc/behaviors/NpcIdleBehavior.js';
import type { NpcController } from 'engine/npc/core/NpcController.js';
import { POSTURE_ANIMATIONS } from 'engine/AnimationPacks.js';
import { PhysicsBodyFactory } from 'engine/physics/PhysicsBodyFactory.js';
import { CollisionGroup } from 'engine/CollisionLayers.js';
import { TroubadourMusic } from './TroubadourMusic.js';

const NPC_ID = 'information_troubadour';
const POSITION = new THREE.Vector3(4.35, 0.04, 13.4);
const YAW = -Math.PI / 2;
// The seated clip uses a hips-centred rig origin; anchor it above the chair seat.
const SEATED_ORIGIN_Y = POSITION.y + .54;

class TroubadourBehavior extends NpcIdleBehavior {
    constructor() { super({ lookAtPlayer: false, randomIdleMotions: false }); }
    override update(): THREE.Vector3 | null { return null; }
    override clone(): TroubadourBehavior { return new TroubadourBehavior(); }
    override getName(): string { return 'Acoustic troubadour'; }
}

/** A self-contained seated act beside Information; no ship re-export required. */
export class InformationTroubadour {
    private readonly stage = new THREE.Group();
    private readonly guitar = new THREE.Group();
    private readonly music: TroubadourMusic;
    private npc: NpcController | null = null;
    private readonly frettingHand = new THREE.Object3D();
    private readonly strummingHand = new THREE.Object3D();
    private chairBody: ReturnType<typeof PhysicsBodyFactory.createStaticBody> | null = null;
    private elapsed = 0;
    private readonly geometries = new Set<THREE.BufferGeometry>();
    private readonly materials = new Set<THREE.Material>();

    constructor(private readonly engine: EngineLike) {
        this.stage.name = 'Information acoustic act';
        this.stage.position.copy(POSITION);
        this.stage.rotation.y = YAW;
        this.music = new TroubadourMusic(engine, POSITION.clone().add(new THREE.Vector3(0, .85, 0)));
    }

    private material(color: number, roughness = .7): THREE.MeshStandardMaterial {
        const material = new THREE.MeshStandardMaterial({ color, roughness });
        this.materials.add(material);
        return material;
    }

    private mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
        position: [number, number, number], parent: THREE.Object3D = this.stage): THREE.Mesh {
        this.geometries.add(geometry);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.position.set(...position);
        mesh.castShadow = true; mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }

    private buildProps(): void {
        const wood = this.material(0x633d25), seat = this.material(0x243e47);
        const top = this.material(0xd49b50), edge = this.material(0x693519);
        const dark = this.material(0x241b16), cream = this.material(0xeee0bd), steel = this.material(0xb4b5ae, .3);
        const box = (name: string, size: [number, number, number], pos: [number, number, number],
            mat: THREE.Material, parent = this.stage) => this.mesh(name, new THREE.BoxGeometry(...size), mat, pos, parent);
        box('Troubadour chair seat', [.64, .10, .50], [0, .48, 0], seat);
        for (const x of [-.25, .25]) {
            for (const z of [-.23, .23]) box('Chair leg', [.065, .44, .065], [x, .22, z], wood);
            box('Chair back upright', [.065, .66, .065], [x, .79, -.24], wood);
            box('Chair side stretcher', [.05, .05, .46], [x, .2, 0], wood);
        }
        for (const y of [.76, .99]) box('Chair back slat', [.56, .10, .045], [0, y, -.25], wood);
        box('Chair footrest', [.58, .055, .16], [0, .22, .38], wood);
        // A small rug defines the act's footprint without adding a raised stage.
        box('Acoustic act rug', [1.75, .012, 1.45], [0, .012, .10], this.material(0x8a5341));
        this.stage.add(this.guitar);
        this.guitar.name = 'Acoustic guitar';
        this.guitar.position.set(-.15, .68, .46);
        this.guitar.rotation.z = -Math.PI / 2 + .25;
        const body = new THREE.Shape();
        body.moveTo(0, -.29);
        body.bezierCurveTo(-.27, -.29, -.28, -.03, -.14, .045);
        body.bezierCurveTo(-.10, .08, -.22, .17, -.16, .25);
        body.bezierCurveTo(-.10, .34, .10, .34, .16, .25);
        body.bezierCurveTo(.22, .17, .10, .08, .14, .045);
        body.bezierCurveTo(.28, -.03, .27, -.29, 0, -.29);
        this.mesh('Guitar mahogany body', new THREE.ExtrudeGeometry(body, {
            depth: .085, bevelEnabled: true, bevelThickness: .009, bevelSize: .009, bevelSegments: 1, curveSegments: 10,
        }), edge, [0, 0, -.085], this.guitar);
        this.mesh('Guitar spruce soundboard', new THREE.ShapeGeometry(body, 10), top, [0, 0, .012], this.guitar);
        const hole = this.mesh('Guitar sound hole', new THREE.CircleGeometry(.064, 24), dark, [0, .095, .017], this.guitar);
        hole.castShadow = false;
        this.mesh('Guitar rosette', new THREE.RingGeometry(.068, .076, 24), cream, [0, .095, .019], this.guitar);
        box('Guitar neck', [.07, .48, .043], [0, .48, -.018], edge, this.guitar);
        box('Guitar fingerboard', [.066, .49, .012], [0, .475, .017], dark, this.guitar);
        box('Guitar headstock', [.105, .15, .04], [0, .78, -.015], wood, this.guitar);
        box('Guitar bridge', [.145, .035, .018], [0, -.135, .026], dark, this.guitar);
        for (let i = 0; i < 12; i++) box('Guitar fret', [.067, .003, .004], [0, .255 + i * .035, .026], steel, this.guitar);
        for (let i = 0; i < 6; i++) box('Guitar string', [.0014, .88, .0014], [-.025 + i * .01, .30, .037], cream, this.guitar);
        for (const x of [-.064, .064]) for (const y of [.73, .78, .83]) {
            box('Guitar tuning peg', [.038, .019, .018], [x, y, -.01], steel, this.guitar);
        }
    }

    async load(): Promise<void> {
        try {
            this.buildProps();
            this.engine.getWorldGroup().add(this.stage);
            const manager = this.engine.registerNpc(NPC_ID, new TroubadourBehavior(), {
                characterAssetId: 'asset_1789652495848_2w95xv', importance: 'hero', damageable: { canDie: false },
            });
            await manager.spawn(POSITION.x, POSITION.z, 1.5);
            this.npc = this.engine.getNpcRegistry?.()?.get(NPC_ID)?.getAllNpcs()[0] ?? null;
            if (!this.npc) throw new Error('Troubadour did not spawn');
            this.npc.teleportTo(POSITION.x, SEATED_ORIGIN_Y, POSITION.z);
            this.npc.setRetreatFromPlayerOverlap(false);
            this.npc.getCharacter().rotation.y = YAW;
            const animation = this.npc.getAnimationController();
            if (!animation) throw new Error('Troubadour animation controller missing');
            await animation.loadAnimationPack(POSTURE_ANIMATIONS.filter(clip => clip.motionId === 'mGenSitHold01'));
            animation.setPosture('sit');
            this.stage.add(this.frettingHand, this.strummingHand);
            this.frettingHand.position.set(.30, .67, .41);
            this.strummingHand.position.set(-.16, .85, .54);
            this.npc.setSkinnedArmGrip('left', this.frettingHand, new THREE.Vector3(), this.handRotation('left', new THREE.Vector3(.1, 1, 0), new THREE.Vector3(0, 0, 1)));
            this.npc.setSkinnedArmGrip('right', this.strummingHand, new THREE.Vector3(), this.handRotation('right', new THREE.Vector3(.45, -1, 0), new THREE.Vector3(0, 0, -1)));
            this.curlFingers();
            // Solid to the player; the seated NPC's own capsule must not stand on the seat.
            if (!this.engine.physicsWorld) throw new Error('Troubadour requires physics');
            this.chairBody = PhysicsBodyFactory.createStaticBody(this.engine.physicsWorld,
                POSITION.clone().add(new THREE.Vector3(0, .53, 0)), {
                    shape: { type: 'box', halfExtents: new THREE.Vector3(.34, .53, .34) },
                    collisionGroup: CollisionGroup.ENVIRONMENT, collisionMask: CollisionGroup.PLAYER,
                });
            await this.music.load();
        } catch (error) { this.dispose(); throw error; }
    }

    /** Map the rig's anatomical hand frame to the guitar, rather than assuming bone axes. */
    private handRotation(side: 'left' | 'right', fingers: THREE.Vector3, palm: THREE.Vector3): THREE.Euler {
        const hand = this.npc!.getBodyPartObject(side + 'Hand')!;
        const find = (finger: string) => {
            const bone = hand.children.find(child => child.name.endsWith(finger + '1'));
            if (!bone) throw new Error(`Troubadour ${side} ${finger} bone missing`);
            return bone.position.clone();
        };
        const y = find('Middle').normalize();
        const x = find('Index').sub(find('Pinky'));
        x.addScaledVector(y, -x.dot(y)).normalize();
        const z = new THREE.Vector3().crossVectors(x, y).normalize();
        const source = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
        const targetY = fingers.normalize();
        const targetZ = palm.multiplyScalar(side === 'left' ? -1 : 1).normalize();
        const targetX = new THREE.Vector3().crossVectors(targetY, targetZ).normalize();
        targetZ.crossVectors(targetX, targetY).normalize();
        const target = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(targetX, targetY, targetZ));
        return new THREE.Euler().setFromQuaternion(target.multiply(source.invert()));
    }

    private curlFingers(): void {
        const rotations = new Map<string, THREE.Quaternion>();
        // This Mixamo rig's fingers run along +Y; left/right palm normals are -X/+X.
        // Curl about Z towards the palm, leaving the thumb loosely opposed.
        for (const side of ['Left', 'Right']) {
            const sign = side === 'Left' ? 1 : -1;
            for (let joint = 1; joint <= 2; joint++) {
                rotations.set(`mixamorig${side}HandThumb${joint}`,
                    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sign * .4));
            }
            for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) {
                for (let joint = 1; joint <= 3; joint++) {
                    const angle = side === 'Left' ? .70 : (finger === 'Index' ? .35 : .55);
                    rotations.set(`mixamorig${side}Hand${finger}${joint}`,
                        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sign * angle));
                }
            }
        }
        this.npc!.getAnimationController()!.setProceduralPoseLayer('guitar-fingers', {
            rotations, weight: 1, fadeIn: 0, fadeOut: 0, duration: null,
        });
    }

    update(dt: number, listener: THREE.Vector3): void {
        this.music.update(listener);
        if (!this.npc) return;
        // This stationary performer is anchored to his chair, independent of KCC settling.
        this.npc.holdPhysicsUntilReady();
        this.npc.teleportTo(POSITION.x, SEATED_ORIGIN_Y, POSITION.z);
        this.elapsed += Math.max(0, Math.min(dt, .1));
        // Engine IK places both hands after the seated animation is evaluated.
        const stroke = Math.sin(this.elapsed * Math.PI * 2 * 2.8);
        this.strummingHand.position.set(-.16 + stroke * .012, .85 + stroke * .025, .54);
    }

    dispose(): void {
        this.music.dispose();
        this.npc?.clearSkinnedArmGrip('left');
        this.npc?.clearSkinnedArmGrip('right');
        this.engine.getNpcRegistry?.()?.unregisterController(NPC_ID);
        this.npc = null;
        if (this.chairBody) this.engine.physicsWorld?.removeRigidBody(this.chairBody.rigidBody);
        this.chairBody = null;
        this.stage.removeFromParent();
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials) material.dispose();
    }
}
