import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import type { PlayerController } from 'engine/PlayerController.js';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import { InteractableComponent } from 'engine/InteractableComponent.js';
import { PhysicsBodyFactory } from 'engine/physics/PhysicsBodyFactory.js';
import { CollisionGroup } from 'engine/CollisionLayers.js';
import type { CoffeeShop } from './CoffeeShop.js';
import { rollSlotReels } from './SlotOdds.js';

const POSITION = new THREE.Vector3(-3.8, .02, 35.48);
const PRICE = 5, PAYOUT = 20, JACKPOT = 100;
const BOAT = 4, SYMBOL_COUNT = 5;
const STOP_TIMES = [2.1, 2.8, 3.5];
const SOUNDS = {
    coin: '755afca7-ac46-4f40-84c5-929b1d2a9d2a',
    spin: '11439ab3-feec-4e42-ab7e-e9c1c6b450c9',
    stop: '4487bbbe-e8f6-4bbd-a80d-30e5aacd2180',
    win: 'cc3c8c36-121e-43ec-80d2-81e1a20da844',
};

/** A physical three-reel cabinet. All payments and outcomes use gameplay time. */
export class SlotMachine {
    private interaction: InteractableComponent | null = null;
    private readonly root = new THREE.Group();
    private readonly geometries: THREE.BufferGeometry[] = [];
    private readonly materials: THREE.Material[] = [];
    private readonly textures: THREE.Texture[] = [];
    private readonly canvas = document.createElement('canvas');
    private readonly context: CanvasRenderingContext2D;
    private readonly screenTexture: THREE.CanvasTexture;
    private body: ReturnType<typeof PhysicsBodyFactory.createStaticBody> | null = null;
    private reels = [0, 1, 2];
    private spin: { elapsed: number; result: number[]; stopped: number; rolling: boolean } | null = null;
    private status = '5 mk per spin';
    private frameTime = 0;
    private elapsed = 0;
    private celebration = 0;
    private jackpotWin = false;
    private readonly chaseLamps: THREE.MeshStandardMaterial[] = [];
    private readonly marquee = document.createElement('canvas');
    private readonly marqueeTexture: THREE.CanvasTexture;
    private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    private readonly coin = new THREE.Group();
    private readonly lamps: THREE.MeshStandardMaterial;

    constructor(private readonly engine: EngineLike, private readonly player: PlayerController,
        private readonly camera: () => THREE.Camera,
        private readonly wallet: CoffeeShop,
        private readonly onWin: (jackpot: boolean) => void = () => {}) {
        this.canvas.width = 768; this.canvas.height = 640;
        const context = this.canvas.getContext('2d');
        if (!context) throw new Error('Slot machine requires a canvas context');
        this.context = context;
        this.screenTexture = this.texture(this.canvas);
        this.marquee.width = 1024; this.marquee.height = 440;
        this.marqueeTexture = this.texture(this.marquee);
        this.lamps = this.material(0xffbc51, .35, 0xff9911);
    }

    private material(color: number, roughness = .5, emissive = 0): THREE.MeshStandardMaterial {
        const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: roughness < .3 ? .8 : .1,
            emissive, emissiveIntensity: .55 });
        this.materials.push(material); return material;
    }

    private texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        this.textures.push(texture); return texture;
    }

    private box(name: string, size: [number, number, number], pos: [number, number, number],
        material: THREE.Material, parent = this.root): THREE.Mesh {
        const geometry = new THREE.BoxGeometry(...size); this.geometries.push(geometry);
        const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(...pos);
        mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    }

    private panel(texture: THREE.Texture, width: number, height: number, y: number, z: number): void {
        const geometry = new THREE.PlaneGeometry(width, height); this.geometries.push(geometry);
        const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }); this.materials.push(material);
        const mesh = new THREE.Mesh(geometry, material); mesh.position.set(0, y, z); this.root.add(mesh);
    }

    async load(): Promise<void> {
        this.root.name = 'Sea Fortune slot machine'; this.root.position.copy(POSITION);
        this.root.rotation.y = Math.PI; // back against the blank forward wall, beside the port lift
        const dark = this.material(0x141920), chrome = this.material(0xb7c5cf, .2);
        const red = this.material(0x891e2b), black = this.material(0x06090c);
        this.box('Cabinet plinth', [1.02, .12, .67], [0, .06, 0], dark);
        this.box('Cabinet body', [.96, 1.06, .60], [0, .65, -.025], red);
        this.box('Coin return surround', [.61, .30, .04], [0, .51, .286], chrome);
        this.box('Coin return tray', [.48, .14, .13], [0, .51, .327], black);
        this.box('Control shelf', [1.02, .13, .77], [0, 1.08, .055], chrome);
        this.box('Button deck', [.91, .04, .65], [0, 1.16, .05], dark);
        this.box('Gold spin button', [.22, .065, .14], [.28, 1.205, .26], this.lamps);
        this.box('Coin acceptor', [.19, .13, .06], [-.25, 1.13, .457], chrome);
        this.box('Coin slot', [.10, .018, .009], [-.25, 1.14, .491], black);
        this.box('Main monitor chrome', [1.00, .81, .24], [0, 1.62, -.12], chrome);
        this.box('Main monitor bezel', [.94, .75, .055], [0, 1.62, .025], black);
        this.panel(this.screenTexture, .86, .69, 1.62, .057);
        this.box('Upper marquee frame', [1.04, .49, .25], [0, 2.30, -.13], chrome);
        this.box('Upper marquee bezel', [.99, .44, .035], [0, 2.30, .016], black);
        this.drawMarquee();
        this.panel(this.marqueeTexture, .94, .39, 2.30, .039);
        const cyan = new THREE.MeshBasicMaterial({ color: 0x73e9ff, toneMapped: false });
        const pink = new THREE.MeshBasicMaterial({ color: 0xff458b, toneMapped: false });
        this.materials.push(cyan, pink);
        // Bright inner edges and curved neon outlines evoke the casino cabinets.
        for (const x of [-.455, .455]) this.box('Cyan monitor edge', [.014, .73, .014], [x, 1.62, .065], cyan);
        for (const y of [1.25, 1.99]) this.box('Cyan monitor edge', [.92, .014, .014], [0, y, .065], cyan);
        for (let i = 0; i < 5; i++) this.chaseLamps.push(this.material(0xffcf79, .3, 0xffa522));
        for (const x of [-.48, .48]) {
            this.box('Glossy red side trim', [.055, 1.33, .15], [x, 1.76, -.02], red);
            for (let i = 0; i < 10; i++) this.box('Chase light', [.031, .055, .022], [x, 1.17 + i * .13, .067], this.chaseLamps[i % 5]!);
            const points = [new THREE.Vector3(x, .16, .31), new THREE.Vector3(x, .85, .34),
                new THREE.Vector3(x, 1.13, .40), new THREE.Vector3(x, 1.30, .08), new THREE.Vector3(x, 2.53, .08)];
            const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 36, .013, 6, false);
            this.geometries.push(geometry);
            const mesh = new THREE.Mesh(geometry, pink); mesh.name = 'Sweeping neon cabinet outline'; this.root.add(mesh);
        }
        this.box('Marquee neon crown', [1.0, .019, .02], [0, 2.53, .045], cyan);
        this.box('Blue under-shelf light', [.92, .018, .025], [0, 1.01, .44], cyan);
        const coinGeometry = new THREE.CylinderGeometry(.045, .045, .009, 24); coinGeometry.rotateX(Math.PI / 2);
        this.geometries.push(coinGeometry);
        this.coin.add(new THREE.Mesh(coinGeometry, this.material(0xcba654, .24)));
        this.root.add(this.coin); this.coin.visible = false;
        this.engine.getWorldGroup().add(this.root);
        if (!this.engine.physicsWorld) throw new Error('Slot machine requires physics');
        this.body = PhysicsBodyFactory.createStaticBody(this.engine.physicsWorld,
            POSITION.clone().add(new THREE.Vector3(0, 1.28, 0)), {
                shape: { type: 'box', halfExtents: new THREE.Vector3(.52, 1.28, .39) },
                collisionGroup: CollisionGroup.ENVIRONMENT, collisionMask: CollisionGroup.PLAYER,
            });
        this.interaction = new InteractableComponent(this.engine.physicsWorld, {
            object3D: this.root, radius: 3,
            interactable: {
                interactionEnabled: () => this.accessible(),
                isActionable: () => !this.spin,
                getInteractStartDisplayName: () => this.spin ? 'Sea Fortune · Spinning…' : 'Spin · 5 mk',
                onInteractStart: () => { this.startSpin(); return true; },
            },
        });
        this.draw();
        await this.engine.preloadAudio?.(Object.values(SOUNDS).filter(Boolean));
    }

    private accessible(): boolean {
        const p = this.player.getPosition(), target = POSITION.clone().add(new THREE.Vector3(0, 1.6, -.3));
        if (Math.abs(p.y - POSITION.y) > 1.2 || p.z > POSITION.z - .4 || p.distanceTo(POSITION) > 2.8) return false;
        const camera = this.camera(), direction = camera.getWorldDirection(new THREE.Vector3());
        return direction.dot(target.sub(camera.getWorldPosition(new THREE.Vector3())).normalize()) > .72;
    }

    private sound(name: keyof typeof SOUNDS): void {
        const distance = this.player.getPosition().distanceTo(POSITION);
        const volume = .5 * Math.max(0, 1 - distance / 12) ** 2;
        if (volume > 0 && SOUNDS[name]) this.engine.playSound(SOUNDS[name], { volume });
    }

    private startSpin(): void {
        if (!getGameStateManager().isState(GameState.PLAYING) || this.spin || !this.accessible() || !this.player.getControlsEnabled()) return;
        if (!this.wallet.trySpend(PRICE)) {
            this.status = this.wallet.balance < PRICE ? 'Not enough money · 5 mk needed' : 'Finish paying for coffee first';
            this.draw(); return;
        }
        this.spin = { elapsed: 0, result: rollSlotReels(), stopped: 0, rolling: false };
        this.celebration = 0; this.jackpotWin = false;
        this.status = '5 mk inserted'; this.coin.visible = true; this.sound('coin'); this.draw();
    }

    update(dt: number): void {
        if (!getGameStateManager().isState(GameState.PLAYING)) return;
        const delta = Math.max(0, dt), spin = this.spin;
        this.elapsed += delta;
        this.celebration = Math.max(0, this.celebration - delta);
        if (spin) {
            spin.elapsed += delta;
            const t = Math.min(1, spin.elapsed / .6);
            this.coin.position.set(-.25, 1.14, .85 - .37 * t);
            this.coin.visible = t < 1;
            if (t === 1 && !spin.rolling) { spin.rolling = true; this.status = 'Spinning…'; this.sound('spin'); }
            for (let i = 0; i < 3; i++) {
                if (spin.elapsed >= STOP_TIMES[i]! && spin.stopped === i) {
                    this.reels[i] = spin.result[i]!; spin.stopped++; this.sound('stop');
                }
            }
            if (spin.stopped === 3) {
                const win = this.reels.every(symbol => symbol === this.reels[0]);
                this.jackpotWin = win && this.reels[0] === BOAT;
                const payout = this.jackpotWin ? JACKPOT : PAYOUT;
                if (win) {
                    this.wallet.credit(payout); this.sound('win');
                    this.celebration = this.jackpotWin ? 8 : 4;
                    this.onWin(this.jackpotWin);
                }
                this.status = this.jackpotWin ? 'SILJA JACKPOT! +100 mk' : win ? 'You win 20 mk!' : 'No match · Try again for 5 mk';
                this.spin = null; this.draw();
            }
        }
        this.frameTime += delta;
        if (this.frameTime >= 1 / 30 && (this.spin || this.celebration > 0 || this.accessible())) {
            this.frameTime = 0; this.draw(); this.drawMarquee();
        }
        const phase = this.reducedMotion ? 0 : this.elapsed * (this.celebration > 0 ? 5 : this.spin ? 7 : 2.5);
        this.lamps.emissiveIntensity = .7 + (this.reducedMotion ? 0 : .35 * Math.sin(phase));
        this.chaseLamps.forEach((lamp, i) => {
            const wave = .5 + .5 * Math.sin(phase - i * 1.25);
            lamp.emissive.setHex(this.celebration > 0 ? 0xffb72e : i % 2 ? 0xff3388 : 0x20bfff);
            lamp.emissiveIntensity = this.reducedMotion ? .8 : .3 + wave * 2.4;
        });
    }

    private symbol(index: number, x: number, y: number): void {
        const c = this.context;
        c.save(); c.translate(x, y); c.textAlign = 'center'; c.textBaseline = 'middle';
        if (index === 0) {
            c.strokeStyle = '#408347'; c.lineWidth = 8; c.beginPath(); c.moveTo(-21, 12); c.quadraticCurveTo(-10, -44, 25, -44);
            c.lineTo(28, 12); c.stroke(); c.fillStyle = '#c02e42';
            for (const dx of [-24, 26]) { c.beginPath(); c.arc(dx, 22, 24, 0, Math.PI * 2); c.fill(); }
        } else if (index === 1) {
            c.fillStyle = '#1683ae'; c.beginPath(); c.moveTo(0, -50); c.lineTo(42, 0); c.lineTo(0, 50); c.lineTo(-42, 0); c.closePath(); c.fill();
            c.strokeStyle = '#8de2ee'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -45); c.lineTo(13, 0); c.lineTo(0, 45); c.stroke();
        } else if (index === 2) {
            c.fillStyle = '#c18416'; c.beginPath(); c.moveTo(-37, 29); c.quadraticCurveTo(-24, 13, -25, -18);
            c.bezierCurveTo(-25, -54, 25, -54, 25, -18); c.quadraticCurveTo(24, 13, 37, 29); c.closePath(); c.fill();
            c.beginPath(); c.arc(0, 36, 10, 0, Math.PI * 2); c.fill();
        } else if (index === BOAT) {
            c.fillStyle = '#186aa0';
            c.beginPath(); c.moveTo(-66, 12); c.lineTo(65, 12); c.lineTo(43, 41); c.lineTo(-45, 41); c.closePath(); c.fill();
            c.fillStyle = '#fdfdf7'; c.strokeStyle = '#328cb5'; c.lineWidth = 3;
            c.fillRect(-49, -22, 94, 34); c.strokeRect(-49, -22, 94, 34);
            c.fillRect(-28, -39, 61, 17); c.strokeRect(-28, -39, 61, 17);
            c.fillStyle = '#18486b'; c.fillRect(14, -51, 16, 12);
            for (let k = 0; k < 6; k++) { c.fillRect(-40 + k * 14, -14, 8, 6); c.fillRect(-40 + k * 14, -3, 8, 6); }
            c.fillStyle = '#ffffff'; c.font = 'bold 19px Arial'; c.fillText('SILJA', 0, 27);
            c.strokeStyle = '#2fbedb'; c.lineWidth = 4; c.beginPath();
            for (let k = 0; k <= 12; k++) { const xx = -65 + k * 11, yy = 48 + Math.sin(k * 1.5) * 3; if (k === 0) c.moveTo(xx, yy); else c.lineTo(xx, yy); } c.stroke();
        } else { c.font = 'bold 110px Georgia'; c.fillStyle = '#ac243b'; c.fillText('7', 0, 4); }
        c.restore();
    }

    private draw(): void {
        const c = this.context;
        const background = c.createLinearGradient(0, 0, 768, 640);
        background.addColorStop(0, this.celebration > 0 ? '#77521b' : '#251251');
        background.addColorStop(.5, '#751333'); background.addColorStop(1, '#111b42');
        c.fillStyle = background; c.fillRect(0, 0, 768, 640);
        c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = '#ffe3a0'; c.font = 'bold 34px Arial';
        c.fillText('SEA FORTUNE', 384, 49);
        for (let i = 0; i < 3; i++) {
            const x = 59 + i * 222;
            c.fillStyle = '#fff9e8'; c.fillRect(x, 78, 204, 430);
            c.save(); c.beginPath(); c.rect(x, 78, 204, 430); c.clip();
            const rolling = this.spin?.rolling && this.spin.stopped <= i;
            const motion = rolling ? (this.spin!.elapsed - .6) * (11 + i * 2) : 0;
            const base = rolling ? Math.floor(motion) % SYMBOL_COUNT : this.reels[i]!;
            const offset = rolling ? (motion % 1) * 142 : 0;
            for (let row = -2; row <= 2; row++) this.symbol((base + row + SYMBOL_COUNT * 2) % SYMBOL_COUNT, x + 102, 293 + row * 142 + offset);
            c.restore();
        }
        c.strokeStyle = '#e8ae35'; c.lineWidth = 6; c.strokeRect(50, 224, 666, 140);
        c.fillStyle = '#ffe3a0'; c.font = 'bold 27px Arial'; c.fillText(this.status, 384, 559);
        c.fillStyle = '#ffffff'; c.font = '24px Arial'; c.fillText('3 SILJA = 100 mk • OTHER TRIPLES = 20 mk', 384, 604);
        c.strokeStyle = this.celebration > 0 ? '#ffed90' : '#54dafa';
        c.lineWidth = 5; c.strokeRect(5, 5, 758, 630);
        if (this.celebration > 0) {
            // Small gold sparkles in the margins preserve the winning payline.
            c.fillStyle = '#ffe7a0';
            for (let i = 0; i < 20; i++) {
                const x = i % 2 ? 27 : 739;
                const y = 70 + ((i * 31 + (this.reducedMotion ? 0 : this.elapsed * 65)) % 445);
                c.save(); c.translate(x, y); c.rotate(this.reducedMotion ? 0 : this.elapsed + i); c.fillRect(-4, -7, 8, 14); c.restore();
            }
        }
        this.screenTexture.needsUpdate = true;
    }

    private drawMarquee(): void {
        const c = this.marquee.getContext('2d')!;
        const pulse = this.reducedMotion ? .5 : .5 + .5 * Math.sin(this.elapsed * 2.8);
        const gradient = c.createLinearGradient(0, 0, 1024, 440);
        gradient.addColorStop(0, '#131d51'); gradient.addColorStop(.5, this.celebration > 0 ? '#825315' : '#871940'); gradient.addColorStop(1, '#21124d');
        c.fillStyle = gradient; c.fillRect(0, 0, 1024, 440);
        c.strokeStyle = '#ffe29a'; c.lineWidth = 9; c.strokeRect(13, 13, 998, 414);
        c.strokeStyle = '#65e0ff'; c.lineWidth = 3; c.strokeRect(26, 26, 972, 388);
        c.textAlign = 'center'; c.fillStyle = '#ffffff'; c.font = 'bold 48px Georgia'; c.fillText('SEA FORTUNE', 512, 89);
        c.fillStyle = '#ffe3a2'; c.font = 'bold 38px Arial';
        c.fillText(this.celebration > 0 && this.jackpotWin ? 'SILJA JACKPOT WON!' : 'SILJA BOAT JACKPOT', 512, 148);
        c.save(); c.shadowColor = '#ffb128'; c.shadowBlur = 14 + 12 * pulse;
        c.fillStyle = '#fff0b6'; c.font = 'bold 108px Arial'; c.fillText('100 mk', 512, 260); c.restore();
        c.fillStyle = '#ffffff'; c.font = '29px Arial'; c.fillText('3 SILJA BOATS ON THE GOLD ROW', 512, 322);
        c.fillStyle = '#aeeeff'; c.font = '26px Arial'; c.fillText('OTHER TRIPLES 20 mk   •   SPIN 5 mk', 512, 377);
        for (let i = 0; i < 16; i++) {
            c.fillStyle = (i + Math.floor(this.reducedMotion ? 0 : this.elapsed * 4)) % 4 === 0 ? '#ffffff' : '#e9aa4c';
            c.beginPath(); c.arc(53 + i * 61, 405, 4, 0, Math.PI * 2); c.fill();
        }
        this.marqueeTexture.needsUpdate = true;
    }

    dispose(): void {
        this.interaction?.dispose();
        this.spin = null; this.root.removeFromParent();
        if (this.body) this.engine.physicsWorld?.removeRigidBody(this.body.rigidBody);
        this.body = null;
        for (const texture of this.textures) texture.dispose();
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials) material.dispose();
    }
}
