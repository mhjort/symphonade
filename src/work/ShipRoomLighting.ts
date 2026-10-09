import * as THREE from 'three';
import { promenadeEvening } from './PromenadeLighting.js';
import type { EngineLike, LightingConfig } from 'types/game.js';

/** One owner blends room ambience, avoiding competing global lighting writes. */
export class ShipRoomLighting {
    private readonly baseline: LightingConfig | null;
    private readonly hemispheres: { light: THREE.HemisphereLight; intensity: number; color: THREE.Color }[] = [];
    private readonly pubColor = new THREE.Color(0xffbd78);
    private readonly clubColor = new THREE.Color(0x6453c9);
    private pubBlend = 0;
    private clubBlend = 0;
    private appliedPub = -1;
    private appliedClub = -1;
    private promenadeBlend = 0;
    private appliedPromenade = -1;

    constructor(private readonly engine: EngineLike) {
        this.baseline = engine.getLightingConfig?.() ?? null;
        engine.scene?.traverse(object => {
            if (object instanceof THREE.HemisphereLight) this.hemispheres.push({
                light: object, intensity: object.intensity, color: object.color.clone(),
            });
        });
    }

    update(dt: number, position?: THREE.Vector3, shipMinutes = 0): void {
        if (!position) return;
        const clubEdge = Math.min(10 - Math.abs(position.x), position.z - 36, 60 - position.z);
        const clubTarget = position.y > -1 && position.y < 6.8
            ? THREE.MathUtils.smoothstep(clubEdge, -0.4, 1.2) : 0;
        const inPub = Math.abs(position.x) < 6.1 && position.z > -34.2
            && position.y > -0.5 && position.y < 3.7;
        const pubTarget = inPub ? THREE.MathUtils.smoothstep(-position.z - 24, -0.2, 1.2) : 0;
        const promenadeEdge = Math.min(6 - Math.abs(position.x), position.z + 24, 36 - position.z);
        const promenadeTarget = position.y > -1 && position.y < 20
            ? THREE.MathUtils.smoothstep(promenadeEdge, 0, 1.5) * promenadeEvening(shipMinutes) : 0;
        const step = Math.max(0, Math.min(dt, 0.1));
        this.promenadeBlend = THREE.MathUtils.damp(this.promenadeBlend, promenadeTarget, 3, step);
        if (Math.abs(this.promenadeBlend - promenadeTarget) < .001) this.promenadeBlend = promenadeTarget;
        this.pubBlend = THREE.MathUtils.damp(this.pubBlend, pubTarget, 3, step);
        this.clubBlend = THREE.MathUtils.damp(this.clubBlend, clubTarget, 3, step);
        // Snap the settled state so exiting restores the exact original configuration.
        if (Math.abs(this.pubBlend - pubTarget) < 0.001) this.pubBlend = pubTarget;
        if (Math.abs(this.clubBlend - clubTarget) < 0.001) this.clubBlend = clubTarget;
        if (this.pubBlend === this.appliedPub && this.clubBlend === this.appliedClub && this.promenadeBlend === this.appliedPromenade) return;
        const base = this.baseline ?? {};
        const p = this.pubBlend, c = this.clubBlend, e = this.promenadeBlend;
        const evening = (day: number, night: number) => THREE.MathUtils.lerp(day, night, e);
        const mix = (normal: number, pub: number, club: number) => normal + (pub - normal) * p + (club - normal) * c;
        this.engine.applyLightingConfig?.(p === 0 && c === 0 && e === 0 ? this.baseline : { ...base,
            ambientFloor: mix(evening(base.ambientFloor ?? 0.8, .22), 0.26, 0.07),
            environmentIntensity: mix(evening(base.environmentIntensity ?? 0.22, .06), 0.045, 0.035),
            sunIntensity: mix(evening(base.sunIntensity ?? 0.08, .012), 0.012, 0.012),
        });
        for (const { light, intensity, color } of this.hemispheres) {
            light.intensity = mix(evening(intensity, .3), 0.38, 0.12);
            light.color.copy(color).lerp(this.pubColor, p).lerp(this.clubColor, c);
        }
        this.appliedPub = p;
        this.appliedClub = c;
        this.appliedPromenade = e;
    }

    dispose(): void {
        this.engine.applyLightingConfig?.(this.baseline);
        for (const { light, intensity, color } of this.hemispheres) {
            light.intensity = intensity;
            light.color.copy(color);
        }
    }
}
