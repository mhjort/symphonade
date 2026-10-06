import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import { GoldenPathVisualizer } from 'engine/GoldenPathVisualizer.js';
import { areDebugHotkeysEnabled } from 'engine/CreatorMode.js';
import type { DebugManager } from 'engine/DebugManager.js';
import { deprecate } from 'engine/compat/deprecate.js';

/** The engine's one debug key table, when this engine has an editor to own it. */
function debugKeyTable(engine: EngineLike): DebugManager | null {
    const editor: unknown = engine.editorManager;
    if (typeof editor !== 'object' || editor === null) return null;
    const getter = (editor as { getDebugManager?: unknown }).getDebugManager;
    return typeof getter === 'function' ? (getter.call(editor) as DebugManager) : null;
}

/**
 * DebugController provides debug features that are only active in development.
 * In production, all methods become no-ops, allowing templates to safely
 * reference this class without code changes for different environments.
 *
 * Its keys live in the engine's one debug key table (`DebugManager`), on localhost
 * only: Shift+F7 toggles the forger's golden-path overlay and Shift+F8 plays the
 * first custom animation. Unshifted F7 and F8 belong to the built-in debug keys.
 */
export class DebugController {
    private game: any = null;
    private goldenPath: GoldenPathVisualizer;
    private unbindKeys: Array<() => void> = [];

    constructor(engine: EngineLike) {
        this.goldenPath = new GoldenPathVisualizer(engine);

        // A published build can report localhost too (a packaged app's web view, a bundle
        // previewed locally), so the hostname alone does not make this a development page.
        const isDevelopment = areDebugHotkeysEnabled
            && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        const keys = isDevelopment ? debugKeyTable(engine) : null;
        if (keys) {
            this.unbindKeys.push(
                keys.addKeyBinding({ code: 'F7', shift: true, label: 'Golden Path Overlay', run: () => this.goldenPath.toggle() }),
                keys.addKeyBinding({ code: 'F8', shift: true, label: 'Play Custom Animation', run: () => this.playFirstCustomAnimation() }),
            );
        }
    }

    /**
     * @deprecated Debug meshes were never shown: the debug mode they waited for could not be
     * turned on. A no-op until the next engine-version migration removes it.
     */
    addDebugMesh(_mesh: THREE.Mesh): void {
        deprecate('engine/DebugController.ts#DebugController.addDebugMesh');
    }

    /**
     * @deprecated Always false: the debug mode it reported could not be turned on. Removed at
     * the next engine-version migration.
     */
    getDebugMode(): boolean {
        deprecate('engine/DebugController.ts#DebugController.getDebugMode');
        return false;
    }

    setGame(game: any): void {
        this.game = game;
    }

    /** Play the first available custom animation on the current game (Shift+F8 debug helper). */
    private playFirstCustomAnimation(): void {
        if (typeof this.game?.getAnimationController !== 'function') {
            console.warn('Custom animation not available');
            return;
        }
        const animController = this.game.getAnimationController();
        if (!animController?.getAvailableCustomAnimations) {
            console.warn('Animation controller not available');
            return;
        }
        const availableAnimations = animController.getAvailableCustomAnimations();
        if (availableAnimations.length === 0) {
            console.warn('No custom animations loaded. Add animations to the assets list');
            return;
        }
        const motionId = availableAnimations[0];
        console.log(`🥊 Playing custom animation (${motionId})!`);
        animController.playCustomAnimation(motionId, { fadeInDuration: 0.1, fadeOutDuration: 0.2 });
    }

    dispose(): void {
        for (const unbind of this.unbindKeys) unbind();
        this.unbindKeys = [];
        this.goldenPath.dispose();
    }
}
