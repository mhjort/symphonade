import * as THREE from 'three';
import type { GameHUD } from './GameHUD.js';

/** One celebration per objective, with a short camera-relative confetti burst. */
export class QuestCelebration {
    private readonly completed = new Set<string>();
    private readonly root = new THREE.Group();
    private readonly geometry = new THREE.PlaneGeometry(.025, .055);
    private readonly materials = [0xe7bc64, 0x287eaf, 0xfff3cf].map(color =>
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true }));
    private readonly pieces: THREE.Mesh[] = [];
    private time = 4;

    constructor(private readonly hud: GameHUD, scene: THREE.Scene,
        private readonly reducedMotion: MediaQueryList) {
        for (let i = 0; i < 48; i++) {
            const piece = new THREE.Mesh(this.geometry, this.materials[i % 3]);
            piece.renderOrder = 1000;
            this.pieces.push(piece); this.root.add(piece);
        }
        this.root.visible = false;
        scene.add(this.root);
    }

    has(id: string): boolean { return this.completed.has(id); }
    get count(): number { return this.completed.size; }

    complete(id: string, title: string, detail: string): void {
        if (this.completed.has(id)) return;
        this.completed.add(id);
        this.hud.showToast(`🏆 Quest complete! ${title} · ${detail}`, {
            variant: 'success', anchor: 'middle-center', duration: 6000,
        });
        this.time = 0;
    }

    update(dt: number, camera: THREE.Camera): void {
        this.time += Math.max(0, dt);
        this.root.visible = this.time < 2.8 && !this.reducedMotion.matches;
        if (!this.root.visible) return;
        this.root.position.copy(camera.position);
        this.root.quaternion.copy(camera.quaternion);
        const t = this.time;
        for (const [i, piece] of this.pieces.entries()) {
            const side = i % 2 ? 1 : -1;
            const spread = (i * .61803398875) % 1;
            const lift = (i * .38196601125 + .27) % 1;
            piece.position.set(side * (.18 + spread * .55 + t * (.12 + spread * .12)),
                -.55 + lift * .3 + (1.1 + lift * .9) * t - .7 * t * t, -2 - spread * .25);
            piece.rotation.set(t * (2 + spread), t * 3 + i, t * side * 4 + i);
        }
        for (const material of this.materials) material.opacity = Math.min(1, (2.8 - t) / .6);
    }

    dispose(): void {
        this.root.removeFromParent();
        this.geometry.dispose();
        for (const material of this.materials) material.dispose();
    }
}
