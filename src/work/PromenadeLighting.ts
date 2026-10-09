import * as THREE from 'three';
import shipLevel from './serenade.mesh-level.json';

// Reserved for the static ship's cached promenade-light shadow maps.
const PROMENADE_SHADOW_LAYER = 29;

/** Continuous voyage minutes avoid a lighting jump when the ship clock goes back. */
export function promenadeEvening(shipMinutes: number): number {
    // Fade in 19:00–22:00 Finnish; fade out 05:30–07:30 Swedish.
    return THREE.MathUtils.smoothstep(shipMinutes, 120, 300)
        * (1 - THREE.MathUtils.smoothstep(shipMinutes, 810, 930));
}

/** Reuses the atrium lamps and adds local wall washes to the existing architecture. */
export class PromenadeLighting {
    private readonly lamps: { light: THREE.PointLight; color: THREE.Color; intensity: number }[] = [];
    private readonly washes: THREE.PointLight[] = [];
    private readonly materials: { material: THREE.MeshStandardMaterial; color: THREE.Color;
        emissive: THREE.Color; intensity: number; target: THREE.Color }[] = [];
    private readonly violet = new THREE.Color(0xb53dff);
    private applied = -1;
    private readonly shadowCasters: THREE.Mesh[] = [];

    constructor(scene: THREE.Scene, ship: THREE.Object3D) {
        for (const spec of shipLevel.lights.filter(light => light.name.startsWith('Atrium light'))) {
            const light = new THREE.PointLight(spec.color, spec.intensity, spec.distance, spec.decay);
            light.name = spec.name;
            light.position.set(...spec.position as [number, number, number]);
            scene.add(light);
            this.lamps.push({ light, color: light.color.clone(), intensity: light.intensity });
        }
        const seen = new Set<THREE.Material>();
        ship.traverse(object => {
            if (object instanceof THREE.Mesh && object.castShadow && !object.layers.isEnabled(PROMENADE_SHADOW_LAYER)) {
                object.layers.enable(PROMENADE_SHADOW_LAYER);
                this.shadowCasters.push(object);
            }
            // Only the base's promenade bay surrounds and chandelier crystals.
            if (!(object instanceof THREE.Mesh) || !['base_bay_cream', 'base_emissive_crystal'].includes(object.name)) return;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (!(material instanceof THREE.MeshStandardMaterial) || seen.has(material)) continue;
                seen.add(material);
                this.materials.push({ material, color: material.color.clone(), emissive: material.emissive.clone(),
                    intensity: material.emissiveIntensity,
                    target: new THREE.Color(object.name === 'base_bay_cream' ? 0xd47aff : 0xffdb78) });
            }
        });
        for (const z of [-16, 4, 26]) for (const side of [-1, 1]) {
            const light = new THREE.PointLight(side < 0 ? 0x39bfff : 0xef46dc, 0, 16, 2);
            light.name = `Promenade ${side < 0 ? 'cyan' : 'magenta'} wash ${z}`;
            light.position.set(side * 4.8, 4.4, z);
            scene.add(light);
            this.washes.push(light);
        }
        // Point lights otherwise illuminate through the cabin bulkheads. Cache
        // the static ship's occlusion once; time-of-day changes only uniforms.
        for (const light of [...this.washes, ...this.lamps.map(entry => entry.light)]) {
            light.castShadow = true;
            light.shadow.mapSize.set(512, 512);
            light.shadow.bias = -.0001;
            light.shadow.normalBias = .02;
            light.shadow.camera.layers.set(PROMENADE_SHADOW_LAYER);
            light.shadow.autoUpdate = false;
            light.shadow.needsUpdate = true;
        }
        this.update(0);
    }

    update(shipMinutes: number): void {
        const evening = promenadeEvening(shipMinutes);
        if (evening === this.applied) return;
        for (const { light, color, intensity } of this.lamps) {
            light.color.copy(color).lerp(this.violet, evening);
            light.intensity = THREE.MathUtils.lerp(intensity, 65, evening);
        }
        for (const light of this.washes) light.intensity = 55 * evening;
        for (const { material, color, emissive, intensity, target } of this.materials) {
            material.color.copy(color).lerp(target, evening * .65);
            material.emissive.copy(emissive).lerp(target, evening);
            material.emissiveIntensity = THREE.MathUtils.lerp(intensity, material.name === 'bay_cream' ? .2 : 2, evening);
        }
        this.applied = evening;
    }

    dispose(): void {
        this.update(0);
        for (const mesh of this.shadowCasters) mesh.layers.disable(PROMENADE_SHADOW_LAYER);
        for (const light of [...this.washes, ...this.lamps.map(entry => entry.light)]) { light.removeFromParent(); light.dispose(); }
    }
}
