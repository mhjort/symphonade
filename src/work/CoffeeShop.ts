import * as THREE from 'three';
import { resolveAssetUrl, type EngineLike } from 'types/game.js';
import { NpcIdleBehavior } from 'engine/npc/behaviors/NpcIdleBehavior.js';
import type { GameHUD } from './GameHUD.js';
import type { HeldDrink } from './HeldDrink.js';

const CASHIER = 'coffee_cashier';
const POSITION = new THREE.Vector3(-11.25, .05, .8);
const PAYMENT = new THREE.Vector3(-11.25, 1.35, 1.6);
export const COFFEE_PRICE = 10;

class CashierBehavior extends NpcIdleBehavior {
    constructor(private readonly buy: () => boolean) {
        super({ lookAtPlayer: true, lookAtRange: 5, randomIdleMotions: false });
    }
    override update(_dt: number, _position: THREE.Vector3, _target: THREE.Vector3 | null): THREE.Vector3 | null { return null; }
    override clone(): CashierBehavior { return new CashierBehavior(this.buy); }
    override getName(): string { return 'Coffee & Co cashier'; }
    override onPlayerInteract(): boolean { return this.buy(); }
}

/** Session wallet and the first onboard purchase. Payment follows gameplay time,
 * like the cabin reader, so pausing cannot finish a transaction in the background. */
export class CoffeeShop {
    private marks = 100;
    private coffees = 0;
    private transaction: { elapsed: number; paid: boolean } | null = null;
    private receiptTime = 0;
    private note: HTMLImageElement | null = null;
    private amount: HTMLElement | null = null;

    get balance(): number { return this.marks; }

    /** Applied once by the boarding transaction, before purchases are possible. */
    initializeTraveler(marks: number): void {
        if (!Number.isSafeInteger(marks) || marks < 0) throw new Error('Invalid starting money');
        this.marks = marks;
        if (this.amount) this.amount.textContent = `${this.marks} mk`;
    }

    /** A pending coffee handover reserves the wallet until payment completes. */
    trySpend(amount: number): boolean {
        if (this.transaction || !Number.isSafeInteger(amount) || amount <= 0 || this.marks < amount) return false;
        this.marks -= amount;
        if (this.amount) this.amount.textContent = `${this.marks} mk`;
        return true;
    }

    credit(amount: number): void {
        if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid wallet credit');
        this.marks += amount;
        if (this.amount) this.amount.textContent = `${this.marks} mk`;
    }

    constructor(private readonly engine: EngineLike, private readonly hud: GameHUD,
        private readonly camera: () => THREE.Camera, private readonly banknoteUrl: string,
        private readonly mug: HeldDrink, private readonly otherDrinkAvailable: () => boolean = () => true,
        initialMarks = 100) { this.initializeTraveler(initialMarks); }

    async load(): Promise<void> {
        this.hud.createCustomElement('mark-wallet', {
            anchor: 'bottom-right',
            css: 'width:min(190px,32vw);pointer-events:none;text-align:right;',
            html: '<div data-balance role="status" aria-label="Money in Finnish marks" style="font-size:1.4em;font-weight:bold;margin-bottom:4px">100 mk</div><img alt="Finnish 100-mark banknote — wallet" style="display:block;width:100%;height:auto;transform-origin:center" />',
            onCreate: container => {
                this.note = container.querySelector('img');
                this.amount = container.querySelector('[data-balance]');
                if (this.amount) this.amount.textContent = `${this.marks} mk`;
                if (this.note) this.note.src = resolveAssetUrl(this.banknoteUrl) ?? this.banknoteUrl;
            },
        });
        this.hud.createIconText('coffee-receipt', { anchor: 'middle-center', icon: '☕', text: '' });
        this.hud.hideElement('coffee-receipt');
        const manager = this.engine.registerNpc(CASHIER, new CashierBehavior(() => this.buy()), {
            characterAssetId: 'asset_1789653095481_pzoafe',
            importance: 'hero', damageable: { canDie: false },
        });
        await manager.spawn(POSITION.x, POSITION.z, 1.5);
        const npc = this.engine.getNpcRegistry?.()?.get(CASHIER)?.getAllNpcs()[0];
        if (!npc) throw new Error('Coffee cashier failed to spawn');
        npc.teleportTo(POSITION.x, POSITION.y, POSITION.z);
        npc.setRetreatFromPlayerOverlap(false);
        npc.getCharacter().rotation.y = 0;
        npc.getInteractStartDisplayName = () => this.transaction ? 'Serving coffee…' : !this.mug.canOrder ? 'Enjoy your coffee' : `Buy coffee · ${COFFEE_PRICE} mk`;
    }

    private message(text: string, seconds: number): void {
        this.hud.updateIconText('coffee-receipt', { text });
        this.hud.showElement('coffee-receipt');
        this.receiptTime = seconds;
    }

    remindSeatedDrinking(): void {
        this.message('Sit down to drink your coffee.', 4);
    }

    private buy(): boolean {
        if (this.transaction) return false;
        if (!this.otherDrinkAvailable()) { this.message('Finish your beer before ordering coffee.', 4); return true; }
        // Also guard the transaction itself, not just the engine's prompt range.
        const player = this.engine.getPlayerController()?.getPosition?.();
        if (!player || player.distanceTo(POSITION) > 3) return false;
        if (!this.mug.canOrder) {
            this.remindSeatedDrinking();
            return true;
        }
        if (this.marks < COFFEE_PRICE) {
            this.message(`Coffee costs ${COFFEE_PRICE} mk · You have ${this.marks} mk`, 4);
            return true;
        }
        this.transaction = { elapsed: 0, paid: false };
        this.message('Paying for coffee…', 3);
        return true;
    }

    update(dt: number): void {
        const delta = Math.max(0, dt);
        if (this.receiptTime > 0) {
            this.receiptTime -= delta;
            if (this.receiptTime <= 0) this.hud.hideElement('coffee-receipt');
        }
        const payment = this.transaction;
        if (!payment) return;
        payment.elapsed += delta;
        if (!payment.paid && payment.elapsed >= 1.1) {
            const cashier = this.engine.getNpcRegistry?.()?.get(CASHIER)?.getAllNpcs()[0];
            if (!cashier) { this.transaction = null; if (this.note) this.note.style.transform = ''; return; }
            payment.paid = true;
            this.marks -= COFFEE_PRICE;
            this.coffees++;
            this.mug.receive(cashier, PAYMENT);
            if (this.amount) this.amount.textContent = `${this.marks} mk`;
            this.remindSeatedDrinking();
        }
        // Carry the note out, hold it at the checkout, then return the wallet
        // symbol with its updated balance. Reproject if the player looks around.
        const t = payment.elapsed;
        const travel = THREE.MathUtils.clamp(t < .65 ? t / .65 : t < 1.35 ? 1 : 1 - (t - 1.35) / .65, 0, 1);
        if (this.note) {
            const rect = this.note.parentElement!.getBoundingClientRect();
            const viewport = document.querySelector('canvas')?.getBoundingClientRect();
            const width = viewport?.width ?? window.innerWidth;
            const height = viewport?.height ?? window.innerHeight;
            const projected = PAYMENT.clone().project(this.camera());
            const x = THREE.MathUtils.clamp((projected.x + 1) * width / 2, 24, width - 24);
            const y = THREE.MathUtils.clamp((1 - projected.y) * height / 2, 24, height - 24);
            const dx = (viewport?.left ?? 0) + x - rect.left - rect.width / 2;
            const dy = (viewport?.top ?? 0) + y - rect.bottom + this.note.clientHeight / 2;
            const eased = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : travel * travel * (3 - 2 * travel);
            this.note.style.transform = `translate(${dx * eased}px,${dy * eased}px) scale(${1 - .78 * eased}) rotate(${-10 * eased}deg)`;
        }
        if (t >= 2) {
            if (this.note) this.note.style.transform = '';
            this.transaction = null;
        }
    }

    dispose(): void {
        this.transaction = null;
        this.engine.getNpcRegistry?.()?.unregisterController(CASHIER);
        this.hud.removeElement('mark-wallet');
        this.hud.removeElement('coffee-receipt');
        this.note = null; this.amount = null;
    }
}
