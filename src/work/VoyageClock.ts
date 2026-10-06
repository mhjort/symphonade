import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import type { GameHUD } from './GameHUD.js';
import { compactHud } from './PhoneHud.js';

/** Helsinki 17:00 Finnish time → Stockholm 09:30 Swedish time (10:30 Finnish). */
export const DEPART_FINNISH_MINUTE = 17 * 60;
export const VOYAGE_SHIP_MINUTES = 17.5 * 60;
export const VOYAGE_REAL_SECONDS = 3600;
/** Ship time switches to Swedish time at 01:00 Finnish, which becomes 00:00 again. */
export const CLOCK_CHANGE_SHIP_MINUTE = 8 * 60;
/** Sleeping in a cabin bed makes ship time pass this many times faster. */
export const SLEEP_TIME_SCALE = 12;
const APPROACH_SHIP_MINUTE = VOYAGE_SHIP_MINUTES - 30;

export interface ShipTime { hours: number; minutes: number; zone: 'FI' | 'SE'; label: string; short: string }

export function shipTimeAt(elapsedShipMinutes: number): ShipTime {
    const elapsed = Math.floor(Math.max(0, elapsedShipMinutes));
    const zone = elapsed >= CLOCK_CHANGE_SHIP_MINUTE ? 'SE' : 'FI';
    const total = (DEPART_FINNISH_MINUTE + elapsed - (zone === 'SE' ? 60 : 0)) % (24 * 60);
    const hours = Math.floor(total / 60), minutes = total % 60;
    const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    return { hours, minutes, zone, label: `${clock} · ${zone === 'FI' ? 'Finnish' : 'Swedish'} time`, short: `${clock} ${zone}` };
}

/** Ship clock running VOYAGE_SHIP_MINUTES over VOYAGE_REAL_SECONDS of gameplay. */
export class VoyageClock {
    // Dev preview: ?shipMinute=300 starts the voyage that far in (localhost only).
    private elapsedShipMinutes = location.hostname === 'localhost'
        ? Math.min(VOYAGE_SHIP_MINUTES - 1, Math.max(0, Number(new URLSearchParams(location.search).get('shipMinute')) || 0)) : 0;
    private started = false;
    private display = '';
    private announcedChange = false;
    private announcedApproach = false;
    private sleeping = false;

    constructor(private readonly hud: GameHUD) {
        hud.createIconText('ship-clock', { anchor: 'top-right', icon: '🕐', text: this.label(shipTimeAt(0)) });
        hud.hideElement('ship-clock');
    }

    get shipMinutes(): number { return this.elapsedShipMinutes; }
    get arrived(): boolean { return this.elapsedShipMinutes >= VOYAGE_SHIP_MINUTES; }
    get time(): ShipTime { return shipTimeAt(this.elapsedShipMinutes); }

    start(): void {
        if (this.started) return;
        this.started = true;
        this.hud.showElement('ship-clock');
        this.hud.showToast('🚢 Departing Helsinki 17:00 · Arriving Stockholm 09:30 Swedish time', { duration: 6000 });
        this.refresh();
    }

    update(dt: number, sleeping = false): void {
        if (!this.started || !getGameStateManager().isState(GameState.PLAYING)) return;
        const scale = sleeping ? SLEEP_TIME_SCALE : 1;
        this.elapsedShipMinutes = Math.min(VOYAGE_SHIP_MINUTES,
            this.elapsedShipMinutes + Math.max(0, dt) * scale * VOYAGE_SHIP_MINUTES / VOYAGE_REAL_SECONDS);
        if (sleeping !== this.sleeping) {
            this.sleeping = sleeping;
            this.hud.updateIconText('ship-clock', { icon: sleeping ? '💤' : '🕐' });
        }
        if (!this.announcedChange && this.elapsedShipMinutes >= CLOCK_CHANGE_SHIP_MINUTE) {
            this.announcedChange = true;
            this.hud.showToast('🕐 Ship time is now Swedish time — clocks go back one hour', { duration: 6000 });
        }
        if (!this.announcedApproach && this.elapsedShipMinutes >= APPROACH_SHIP_MINUTE) {
            this.announcedApproach = true;
            this.hud.showToast('⚓ Approaching Stockholm · arrival at 09:30', { duration: 6000 });
        }
        this.refresh();
    }

    private refresh(): void {
        const label = this.label(shipTimeAt(this.elapsedShipMinutes));
        if (label === this.display) return;
        this.display = label;
        this.hud.updateIconText('ship-clock', { text: label });
    }

    private label(time: ShipTime): string { return compactHud ? time.short : time.label; }

    dispose(): void {
        this.hud.removeElement('ship-clock');
    }
}
