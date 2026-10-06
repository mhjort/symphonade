import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import type { PointerLockManager } from 'engine/PointerLockManager.js';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import { NpcIdleBehavior } from 'engine/npc/behaviors/NpcIdleBehavior.js';
import type { NpcController } from 'engine/npc/core/NpcController.js';
import type { CoffeeShop } from './CoffeeShop.js';
import type { GameHUD } from './GameHUD.js';
import { shipTimeAt } from './VoyageClock.js';
import { compactHud } from './PhoneHud.js';

/** Seatings in ship minutes after the 17:00 departure (Finnish time). */
export const SEATINGS = [
    { label: '18:00', minute: 60 },
    { label: '19:30', minute: 150 },
    { label: '21:00', minute: 240 },
] as const;
export const SEATING_EARLY_MINUTES = 15;
export const SEATING_LATE_MINUTES = 30;
export const DINNER_PRICE = 30;
const SERVE_SECONDS = 1.5;
const EAT_SECONDS = 6;
const ID = 'bon_vivant_host';
const BON_VIVANT_HOST_ASSET = 'asset_1791127414097_8138sk';
/** Promenade side of the Bon Vivant doorway (wall X=6, opening Z -7.6..-4.4). */
const HOST_POSITION = new THREE.Vector3(5.35, .05, -8.35);
const LECTERN_POSITION = new THREE.Vector3(4.75, 0, -8.35);

export type ReservationState = 'none' | 'booked' | 'eaten' | 'missed' | 'full';
type Seating = typeof SEATINGS[number];

class HostBehavior extends NpcIdleBehavior {
    constructor(private readonly talk: () => boolean) {
        super({ lookAtPlayer: true, lookAtRange: 6, randomIdleMotions: false });
    }
    override update(): THREE.Vector3 | null { return null; }
    override clone(): HostBehavior { return new HostBehavior(this.talk); }
    override getName(): string { return 'Bon Vivant host'; }
    override onPlayerInteract(): boolean { return this.talk(); }
}

export interface DinnerContext {
    shipMinutes: number;
    /** Name of the chair the player has fully settled into, if any. */
    seatName: string | null;
    tablePosition: THREE.Vector3 | null;
    playerPosition: THREE.Vector3;
}

/** Bon Vivant books one seating per voyage; dinner is served only in its window. */
export class BonVivantReservation {
    private npc: NpcController | null = null;
    private seating: Seating | null = null;
    private stateValue: ReservationState = 'none';
    private meal: { elapsed: number; paid: boolean; seat: string } | null = null;
    private refusedSeat: string | null = null;
    private messageTime = 0;
    private announcedWindow = false;
    private hudText = '';
    private shipMinutes = 0;
    private previousFreeMouse = false;
    private readonly lectern = new THREE.Group();
    private readonly plate = new THREE.Group();
    private readonly food = new THREE.Group();
    private readonly dialog = document.createElement('dialog');
    private readonly style = document.createElement('style');
    private readonly disposables: Array<THREE.BufferGeometry | THREE.Material> = [];

    constructor(private readonly engine: EngineLike, private readonly hud: GameHUD,
        private readonly wallet: CoffeeShop,
        private readonly pointerLock: () => PointerLockManager | null,
        private readonly onBooked: () => void,
        private readonly onDinner: () => void,
        private readonly onMissed: () => void) {
        hud.createIconText('bon-vivant', { anchor: 'top-right', icon: '🍽', text: '' });
        hud.hideElement('bon-vivant');
        hud.createIconText('bon-vivant-message', { anchor: 'middle-center', icon: '🍽', text: '' });
        hud.hideElement('bon-vivant-message');
        this.buildProps();
        this.buildDialog();
    }

    get state(): ReservationState { return this.stateValue; }
    get bookedSeating(): string | null { return this.seating?.label ?? null; }
    get isEating(): boolean { return this.meal !== null; }

    async load(): Promise<void> {
        const manager = this.engine.registerNpc(ID, new HostBehavior(() => this.talk()), {
            characterAssetId: BON_VIVANT_HOST_ASSET,
            importance: 'hero', damageable: { canDie: false },
        });
        // Initialise on open promenade floor, then place precisely at the lectern.
        await manager.spawn(3, -8.5, 1.5);
        this.npc = this.engine.getNpcRegistry?.()?.get(ID)?.getAllNpcs()[0] ?? null;
        if (!this.npc) throw new Error('Bon Vivant host failed to spawn');
        this.npc.teleportTo(HOST_POSITION.x, HOST_POSITION.y, HOST_POSITION.z);
        this.npc.setRetreatFromPlayerOverlap(false);
        this.npc.getCharacter().rotation.y = -Math.PI / 2;
        this.npc.getInteractStartDisplayName = () => this.prompt();
    }

    private prompt(): string {
        switch (this.stateValue) {
            case 'none': return 'Book a table · Bon Vivant';
            case 'booked': return `Your table · ${this.seating!.label}`;
            case 'eaten': return 'Thank the host';
            default: return 'Ask about a table';
        }
    }

    private window(seating: Seating): { from: number; to: number } {
        return { from: seating.minute - SEATING_EARLY_MINUTES, to: seating.minute + SEATING_LATE_MINUTES };
    }
    private clockLabel(minute: number): string { return shipTimeAt(minute).label.slice(0, 5); }

    private talk(): boolean {
        if (!getGameStateManager().isState(GameState.PLAYING)) return false;
        const player = this.engine.getPlayerController()?.getPosition?.();
        if (!player || player.distanceTo(HOST_POSITION) > 3.4) return false;
        if (this.stateValue === 'none') {
            if (SEATINGS.some(s => s.minute > this.shipMinutes)) this.openDialog();
            else {
                this.stateValue = 'full';
                this.message('Host: I’m sorry, tonight’s seatings are over.');
                this.onBooked();
            }
        } else if (this.stateValue === 'booked') {
            const { from, to } = this.window(this.seating!);
            this.message(this.shipMinutes >= from
                ? `Host: Your ${this.seating!.label} table is ready — please take a seat inside.`
                : `Host: See you at ${this.seating!.label}. Please arrive between ${this.clockLabel(from)} and ${this.clockLabel(to)}.`);
        } else if (this.stateValue === 'eaten') this.message('Host: Thank you for dining with us tonight!');
        else this.message('Host: I’m sorry, we have no more tables for you tonight.');
        return true;
    }

    book(label: string): boolean {
        const seating = SEATINGS.find(s => s.label === label);
        if (!seating || this.stateValue !== 'none' || seating.minute <= this.shipMinutes) return false;
        this.seating = seating;
        this.stateValue = 'booked';
        this.closeDialog();
        const { from, to } = this.window(seating);
        this.message(`Table booked for ${seating.label} · Arrive ${this.clockLabel(from)}–${this.clockLabel(to)} · Dinner ${DINNER_PRICE} mk`, 6);
        this.onBooked();
        return true;
    }

    update(dt: number, context: DinnerContext): void {
        this.shipMinutes = context.shipMinutes;
        const playing = getGameStateManager().isState(GameState.PLAYING);
        const delta = playing ? Math.max(0, Math.min(dt, .1)) : 0;
        if (this.messageTime > 0) {
            this.messageTime -= delta;
            if (this.messageTime <= 0) this.hud.hideElement('bon-vivant-message');
        }
        const seat = context.seatName?.startsWith('Bon Vivant') ? context.seatName : null;
        if (seat !== this.refusedSeat) this.refusedSeat = null;

        if (this.stateValue === 'booked') {
            const { from, to } = this.window(this.seating!);
            const inWindow = context.shipMinutes >= from && context.shipMinutes <= to;
            if (!this.announcedWindow && context.shipMinutes >= from) {
                this.announcedWindow = true;
                this.hud.showToast(`🍽 Your ${this.seating!.label} table at Bon Vivant is ready`, { duration: 6000 });
            }
            if (this.meal) this.advanceMeal(delta, seat, context);
            else if (context.shipMinutes > to) {
                this.stateValue = 'missed';
                this.hud.showToast(`🍽 You missed your ${this.seating!.label} seating at Bon Vivant · Dinner quest failed`, {
                    variant: 'warning', anchor: 'middle-center', duration: 6000,
                });
                this.onMissed();
            } else if (seat && seat !== this.refusedSeat) {
                if (inWindow) this.meal = { elapsed: 0, paid: false, seat };
                else {
                    this.refusedSeat = seat;
                    this.message(`Waiter: Your table is at ${this.seating!.label} — we start serving at ${this.clockLabel(from)}.`);
                }
            }
        } else if (seat && seat !== this.refusedSeat && this.stateValue !== 'eaten') {
            this.refusedSeat = seat;
            this.message(this.stateValue === 'none'
                ? 'Waiter: Tables are by reservation only — book with the host at the entrance.'
                : 'Waiter: I’m sorry, we can’t serve you without a reservation tonight.');
        }
        this.refreshHud(context.shipMinutes);
    }

    private advanceMeal(delta: number, seat: string | null, context: DinnerContext): void {
        const meal = this.meal!;
        if (seat !== meal.seat) {
            // Leaving before the meal is finished clears the table and refunds it.
            if (meal.paid) { this.wallet.credit(DINNER_PRICE); this.message(`Dinner cancelled · ${DINNER_PRICE} mk refunded.`); }
            this.meal = null; this.plate.visible = false;
            return;
        }
        meal.elapsed += delta;
        if (!meal.paid && meal.elapsed >= SERVE_SECONDS) {
            if (!this.wallet.trySpend(DINNER_PRICE)) {
                this.message(`Dinner costs ${DINNER_PRICE} mk · Available: ${this.wallet.balance} mk`);
                this.refusedSeat = seat; this.meal = null;
                return;
            }
            meal.paid = true;
            const table = context.tablePosition ?? context.playerPosition.clone().setY(.75);
            const away = table.clone().sub(context.playerPosition).setY(0);
            if (away.lengthSq() > 0) table.add(away.normalize().multiplyScalar(.14));
            this.plate.position.copy(table);
            this.plate.visible = true; this.food.visible = true; this.food.scale.setScalar(1);
            this.message(`Dinner served · ${DINNER_PRICE} mk · Bon appétit!`, EAT_SECONDS);
        }
        if (meal.paid) {
            const eaten = THREE.MathUtils.clamp((meal.elapsed - SERVE_SECONDS) / EAT_SECONDS, 0, 1);
            this.food.scale.setScalar(Math.max(.05, 1 - eaten * .95));
            if (eaten >= 1) {
                this.food.visible = false;
                this.meal = null;
                this.stateValue = 'eaten';
                this.onDinner();
            }
        }
    }

    private refreshHud(minutes: number): void {
        let text = '';
        if (this.stateValue === 'booked') {
            const { from } = this.window(this.seating!);
            const time = this.seating!.label;
            text = compactHud
                ? this.meal ? 'Dining' : minutes >= from ? `${time} · Go!` : time
                : this.meal ? `Bon Vivant ${time} · Dining`
                : minutes >= from ? `Bon Vivant ${time} · Go now!` : `Bon Vivant table ${time}`;
        } else if (this.stateValue === 'eaten') text = compactHud ? 'Dined' : 'Bon Vivant · Dinner enjoyed';
        else if (this.stateValue === 'missed') text = compactHud ? 'Missed' : 'Bon Vivant · Seating missed';
        if (text === this.hudText) return;
        this.hudText = text;
        if (text) { this.hud.updateIconText('bon-vivant', { text }); this.hud.showElement('bon-vivant'); }
        else this.hud.hideElement('bon-vivant');
    }

    private message(text: string, seconds = 4.5): void {
        this.hud.updateIconText('bon-vivant-message', { text });
        this.hud.showElement('bon-vivant-message');
        this.messageTime = seconds;
    }

    private buildProps(): void {
        const material = (color: number, roughness = .6) => {
            const m = new THREE.MeshStandardMaterial({ color, roughness });
            this.disposables.push(m); return m;
        };
        const geometry = <T extends THREE.BufferGeometry>(g: T): T => { this.disposables.push(g); return g; };
        const walnut = material(0x4a2c1d, .45), brass = material(0xc9a45a, .3), paper = material(0xf4efe2, .8);
        const stand = new THREE.Mesh(geometry(new THREE.BoxGeometry(.42, 1.02, .5)), walnut);
        stand.position.y = .51;
        const top = new THREE.Mesh(geometry(new THREE.BoxGeometry(.5, .04, .6)), walnut);
        top.position.set(.02, 1.07, 0); top.rotation.z = .18;
        const book = new THREE.Mesh(geometry(new THREE.BoxGeometry(.3, .025, .42)), paper);
        book.position.set(.03, 1.105, 0); book.rotation.z = .18;
        const trim = new THREE.Mesh(geometry(new THREE.BoxGeometry(.44, .05, .52)), brass);
        trim.position.y = .03;
        const lamp = new THREE.Mesh(geometry(new THREE.SphereGeometry(.05, 12, 8)), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc870, emissiveIntensity: 1.2 }));
        this.disposables.push(lamp.material);
        lamp.position.set(-.15, 1.16, .2);
        this.lectern.add(stand, top, book, trim, lamp);
        this.lectern.name = 'Bon Vivant reservation lectern';
        this.lectern.position.copy(LECTERN_POSITION);
        this.lectern.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });

        const china = material(0xfbfaf6, .25);
        const dish = new THREE.Mesh(geometry(new THREE.CylinderGeometry(.14, .11, .02, 24)), china);
        dish.position.y = .01;
        const fish = new THREE.Mesh(geometry(new THREE.BoxGeometry(.12, .03, .06)), material(0xe9a77a, .5));
        fish.position.set(.02, .035, 0); fish.rotation.y = .4;
        const potatoes = [-.06, -.04].map((x, i) => {
            const p = new THREE.Mesh(geometry(new THREE.SphereGeometry(.022, 8, 6)), material(0xe5c66d, .6));
            p.position.set(x, .035, i ? .05 : -.04); return p;
        });
        const greens = new THREE.Mesh(geometry(new THREE.BoxGeometry(.05, .02, .05)), material(0x4f8a3a, .7));
        greens.position.set(-.02, .03, .07);
        this.food.add(fish, greens, ...potatoes);
        this.plate.add(dish, this.food);
        this.plate.name = 'Bon Vivant dinner plate';
        this.plate.visible = false;
        this.engine.getWorldGroup().add(this.lectern, this.plate);
    }

    private buildDialog(): void {
        this.style.textContent = `
            .bon-vivant-booking { box-sizing:border-box; width:min(440px,92vw); margin:auto; padding:clamp(16px,3vw,28px);
                border:0; border-radius:var(--hud-radius-card); background:var(--hud-color-background);
                color:var(--hud-color-text); font-family:var(--hud-font-family); }
            .bon-vivant-booking::backdrop { background:color-mix(in srgb,var(--hud-color-background) 70%,transparent); }
            .bon-vivant-booking h1 { margin:0 0 6px; font-size:22px; }
            .bon-vivant-booking p { margin:0 0 14px; color:var(--hud-color-text-muted); font-size:14px; }
            .bon-vivant-booking button { display:flex; justify-content:space-between; width:100%; margin:8px 0;
                padding:12px 16px; font:inherit; font-size:16px; border:2px solid transparent; cursor:pointer;
                border-radius:var(--hud-radius-card); background:var(--hud-color-surface); color:var(--hud-color-on-surface); }
            .bon-vivant-booking button:focus-visible { outline:3px solid var(--hud-color-primary); outline-offset:2px; }
            .bon-vivant-booking button:disabled { opacity:.45; cursor:default; }
            .bon-vivant-booking .bon-vivant-cancel { justify-content:center; background:transparent; color:var(--hud-color-text-muted); }`;
        document.head.append(this.style);
        this.dialog.className = 'bon-vivant-booking';
        this.dialog.setAttribute('aria-labelledby', 'bon-vivant-title');
        this.dialog.innerHTML = `<h1 id="bon-vivant-title">Bon Vivant · Reservations</h1>
            <p>Choose one dinner seating for tonight. Arrive within 15 minutes before to 30 minutes after it. Dinner costs ${DINNER_PRICE} mk at the table. Miss it and there is no second chance.</p>
            <div class="bon-vivant-seatings" role="group" aria-label="Seatings"></div>
            <button class="bon-vivant-cancel">Not now</button>`;
        for (const seating of SEATINGS) {
            const button = document.createElement('button');
            button.dataset.seating = seating.label;
            button.onclick = () => this.book(seating.label);
            this.dialog.querySelector('.bon-vivant-seatings')!.append(button);
        }
        this.dialog.querySelector<HTMLButtonElement>('.bon-vivant-cancel')!.onclick = () => this.closeDialog();
        this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.closeDialog(); });
        // Dialog keyboard navigation must never become a gameplay action or pause hotkey.
        this.dialog.addEventListener('keydown', event => { if (event.key !== 'Escape') event.stopPropagation(); });
        this.dialog.addEventListener('keyup', event => event.stopPropagation());
        document.body.append(this.dialog);
    }

    private openDialog(): void {
        if (this.dialog.open) return;
        let first: HTMLButtonElement | null = null;
        for (const button of this.dialog.querySelectorAll<HTMLButtonElement>('[data-seating]')) {
            const seating = SEATINGS.find(s => s.label === button.dataset.seating)!;
            button.disabled = seating.minute <= this.shipMinutes;
            button.innerHTML = `<strong>${seating.label}</strong><span>${button.disabled ? 'Closed' : 'Available'}</span>`;
            if (!button.disabled) first ??= button;
        }
        getGameStateManager().setPaused(true, 'interactive-ui');
        const lock = this.pointerLock();
        this.previousFreeMouse = lock?.getFreeMouseMode() ?? false;
        lock?.setFreeMouseMode(true); lock?.cancelLockRequest(); lock?.setInteractiveUIMode(true);
        document.exitPointerLock();
        this.dialog.showModal();
        first?.focus();
    }

    private closeDialog(): void {
        if (!this.dialog.open) return;
        this.dialog.close();
        const lock = this.pointerLock();
        lock?.setFreeMouseMode(this.previousFreeMouse); lock?.setInteractiveUIMode(false);
        getGameStateManager().setPaused(false, 'interactive-ui');
        lock?.requestLockWithRetry();
    }

    dispose(): void {
        if (this.meal?.paid) this.wallet.credit(DINNER_PRICE);
        if (this.dialog.open) this.closeDialog();
        this.dialog.remove(); this.style.remove();
        this.engine.getNpcRegistry?.()?.unregisterController(ID);
        this.npc = null;
        this.lectern.removeFromParent(); this.plate.removeFromParent();
        for (const item of this.disposables) item.dispose();
        this.hud.removeElement('bon-vivant');
        this.hud.removeElement('bon-vivant-message');
    }
}
