/**
 * Resize the player character at run time: scale the mesh, then rebuild the
 * physics capsule to match.
 *
 * Referenced from agent docs (read-docs name: `samples/resize-player-character`).
 * Compiled against the live engine by game's `pnpm run check`
 * (tsconfig.docs-samples.json) — an engine API change breaks this file loudly.
 *
 * Rapier colliders cannot be scaled in place, so a resize is two steps: scale the
 * visual with `scaleCharacterToHeight`, then hand the new capsule size to the
 * controller and the loader and let `PlayerLoader.recreatePhysicsBody` swap in a
 * fresh body (position and velocity carry over). Call it from Game.ts, which owns
 * both objects: `resizePlayerCharacter(this.playerController, this.playerLoader, 1.3)`.
 */
import { scaleCharacterToHeight, getSkeletonHeight } from 'engine/CharacterConfig.js';
import type { PlayerController } from 'engine/PlayerController.js';
import type { PlayerLoader } from 'engine/loaders/PlayerLoader.js';

/** Scale the player to `targetHeight` meters and rebuild its physics body to fit. */
export function resizePlayerCharacter(
    playerController: PlayerController,
    playerLoader: PlayerLoader,
    targetHeight: number,
): void {
    // 1. Scale the visual from the height PlayerLoader gave it (world.json's characterHeight).
    const currentHeight = playerController.characterHeight || getSkeletonHeight();
    scaleCharacterToHeight(playerController.player, currentHeight, targetHeight);

    // 2. Keep the capsule's proportions: the radius scales by the same ratio as the height.
    const radius = playerController.capsuleRadius * (targetHeight / currentHeight);
    playerController.setCharacterHeight(targetHeight);
    playerController.setCapsuleDimensions(targetHeight, radius);

    // 3. Rebuild the body with the new capsule, then point the controller at it.
    //    The controller re-registers the new body with NPC proximity scans on its next update.
    playerLoader.updateCapsuleDimensions(targetHeight, radius);
    playerLoader.recreatePhysicsBody(playerController.player);
    const body = playerLoader.getPlayerBody();
    if (body) playerController.playerBody = body;

    // 4. Put the feet back on the ground at the new height.
    playerController.regroundCharacter(targetHeight);
}
