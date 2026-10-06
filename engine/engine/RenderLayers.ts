/**
 * RenderLayers — what each THREE.Layers bit means in the engine's main scene.
 *
 * A camera draws an object only when their layer masks share a bit, and a
 * Raycaster hits it only on the same test. The bits used to be bare numbers kept
 * in step by comments; name them here instead.
 *
 * The main camera enables {@link SCENE_CAMERA_LAYERS}. Anything else that draws
 * the scene the way the player sees it (a screenshot camera, the top-down
 * orthographic view) copies the main camera's mask rather than restating it.
 * The view-model layer is a separate scene and enables every bit.
 */

import type * as THREE from 'three';

export const RenderLayers = {
    /** Everything by default. */
    DEFAULT: 0,
    /**
     * Block characters (CharacterLoader), glowing effects and projectiles. Drawn
     * by the main camera, cast shadows (the shadow camera enables it), and hit by
     * the melee and selection raycasters. The projectile `bloomLayer` option puts
     * a mesh here; no post-FX pass reads layers, so it has no bloom of its own.
     */
    CHARACTERS_AND_EFFECTS: 1,
    /** Weapon meshes that are seen but never hit by gameplay raycasts. */
    VISUAL_ONLY: 2,
    /** Excluded from editor picking (EditorManager's raycaster disables it). */
    EDITOR_UNPICKABLE: 3,
    /**
     * Seen ONLY by the directional light's shadow camera: the instances an
     * environment type has off-screen, kept so their shadows still fall into
     * view (EnvironmentObjectSystem). No colour camera enables it.
     */
    SHADOW_ONLY: 4,
} as const;

/** The layers the main colour camera draws. */
export const SCENE_CAMERA_LAYERS: readonly number[] = [
    RenderLayers.DEFAULT,
    RenderLayers.CHARACTERS_AND_EFFECTS,
    RenderLayers.VISUAL_ONLY,
];

/** Give `camera` the main colour camera's layers. */
export function enableSceneLayers(camera: THREE.Camera): void {
    for (const layer of SCENE_CAMERA_LAYERS) camera.layers.enable(layer);
}

/** The shadow camera's layers: the scene's casters plus the shadow-only meshes. */
export function enableShadowLayers(shadowCamera: THREE.Camera): void {
    shadowCamera.layers.enable(RenderLayers.CHARACTERS_AND_EFFECTS);
    shadowCamera.layers.enable(RenderLayers.SHADOW_ONLY);
}
