/**
 * The player's movement physics: gravity, jump height, air control and friction. Change
 * `DEFAULT_PHYSICS` to change how the game feels; Game.ts passes it to the player controller.
 */

export interface PhysicsConstants {
    /** 
     * Gravity acceleration (negative value for downward force)
     * Default: -48.0
     */
    gravity: number;
    
    /**
     * Maximum falling speed
     * Default: 53.0
     */
    terminalVelocity: number;
    
    /**
     * Jump height in world units
     * Default: 2.5
     */
    jumpHeight: number;
    
    /**
     * Air control multiplier (how much the player can move while in air)
     * 1.0 = full control, 0.0 = no control
     * Default: 0.5 (50% air control for good platforming)
     */
    airControlMultiplier: number;
    
    /**
     * Ground friction (how quickly the player stops when not moving)
     * Default: 0.9 (10% velocity retained each frame)
     */
    groundFriction: number;
    
    /**
     * Air friction (drag while in air)
     * Default: 0.98 (2% velocity lost each frame)
     */
    airFriction: number;
}

/**
 * Default physics constants
 * Modify these values to change the game's physics feel
 */
export const DEFAULT_PHYSICS: PhysicsConstants = {
    gravity: -48.0,            // Stronger gravity for snappier feel
    terminalVelocity: 53.0,
    jumpHeight: 2.5,           // Slightly lower jump for tighter control
    airControlMultiplier: 0.5, // 50% air control for good platforming feel
    groundFriction: 0.9,
    airFriction: 0.98
};
