import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import type { GameHUD } from './GameHUD.js';
import { compactHud } from './PhoneHud.js';

export class PlayerEnergy {
    private amount = 100;
    private displayed = 100;
    private reminderCooldown = 0;
    private reminderTime = 0;
    private exhaustionWarned = false;

    constructor(private readonly hud: GameHUD, initialEnergy = 100) {
        this.amount = this.displayed = Math.min(110, Math.max(0, initialEnergy));
        hud.createIconText('energy', { anchor: 'top-left', icon: '⚡', text: this.label(this.displayed) });
        // Keep the meter at the corner, above the desktop controls legend.
        const element = hud.getElement('energy');
        if (element) element.container.style.order = '-1';
        hud.createIconText('energy-coffee-reminder', {
            anchor: 'middle-center', icon: '☕', text: 'Feeling tired? Coffee gives +10% energy.',
        });
        hud.hideElement('energy-coffee-reminder');
    }

    get value(): number { return this.amount; }

    /** Applied once by the boarding transaction, before gameplay can advance. */
    initializeTraveler(amount: number): void {
        this.amount = amount;
        this.refresh();
    }

    update(dt: number, dancing = false, sleeping = false): void {
        if (!getGameStateManager().isState(GameState.PLAYING)) return;
        const delta = Math.max(0, dt);
        if (sleeping) {
            // Sleep restores normal energy without removing a drink's bonus.
            if (this.amount < 100) this.amount = Math.min(100, this.amount + delta * 2);
            this.refresh();
            this.hud.hideElement('energy-coffee-reminder');
            this.reminderTime = 0;
            return;
        }
        this.amount = Math.max(0, this.amount - delta / 30 * (dancing ? 3 : 1));
        this.refresh();
        this.reminderCooldown = Math.max(0, this.reminderCooldown - delta);
        if (this.reminderTime > 0) {
            this.reminderTime = Math.max(0, this.reminderTime - delta);
            if (this.reminderTime === 0) this.hud.hideElement('energy-coffee-reminder');
        }
        if (this.amount > 15) this.exhaustionWarned = false;
        else if (!this.exhaustionWarned) {
            this.exhaustionWarned = true;
            this.hud.showToast('⚡ Exhausted — get coffee or sleep in your cabin before you pass out', {
                variant: 'warning', anchor: 'middle-center', duration: 6000,
            });
        }
        if (this.amount <= 90 && this.reminderCooldown === 0) {
            this.hud.showElement('energy-coffee-reminder');
            this.reminderTime = 6;
            this.reminderCooldown = 300;
        }
    }

    drinkCoffee(): void {
        this.amount += 10;
        this.refresh();
        this.hud.hideElement('energy-coffee-reminder');
        this.reminderTime = 0;
        this.reminderCooldown = 300;
    }

    eatMeal(amount: number): void {
        this.amount += amount;
        this.refresh();
    }

    drinkBeer(): void {
        this.amount += 15;
        this.refresh();
    }

    private refresh(): void {
        this.amount = Math.min(110, this.amount);
        const rounded = Math.ceil(this.amount);
        if (rounded === this.displayed) return;
        this.displayed = rounded;
        this.hud.updateIconText('energy', { text: this.label(rounded) });
    }

    private label(percent: number): string { return compactHud ? `${percent}%` : `Energy ${percent}%`; }

    dispose(): void {
        this.hud.removeElement('energy');
        this.hud.removeElement('energy-coffee-reminder');
    }
}
