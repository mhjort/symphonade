import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import { NpcIdleBehavior } from 'engine/npc/behaviors/NpcIdleBehavior.js';
import type { NpcController } from 'engine/npc/core/NpcController.js';
import type { CoffeeShop } from './CoffeeShop.js';
import type { HeldDrink } from './HeldDrink.js';
import type { GameHUD } from './GameHUD.js';

export const BEER_PRICE = 20;
const ID = 'sea_pub_bartender';
const POSITION = new THREE.Vector3(2.2, .05, -32.8);
const GLASS = new THREE.Vector3(2.4, 1.225, -32.15);
const TAP = new THREE.Vector3(2.4, 1.57, -32.15);

class BartenderBehavior extends NpcIdleBehavior {
    constructor(private readonly order: () => boolean) {
        super({ lookAtPlayer: true, lookAtRange: 5, randomIdleMotions: false });
    }
    override update(): THREE.Vector3 | null { return null; }
    override clone(): BartenderBehavior { return new BartenderBehavior(this.order); }
    override getName(): string { return 'Sea Pub bartender'; }
    override onPlayerInteract(): boolean { return this.order(); }
}

/** One prepaid order: empty glass -> tap pour -> filled glass handover. */
export class BeerBar {
    private npc: NpcController | null = null;
    private readonly tapHand = new THREE.Object3D();
    private elapsed: number | null = null;
    private receiptTime = 0;
    private readonly stream = new THREE.Mesh(
        new THREE.CylinderGeometry(.008, .008, 1, 8),
        new THREE.MeshStandardMaterial({ color: 0xe8ad30, roughness: .25 }),
    );
    get isServing(): boolean { return this.elapsed !== null; }

    constructor(private readonly engine: EngineLike, private readonly hud: GameHUD,
        private readonly wallet: CoffeeShop, private readonly glass: HeldDrink,
        private readonly coffee: HeldDrink) {
        this.stream.name = 'Beer pouring from tap';
        this.stream.visible = false;
        this.tapHand.position.set(2.7, 1.86, -31.91);
        engine.getWorldGroup().add(this.stream, this.tapHand);
        hud.createIconText('beer-receipt', { anchor: 'middle-center', icon: '🍺', text: '' });
        hud.hideElement('beer-receipt');
    }

    async load(): Promise<void> {
        const manager = this.engine.registerNpc(ID, new BartenderBehavior(() => this.buy()), {
            characterAssetId: 'asset_1789653266148_1h9yun',
            importance: 'hero', damageable: { canDie: false },
        });
        // The manager snaps its initial floor query to half-meter coordinates.
        // Snapping the service spot lands inside the bar; initialize on clear floor
        // before placing the bartender at the precise authored service position.
        await manager.spawn(.5, -30.5, 1.5);
        this.npc = this.engine.getNpcRegistry?.()?.get(ID)?.getAllNpcs()[0] ?? null;
        if (!this.npc) throw new Error('Sea Pub bartender failed to spawn');
        this.npc.teleportTo(POSITION.x, POSITION.y, POSITION.z);
        this.npc.setRetreatFromPlayerOverlap(false);
        this.npc.getCharacter().rotation.y = 0;
        this.npc.getInteractStartDisplayName = () => this.isServing ? 'Pouring your beer…'
            : !this.glass.canOrder ? 'Enjoy your beer' : `Buy beer · ${BEER_PRICE} mk`;
    }

    private message(text: string, seconds = 4): void {
        this.hud.updateIconText('beer-receipt', { text });
        this.hud.showElement('beer-receipt');
        this.receiptTime = seconds;
    }
    remindSeatedDrinking(): void { this.message('Sit at a table to drink your beer.'); }

    private buy(): boolean {
        const player = this.engine.getPlayerController()?.getPosition?.();
        if (!player || player.distanceTo(POSITION) > 3.4 || this.isServing || !this.npc) return false;
        if (!this.glass.canOrder) { this.remindSeatedDrinking(); return true; }
        if (!this.coffee.canOrder) { this.message('Finish your coffee before ordering beer.'); return true; }
        if (!this.wallet.trySpend(BEER_PRICE)) {
            this.message(`Beer costs ${BEER_PRICE} mk · Available: ${this.wallet.balance} mk`);
            return true;
        }
        this.elapsed = 0;
        this.glass.showPour(GLASS, 0);
        this.npc.setSkinnedArmGrip('left', this.tapHand, new THREE.Vector3(), new THREE.Euler());
        this.message('Pouring your beer…', 5);
        return true;
    }

    update(dt: number): void {
        const delta = Math.max(0, Math.min(dt, .1));
        if (this.receiptTime > 0) {
            this.receiptTime -= delta;
            if (this.receiptTime <= 0) this.hud.hideElement('beer-receipt');
        }
        if (this.elapsed === null) return;
        const player = this.engine.getPlayerController()?.getPosition?.();
        if (!player || player.distanceTo(POSITION) > 4.5 || !this.npc) {
            this.cancel(); this.message('Order cancelled · 20 mk refunded.'); return;
        }
        this.elapsed += delta;
        const fill = THREE.MathUtils.clamp((this.elapsed - .5) / 2.3, 0, 1);
        this.glass.showPour(GLASS, fill);
        this.stream.visible = this.elapsed >= .5 && this.elapsed < 2.8;
        const bottom = GLASS.y + .022 + .225 * fill;
        this.stream.scale.y = TAP.y - bottom;
        this.stream.position.set(TAP.x, (TAP.y + bottom) / 2, TAP.z);
        if (this.elapsed >= 3.2) {
            this.npc?.clearSkinnedArmGrip('left');
            this.stream.visible = false;
            this.elapsed = null;
            this.glass.receive(this.npc, GLASS);
            this.remindSeatedDrinking();
        }
    }

    private cancel(): void {
        if (this.elapsed !== null) this.wallet.credit(BEER_PRICE);
        this.elapsed = null;
        this.npc?.clearSkinnedArmGrip('left');
        this.stream.visible = false;
        this.glass.cancelPour();
    }
    dispose(): void {
        if (this.isServing) this.cancel();
        this.engine.getNpcRegistry?.()?.unregisterController(ID);
        this.npc = null;
        this.tapHand.removeFromParent();
        this.stream.removeFromParent(); this.stream.geometry.dispose(); this.stream.material.dispose();
        this.hud.removeElement('beer-receipt');
    }
}
