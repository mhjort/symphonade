import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import type { ChairSeating } from './ChairSeating.js';
import type { NpcController } from 'engine/npc/core/NpcController.js';
import { FirstPersonHand, type HandLook, type HandModel } from './FirstPersonHand.js';
import { AvatarHand } from './AvatarHand.js';
import type { DrinkSpec, Vessel } from './Drinks.js';

type Motion = { kind: 'handover' | 'placing' | 'retrieving' | 'drinking'; elapsed: number; from: THREE.Vector3; rotation: THREE.Quaternion };

/** One purchased drink, shared between a first-person grip and a real tabletop. */
export class HeldDrink {
    readonly root = new THREE.Group();
    readonly vessel: Vessel;
    private readonly hand = new THREE.Group();
    private readonly steam: SteamPlume | null;
    private hotElapsed = 0;
    private readonly geometries: THREE.BufferGeometry[] = [];
    private readonly materials: THREE.MeshStandardMaterial[] = [];
    private motion: Motion | null = null;
    private owned = false;
    private full = false;
    private drinkQueued = false;
    private pouring = false;
    private readonly leftEmpties: THREE.Group[] = [];
    private tablePosition: THREE.Vector3 | null = null;
    private pose: ReturnType<NpcController['acquirePoseOverride']> = null;
    private handoverNpc: NpcController | null = null;
    private readonly handTarget = new THREE.Object3D();
    private readonly restingHand = new THREE.Vector3();
    private readonly handover = new THREE.Vector3();
    private readonly heldPosition = new THREE.Vector3();
    private readonly heldRotation = new THREE.Quaternion();
    /** Turned to the passenger's heading when set down, so the handle (and the hand that takes it) is on their right. */
    private readonly tableRotation = new THREE.Quaternion();
    private handModel: HandModel = new FirstPersonHand('right');

    constructor(private readonly engine: EngineLike, private readonly camera: () => THREE.Camera,
        private readonly seating: ChairSeating, private readonly onDrink: () => void,
        private readonly onMustSit: () => void, readonly spec: DrinkSpec) {
        this.root.name = `Player ${spec.vesselName}`;
        this.vessel = spec.buildVessel({
            material: (color, roughness = .45) => {
                const m = new THREE.MeshStandardMaterial({ color, roughness });
                this.materials.push(m); return m;
            },
            mesh: (geometry, material) => {
                this.geometries.push(geometry);
                const object = new THREE.Mesh(geometry, material);
                object.castShadow = true; object.receiveShadow = true; this.root.add(object); return object;
            },
        });
        this.vessel.setFill(1);
        this.hand.name = `${spec.vesselName} holding hand`; this.root.add(this.hand);
        // Index on top and the forearm reaching back toward the camera.
        this.hand.add(this.handModel.root);
        // The props are drawn about 1.7x life size; the hand matches them.
        this.handModel.root.scale.setScalar(1.55);
        this.handModel.root.rotation.set(0, .28, -Math.PI / 2, 'YXZ');
        this.handModel.root.position.set(...spec.grip.position);
        this.handModel.setPose(spec.grip.pose);
        this.steam = spec.hotSeconds > 0 ? new SteamPlume(spec.height - .005) : null;
        if (this.steam) this.root.add(this.steam.root);
        this.root.visible = false;
        engine.getWorldGroup().add(this.root);
    }

    /** Match the holding hand to the chosen traveler's skin and sleeve. */
    setHandLook(look: HandLook): void {
        if (this.handModel instanceof FirstPersonHand) this.handModel.setLook(look);
    }

    /** Hold drinks with the traveler's own skinned hand when their avatar is rigged for it. */
    useAvatarHand(avatar: THREE.Object3D): void {
        const next = AvatarHand.fromAvatar(avatar, 'right');
        if (!next) return;
        next.root.position.copy(this.handModel.root.position);
        next.root.quaternion.copy(this.handModel.root.quaternion);
        next.root.scale.copy(this.handModel.root.scale);
        next.setPose(this.handModel.pose);
        this.hand.add(next.root);
        this.handModel.dispose();
        this.handModel = next;
    }

    get hasDrink(): boolean { return this.owned && this.full; }
    get canOrder(): boolean { return !this.pouring && (!this.owned || (!this.full && !this.motion)); }
    get hotSecondsRemaining(): number { return this.hasDrink ? Math.max(0,this.spec.hotSeconds-this.hotElapsed) : 0; }
    get seatedDrinkHint(): string | null {
        if (!this.seating.isSettledSeated) return null;
        if (this.motion?.kind === 'drinking') return `Drinking ${this.spec.name}…`;
        if (!this.hasDrink) return null;
        return this.spec.drinkHint;
    }

    drink(): boolean {
        if (!this.hasDrink) return false;
        if (!this.seating.isSettledSeated || (this.spec.needsTable && !this.seating.getMugTablePosition())) {
            this.onMustSit();
            return false;
        }
        if (this.motion) {
            // A seated passenger can press drink while setting the cup down.
            // Complete that movement before lifting it again.
            if (this.motion.kind === 'placing' || this.motion.kind === 'handover') {
                this.drinkQueued = true;
                return true;
            }
            return false;
        }
        if (this.tablePosition) {
            // The passenger may have turned since setting it down (or sat while still turning):
            // the hand takes it by the side facing them, so lift and return never twist across.
            this.faceTableRotation();
            this.root.quaternion.copy(this.tableRotation);
        }
        this.motion = { kind:'drinking', elapsed:0, from:this.root.position.clone(), rotation:this.root.quaternion.clone() };
        return true;
    }

    private faceTableRotation(): void {
        const forward = this.camera().getWorldDirection(new THREE.Vector3());
        this.tableRotation.setFromAxisAngle(new THREE.Vector3(0,1,0), Math.atan2(-forward.x,-forward.z));
    }

    receive(cashier: NpcController, from: THREE.Vector3): void {
        if (!this.canOrder && !this.pouring) return;
        this.pouring = false;
        this.owned = true;
        this.full = true;
        this.vessel.setFill(1);
        this.hotElapsed = 0;
        this.handover.copy(from);
        this.root.position.copy(from);
        this.root.quaternion.identity();
        this.root.visible = true;
        this.hand.visible = false;
        if (cashier.isRenderingSkinnedMesh()) {
            this.handoverNpc = cashier;
            cashier.getBodyPartObject('rightHand')?.getWorldPosition(this.restingHand);
            this.handTarget.position.copy(from).add(new THREE.Vector3(.13, .10, 0));
            this.engine.getWorldGroup().add(this.handTarget);
            cashier.setSkinnedArmGrip('right', this.handTarget, new THREE.Vector3(), new THREE.Euler());
        } else {
            this.pose = cashier.acquirePoseOverride({ parts: ['rightUpperArm','rightForearm','rightHand'], preserveRootHeight: true, preserveFeet: true });
        }
        this.motion = { kind:'handover', elapsed:0, from:from.clone(), rotation:this.root.quaternion.clone() };
    }

    /** Display the same glass under the tap before the handover begins. */
    showPour(position: THREE.Vector3, progress: number): void {
        this.pouring = true;
        this.root.visible = true;
        this.root.position.copy(position);
        this.root.quaternion.identity();
        this.hand.visible = false;
        this.steam?.hide();
        this.vessel.setFill(progress);
    }

    cancelPour(): void {
        this.pouring = false;
        this.root.visible = false;
    }

    private heldTransform(): void {
        const camera = this.camera();
        camera.updateWorldMatrix(true,false);
        const perspective = camera instanceof THREE.PerspectiveCamera ? camera : null;
        const aspect = perspective?.aspect ?? 1;
        // Keep the full grip inside a narrow portrait viewport, above the wallet.
        this.heldPosition.set(aspect < 1 ? .075 : .20, -.27, -.68).applyMatrix4(camera.matrixWorld);
        camera.getWorldQuaternion(this.heldRotation);
        this.heldRotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), .18));
    }


    update(dt: number): void {
        if (!this.owned || this.pouring) return;
        if (!this.seating.isSettledSeated) this.drinkQueued = false;
        this.heldTransform();
        const spot = this.seating.getMugTablePosition();
        if (!this.motion) {
            if (spot && !this.tablePosition) {
                this.tablePosition = spot;
                this.faceTableRotation();
                this.motion = { kind:'placing',elapsed:0,from:this.root.position.clone(),rotation:this.root.quaternion.clone() };
            } else if (!spot && this.tablePosition) {
                if (!this.full) {
                    this.leaveEmpty();
                    return;
                }
                this.motion = { kind:'retrieving',elapsed:0,from:this.root.position.clone(),rotation:this.root.quaternion.clone() };
                this.tablePosition = null;
            }
        }
        const motion = this.motion;
        if (motion?.kind === 'drinking') {
            this.updateDrinking(dt, motion);
            this.updateSteam(dt);
            return;
        }
        if (motion) {
            motion.elapsed += Math.max(0,Math.min(dt,.1));
            const handover = motion.kind === 'handover';
            const duration = handover ? 1.35 : .7;
            const t = Math.min(1,motion.elapsed/duration);
            const travel = THREE.MathUtils.smootherstep(t,handover ? .28 : 0,1);
            const placing = motion.kind === 'placing';
            const target = placing ? this.tablePosition! : this.heldPosition;
            this.root.position.lerpVectors(motion.from,target,travel);
            this.root.position.y += Math.sin(Math.PI*travel)*.10;
            this.root.quaternion.slerpQuaternions(motion.rotation,placing ? this.tableRotation : this.heldRotation,travel);
            this.hand.visible = handover ? t > .62 : !placing || t < .88;

            if (handover && this.handoverNpc) {
                this.handTarget.position.copy(this.handover).add(new THREE.Vector3(.13, .10, 0));
                this.handTarget.position.lerp(this.restingHand, THREE.MathUtils.smootherstep(t, .38, .72));
                if (t >= .72) this.releaseHand();
            }
            if (handover && this.pose) {
                // Reach to the handle, then let go as the passenger takes it.
                this.pose.setHandTarget('right',this.handover.clone().add(new THREE.Vector3(.13,.10,0)));
                this.pose.setWeight(1-THREE.MathUtils.smootherstep(t,.38,.72));
            }
            if (t === 1) {
                this.motion = null;
                this.pose?.release(); this.pose = null;
            }
        } else if (this.tablePosition) {
            this.root.position.copy(this.tablePosition); this.root.quaternion.copy(this.tableRotation);
            this.hand.visible = false;
        } else {
            this.root.position.copy(this.heldPosition); this.root.quaternion.copy(this.heldRotation);
            this.hand.visible = true;
        }
        this.updateSteam(dt);
        if (this.drinkQueued && !this.motion) {
            this.drinkQueued = false;
            this.drink();
        }
    }

    private updateDrinking(dt: number, motion: Motion): void {
        // Standing interrupts a sip before it can consume the drink or grant energy.
        // If the sip already completed while seated, retain its empty-cup state.
        if (!this.seating.isSettledSeated) {
            this.motion = null;
            if (this.full) this.vessel.setFill(1);
            this.root.position.copy(this.tablePosition ?? this.heldPosition);
            this.root.quaternion.copy(this.tablePosition ? this.tableRotation : this.heldRotation);
            this.hand.visible = !this.tablePosition;
            if (this.full) this.onMustSit();
            return;
        }
        const previousTime = motion.elapsed;
        motion.elapsed += Math.max(0, Math.min(dt, .1));
        const time = motion.elapsed;
        // Fire each cue once, on the animation timeline, through the muteable
        // engine SFX bus. Interrupted drinks never reach the satisfied exhale.
        if (previousTime < .45 && time >= .45) this.engine.playSound(this.spec.sounds.sip, { volume: .55 });
        if (previousTime < 1.15 && time >= 1.15) this.engine.playSound(this.spec.sounds.exhale, { volume: .5 });
        const camera = this.camera();
        // Tip the base up past level with the rim at the lips, just below the view, so the
        // passenger sees the raised cup and hand rather than looking into the opening.
        const angle = 1.75, height = this.spec.height;
        const mouth = new THREE.Vector3(.04,-Math.cos(angle)*height-.16,-Math.sin(angle)*height-.16).applyMatrix4(camera.matrixWorld);
        const tilt = camera.getWorldQuaternion(new THREE.Quaternion()).multiply(
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), angle));
        const returning = time >= 1.15;
        const progress = returning ? THREE.MathUtils.smootherstep(time,1.15,1.9) : THREE.MathUtils.smootherstep(time,0,.65);
        if (returning) {
            this.root.position.lerpVectors(mouth,this.tablePosition ?? this.heldPosition,progress);
            this.root.quaternion.slerpQuaternions(tilt,this.tablePosition ? this.tableRotation : this.heldRotation,progress);
        } else {
            this.root.position.lerpVectors(motion.from,mouth,progress);
            this.root.quaternion.slerpQuaternions(motion.rotation,tilt,progress);
        }
        this.hand.visible = true;
        if (this.full) {
            this.vessel.setFill(1 - THREE.MathUtils.smootherstep(time,.65,1));
            if (time >= 1) {
                this.full = false;
                this.vessel.setFill(0);
                this.steam?.hide();
                this.onDrink();
            }
        }
        if (time >= 1.9) {
            this.motion = null;
            this.hand.visible = !this.tablePosition;
        }
    }

    private leaveEmpty(): void {
        // Keep the actual empty cup or glass on its table when the passenger walks away.
        // Clones share immutable geometry/materials and are removed on disposal.
        this.root.position.copy(this.tablePosition!);
        this.root.quaternion.copy(this.tableRotation);
        this.hand.visible = false;
        this.steam?.hide();
        const left = this.root.clone(true);
        left.name = `Empty ${this.spec.vesselName}`;
        this.engine.getWorldGroup().add(left);
        this.leftEmpties.push(left);
        this.root.visible = false;
        this.owned = false;
        this.tablePosition = null;
    }

    private updateSteam(dt: number): void {
        // Cooling uses gameplay seconds, so pausing also pauses the hot drink.
        this.hotElapsed = Math.min(this.spec.hotSeconds,this.hotElapsed+Math.max(0,dt));
        // Steam at the lips would fog the whole view.
        if (this.motion?.kind === 'drinking') this.steam?.hide();
        else this.steam?.update(this.hotElapsed, this.hotSecondsRemaining, this.root);
    }

    private releaseHand(): void {
        this.handoverNpc?.clearSkinnedArmGrip('right');
        this.handoverNpc = null;
        this.handTarget.removeFromParent();
    }

    dispose(): void {
        this.releaseHand();
        this.pose?.release(); this.pose = null;
        this.root.removeFromParent();
        for (const empty of this.leftEmpties) empty.removeFromParent();
        this.handModel.dispose();
        this.steam?.dispose();
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials) material.dispose();
    }
}

/** Soft rising steam over a hot drink; it stays upright however the cup is tilted. */
class SteamPlume {
    readonly root = new THREE.Group();
    private readonly puffs: THREE.Sprite[] = [];
    private readonly texture: THREE.CanvasTexture;

    constructor(rim: number) {
        // Ordinary Three sprite materials work on both renderers. One shared tiny
        // texture; no particle allocations per frame.
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const context = canvas.getContext('2d')!;
        const gradient = context.createRadialGradient(32,32,0,32,32,32);
        gradient.addColorStop(0,'rgba(255,255,255,0.8)');
        gradient.addColorStop(.4,'rgba(255,255,255,0.4)');
        gradient.addColorStop(1,'rgba(255,255,255,0)');
        context.fillStyle = gradient; context.fillRect(0,0,64,64);
        this.texture = new THREE.CanvasTexture(canvas);
        this.root.name = 'Hot drink steam';
        this.root.position.y = rim;
        this.root.visible = false;
        for (let i=0;i<12;i++) {
            const puff = new THREE.Sprite(new THREE.SpriteMaterial({
                map:this.texture, color:0xf4f5f5, transparent:true,
                opacity:0, depthWrite:false, toneMapped:false,
            }));
            this.root.add(puff); this.puffs.push(puff);
        }
    }

    hide(): void { this.root.visible = false; }

    update(elapsed: number, remaining: number, vessel: THREE.Object3D): void {
        this.root.visible = remaining > 0;
        if (!this.root.visible) return;
        vessel.getWorldQuaternion(this.root.quaternion).invert();
        const cooling = Math.min(1,remaining/2);
        for (const [i,puff] of this.puffs.entries()) {
            const phase = (elapsed/1.9+i/this.puffs.length)%1;
            const curl = elapsed*1.8+i*1.7;
            puff.position.set(Math.sin(curl)*(.012+phase*.024),phase*.32,Math.cos(curl*.8)*.017);
            const size = .035+phase*.065;
            puff.scale.set(size*.75,size*1.35,1);
            puff.material.opacity = Math.sin(Math.PI*phase)*.48*cooling;
            puff.material.rotation = Math.sin(curl)*.3;
        }
    }

    dispose(): void {
        for (const puff of this.puffs) puff.material.dispose();
        this.texture.dispose();
    }
}
