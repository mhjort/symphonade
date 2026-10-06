import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';

/** Stage-fixture spotlights plus lightweight haze cones, compatible with WebGPU. */
export class StarlightLighting {
    private readonly rig = new THREE.Group();
    private readonly beams: { spot: THREE.SpotLight; cone: THREE.Mesh; pool: THREE.Mesh; index: number }[] = [];
    private readonly geometry = new THREE.CylinderGeometry(0.045, 1, 1, 32, 12, true);
    private readonly lensGeometry = new THREE.SphereGeometry(0.075, 12, 8);
    private readonly poolGeometry = new THREE.PlaneGeometry(2, 2);
    private readonly materials: THREE.Material[] = [];
    private readonly poolTexture: THREE.CanvasTexture;
    private readonly up = new THREE.Vector3(0, 1, 0);
    private readonly direction = new THREE.Vector3();
    private time = 0;

    constructor(private readonly engine: EngineLike) {
        if (!engine.scene) throw new Error('Stage lighting requires the scene');
        this.rig.name = 'Starlight disco lighting';
        const colors = [0x6747ff, 0xff38bd, 0x3870ff, 0xd950ff, 0xff3298];
        const vertices = this.geometry.getAttribute('position');
        const rgba = new Float32Array(vertices.count * 4);
        for (let i = 0; i < vertices.count; i++) {
            const t = 0.5 - vertices.getY(i);
            rgba.set([1, 1, 1, Math.pow(1 - t, 0.7) * 0.9 + 0.03], i * 4);
        }
        this.geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
        const context = canvas.getContext('2d')!;
        const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
        gradient.addColorStop(0.45, 'rgba(255,255,255,0.65)');
        gradient.addColorStop(0.8, 'rgba(255,255,255,0.12)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
        this.poolTexture = new THREE.CanvasTexture(canvas);
        for (let i = 0; i < 5; i++) {
            // Existing light lenses on the stage truss: x=-4,-2,0,2,4.
            const spot = new THREE.SpotLight(colors[i], 380, 18, 0.15, 0.7, 2);
            spot.name = `Starlight spotlight ${i + 1}`;
            spot.position.set(-4 + i * 2, 4.64, 54.78);
            spot.castShadow = false;
            if (i === 0 || i === 4) spot.angle = 0.35;
            const lensMaterial = new THREE.MeshBasicMaterial({ color: colors[i], toneMapped: false });
            const lens = new THREE.Mesh(this.lensGeometry, lensMaterial);
            lens.position.copy(spot.position); lens.position.z -= 0.04;
            this.materials.push(lensMaterial);
            this.rig.add(lens);
            const coneMaterial = new THREE.MeshBasicMaterial({ color: colors[i], transparent: true,
                opacity: 0.025, vertexColors: true, blending: THREE.AdditiveBlending,
                depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
            const cone = new THREE.Mesh(this.geometry, coneMaterial);
            cone.name = `Starlight haze beam ${i + 1}`;
            cone.renderOrder = 3;
            const poolMaterial = new THREE.MeshBasicMaterial({ color: colors[i], map: this.poolTexture,
                transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending,
                depthWrite: false, toneMapped: false });
            const pool = new THREE.Mesh(this.poolGeometry, poolMaterial);
            pool.name = `Starlight dancefloor spot ${i + 1}`;
            pool.rotation.x = -Math.PI / 2;
            this.materials.push(coneMaterial, poolMaterial);
            this.rig.add(spot, spot.target, cone, pool);
            this.beams.push({ spot, cone, pool, index: i });
        }
        engine.scene.add(this.rig);
        this.update(0);
    }

    update(dt: number): void {
        // Slow overlapping sweeps; no strobes or flashes.
        this.time += Math.min(Math.max(dt, 0), 0.1);
        for (const { spot, cone, pool, index } of this.beams) {
            const phase = this.time * 0.28 + index * 1.7;
            const stageWash = index === 0 || index === 4;
            const x = stageWash ? (index === 0 ? -2.6 : 2.6) : Math.sin(phase) * 3.1;
            const z = stageWash ? 57.2 : 47.5 + Math.cos(phase * 0.7 + index) * 3.2;
            spot.target.position.set(x, stageWash ? 0.57 : 0.055, z);
            this.direction.subVectors(spot.position, spot.target.position);
            const length = this.direction.length();
            const radius = Math.tan(spot.angle) * length;
            cone.position.copy(spot.position).add(spot.target.position).multiplyScalar(0.5);
            cone.quaternion.setFromUnitVectors(this.up, this.direction.normalize());
            cone.scale.set(radius, length, radius);
            pool.position.copy(spot.target.position);
            pool.scale.set(radius, radius * 1.3, 1);
        }
    }

    dispose(): void {
        this.rig.removeFromParent();
        for (const { spot } of this.beams) spot.dispose();
        this.geometry.dispose(); this.lensGeometry.dispose(); this.poolGeometry.dispose(); this.poolTexture.dispose();
        for (const material of this.materials) material.dispose();
    }
}
