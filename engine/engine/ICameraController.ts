import * as THREE from 'three';

/**
 * Camera controller interface that both FirstPersonCamera and ThirdPersonCamera implement.
 * This allows easy switching between camera modes in templates.
 */
export interface ICameraController {
    /** The Three.js camera instance */
    camera: THREE.PerspectiveCamera;
    
    /** The target object the camera follows */
    target: THREE.Object3D;
    
    /** Whether the camera controller is enabled */
    enabled: boolean;
    
    /** Update the camera position/rotation - call every frame */
    update(deltaTime: number): void;
    
    /** Get the camera's forward direction (Y=0, normalized) for movement */
    getForwardVector(): THREE.Vector3;
    
    /** Get the camera's right direction (Y=0, normalized) for movement */
    getRightVector(): THREE.Vector3;
    
    /** Get the Three.js camera instance */
    getCamera(): THREE.PerspectiveCamera;

    /**
     * The camera the frame is actually drawn through, for screen↔world
     * projection (cursor rays, on-screen prompts). Differs from getCamera()
     * when a controller renders through a camera of its own, as TopDownCamera
     * does with its orthographic fit-world view. Optional: a controller
     * without it renders through getCamera(). Read it via {@link renderCameraOf}.
     */
    getRenderCamera?(): THREE.Camera;
    
    /** Set the target object to follow */
    setTarget(target: THREE.Object3D): void;
    
    /** Enable or disable the camera controller */
    setEnabled(enabled: boolean): void;
    
    /** Set pointer lock mode (for PC gameplay) */
    setPointerLocked(locked: boolean): void;
    
    /** Get whether pointer lock is active */
    getPointerLocked(): boolean;
    
    /** Set editor mode (click-and-drag instead of pointer lock) */
    setEditorModeCamera(enabled: boolean): void;
    
    /** Apply external camera delta (e.g., from mobile controls) */
    applyExternalDelta(deltaX: number, deltaY: number): void;
    
    /** Get the horizontal angle (yaw) in radians */
    getHorizontalAngle(): number;
    
    /**
     * A controller-specific vertical angle, in radians: the orbit polar angle
     * for ThirdPersonCamera, PI/2 - pitch for FirstPersonCamera, pitch + PI for
     * TopDownCamera. Not transferable between controllers.
     * @deprecated Use getViewPitch, which means the same thing everywhere.
     */
    getVerticalAngle(): number;

    /**
     * A controller-specific pitch, in radians: downward-positive in
     * FirstPersonCamera, UPWARD-positive in ThirdPersonCamera, and the angle
     * from straight down in TopDownCamera.
     * @deprecated Use getViewPitch, which means the same thing everywhere.
     */
    getPitchAngle(): number;

    /**
     * How far below the horizon the view looks, in radians: 0 level, positive
     * down, PI/2 straight down. The same in every built-in controller, so it can
     * be read from one and handed to another. Optional for a controller of your own.
     */
    getViewPitch?(): number;

    /** Look `radians` below the horizon (see getViewPitch), clamped to the controller's range. */
    setViewPitch?(radians: number): void;

    /** The camera mode this controller implements (drives weapon aim-mode auto-detection) */
    getMode(): CameraMode;

    /**
     * Apply camera shake effect. `intensity` is in the controller's own units:
     * radians of view jitter for the first- and third-person cameras (default
     * 0.03), metres of position jitter for the top-down one (default 0.5).
     */
    applyShake(intensity?: number): void;
    
    /** Clean up event listeners */
    dispose(): void;
}

/**
 * The camera a controller's frame is drawn through: getRenderCamera() when it
 * has one, else getCamera(). Use it for anything that projects between the
 * screen and the world; keep getCamera() for perspective-only reads like FOV.
 */
export function renderCameraOf(controller: Pick<ICameraController, 'getCamera' | 'getRenderCamera'>): THREE.Camera {
    return controller.getRenderCamera?.() ?? controller.getCamera();
}

/**
 * Camera mode enum for easy switching
 */
export type CameraMode = 'first-person' | 'third-person' | 'top-down';

/**
 * Controls which camera is used when the player enters a vehicle.
 *
 * - 'auto'    — detect from walking camera type (default, preserves legacy behaviour)
 * - 'chase'   — dedicated VehicleCamera (third-person chase cam with inertia)
 * - 'cockpit' — dedicated FirstPersonVehicleCamera (driver's-eye view)
 * - 'keep'    — retarget the walking camera to the vehicle chassis so any
 *               custom follow camera keeps working while driving
 */
export type VehicleCameraMode = 'auto' | 'chase' | 'cockpit' | 'keep';
