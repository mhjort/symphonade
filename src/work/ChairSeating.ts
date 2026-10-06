import * as THREE from 'three';
import { renderButtonContent } from 'engine/ui/buttonContent.js';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import { InteractableComponent } from 'engine/InteractableComponent.js';
import type { PhysicsWorld } from 'engine/physics/PhysicsWorld.js';
import { WalkingAndJumpingMovement } from 'engine/WalkingAndJumpingMovement.js';
import type { IPlayerMovement } from 'engine/IPlayerMovement.js';
import type { PlayerController } from 'engine/PlayerController.js';
import type { FirstPersonCamera } from 'engine/FirstPersonCamera.js';
import type { GameHUD } from './GameHUD.js';
import shipLevel from './serenade.mesh-level.json';

type Seat = { bed?: boolean; name: string; position: THREE.Vector3; forward: THREE.Vector3; mugPosition: THREE.Vector3 | null };
type SeatTransition = {
    kind: 'sitting' | 'standing'; elapsed: number; duration: number;
    from: THREE.Vector3; to: THREE.Vector3; fromEye: number; toEye: number;
    turn: number; appliedTurn: number; appliedLean: number; fromPitch: number; toPitch: number;
};

/** Holds position while preserving input processing and free camera look. */
class SeatedMovement extends WalkingAndJumpingMovement {
    override update(): void {}
    override getSupportedKeys() { return { ascend: false, descend: false }; }
    handlesPlayerPositionSync(): boolean { return true; }
    override shouldShowPlayer(): boolean { return false; }
}

/** First-person seating for the ship's existing chair cushions and stools. */
export class ChairSeating {
    setPlayerObject(player: THREE.Object3D): void { this.playerObject = player; }
    private readonly seats: Seat[] = [];
    private readonly ray = new THREE.Raycaster();
    private readonly solids: THREE.Object3D[] = [];
    private seated: Seat | null = null;
    private previousMovement: IPlayerMovement | null = null;
    private returnPosition = new THREE.Vector3();
    private eyeHeight = 1.6;
    private standingPitch = 0;
    private pressed = false;
    private availableSeat: Seat | null = null;
    private readonly interactions: InteractableComponent[] = [];
    private transition: SeatTransition | null = null;
    private readonly viewPosition = new THREE.Vector3();
    private readonly returnViewPosition = new THREE.Vector3();

    constructor(root: THREE.Object3D, private readonly player: PlayerController,
        private playerObject: THREE.Object3D, private readonly camera: FirstPersonCamera,
        private readonly hud: GameHUD, physicsWorld: PhysicsWorld) {
        root.updateMatrixWorld(true);
        root.traverse(object => { if (object instanceof THREE.Mesh) this.solids.push(object); });
        // Visual meshes are merged by material at export. The physics manifest
        // retains the individual furniture names, positions and dimensions.
        const tables: THREE.Vector3[] = [];
        const surfaces: Array<{ center: THREE.Vector3; half: THREE.Vector3; yaw: number; round: boolean }> = [];
        for (const collider of shipLevel.colliders) {
            if (!/lounge (round table collision|booth table)|tabletop|Street cafe table|^Bon Vivant table [-\d.]+ [-\d.]+$|CoffeeCo (shared table|wall bar|terrace table)/.test(collider.name)) continue;
            if (collider.position && collider.size) {
                const center = new THREE.Vector3(...collider.position);
                tables.push(center);
                surfaces.push({ center, half: new THREE.Vector3(...collider.size).multiplyScalar(.5), yaw: collider.yaw ?? 0, round: /lounge round table/.test(collider.name) });
            }
            else if (collider.vertices) {
                const points: THREE.Vector3[] = [];
                for (let i = 0; i < collider.vertices.length; i += 3) points.push(new THREE.Vector3(...collider.vertices.slice(i, i + 3)));
                const box = new THREE.Box3().setFromPoints(points);
                const center = box.getCenter(new THREE.Vector3());
                tables.push(center);
                surfaces.push({ center, half: box.getSize(new THREE.Vector3()).multiplyScalar(.5), yaw: 0, round: true });
            }
        }
        for (const collider of shipLevel.colliders) {
            const { name, position, size } = collider;
            if (!position || !size || !/lounge (tub collision|booth plinth)|chair (seat|.* body|.* envelope|collision)|CoffeeCo .* collision/.test(name)) continue;
            const width = size[0], height = size[1], centerY = position[1];
            if (width === undefined || height === undefined || centerY === undefined) continue;
            const point = new THREE.Vector3(...position);
            if (/lounge tub collision/.test(name)) point.y = .57;
            else if (/lounge booth plinth/.test(name)) { point.y = .65; point.x -= width / 2 - .5; }
            else if (/chair seat/.test(name)) point.y += height / 2;
            else if (/ body$/.test(name)) point.y += .05;
            else if (/ envelope$/.test(name)) point.y -= .045;
            else if (/^CoffeeCo/.test(name)) point.y = centerY - height / 2 + height - .58 + .0375;
            else point.y += .01;
            const forward = new THREE.Vector3(0, 0, 1);
            if (/Starlight/.test(name)) forward.set(-Math.sign(point.x), 0, 0);
            else if (!/Sea View/.test(name)) {
                const back = shipLevel.colliders.find(c => c.name === name.replace('chair seat', 'chair back'));
                if (back?.position && back.name !== name) forward.copy(point).sub(new THREE.Vector3(...back.position)).setY(0).normalize();
                else {
                    const table = tables.filter(t => Math.abs(t.y - point.y) < .7)
                        .sort((a, b) => a.distanceToSquared(point) - b.distanceToSquared(point))[0];
                    if (table && table.distanceTo(point) < 2) forward.copy(table).sub(point).setY(0).normalize();
                }
            }
            // Resolve an actual supported tabletop point, not its center height.
            // Long shared tables keep each mug in front of its own stool.
            let mugPosition: THREE.Vector3 | null = null;
            let reach = 1.45;
            for (const table of surfaces) {
                const top = table.center.y + table.half.y;
                if (top < point.y - .15 || top > point.y + .8) continue;
                const local = point.clone().sub(table.center).applyAxisAngle(new THREE.Vector3(0, 1, 0), -table.yaw);
                const x = Math.max(0, table.half.x - .16), z = Math.max(0, table.half.z - .16);
                if (table.round) {
                    // Out by the rim, clear of the lounge tables' centrepiece.
                    local.setY(0).setLength(Math.min(x, z));
                } else {
                    local.x = THREE.MathUtils.clamp(local.x, -x, x);
                    local.z = THREE.MathUtils.clamp(local.z, -z, z);
                }
                local.y = table.half.y + .004;
                const spot = local.applyAxisAngle(new THREE.Vector3(0, 1, 0), table.yaw).add(table.center);
                const direction = spot.clone().sub(point).setY(0);
                const distance = direction.length();
                if (distance >= reach || direction.normalize().dot(forward) < .25) continue;
                mugPosition = spot; reach = distance;
            }
            this.seats.push({ name, position: point, forward, mugPosition });
        }
        for (const collider of shipLevel.colliders) {
            if (!/bed base$/.test(collider.name) || !collider.position || !collider.size) continue;
            this.seats.push({ name: collider.name, bed: true,
                position: new THREE.Vector3(...collider.position).add(new THREE.Vector3(0, collider.size[1]! / 2 + .12, 0)),
                forward: new THREE.Vector3(collider.position[0]! < 11 ? 1 : -1, 0, 0), mugPosition: null });
        }
        for (const seat of this.seats) {
            const anchor = new THREE.Object3D();
            anchor.position.copy(seat.position);
            this.interactions.push(new InteractableComponent(physicsWorld, {
                object3D: anchor, radius: 2.2,
                interactable: {
                    interactionEnabled: () => !this.seated && !this.transition && this.availableSeat === seat,
                    getInteractStartDisplayName: () => seat.bed ? 'Sleep · Recover energy' : 'Sit down',
                    onInteractStart: () => {
                        if (!getGameStateManager().isState(GameState.PLAYING) || this.seated || this.transition || this.availableSeat !== seat || !this.player.getControlsEnabled()) return false;
                        this.sit(seat);
                        return true;
                    },
                },
            }));
        }
        this.hud.createIconText('chair-seating', { anchor: 'bottom-center', icon: '🪑', text: '' });
        this.hud.hideElement('chair-seating');
        console.log(`[ChairSeating] ${this.seats.length} chairs available`);
    }

    get isSeated(): boolean { return this.seated !== null; }
    get isSettledSeated(): boolean { return this.seated !== null && !this.seated.bed && this.transition === null; }
    /** The chair the player has fully settled into, for venue service. */
    get settledSeatName(): string | null { return this.isSettledSeated ? this.seated!.name : null; }
    get isSleeping(): boolean { return this.seated?.bed === true && this.transition === null; }

    /** A mug is set down once the player settles, and picked up as standing begins. */
    getMugTablePosition(): THREE.Vector3 | null {
        return this.seated && !this.transition ? this.seated.mugPosition?.clone() ?? null : null;
    }

    private nearest(): Seat | null {
        const p = this.player.getGroundPosition();
        let nearest: Seat | null = null, distance = 1.65;
        for (const seat of this.seats) {
            if (seat.bed) {
                const room = shipLevel.volumes.find(volume => volume.name === seat.name.replace(' bed base', ''));
                if (!room || Math.abs(p.x - room.position[0]!) >= room.size[0]! / 2
                    || Math.abs(p.z - room.position[2]!) >= room.size[2]! / 2) continue;
            }
            const height = seat.position.y - p.y;
            if (height < .2 || height > .95) continue;
            const d = Math.hypot(p.x - seat.position.x, p.z - seat.position.z);
            if (d >= distance) continue;
            // Prevent sitting through walls or counters, even when a chair is close.
            const from = p.clone().add(new THREE.Vector3(0, 1.05, 0));
            const to = seat.position.clone().add(new THREE.Vector3(0, .55, 0));
            const direction = to.sub(from);
            this.ray.set(from, direction.clone().normalize());
            this.ray.far = Math.max(0, direction.length() - .35);
            if (this.ray.intersectObjects(this.solids, false).length) continue;
            nearest = seat; distance = d;
        }
        return nearest;
    }

    prepareInteractions(): void {
        this.availableSeat = this.seated || this.transition ? null : this.nearest();
    }

    update(deltaTime: number): void {
        const playing = getGameStateManager().isState(GameState.PLAYING);
        const down = this.player.keys.stand === true;
        if (playing && down && !this.pressed && (this.isSettledSeated || this.isSleeping) && this.player.getControlsEnabled()) this.stand();
        this.pressed = this.player.getDesktopControls().isAnyKeyDown(['KeyF']);
        this.player.keys.stand = false;
        if (playing && this.transition && this.player.getControlsEnabled()) this.advanceTransition(deltaTime);
        const button = this.player.getMobileControls().getButton('stand');
        if (button) {
            const visible = (this.isSettledSeated || this.isSleeping) && playing && this.player.getControlsEnabled();
            const label = this.seated?.bed ? 'WAKE' : 'STAND';
            if (button.getAttribute('aria-label') !== label) renderButtonContent(button, 'hud-mobile-button', { label });
            button.style.display = visible ? '' : 'none';
            button.style.opacity = visible ? '1' : '0';
            button.style.pointerEvents = visible ? 'auto' : 'none';
        }
        if (this.seated) {
            const sleepText = this.player.getMobileControls().isEnabled()
                ? 'Sleeping · Energy +2%/s · Time flies' : 'Sleeping · Recovering energy · Time flies · F · Wake up';
            const text = this.seated.bed
                ? this.transition ? (this.transition.kind === 'sitting' ? 'Lying down…' : 'Waking up…')
                    : sleepText
                : this.transition ? (this.transition.kind === 'sitting' ? 'Sitting down…' : 'Standing up…')
                    : this.player.getMobileControls().isEnabled() ? 'STAND · Stand up' : 'F · Stand up';
            this.hud.updateIconText('chair-seating', { text, icon: this.seated.bed ? '💤' : '🪑' });
            this.hud.showElement('chair-seating');
        } else {
            this.hud.hideElement('chair-seating');
            if (this.availableSeat?.bed && playing && this.player.getControlsEnabled())
                this.player.showInteractionPrompt('Sleep · Recover energy, time passes faster');
        }
    }

    private sit(seat: Seat): void {
        this.returnPosition.copy(this.player.getGroundPosition());
        this.returnViewPosition.copy(this.playerObject.position);
        this.viewPosition.copy(this.playerObject.position);
        this.eyeHeight = this.camera.getEyeHeight();
        this.standingPitch = this.camera.getViewPitch();
        this.previousMovement = this.player.getMovementSystem();
        this.seated = seat;
        this.player.setMovementSystem(new SeatedMovement());
        this.player.setCapsuleBodyEnabled(false);
        this.player.setInteractionsSuppressed(true);
        const targetYaw = Math.atan2(-seat.forward.x, -seat.forward.z);
        const yawDelta = targetYaw - this.camera.getHorizontalAngle();
        this.transition = {
            kind: 'sitting', elapsed: 0, duration: seat.bed ? 2.2 : 1.15,
            from: this.viewPosition.clone(), to: new THREE.Vector3(seat.position.x, this.returnPosition.y, seat.position.z),
            fromEye: this.eyeHeight, toEye: seat.position.y - this.returnPosition.y + (seat.bed ? .22 : .75),
            turn: Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta)), appliedTurn: 0, appliedLean: 0,
            fromPitch: this.standingPitch, toPitch: seat.bed ? -Math.PI * .46 : this.standingPitch,
        };
    }

    /** Run after the normal physics sync and before the camera update. */
    syncView(): void {
        if (this.seated) this.playerObject.position.copy(this.viewPosition);
    }

    private stand(): void {
        if (!this.seated || !this.previousMovement) return;
        this.transition = {
            kind: 'standing', elapsed: 0, duration: this.seated.bed ? 1.8 : 1.0,
            from: this.viewPosition.clone(), to: this.returnViewPosition.clone(),
            fromEye: this.camera.getEyeHeight(), toEye: this.eyeHeight,
            turn: 0, appliedTurn: 0, appliedLean: 0,
            fromPitch: this.camera.getViewPitch(), toPitch: this.standingPitch,
        };
    }

    private advanceTransition(deltaTime: number): void {
        const motion = this.transition;
        if (!motion || !this.seated) return;
        motion.elapsed += Math.max(0, Math.min(deltaTime, .1));
        const t = Math.min(1, motion.elapsed / motion.duration);
        const ease = (start: number, end: number) => THREE.MathUtils.smootherstep(t, start, end);
        const sitting = motion.kind === 'sitting';
        if (this.seated.bed) {
            // Sit on the mattress, then lower the shoulders and head onto the
            // pillow. The authored pillows lie 0.7 m toward the wall from center.
            const recline = ease(.35, 1);
            const rise = ease(0, .65);
            const seatedEye = this.seated.position.y - this.returnPosition.y + .75;
            const center = this.seated.position;
            if (sitting) {
                this.viewPosition.set(center.x, this.returnPosition.y, center.z);
                this.viewPosition.lerpVectors(motion.from, this.viewPosition, ease(0, .45));
                this.viewPosition.addScaledVector(this.seated.forward, -.7 * recline);
                const sitHeight = THREE.MathUtils.lerp(motion.fromEye, seatedEye, ease(0, .45));
                this.camera.setEyeHeight(THREE.MathUtils.lerp(sitHeight, motion.toEye, recline));
                const sitPitch = THREE.MathUtils.lerp(motion.fromPitch, 0, ease(0, .4));
                this.camera.setViewPitch(THREE.MathUtils.lerp(sitPitch, motion.toPitch, recline));
            } else {
                this.viewPosition.set(center.x, this.returnPosition.y, center.z);
                this.viewPosition.lerpVectors(motion.from, this.viewPosition, rise);
                this.viewPosition.lerp(motion.to, ease(.6, 1));
                const sitHeight = THREE.MathUtils.lerp(motion.fromEye, seatedEye, rise);
                this.camera.setEyeHeight(THREE.MathUtils.lerp(sitHeight, motion.toEye, ease(.6, 1)));
                this.camera.setViewPitch(THREE.MathUtils.lerp(motion.fromPitch, motion.toPitch, rise));
            }
            const turn = motion.turn * ease(0, .4);
            this.camera.setHorizontalAngle(this.camera.getHorizontalAngle() + turn - motion.appliedTurn);
            motion.appliedTurn = turn;
        } else {
            // Approach and turn first, then bend into the seat. Standing reverses
            // the weight shift: lean forward, rise, then step clear of the chair.
            const travel = sitting ? ease(0, .8) : ease(.3, 1);
            const height = sitting ? ease(.2, 1) : ease(.1, .85);
            const lean = Math.sin(Math.PI * ease(0, 1));
            this.viewPosition.lerpVectors(motion.from, motion.to, travel);
            this.viewPosition.addScaledVector(this.seated.forward, lean * .10);
            this.camera.setEyeHeight(THREE.MathUtils.lerp(motion.fromEye, motion.toEye, height) - lean * .035);
            const turn = motion.turn * ease(0, .75);
            this.camera.setHorizontalAngle(this.camera.getHorizontalAngle() + turn - motion.appliedTurn);
            // Apply only this frame's change so mouse/touch look remains available.
            const pitch = lean * .085;
            // View pitch is downward-positive in both getter and setter. Feed back
            // pitch so the lean cannot accumulate a spin.
            this.camera.setViewPitch(this.camera.getViewPitch() + pitch - motion.appliedLean);
            motion.appliedTurn = turn; motion.appliedLean = pitch;
        }
        if (t === 1) {
            this.transition = null;
            if (!sitting) this.finishStanding();
        }
    }

    private finishStanding(): void {
        if (!this.seated || !this.previousMovement) return;
        if (this.seated.bed) this.camera.setViewPitch(this.standingPitch);
        else if (this.transition) this.camera.setViewPitch(this.camera.getViewPitch() - this.transition.appliedLean);
        this.transition = null;
        this.seated = null;
        this.player.setMovementSystem(this.previousMovement);
        this.previousMovement = null;
        this.player.setCapsuleBodyEnabled(true);
        this.player.setInteractionsSuppressed(false);
        this.camera.setEyeHeight(this.eyeHeight);
        this.player.teleportTo(this.returnPosition.x, this.returnPosition.y, this.returnPosition.z);
        // Teleport adds a 0.4 s action lock, but standing has already finished
        // its own transition and consumed F/Stand. Do not advertise Sit while
        // silently discarding the next phone tap; held E still requires release.
        this.player.suppressActionsFor(0, ['interact']);
    }

    dispose(): void {
        this.finishStanding();
        for (const interaction of this.interactions) interaction.dispose();
        this.hud.removeElement('chair-seating');
    }
}
