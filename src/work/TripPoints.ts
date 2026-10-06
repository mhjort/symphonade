import type { GameHUD } from './GameHUD.js';
import { compactHud } from './PhoneHud.js';

/** Trip points (the voyage's XP), earned by completing quests. */
export class TripPoints {
    private points = 0;

    constructor(private readonly hud: GameHUD) {
        hud.createIconText('trip-points', { anchor: 'top-right', icon: '⭐', text: this.label() });
    }

    get total(): number { return this.points; }

    award(points: number): void {
        this.points += Math.max(0, points);
        this.hud.updateIconText('trip-points', { text: this.label() });
    }

    private label(): string { return compactHud ? `${this.points} TP` : `${this.points} trip points`; }

    dispose(): void {
        this.hud.removeElement('trip-points');
    }
}
