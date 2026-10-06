/**
 * Game Exchange ads in the game's own world: a poster and a TV on a wall,
 * refreshed before the ads expire, opened by the game's own click handling.
 *
 * Referenced from agent docs (read-docs name: `samples/game-exchange-wall-ads`).
 * Compiled against the live engine by game's `pnpm run check`
 * (tsconfig.docs-samples.json) — an engine API change breaks this file loudly.
 */
import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import type { GameExchangeVideoTexture, GameExchangeWorldAd } from 'engine/exchange/GameExchangeTypes.js';

type Screen = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

export class HallAds {
    private readonly poster: Screen;
    private readonly tv: Screen;
    /** Which ad each mesh shows: the click handler opens it. */
    private readonly adsByMesh = new Map<THREE.Object3D, GameExchangeWorldAd>();
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointer = new THREE.Vector2();
    private clip: GameExchangeVideoTexture | null = null;
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    /** Set by dispose(): a refresh still in flight hangs nothing and asks for nothing more. */
    private disposed = false;

    constructor(private readonly engine: EngineLike, scene: THREE.Scene) {
        // The game's own art stays up until an ad arrives, and wherever the exchange is off.
        this.poster = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ color: 0x334455 }));
        this.poster.position.set(-2, 2, -5);
        this.tv = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        this.tv.position.set(2, 2, -5);
        scene.add(this.poster, this.tv);
        this.engine.renderer?.domElement.addEventListener('pointerdown', this.onPointerDown);
    }

    /**
     * Ask for two ads and hang them: one still, one clip. Call again before they expire.
     * dispose() may run during any await here: after each one, a disposed HallAds
     * releases what that await brought and stops.
     */
    async refresh(): Promise<void> {
        const exchange = this.engine.gameExchange;
        if (!exchange || this.disposed) return;
        const [posterAd, tvAd] = await exchange.getAds({ count: 2 });
        if (this.disposed) return;
        if (posterAd) {
            // Rejects when the picture cannot load: the poster keeps the game's own art.
            const texture = await exchange.loadImageTexture(posterAd).catch(() => null);
            if (this.disposed) {
                texture?.dispose();
                return;
            }
            if (texture) {
                this.show(this.poster, texture);
                this.adsByMesh.set(this.poster, posterAd);
            }
        }
        if (tvAd) {
            const clip = exchange.createVideoTexture(tvAd);
            // No clip here (or one that cannot play): the still instead.
            const playing = clip ? await clip.play().then(() => true, () => false) : false;
            if (this.disposed) {
                clip?.dispose();
                return;
            }
            const still = playing ? null : await exchange.loadImageTexture(tvAd).catch(() => null);
            if (this.disposed) {
                clip?.dispose();
                still?.dispose();
                return;
            }
            if (!playing) clip?.dispose();
            const texture = playing && clip ? clip.texture : still;
            if (texture) {
                this.show(this.tv, texture);
                // The previous clip is off the screen now.
                this.clip?.dispose();
                this.clip = playing ? clip : null;
                this.adsByMesh.set(this.tv, tvAd);
            }
        }
        const ads = [posterAd, tvAd].filter((ad): ad is GameExchangeWorldAd => ad !== undefined);
        if (ads.length === 0) {
            // Nothing came this time: try again later, while the exchange runs here at all.
            if (exchange.isAvailable()) this.scheduleRefresh(10 * 60_000);
            return;
        }
        // Fetch new ones a minute before the first of these expires (and at least every six hours).
        const wait = Math.min(...ads.map((ad) => ad.expiresAt)) - Date.now() - 60_000;
        this.scheduleRefresh(Math.min(6 * 3_600_000, Math.max(60_000, wait)));
    }

    /** The next refresh replaces any other; a disposed HallAds schedules none. */
    private scheduleRefresh(delayMs: number): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = this.disposed ? null : setTimeout(() => void this.refresh(), delayMs);
    }

    private show(mesh: Screen, texture: THREE.Texture): void {
        const old = mesh.material.map;
        mesh.material.map = texture;
        mesh.material.color.set(0xffffff);
        mesh.material.needsUpdate = true;
        // A clip's texture belongs to its handle, which disposes it.
        if (old && !(old instanceof THREE.VideoTexture)) old.dispose();
    }

    /** The game's own click: a raycast from the pointer. A first-person game would cast from the crosshair. */
    private readonly onPointerDown = (event: PointerEvent): void => {
        const camera = this.engine.camera;
        const canvas = this.engine.renderer?.domElement;
        if (!camera || !canvas) return;
        const rect = canvas.getBoundingClientRect();
        this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, camera);
        const [hit] = this.raycaster.intersectObjects([...this.adsByMesh.keys()], false);
        if (hit) this.adsByMesh.get(hit.object)?.open();
    };

    /** Take everything down. Safe while a refresh is in flight: it hangs nothing after this. */
    dispose(): void {
        this.disposed = true;
        this.engine.renderer?.domElement.removeEventListener('pointerdown', this.onPointerDown);
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
        this.clip?.dispose();
        this.clip = null;
        for (const mesh of [this.poster, this.tv]) {
            const map = mesh.material.map;
            if (map && !(map instanceof THREE.VideoTexture)) map.dispose();
        }
        this.adsByMesh.clear();
    }
}
