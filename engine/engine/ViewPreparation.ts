/**
 * ViewPreparation — make the scene ready to be drawn from a camera that is not
 * the live one.
 *
 * Every frame culls the world against the LIVE camera: GameEngine repacks the
 * environment-object instances, and a genre hides the terrain chunks the live
 * view cannot see. An off-screen shot from anywhere else (a whole-level preset,
 * an orbit, the agent's look) would otherwise draw only what the player happens
 * to be looking at. `prepareViewFor(camera)` re-runs that culling for the shot's
 * camera. Nothing needs restoring: the next live frame culls for the live camera
 * again.
 *
 * The engine owns the environment-object pass; a genre that culls its own
 * terrain registers that pass here (`registerViewPreparer`), since the engine
 * cannot see genre systems.
 */

import type * as THREE from 'three';
import { getActiveEnvironmentObjectSystem } from 'engine/EnvironmentObjectSystem.js';

/** Re-cull something for `camera`. */
export type ViewPreparer = (camera: THREE.Camera) => void;

const preparers = new Set<ViewPreparer>();

/**
 * Add a culling pass that an off-screen capture runs for its camera — for a
 * game that culls its own terrain against the live camera each frame (the
 * voxel Game.ts does). Returns the function that removes it again; call it
 * from the game's dispose().
 */
export function registerViewPreparer(preparer: ViewPreparer): () => void {
    preparers.add(preparer);
    return () => {
        preparers.delete(preparer);
    };
}

/**
 * Cull the world for `camera` ahead of an off-screen render from it.
 *
 * @internal called by ScreenshotService before every non-live capture.
 */
export function prepareViewFor(camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    const env = getActiveEnvironmentObjectSystem();
    env?.updateInstanceCulling(camera);
    env?.updateVisibility(camera);
    for (const preparer of preparers) preparer(camera);
}
