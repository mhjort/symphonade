import * as THREE from 'three';
// The published bundle maps 'three' to its WebGPU build, which has no WebGLRenderer.
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import type { PlayerLoader } from 'engine/loaders/PlayerLoader.js';
import type { PointerLockManager } from 'engine/PointerLockManager.js';
import { TRAVELERS, type Traveler } from './Travelers.js';

export interface TravelerAvatar {
    loader: PlayerLoader;
    root: THREE.Object3D;
    url: string;
}

/** Owns preview resources until boarding transfers the chosen avatar to the game. */
export function disposeTravelerAvatar(avatar: TravelerAvatar): void {
    avatar.loader.dispose();
    avatar.root.removeFromParent();
    const textures = new Set<THREE.Texture>();
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    avatar.root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
        if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
    });
    textures.forEach(texture => texture.dispose());
    materials.forEach(material => material.dispose());
    geometries.forEach(geometry => geometry.dispose());
}

export class TravelerSelection {
    private readonly dialog = document.createElement('dialog');
    private readonly style = document.createElement('style');
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.PerspectiveCamera(34, 1, .01, 30);
    private renderer: WebGLRenderer | null = null;
    private avatar: TravelerAvatar | null = null;
    private selected = TRAVELERS[0]!;
    private revision = 0;
    private frame = 0;
    private previousTime = 0;
    private previewWidth = 0;
    private previewHeight = 0;
    private disposed = false;
    private boarding = false;
    private opened = false;
    private previousFreeMouse = false;
    private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    private readonly state = getGameStateManager();
    private readonly stateChanged = (state: GameState): void => {
        if (state !== GameState.PLAYING || this.disposed) return;
        // A resume/visibility event must not bypass the unconfirmed choice.
        this.state.setPaused(true, 'interactive-ui');
        if (!this.opened) this.open();
    };

    constructor(private readonly loadAvatar: (traveler: Traveler) => Promise<TravelerAvatar>,
        private readonly board: (traveler: Traveler, avatar: TravelerAvatar) => void,
        private readonly pointerLock: () => PointerLockManager | null,
        private readonly startGame: () => void) {
        this.style.textContent = `
            .traveler-selection { box-sizing:border-box; width:min(980px,96vw); max-height:94dvh;
                margin:auto; padding:clamp(16px,3vw,32px); border:0; border-radius:var(--hud-radius-card);
                background:var(--hud-color-background); color:var(--hud-color-text);
                font-family:var(--hud-font-family); overflow:hidden; }
            .traveler-selection[open] { display:flex; flex-direction:column; }
            .traveler-selection > h1,.traveler-selection > p,.traveler-selection > .traveler-modes { flex-shrink:0; }
            .traveler-selection::backdrop { background:color-mix(in srgb,var(--hud-color-background) 88%,transparent); }
            .traveler-selection h1 { font-size:clamp(24px,4vw,36px); margin:0 0 6px; }
            .traveler-selection p { line-height:1.45; }
            .traveler-selection .traveler-intro { margin:0 0 20px; color:var(--hud-color-text-muted); }
            .traveler-layout { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.1fr); gap:28px;
                min-height:0; overflow:auto; overscroll-behavior:contain; }
            .traveler-list { display:grid; grid-template-columns:1fr 1fr; gap:10px; align-content:start; }
            .traveler-selection button { min-height:52px; padding:12px; cursor:pointer; font:inherit;
                border:2px solid transparent; border-radius:var(--hud-radius-card);
                background:var(--hud-color-surface); color:var(--hud-color-on-surface); }
            .traveler-selection button:focus-visible { outline:3px solid var(--hud-color-primary); outline-offset:3px; }
            .traveler-selection button[aria-pressed=true] { border-color:var(--hud-color-primary); }
            .traveler-selection button:disabled { opacity:.55; cursor:wait; }
            .traveler-choice { text-align:left; }
            .traveler-choice strong,.traveler-choice span { display:block; }
            .traveler-choice span { font-size:13px; margin-top:5px; }
            .traveler-preview { height:clamp(140px,calc(100dvh - 390px),310px); border-radius:var(--hud-radius-card); overflow:hidden;
                background:var(--hud-color-surface); }
            .traveler-preview canvas { display:block; width:100%; height:100%; }
            .traveler-details h2 { margin:14px 0 0; font-size:24px; }
            .traveler-details p { margin:8px 0; }
            .traveler-stats { display:flex; gap:12px; margin:14px 0; }
            .traveler-stats span { background:var(--hud-color-surface); color:var(--hud-color-on-surface);
                padding:10px 14px; border-radius:var(--hud-radius-card); font-weight:var(--hud-font-weight-heading); }
            .traveler-modes { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
            .traveler-selection .traveler-board { width:100%; background:var(--hud-color-primary); color:var(--hud-color-on-primary); }
            /* Board solo carries .hud-play-button so tools that press the game's Play button
               (bitmagic verify) board through this screen; keep the engine's Play styling off it. */
            .traveler-selection .traveler-board.hud-play-button { font:inherit; text-transform:none; letter-spacing:normal;
                border:2px solid transparent; border-radius:var(--hud-radius-card); padding:12px; box-shadow:none;
                background-image:none; -webkit-text-stroke:0; transform:none; filter:none; transition:none; }
            .traveler-selection .traveler-board.hud-play-button:disabled { opacity:.55; cursor:wait; }
            .traveler-selection .traveler-multiplayer { width:100%; opacity:.8; cursor:default; }
            .traveler-soon { display:inline-block; margin-left:6px; padding:2px 8px; border-radius:999px; font-size:12px;
                background:var(--hud-color-primary); color:var(--hud-color-on-primary); vertical-align:middle; }
            .traveler-status { min-height:22px; font-size:14px; }
            .traveler-note { font-size:13px; color:var(--hud-color-text-muted); }
            @media(min-width:601px) and (max-height:700px) {
                .traveler-selection { padding:16px; }
                .traveler-selection h1 { font-size:26px; }
                .traveler-selection .traveler-intro { margin-bottom:12px; }
                .traveler-layout { gap:18px; }
                .traveler-selection button { padding:8px; }
                .traveler-details h2 { margin-top:8px; font-size:20px; }
                .traveler-details p { margin:6px 0; font-size:14px; }
                .traveler-stats { margin:8px 0; }
                .traveler-stats span { padding:6px 10px; }
            }
            @media(max-width:600px) {
                .traveler-selection { padding:14px; }
                .traveler-selection h1 { font-size:24px; }
                .traveler-layout { grid-template-columns:1fr; gap:10px; }
                .traveler-list { grid-template-columns:repeat(3,1fr); gap:6px; }
                .traveler-selection button { padding:7px; min-height:60px; font-size:14px; }
                .traveler-choice span { font-size:11px; }
                .traveler-preview { height:clamp(140px,25dvh,190px); }
                .traveler-details h2 { margin-top:8px; font-size:18px; }
                .traveler-details p { font-size:13px; margin:5px 0; }
                .traveler-stats { margin:8px 0; font-size:14px; }
                .traveler-stats span { padding:8px 12px; }
                .traveler-selection .traveler-intro { margin-bottom:10px; font-size:13px; }
                .traveler-note { display:none; }
            }`;
        document.head.append(this.style);
        this.dialog.className = 'traveler-selection';
        this.dialog.setAttribute('aria-labelledby', 'traveler-title');
        this.dialog.innerHTML = `<h1 id="traveler-title">Choose your traveler</h1>
            <p class="traveler-intro">Six ways to start your voyage. Who are you?</p>
            <div class="traveler-layout"><div><div class="traveler-list" role="group" aria-label="Travelers"></div>
            <p class="traveler-note">Your traveler stays with you for this voyage.</p></div>
            <div class="traveler-details"><div class="traveler-preview" role="img" aria-label="Full-body traveler preview"></div>
            <h2></h2><p class="traveler-description"></p><div class="traveler-stats"></div>
            <p class="traveler-status" role="status" aria-live="polite"></p>
            <button class="traveler-retry" hidden>Retry preview</button></div></div>
            <div class="traveler-modes"><button class="traveler-board hud-play-button" disabled>Board solo</button>
            <button class="traveler-multiplayer" aria-disabled="true">Multiplayer <span class="traveler-soon">Coming soon</span></button></div>`;
        for (const traveler of TRAVELERS) {
            const button = document.createElement('button');
            button.className = 'traveler-choice';
            button.dataset.traveler = traveler.id;
            button.innerHTML = `<strong>${traveler.name}</strong><span>${traveler.category}</span>`;
            button.setAttribute('aria-pressed', String(traveler === this.selected));
            button.onclick = () => { if (!this.boarding) void this.select(traveler); };
            this.element('.traveler-list').append(button);
        }
        this.element<HTMLButtonElement>('.traveler-board').onclick = () => this.confirm();
        // Advertised only: no networking yet, so it explains itself instead of starting anything.
        this.element<HTMLButtonElement>('.traveler-multiplayer').onclick = () => {
            this.element('.traveler-status').textContent = 'Multiplayer voyages are coming soon. Board solo for now.';
        };
        this.element<HTMLButtonElement>('.traveler-retry').onclick = () => void this.select(this.selected);
        this.dialog.addEventListener('cancel', event => event.preventDefault());
        // Dialog keyboard navigation must never become a gameplay action or pause hotkey.
        this.dialog.addEventListener('keydown', event => event.stopPropagation());
        this.dialog.addEventListener('keyup', event => event.stopPropagation());
        // First in the document, so `.hud-play-button` lookups find Board solo before the
        // engine's hidden Play button. A modal dialog renders on top wherever it sits.
        document.body.prepend(this.dialog);
        this.scene.add(new THREE.HemisphereLight(0xf2f7ff, 0x65717d, 2.5));
        const key = new THREE.DirectionalLight(0xffead8, 3);
        key.position.set(3, 4, 5); this.scene.add(key);
        this.camera.position.set(0, .95, 3.8);
        this.camera.lookAt(0, .9, 0);
        this.state.addListener(this.stateChanged);
    }

    private element<T extends HTMLElement = HTMLElement>(selector: string): T {
        return this.dialog.querySelector<T>(selector)!;
    }

    /** Open as the game's start screen, before gameplay begins. */
    show(): void {
        if (!this.opened && !this.disposed) this.open();
    }

    private open(): void {
        this.opened = true;
        this.previousFreeMouse = this.pointerLock()?.getFreeMouseMode() ?? false;
        this.pointerLock()?.setFreeMouseMode(true);
        this.pointerLock()?.cancelLockRequest();
        this.pointerLock()?.setInteractiveUIMode(true);
        document.exitPointerLock?.(); // Absent on iPhone Safari (no pointer lock).
        this.dialog.showModal();
        void this.select(this.selected);
        this.element<HTMLButtonElement>('.traveler-choice').focus();
        this.frame = requestAnimationFrame(this.render);
    }

    private async select(traveler: Traveler): Promise<void> {
        const revision = ++this.revision;
        this.selected = traveler;
        if (this.avatar) disposeTravelerAvatar(this.avatar);
        this.avatar = null;
        this.element('h2').textContent = `${traveler.name} · ${traveler.category}`;
        this.element('.traveler-description').textContent = traveler.description;
        this.element('.traveler-stats').innerHTML = `<span>${traveler.marks} mk</span><span>Energy ${traveler.energy}%</span>`;
        this.element('.traveler-preview').setAttribute('aria-label', `Full-body preview of ${traveler.name}, ${traveler.category.toLowerCase()}`);
        this.dialog.querySelectorAll<HTMLButtonElement>('.traveler-choice').forEach(button =>
            button.setAttribute('aria-pressed', String(button.dataset.traveler === traveler.id)));
        this.element<HTMLButtonElement>('.traveler-board').disabled = true;
        this.element('.traveler-retry').hidden = true;
        this.element('.traveler-status').textContent = 'Preparing your traveler…';
        try {
            if (!this.renderer) {
                this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
                this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
                this.renderer.setClearColor(0x000000, 0);
                this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
                this.element('.traveler-preview').append(this.renderer.domElement);
            }
            const avatar = await this.loadAvatar(traveler);
            if (this.disposed || revision !== this.revision) { disposeTravelerAvatar(avatar); return; }
            this.avatar = avatar;
            avatar.root.position.set(0, 0, 0);
            avatar.root.rotation.set(0, -.12, 0);
            this.scene.add(avatar.root);
            this.element<HTMLButtonElement>('.traveler-board').disabled = false;
            this.element('.traveler-status').textContent = 'Ready to board';
        } catch (error) {
            if (this.disposed || revision !== this.revision) return;
            this.element('.traveler-status').textContent = 'Could not prepare this traveler. Retry or choose someone else.';
            this.element('.traveler-retry').hidden = false;
            console.warn('Traveler preview unavailable:', error);
        }
    }

    private readonly render = (time: number): void => {
        if (this.disposed) return;
        const dt = Math.min(.05, this.previousTime ? (time - this.previousTime) / 1000 : 0);
        this.previousTime = time;
        if (this.avatar) {
            const animation = this.avatar.loader.getAnimationController();
            animation?.updateAnimation(false, 0, true, false);
            animation?.update(this.reducedMotion.matches ? 0 : dt);
            this.avatar.loader.updateBlockCharacter();
        }
        if (this.renderer) {
            const preview = this.element('.traveler-preview');
            const width = preview.clientWidth, height = preview.clientHeight;
            if (width !== this.previewWidth || height !== this.previewHeight) {
                this.previewWidth = width; this.previewHeight = height;
                this.renderer.setSize(width, height, false);
                this.camera.aspect = width / height;
                this.camera.updateProjectionMatrix();
            }
            this.renderer.render(this.scene, this.camera);
        }
        this.frame = requestAnimationFrame(this.render);
    };

    private confirm(): void {
        if (!this.avatar || this.boarding || this.disposed) return;
        this.boarding = true;
        this.element<HTMLButtonElement>('.traveler-board').disabled = true;
        try {
            this.board(this.selected, this.avatar);
            this.avatar = null; // Ownership transferred to VoxelGame.
            const playing = this.state.getCurrentState() === GameState.PLAYING;
            this.dispose();
            if (playing) {
                // Autostarted (verify, portal instant play): gameplay was already running.
                this.state.setPaused(false, 'interactive-ui');
                this.pointerLock()?.requestLockWithRetry();
            } else {
                // This screen is the start screen: boarding is the Play press.
                this.startGame();
            }
        } catch (error) {
            this.boarding = false;
            this.element<HTMLButtonElement>('.traveler-board').disabled = false;
            this.element('.traveler-status').textContent = 'Boarding failed. Please try again.';
            console.error('Traveler boarding failed:', error);
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        ++this.revision;
        this.state.removeListener(this.stateChanged);
        if (this.opened) {
            this.pointerLock()?.setFreeMouseMode(this.previousFreeMouse);
            this.pointerLock()?.setInteractiveUIMode(false);
        }
        cancelAnimationFrame(this.frame);
        if (this.avatar) disposeTravelerAvatar(this.avatar);
        this.avatar = null;
        this.renderer?.dispose();
        this.renderer?.forceContextLoss();
        this.renderer = null;
        this.dialog.close(); this.dialog.remove(); this.style.remove();
    }
}
