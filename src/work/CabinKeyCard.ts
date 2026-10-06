import * as THREE from 'three';
import type { GameHUD } from './GameHUD.js';
import type { CabinAssignment } from './CabinAssignment.js';

// Original vector artwork: a ferry boarding card, based on the creator's reference.
const bars = Array.from({ length: 64 }, (_, i) => {
    const width = [2, 1, 3, 1, 2, 4, 1][i % 7];
    return `<rect x="${132 + i * 4}" y="221" width="${width}" height="43"/>`;
}).join('');
function cardArtwork(cabin: CabinAssignment): string {
return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 310">
<defs><linearGradient id="paper" x2="0.8" y2="1"><stop stop-color="#bde8ed"/><stop offset="1" stop-color="#97cbd7"/></linearGradient></defs>
<rect x="2" y="2" width="496" height="306" rx="25" fill="url(#paper)" stroke="#6ca6b7" stroke-width="3"/>
<path d="M18 26L57 13V35ZM18 284L57 274V298Z" fill="#24628f"/>
<g fill="#234750" font-family="monospace" text-anchor="middle">
<text x="268" y="40" font-size="27" font-weight="bold">M/S Silja Symphonade</text>
<text x="270" y="68" font-size="17">Cabin / Boarding Card</text>
<path d="M72 79H466" stroke="#436b73" stroke-width="2" stroke-dasharray="3 5"/>
<text x="270" y="107" font-size="22">Helsinki–Stockholm</text>
<text x="270" y="132" font-size="15">SILJA LINE · SEA VOYAGE</text>
<text x="270" y="179" font-size="31" font-weight="bold">Cabin ${cabin.id}</text>
<text x="270" y="205" font-size="18">Deck 8 · ${cabin.view}</text>
<text transform="translate(39 160) rotate(-90)" font-size="19">CABIN KEY · PASSENGER</text>
<text transform="translate(467 187) rotate(-90)" font-size="13">HELSINKI → STOCKHOLM</text>
<g fill="#24464b">${bars}</g>
<text x="270" y="285" font-size="13" letter-spacing="3">${cabin.id} / 08 001 SYMPHONADE</text>
</g></svg>`;
}

export class CabinKeyCard {
    private image: HTMLImageElement | null = null;
    private animation: Animation | null = null;
    private collected = false;

    constructor(private readonly hud: GameHUD, cabin: CabinAssignment) {
        const cardUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardArtwork(cabin))}`;
        hud.createCustomElement('cabin-key-card', {
            anchor: 'bottom-left',
            css: 'width: min(280px, 40vw); max-width: 100%; pointer-events: none;',
            html: `<img src="${cardUrl}" alt="Silja Symphonade cabin key card, Helsinki to Stockholm, room ${cabin.id}, deck 8" style="display:block;width:100%;height:auto;visibility:hidden;transform-origin:center" />`,
            onCreate: container => { this.image = container.querySelector('img'); },
        });
    }

    collect(clerkPosition: THREE.Vector3, camera: THREE.Camera): void {
        if (this.collected || !this.image) return;
        this.collected = true;
        const image = this.image;
        image.style.visibility = 'visible';
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const target = image.getBoundingClientRect();
        const projected = clerkPosition.clone().project(camera);
        const canvas = document.querySelector('canvas');
        const viewport = canvas?.getBoundingClientRect();
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        const left = viewport?.left ?? 0;
        const top = viewport?.top ?? 0;
        const visible = projected.z >= -1 && projected.z <= 1;
        const sourceX = left + (visible ? (projected.x + 1) / 2 : 0.5) * width;
        const sourceY = top + (visible ? (1 - projected.y) / 2 : 0.5) * height;
        const dx = sourceX - (target.left + target.width / 2);
        const dy = sourceY - (target.top + target.height / 2);
        const peekX = left + width * 0.5 - (target.left + target.width / 2);
        const peekY = top + height * 0.58 - (target.top + target.height / 2);
        this.animation = image.animate([
            { transform: `translate(${dx}px, ${dy}px) scale(0.18) rotate(-12deg)`, opacity: 0, offset: 0 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.24) rotate(-12deg)`, opacity: 1, offset: 0.12 },
            { transform: `translate(${peekX}px, ${peekY}px) scale(1.1) rotate(3deg)`, opacity: 1, offset: 0.44 },
            { transform: `translate(${peekX}px, ${peekY}px) scale(1.1) rotate(3deg)`, opacity: 1, offset: 0.65 },
            { transform: 'translate(0, 0) scale(1.06) rotate(-2deg)', opacity: 1, offset: 0.91 },
            { transform: 'translate(0, 0) scale(1) rotate(0)', opacity: 1, offset: 1 },
        ], { duration: 1900, easing: 'ease-in-out' });
        this.animation.onfinish = () => { this.animation = null; };
    }

    get busy(): boolean { return this.animation !== null; }

    /** Driven by gameplay time so the check pauses with the game. Re-project on
     * every frame: looking around never leaves the card floating off the reader. */
    moveToReader(position: THREE.Vector3, camera: THREE.Camera, progress: number): void {
        if (!this.image) return;
        const container = this.image.parentElement!.getBoundingClientRect();
        const projected = position.clone().project(camera);
        const viewport = document.querySelector('canvas')?.getBoundingClientRect();
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        // Keep the small card at the viewport edge if the player turns away
        // or stands so close that the reader is just outside their view.
        const margin = Math.max(24, container.width * 0.1);
        const screenX = THREE.MathUtils.clamp((projected.x + 1) * width / 2, margin, width - margin);
        const screenY = THREE.MathUtils.clamp((1 - projected.y) * height / 2, margin, height - margin);
        const dx = (viewport?.left ?? 0) + screenX - container.left - container.width / 2;
        const dy = (viewport?.top ?? 0) + screenY - container.top - container.height / 2;
        const t = Math.max(0, Math.min(1, progress));
        const eased = t * t * (3 - 2 * t);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const travel = reduced ? (t < 0.5 ? 0 : 1) : eased;
        this.image.style.transform = `translate(${dx * travel}px, ${dy * travel}px) scale(${1 - 0.86 * travel}) rotate(${travel * -8}deg)`;
        this.image.style.visibility = 'visible';
    }

    returnToInventory(): void {
        if (!this.image) return;
        this.image.style.transform = '';
        this.image.style.visibility = this.collected ? 'visible' : 'hidden';
    }

    dispose(): void {
        this.animation?.cancel();
        this.hud.removeElement('cabin-key-card');
        this.image = null;
    }
}
