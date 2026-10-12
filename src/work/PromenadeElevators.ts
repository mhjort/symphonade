import * as THREE from 'three';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import { InteractableComponent } from 'engine/InteractableComponent.js';
import type { FerrySounds } from './FerrySounds.js';
import type { EngineLike, DoorDefinition } from 'types/game.js';
import type { PlayerController } from 'engine/PlayerController.js';
import { KinematicPlatform, DEFAULT_KINEMATIC_PLATFORM_OPTIONS } from 'engine/KinematicPlatform.js';
import { DungeonDoor } from 'engine/doors/DungeonDoor.js';
import { Keyring } from 'engine/doors/Keyring.js';

type Floor = 0 | 1 | 2;
type Phase = 'docked' | 'closing' | 'moving';
type LandingGate = Pick<DungeonDoor, 'open' | 'close' | 'getState' | 'dispose'>;

/** Calls/interlocks are custom; engine platforms carry riders and engine doors slide. */
class PanoramaLift {
    private readonly scene: THREE.Scene;
    readonly floorMesh: THREE.Mesh;
    readonly gates: [LandingGate, LandingGate, LandingGate];
    readonly movers: KinematicPlatform[] = [];
    readonly x: number;
    readonly z: number;
    readonly levels: [number, number, number];
    private travelDirection: 1 | -1 = 1;
    readonly width: number;
    readonly depth: number;
    readonly gateOffset: number;
    readonly yaw: number;
    readonly doorWidth: number;
    readonly carHeight: number;
    readonly floorThickness: number;
    speed: number;
    clearDelay: number;
    floor: Floor = 0;
    target: Floor = 0;
    phase: Phase = 'docked';
    private clearTime = 0;
    private readonly materials: THREE.Material[] = [];
    private readonly geometries: THREE.BufferGeometry[] = [];
    private readonly display: THREE.CanvasTexture;
    private readonly canvas: HTMLCanvasElement;
    private displayText = '';

    constructor(engine: EngineLike, readonly id: string, private readonly sounds: FerrySounds) {
        if (!engine.scene) throw new Error('Panoramic lifts require a loaded scene');
        this.scene = engine.scene;
        const registry = engine.getMechanismSystem?.();
        const spec = registry?.getSpec(id);
        if (!registry || !spec?.params) throw new Error(`Missing lift mechanism ${id}`);
        const p = spec.params;
        const num = (key: string): number => {
            const value = p[key];
            if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${id}: invalid ${key}`);
            return value;
        };
        this.x = spec.position?.x ?? 0;
        this.z = spec.position?.z ?? 0;
        this.levels = [num('lowerFloor'), num('upperFloor'), num('topFloor')];
        this.width = num('width'); this.depth = num('depth');
        this.carHeight = num('carHeight'); this.floorThickness = num('floorThickness');
        this.doorWidth = num('doorWidth'); this.gateOffset = num('gateOffset');
        this.yaw = num('yaw');
        this.speed = num('speed'); this.clearDelay = num('clearDelay');

        const bronze = new THREE.MeshStandardMaterial({ color: 0xbfc7cd, metalness: .88, roughness: .18 });
        const cream = new THREE.MeshStandardMaterial({ color: 0xe8e3d5, roughness: .5 });
        const glass = new THREE.MeshStandardMaterial({ color: 0xb7d9db, transparent: true, opacity: .10, roughness: .15, side: THREE.DoubleSide, depthWrite: false });
        const warm = new THREE.MeshStandardMaterial({ color: 0xffedc7, emissive: 0xffd89b, emissiveIntensity: .8 });
        this.materials.push(bronze, cream, glass, warm);
        const part = (w: number, h: number, d: number, material: THREE.Material): THREE.Mesh => {
            const geometry = new THREE.BoxGeometry(w, h, d); this.geometries.push(geometry);
            return new THREE.Mesh(geometry, material);
        };
        const radius = this.width / 2;
        const deck = (thickness: number, material: THREE.Material): THREE.Mesh => {
            const outline = new THREE.Shape();
            outline.moveTo(-radius, this.depth / 2); outline.lineTo(-radius, 0);
            for (let i = 1; i <= 16; i++) {
                const a = Math.PI + i * Math.PI / 16;
                outline.lineTo(radius * Math.cos(a), radius * Math.sin(a));
            }
            outline.lineTo(radius, this.depth / 2); outline.closePath();
            const geometry = new THREE.ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: false });
            geometry.rotateX(Math.PI / 2); geometry.translate(0, thickness / 2, 0);
            this.geometries.push(geometry); return new THREE.Mesh(geometry, material);
        };
        this.floorMesh = deck(this.floorThickness, bronze);
        this.floorMesh.name = spec.name ?? id;
        const floorMover = this.makeMover(engine, this.floorMesh, -this.floorThickness / 2);
        this.movers.push(floorMover);
        const carVisual = new THREE.Group(); carVisual.name = spec.name ?? id;
        this.floorMesh.add(carVisual);
        // Add car dressing AFTER platform construction so only the floor bounds
        // become its collider, never a solid box filling the passenger space.
        const attach = (mesh: THREE.Mesh, x: number, y: number, z: number): void => {
            mesh.position.set(x, y + this.floorThickness / 2, z); carVisual.add(mesh);
        };
        const lining = deck(.025, cream); attach(lining, 0, .02, 0);
        // Semicircular glass bow outside the wall; the opaque rear half is in
        // the lift lobby. Each glass facet travels with its own engine collider.
        const frontSegments = 12;
        for (let i = 0; i < frontSegments; i++) {
            const a = Math.PI + i * Math.PI / frontSegments;
            const b = a + Math.PI / frontSegments;
            const ax = radius * Math.cos(a), az = radius * Math.sin(a);
            const bx = radius * Math.cos(b), bz = radius * Math.sin(b);
            const x = (ax + bx) / 2, z = (az + bz) / 2;
            const length = Math.hypot(bx - ax, bz - az) + .015;
            const yaw = -Math.atan2(bz - az, bx - ax);
            const panel = part(length, this.carHeight - .14, .025, glass);
            panel.rotation.y = yaw;
            this.movers.push(this.makeMover(engine, panel, this.carHeight / 2, x, z));
            for (const y of [.16, .32, .44, .56, .68, .80, .92, this.carHeight - .02]) {
                const band = part(length, y === .16 ? .2 : .045, .065, bronze);
                band.rotation.y = yaw; attach(band, x, y, z);
            }
        }
        for (const side of [-1, 1]) {
            const rear = part(.07, this.carHeight, this.depth / 2, cream);
            this.movers.push(this.makeMover(engine, rear, this.carHeight / 2, side * (radius - .04), this.depth / 4));
            attach(part(.08, this.carHeight, .09, bronze), side * radius, this.carHeight / 2, 0);
        }
        attach(part(.065, this.carHeight, .065, bronze), 0, this.carHeight / 2, -radius);
        const roof = deck(.12, bronze);
        this.movers.push(this.makeMover(engine, roof, this.carHeight));
        attach(part(.72, .035, .6, warm), 0, this.carHeight - .075, -.15);
        const green = new THREE.MeshStandardMaterial({ color: 0x268237, metalness: .35, roughness: .3 });
        this.materials.push(green);
        attach(part(.4, .52, .055, green), 0, -.38, -.62);
        for (const y of [-.24, -.46]) {
            const geometry = new THREE.SphereGeometry(.065, 8, 6); this.geometries.push(geometry);
            attach(new THREE.Mesh(geometry, warm), 0, y, -.66);
        }

        const keys = new Keyring();
        const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x591f22, roughness: .22,
            metalness: .12, clearcoat: 1, clearcoatRoughness: .12 });
        const brass = new THREE.MeshStandardMaterial({ color: 0xd8c38a, metalness: .78, roughness: .2 });
        this.materials.push(lacquer, brass);
        const gate = (level: Floor): LandingGate => {
            const height = num('doorHeight'), half = this.doorWidth / 2;
            const leaves = [-1, 1].map(side => {
                const def: DoorDefinition = {
                    id: `${id}-gate-${level + 7}-${side}`, position: this.worldPoint(side * half / 2, this.levels[level] + height / 2, this.gateOffset),
                    rotationY: this.yaw + (side < 0 ? Math.PI : 0), width: half, height, thickness: .10,
                    kind: 'plain', animation: 'slide', color: '#591f22', autoOpenRadius: 0,
                };
                // DungeonDoor owns motion and collision. Capture its synchronous fallback
                // mesh through the public world group so all trim inherits the leaf pose.
                const world = engine.getWorldGroup();
                const before = new Set(world.children);
                const door = new DungeonDoor(engine, def, keys, { onStateChanged: state => {
                    if (side === 1 && (state === 'opening' || state === 'closing')) this.sounds.play('doorSlide',
                        new THREE.Vector3(def.position.x, def.position.y, def.position.z));
                } });
                const leaf = world.children.find(child => !before.has(child) && child instanceof THREE.Mesh);
                if (!(leaf instanceof THREE.Mesh)) throw new Error(`Missing elevator door leaf: ${def.id}`);
                leaf.name = def.id;
                // Coordinates below describe one half of the complete reference pattern:
                // u=0 is the centre seam, u=1 the outer edge, v=0 the sill.
                const point = (u: number, v: number, face: number): THREE.Vector3 =>
                    new THREE.Vector3(u * half - half / 2, v * height - height / 2, face * .064);
                for (const face of [-1, 1]) {
                    const panel = part(half - .009, height - .014, .009, lacquer);
                    panel.position.z = face * .056; leaf.add(panel);
                    const line = (points: THREE.Vector3[]): void => {
                        const curve = new THREE.CatmullRomCurve3(points);
                        const geometry = new THREE.TubeGeometry(curve, Math.max(24, points.length * 2), .006, 6, false);
                        this.geometries.push(geometry); leaf.add(new THREE.Mesh(geometry, brass));
                    };
                    // Circular medallion, split precisely at the moving centre seam.
                    line(Array.from({ length: 49 }, (_, i) => {
                        const angle = -Math.PI / 2 + i * Math.PI / 48;
                        return point(.86 * Math.cos(angle), .70 + .86 * half / height * Math.sin(angle), face);
                    }));
                    for (const peak of [.80, .64, .48, .32]) {
                        line(Array.from({ length: 25 }, (_, i) => {
                            const u = i / 24;
                            return point(u * .94, peak - .115 * (1 - (1 - u) ** 3), face);
                        }));
                    }
                    const kick = new THREE.Shape();
                    kick.moveTo(-half / 2, -height / 2 + .025);
                    kick.lineTo(half / 2 - .012, -height / 2 + .025);
                    for (let i = 24; i >= 0; i--) {
                        const u = i / 24;
                        kick.lineTo(u * (half - .012) - half / 2, height * (.075 + .12 * (1 - u) ** 3) - height / 2);
                    }
                    kick.closePath();
                    const geometry = new THREE.ShapeGeometry(kick); this.geometries.push(geometry);
                    const plate = new THREE.Mesh(geometry, brass); plate.position.z = .067;
                    if (face < 0) { plate.rotation.y = Math.PI; plate.scale.x = -1; plate.position.z = -.067; }
                    leaf.add(plate);
                    line([point(.008, .015, face), point(.008, .988, face)]);
                }
                return door;
            });
            const frame = new THREE.Group();
            frame.name = `${id}-brass-frame-${level + 7}`;
            frame.position.copy(this.worldPoint(0, this.levels[level], this.gateOffset));
            frame.rotation.y = this.yaw;
            for (const side of [-1, 1]) {
                const jamb = part(.095, height + .1, .19, brass);
                jamb.position.set(side * (half + .05), height / 2, 0); frame.add(jamb);
            }
            for (const y of [.012, height + .045]) {
                const rail = part(this.doorWidth + .19, .055, .19, brass);
                rail.position.y = y; frame.add(rail);
            }
            this.scene.add(frame); this.doorFrames.push(frame);
            return {
                open: () => leaves.forEach(leaf => leaf.open()),
                close: () => leaves.forEach(leaf => leaf.close()),
                getState: () => leaves.every(leaf => leaf.getState() === 'closed') ? 'closed'
                    : leaves.every(leaf => leaf.getState() === 'open') ? 'open'
                    : leaves.find(leaf => leaf.getState() !== 'closed' && leaf.getState() !== 'open')?.getState() ?? 'closing',
                dispose: () => leaves.forEach(leaf => leaf.dispose()),
            };
        };
        this.gates = [gate(0), gate(1), gate(2)];
        this.gates[0].open();

        this.canvas = document.createElement('canvas'); this.canvas.width = 256; this.canvas.height = 128;
        this.display = new THREE.CanvasTexture(this.canvas); this.display.colorSpace = THREE.SRGBColorSpace;
        const screenMaterial = new THREE.MeshBasicMaterial({ map: this.display }); this.materials.push(screenMaterial);
        const displayGeometry = new THREE.PlaneGeometry(.66, .33); this.geometries.push(displayGeometry);
        for (const floor of [0, 1, 2] as const) {
            const screen = new THREE.Mesh(displayGeometry, screenMaterial);
            screen.position.copy(this.worldPoint(0, this.levels[floor] + 2.92, this.gateOffset + .10));
            screen.rotation.y = this.yaw;
            this.scene.add(screen); this.indicators.push(screen);
        }
        this.renderIndicator();
        registry.registerCustom(id, carVisual, {
            speed: { min: .4, max: 1.8, step: .1, apply: v => {
                this.speed = v;
                for (const mover of this.movers) { mover.applyEditableParam('speed', v); mover.applyEditableParam('returnSpeed', v); }
            } },
            clearDelay: { min: .3, max: 3, step: .1, apply: v => { this.clearDelay = v; } },
        });
    }
    private readonly indicators: THREE.Mesh[] = [];
    private readonly doorFrames: THREE.Group[] = [];

    private makeMover(engine: EngineLike, mesh: THREE.Mesh, offset: number, dx = 0, dz = 0): KinematicPlatform {
        mesh.rotation.y += this.yaw;
        return new KinematicPlatform(engine, {
            ...DEFAULT_KINEMATIC_PLATFORM_OPTIONS, mesh,
            waypoints: [this.levels[0], this.levels[2]].map(y => this.worldPoint(dx, y + offset, dz)),
            speed: this.speed, returnSpeed: this.speed, loop: 'pingpong', trigger: 'always', dwellS: 0,
        });
    }

    private worldPoint(x: number, y: number, z: number): THREE.Vector3 {
        return new THREE.Vector3(this.x + Math.cos(this.yaw) * x + Math.sin(this.yaw) * z,
            y, this.z - Math.sin(this.yaw) * x + Math.cos(this.yaw) * z);
    }
    private localPoint(p: THREE.Vector3): THREE.Vector3 {
        const dx = p.x - this.x, dz = p.z - this.z;
        return new THREE.Vector3(Math.cos(this.yaw) * dx - Math.sin(this.yaw) * dz,
            p.y, Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz);
    }
    get height(): number { return this.floorMesh.position.y + this.floorThickness / 2; }
    near(p: THREE.Vector3): boolean {
        const local = this.localPoint(p);
        return Math.abs(local.x) < 1.8 && local.z > -1.5 && local.z < this.gateOffset + 1.8 && p.y > -.5 && p.y < this.levels[2] + .7;
    }
    inside(p: THREE.Vector3): boolean {
        const local = this.localPoint(p);
        return Math.abs(local.x) < this.width / 2 && Math.abs(local.z) < this.depth / 2 - .25 && Math.abs(p.y - this.height) < .6;
    }
    thresholdBlocked(p: THREE.Vector3): boolean {
        const local = this.localPoint(p);
        return Math.abs(local.x) < this.doorWidth / 2 + .3 && Math.abs(local.z - this.gateOffset) < .6 && Math.abs(p.y - this.levels[this.floor]) < 1.3;
    }
    floorAt(p: THREE.Vector3): Floor {
        return p.y > (this.levels[1] + this.levels[2]) / 2 ? 2 : p.y > (this.levels[0] + this.levels[1]) / 2 ? 1 : 0;
    }
    private nextFloor(): Floor {
        return this.floor === 0 ? 1 : this.floor === 2 ? 1 : this.travelDirection > 0 ? 2 : 0;
    }
    request(p: THREE.Vector3): void {
        if (this.phase !== 'docked') return;
        const requested: Floor = this.inside(p) ? this.nextFloor() : this.floorAt(p);
        if (requested === this.floor) { this.gates[this.floor].open(); return; }
        this.target = requested; this.phase = 'closing'; this.clearTime = 0;
    }
    update(dt: number, p: THREE.Vector3): void {
        let travelDt = 0;
        if (this.phase === 'docked') {
            this.gates.forEach((gate, index) => { if (index !== this.floor) gate.close(); });
            if (this.near(p) && Math.abs(p.y - this.height) < 1.3) this.gates[this.floor].open();
            else if (!this.thresholdBlocked(p)) this.gates[this.floor].close();
        } else if (this.phase === 'closing') {
            if (this.thresholdBlocked(p)) {
                this.clearTime = 0; this.gates[this.floor].open();
            } else {
                this.clearTime += dt;
                if (this.clearTime >= this.clearDelay) {
                    for (const gate of this.gates) gate.close();
                    if (this.gates.every(gate => gate.getState() === 'closed')) {
                        this.phase = 'moving';
                        this.sounds.play('liftMotor', this.worldPoint(0, this.height + 1, 0));
                    }
                }
            }
        } else {
            // Engine platforms follow a ping-pong shaft path. A call behind the
            // current direction rides through the end before returning; all
            // intermediate landing gates remain interlocked.
            const targetY = this.levels[this.target];
            const ahead = (targetY - this.height) * this.travelDirection > 0;
            const nextY = ahead ? targetY : this.levels[this.travelDirection > 0 ? 2 : 0];
            const remaining = Math.abs(nextY - this.height);
            travelDt = Math.min(dt, remaining / this.speed);
        }
        for (const mover of this.movers) mover.update(travelDt);
        if (this.height >= this.levels[2] - .0001) this.travelDirection = -1;
        if (this.height <= this.levels[0] + .0001) this.travelDirection = 1;
        if (this.phase === 'moving' && Math.abs(this.height - this.levels[this.target]) < .0001) {
            this.floor = this.target; this.phase = 'docked';
            this.sounds.play('liftArrival', this.worldPoint(0, this.height + 1, 0));
            this.gates[this.floor].open();
        }
        this.renderIndicator();
    }
    hint(p: THREE.Vector3): string {
        if (this.phase === 'moving') return `Lift → Deck ${this.target + 7}`;
        if (this.phase === 'closing') return this.thresholdBlocked(p) ? 'Clear the doorway to depart' : 'Doors closing';
        if (this.inside(p)) return `Travel to deck ${this.nextFloor() + 7}`;
        const here = this.floorAt(p);
        return here === this.floor ? `Deck ${this.floor + 7} · Step inside` : 'Call elevator';
    }
    private renderIndicator(): void {
        const text = this.phase === 'moving' ? `${this.travelDirection > 0 ? '↑' : '↓'} ${this.target + 7}` : `${this.floor + 7}`;
        if (text === this.displayText) return;
        this.displayText = text;
        const c = this.canvas.getContext('2d'); if (!c) return;
        c.fillStyle = '#172526'; c.fillRect(0, 0, 256, 128);
        c.fillStyle = '#ffdfa0'; c.font = 'bold 86px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 66);
        this.display.needsUpdate = true;
    }
    dispose(engine: EngineLike): void {
        for (const gate of this.gates) gate.dispose();
        for (const mover of this.movers) mover.dispose();
        for (const screen of this.indicators) this.scene.remove(screen);
        for (const frame of this.doorFrames) this.scene.remove(frame);
        this.display.dispose();
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials) material.dispose();
    }
}

export class PromenadeElevators {
    readonly lifts: PanoramaLift[];
    private readonly interactions: InteractableComponent[] = [];
    private activated = false;
    constructor(private readonly engine: EngineLike, private readonly player: PlayerController, sounds: FerrySounds) {
        this.lifts = ['promenade-lift-port', 'promenade-lift-starboard'].map(id => new PanoramaLift(engine, id, sounds));
        if (!engine.physicsWorld) throw new Error('Lift interactions require physics');
        for (const lift of this.lifts) {
            for (const height of lift.levels) {
                const anchor = new THREE.Object3D();
                anchor.position.set(lift.x, height + .5, lift.z);
                const eligible = () => lift.near(player.getPosition()) && Math.abs(player.getPosition().y - height) < 1.3;
                const actionable = () => lift.phase === 'docked' &&
                    (lift.inside(player.getPosition()) || lift.floorAt(player.getPosition()) !== lift.floor);
                this.interactions.push(new InteractableComponent(engine.physicsWorld, {
                    object3D: anchor, radius: lift.depth + 2,
                    interactable: {
                        interactionEnabled: eligible,
                        isActionable: actionable,
                        getInteractStartDisplayName: () => lift.hint(player.getPosition()),
                        onInteractStart: () => {
                            if (!getGameStateManager().isState(GameState.PLAYING) || this.activated || !eligible() || !actionable() || !player.getControlsEnabled()) return false;
                            this.activated = true;
                            lift.request(player.getPosition());
                            return true;
                        },
                    },
                }));
            }
        }
    }
    update(dt: number): void {
        this.activated = false;
        const p = this.player.getPosition();
        for (const lift of this.lifts) lift.update(dt, p);
    }
    dispose(): void {
        for (const interaction of this.interactions) interaction.dispose();
        for (const lift of this.lifts) lift.dispose(this.engine);
    }
}
