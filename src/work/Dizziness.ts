import * as THREE from 'three';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import type { GameHUD } from './GameHUD.js';
import { compactHud } from './PhoneHud.js';

export const DIZZINESS_RECOVERY_SECONDS = 180;
export const DIZZINESS_PER_BEER = .4;

/** Gameplay-time intoxication, separate from the ship's ambient swell. */
export class Dizziness {
    private peak = 0;
    private remaining = 0;
    private phase = 0;
    private display = '';
    private readonly up = new THREE.Vector3(0,1,0);
    private readonly tilt = new THREE.Quaternion();
    private readonly euler = new THREE.Euler();
    private canvas: HTMLCanvasElement | null = null;
    private previousFilter = '';
    private appliedBlur = -1;
    /** Set when a beer pushes dizziness past 100% — the passenger blacks out. */
    blackedOut = false;

    constructor(private readonly hud: GameHUD, private readonly reducedMotion: MediaQueryList) {
        hud.createIconText('dizziness', { anchor: compactHud ? 'top-left' : 'top-right', icon: '🍺', text: '' });
        hud.hideElement('dizziness');
    }

    get severity(): number { return this.peak * this.remaining / DIZZINESS_RECOVERY_SECONDS; }
    get secondsRemaining(): number { return this.remaining; }

    drinkBeer(): void {
        if (this.severity + DIZZINESS_PER_BEER > 1 + 1e-9) this.blackedOut = true;
        this.peak = Math.min(1, this.severity + DIZZINESS_PER_BEER);
        this.remaining = DIZZINESS_RECOVERY_SECONDS;
        this.refresh();
    }

    update(dt: number): void {
        if (!getGameStateManager().isState(GameState.PLAYING)) return;
        const delta = Math.max(0,dt);
        this.remaining = Math.max(0,this.remaining-delta);
        if (this.remaining === 0) { this.peak = 0; this.phase = 0; }
        else this.phase += delta;
        this.refresh();
    }

    affectWalking(direction: THREE.Vector3): void {
        const strength = this.severity;
        if (!strength || direction.lengthSq() === 0) return;
        // Rotate the intended movement, preserving zero input and analogue strength.
        direction.applyAxisAngle(this.up, Math.sin(this.phase * 1.35) * .24 * strength);
        direction.multiplyScalar(1 - .25 * strength);
    }

    applyView(camera: THREE.Camera): void {
        if (this.severity === 0 || this.reducedMotion.matches) return;
        // Game.ts calls this on the freshly rebuilt camera after ship swell.
        const strength = this.severity;
        this.euler.set(Math.sin(this.phase * .91) * .012 * strength,
            Math.sin(this.phase * .73) * .014 * strength,
            Math.sin(this.phase * 1.07) * .022 * strength, 'YXZ');
        camera.quaternion.multiply(this.tilt.setFromEuler(this.euler));
    }

    private refresh(): void {
        if (!this.canvas) {
            this.canvas = document.querySelector('canvas');
            this.previousFilter = this.canvas?.style.filter ?? '';
        }
        const blur = Math.round(this.severity * 1.8 * 100) / 100;
        if (this.canvas && blur !== this.appliedBlur) {
            this.canvas.style.filter = blur > 0
                ? `${this.previousFilter === 'none' ? '' : this.previousFilter} blur(${blur}px)`.trim()
                : this.previousFilter;
            this.appliedBlur = blur;
        }
        if (this.remaining === 0) { this.hud.hideElement('dizziness'); this.display = ''; return; }
        const seconds = Math.ceil(this.remaining);
        const warning = this.severity + DIZZINESS_PER_BEER > 1 ? (compactHud ? ' ⚠' : ' · one more is too many') : '';
        const text = `${compactHud ? '' : 'Dizzy '}${Math.ceil(this.severity * 100)}% · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}${warning}`;
        if (text !== this.display) { this.hud.updateIconText('dizziness',{ text }); this.display = text; }
        this.hud.showElement('dizziness');
    }

    dispose(): void {
        this.peak = 0; this.remaining = 0;
        if (this.canvas) this.canvas.style.filter = this.previousFilter;
        this.hud.removeElement('dizziness');
    }
}
