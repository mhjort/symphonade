import type { GameConstants } from 'engine/Constants.js';
import { DEFAULT_CONSTANTS } from 'engine/Constants.js';

/**
 * Voxel template constants
 * Overrides engine defaults with template-specific values
 */
export const VOXEL_CONSTANTS: Partial<GameConstants> = {
    interactionRange: 4.0, // Slightly longer range for exploration
    // Other values use engine defaults
};

/**
 * Merged constants for this template (for engine use)
 * These override engine defaults and are passed to PlayerController
 */
export const CONSTANTS: GameConstants = {
    ...DEFAULT_CONSTANTS,
    ...VOXEL_CONSTANTS,
};
