import type { PlayerController } from 'engine/PlayerController.js';
import type { RigFrameInput } from 'engine/viewmodel/ViewModelRig.js';

/**
 * Reads the per-frame state a view-model rig needs off a PlayerController.
 *
 * Shared by every view-model system so there is ONE place that knows how the
 * controller exposes this state — and so it can be tested against a
 * controller-shaped object without standing up an engine.
 *
 * That matters because the shapes here are not guessable and getting one wrong
 * is fatal rather than degraded: `isGrounded` is a PROPERTY, not a method, so
 * `controller.isGrounded?.()` is not a safe probe — optional-call guards
 * null and undefined, but `true?.()` throws. A throw in here lands inside
 * PlayerController.update, which takes the player's movement down with it.
 */

/** Fallback nominal speed when the movement system reports none. */
const DEFAULT_REFERENCE_SPEED = 5;

/** Tracks what has to be derived across frames rather than read. */
export class RigInputReader {
    private previousPlayerY: number | null = null;
    private verticalVelocity = 0;
    private previousPlayerX: number | null = null;
    private previousPlayerZ = 0;
    private lateralVelocity = 0;

    /**
     * The frame `read` fills and returns. One per reader, rewritten every call,
     * so the per-frame read allocates nothing; the rig consumes it immediately.
     */
    private readonly frame: RigFrameInput = {
        yaw: 0, pitch: 0,
        speed: 0, referenceSpeed: DEFAULT_REFERENCE_SPEED,
        lateralVelocity: 0, verticalVelocity: 0,
        grounded: true, adsHeld: false,
    };

    /** Forget the motion history — use after a teleport or respawn. */
    reset(): void {
        this.previousPlayerY = null;
        this.verticalVelocity = 0;
        this.previousPlayerX = null;
        this.lateralVelocity = 0;
    }

    /**
     * Fill in one frame of rig input. The returned object is this reader's own
     * and is overwritten by the next call: use it, do not keep it.
     *
     * @param adsHeld whether the aim control is held; the rig applies its own
     *                blocking rules on top.
     */
    read(controller: PlayerController | null, deltaTime: number, adsHeld: boolean): RigFrameInput {
        const frame = this.frame;
        if (!controller) {
            frame.yaw = 0;
            frame.pitch = 0;
            frame.speed = 0;
            frame.referenceSpeed = DEFAULT_REFERENCE_SPEED;
            frame.lateralVelocity = 0;
            frame.verticalVelocity = 0;
            frame.grounded = true;
            frame.adsHeld = false;
            return frame;
        }

        // Probed rather than called outright: these are required members of
        // PlayerController, but generated games install custom controllers that
        // implement only part of it, and a missing accessor must cost the
        // weapon its sway — not cost the player their movement.
        const camera = typeof controller.getCameraController === 'function'
            ? controller.getCameraController()
            : null;

        // Vertical and lateral velocity are DERIVED: no movement system exposes
        // them, and differentiating the player's own position works under every
        // custom movement system, on moving platforms, and during knockback.
        const position = controller.player?.position;
        if (position) {
            if (this.previousPlayerY !== null && deltaTime > 0) {
                this.verticalVelocity = (position.y - this.previousPlayerY) / deltaTime;
            }
            this.previousPlayerY = position.y;

            // Strafe: the horizontal velocity along the view's right vector.
            const right = typeof camera?.getRightVector === 'function' ? camera.getRightVector() : null;
            if (this.previousPlayerX !== null && deltaTime > 0 && right) {
                this.lateralVelocity = ((position.x - this.previousPlayerX) * right.x
                    + (position.z - this.previousPlayerZ) * right.z) / deltaTime;
            }
            this.previousPlayerX = position.x;
            this.previousPlayerZ = position.z;
        }

        const movement = typeof controller.getMovementSystem === 'function'
            ? controller.getMovementSystem()
            : null;
        const referenceSpeed = typeof movement?.getMoveSpeed === 'function'
            ? movement.getMoveSpeed()
            : DEFAULT_REFERENCE_SPEED;

        frame.yaw = typeof camera?.getHorizontalAngle === 'function' ? camera.getHorizontalAngle() : 0;
        frame.pitch = typeof camera?.getViewPitch === 'function' ? camera.getViewPitch() : 0;
        frame.speed = typeof controller.getCurrentSpeed === 'function' ? controller.getCurrentSpeed() : 0;
        frame.referenceSpeed = referenceSpeed > 0 ? referenceSpeed : DEFAULT_REFERENCE_SPEED;
        frame.lateralVelocity = this.lateralVelocity;
        frame.verticalVelocity = this.verticalVelocity;
        // A PROPERTY. See the note at the top of this file.
        frame.grounded = controller.isGrounded !== false;
        frame.adsHeld = adsHeld;
        return frame;
    }
}
