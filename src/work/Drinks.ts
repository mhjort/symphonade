import * as THREE from 'three';
import type { HandPose } from './FirstPersonHand.js';

// Shared by every drink until one gets its own recording.
const SIP_SOUND = '3f59f1c7-693c-43b9-bea1-a6ad364f92db';
const AAH_SOUND = 'bf1c6b37-2c1a-4a8e-9ef3-6b718ade5234';

/** Builds a vessel's meshes; HeldDrink owns and disposes what these create. */
export interface VesselKit {
    material(color: number, roughness?: number): THREE.MeshStandardMaterial;
    mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh;
}

export interface Vessel {
    readonly liquid: THREE.Mesh;
    readonly foam?: THREE.Mesh;
    /** Show 0 (empty) to 1 (full). */
    setFill(amount: number): void;
}

/** Everything that differs between drinks; HeldDrink supplies the shared behaviour. */
export interface DrinkSpec {
    /** As in "Drinking coffee…". */
    readonly name: string;
    /** As in "Player coffee mug" and "Empty coffee mug". */
    readonly vesselName: string;
    /** Base to rim, in metres — where the lips meet it. Props are drawn about 1.7x life size. */
    readonly height: number;
    /** Seconds it steams after being served; 0 for cold drinks. */
    readonly hotSeconds: number;
    /** Only drunk with a table to set it down on. */
    readonly needsTable: boolean;
    readonly drinkHint: string;
    /** Where the right wrist sits in the vessel's frame, and how the hand closes around it. */
    readonly grip: { readonly position: readonly [number, number, number]; readonly pose: HandPose };
    readonly sounds: { readonly sip: string; readonly exhale: string };
    buildVessel(kit: VesselKit): Vessel;
}

export const COFFEE: DrinkSpec = {
    name: 'coffee', vesselName: 'coffee mug', height: .19, hotSeconds: 15, needsTable: false,
    drinkHint: 'Drink coffee · +10% energy',
    // Fingers hooked through the handle, thumb resting on top.
    grip: { position: [.190, .102, .155], pose: { curl: 1.15, thumb: .9, spread: 0, wrist: .1, deviation: .55 } },
    sounds: { sip: SIP_SOUND, exhale: AAH_SOUND },
    buildVessel({ material, mesh }) {
        const ceramic = material(0xf6f0e4, .22);
        const profile = [[0,0],[.066,0],[.078,.012],[.086,.17],[.083,.188],[.073,.188],[.073,.172],[.065,.02],[0,.02]];
        mesh(new THREE.LatheGeometry(profile.map(([x,y]) => new THREE.Vector2(x,y)), 24), ceramic);
        const liquid = mesh(new THREE.CircleGeometry(.073,24), material(0x361b0c, .18));
        liquid.rotation.x = -Math.PI / 2;
        // Only the outer arc: a full ring would poke through the cup's inner wall.
        const handle = mesh(new THREE.TorusGeometry(.055,.012,8,20,Math.PI+.6), ceramic);
        handle.position.set(.096,.10,0); handle.rotation.z = -Math.PI/2-.3;
        const band = mesh(new THREE.CylinderGeometry(.087,.086,.018,24,1,true), material(0x254963));
        band.position.y = .139;
        return {
            liquid,
            setFill(amount) {
                liquid.visible = amount > 0;
                liquid.position.y = THREE.MathUtils.lerp(.025,.165,amount);
            },
        };
    },
};

export const BEER: DrinkSpec = {
    name: 'beer', vesselName: 'beer glass', height: .28, hotSeconds: 0, needsTable: true,
    drinkHint: 'Drink beer',
    // Palm against the glass, fingers wrapped behind it, thumb across the front.
    grip: { position: [.112, .12, .15], pose: { curl: .45, thumb: 1.1, spread: 0, wrist: .1, deviation: .55 } },
    sounds: { sip: SIP_SOUND, exhale: AAH_SOUND },
    buildVessel({ material, mesh }) {
        const glass = material(0xe6f5f1, .12);
        glass.transparent = true; glass.opacity = .23; glass.depthWrite = false;
        const profile = [[0,0],[.066,0],[.069,.02],[.096,.28],[.089,.28],[.063,.025],[0,.025]];
        mesh(new THREE.LatheGeometry(profile.map(([x,y]) => new THREE.Vector2(x,y)), 24), glass);
        const liquid = mesh(new THREE.CylinderGeometry(.086,.060,1,24), material(0xe9a423,.22));
        const foam = mesh(new THREE.CylinderGeometry(.087,.086,.018,24), material(0xffefcf,.88));
        return {
            liquid, foam,
            setFill(amount) {
                liquid.visible = amount > 0;
                const height = Math.max(.001, .225 * amount);
                const radius = .063 + .026 * height / .255;
                liquid.scale.set(radius / .086, height, radius / .086);
                liquid.position.y = .022 + height / 2;
                foam.visible = amount > .04;
                foam.scale.set(radius / .087, 1, radius / .087);
                foam.position.y = .022 + height;
            },
        };
    },
};
