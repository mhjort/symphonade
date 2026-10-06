/**
 * The compat registry: every deprecated engine symbol, and when it may be removed.
 *
 * A deprecation is a promise to creators whose code still uses the symbol: it keeps
 * working until the release named here. `pnpm run check:deprecations` keeps this list and
 * the `@deprecated` tags in step, so nothing is deprecated without a removal date and
 * nothing is removed without having been deprecated. To deprecate a symbol: tag it,
 * add an entry, and call `deprecate(key)` from it if it still runs.
 *
 * `removeIn`:
 * - 'next-release': announced as lasting one engine version; remove it in the next tagged
 *   3.x release that has been the CLI default for four weeks (decision D23).
 * - 'first-semver-major': stays until W6.4 cuts the first semver major of the engine.
 *
 * Keys are `<path under game/src>#<Symbol>` or `#<Container>.<member>`.
 */

export type DeprecationRemoval = 'next-release' | 'first-semver-major';

export interface Deprecation {
    key: string;
    removeIn: DeprecationRemoval;
    /** What to use instead, or why it is going. */
    note: string;
}

export const DEPRECATIONS: readonly Deprecation[] = [
    {
        key: 'engine/AnimationAssets.ts#AnimationAssetsData.animalBaseUrl',
        removeIn: 'next-release',
        note: 'Nothing loads skeleton animal rigs any more: their only reader, SkeletonAnimalLoader, was deleted with the rigs long gone from every host. Kept for one engine version because the CLI reads this module from projects of…',
    },
    {
        key: 'engine/AnimationAssets.ts#AnimationAssetsData.animalSkeletons',
        removeIn: 'next-release',
        note: 'See `animalBaseUrl`.',
    },
    {
        key: 'engine/CollisionLayers.ts#GROUND_CHECK_NO_DEBRIS',
        removeIn: 'first-semver-major',
        note: 'Use GROUND_CHECK — identical bitmask (kept for older call sites).',
    },
    {
        key: 'engine/DebugController.ts#DebugController.addDebugMesh',
        removeIn: 'next-release',
        note: 'Debug meshes were never shown: the debug mode they waited for could not be turned on. A no-op until the next engine-version migration removes it.',
    },
    {
        key: 'engine/DebugController.ts#DebugController.getDebugMode',
        removeIn: 'next-release',
        note: 'Always false: the debug mode it reported could not be turned on. Removed at the next engine-version migration.',
    },
    {
        key: 'engine/EnvironmentObjectSystem.ts#EnvironmentObjectSystem.setEngine',
        removeIn: 'first-semver-major',
        note: 'The engine reference is now installed by GameEngine via the module-level `setEnvironmentObjectSystemEngine()` — templates and work folders no longer need to wire it. This shim exists so pre-existing work-folder…',
    },
    {
        key: 'engine/FirstPersonCamera.ts#FirstPersonCamera.getPitchAngle',
        removeIn: 'first-semver-major',
        note: 'Its meaning differs per controller (sign and zero point), so it cannot be carried between them. Use getViewPitch / setViewPitch: radians below the horizon, the same in every controller.',
    },
    {
        key: 'engine/FirstPersonCamera.ts#FirstPersonCamera.getVerticalAngle',
        removeIn: 'first-semver-major',
        note: 'See FirstPersonCamera.getPitchAngle.',
    },
    {
        key: 'engine/FirstPersonCamera.ts#FirstPersonCamera.setVerticalAngle',
        removeIn: 'first-semver-major',
        note: 'See FirstPersonCamera.getPitchAngle.',
    },
    {
        key: 'engine/ICameraController.ts#ICameraController.getPitchAngle',
        removeIn: 'first-semver-major',
        note: 'A required member creators implement, so it stays until the semver major. See FirstPersonCamera.getPitchAngle.',
    },
    {
        key: 'engine/ICameraController.ts#ICameraController.getVerticalAngle',
        removeIn: 'first-semver-major',
        note: 'A required member creators implement, so it stays until the semver major. See FirstPersonCamera.getPitchAngle.',
    },
    {
        key: 'engine/IDamageable.ts#LEGACY_ENEMY_CONTROLLER_KEY',
        removeIn: 'next-release',
        note: 'Tag damageable meshes with userData.damageableController; the enemyController alias is read for one more release.',
    },
    {
        key: 'engine/MobileControls.ts#MobileButtonDef.baseColor',
        removeIn: 'first-semver-major',
        note: 'Mobile buttons now follow the UI theme — colors come from the button\'s semantic `role`, not per-button overrides. Kept (optional) only so existing genre code that still passes a color keeps type-checking; the value is…',
    },
    {
        key: 'engine/MobileControls.ts#MobileButtonDef.pressedColor',
        removeIn: 'first-semver-major',
        note: 'See `baseColor` — ignored, the theme drives the pressed color.',
    },
    {
        key: 'engine/PlayerController.ts#PlayerController.baseColor',
        removeIn: 'first-semver-major',
        note: 'Ignored — mobile buttons follow the UI theme via `role`.',
    },
    {
        key: 'engine/PlayerController.ts#PlayerController.pressedColor',
        removeIn: 'first-semver-major',
        note: 'Ignored — mobile buttons follow the UI theme via `role`.',
    },
    {
        key: 'engine/Projectile.ts#Projectile.constructor',
        removeIn: 'first-semver-major',
        note: 'Positional form. Use new Projectile({ ...DEFAULT_PROJECTILE_OPTIONS, position, direction, speed, physicsWorld, engine }); projectileType has no replacement.',
    },
    {
        key: 'engine/Projectile.ts#Projectile.getProjectileType',
        removeIn: 'first-semver-major',
        note: 'ProjectileType is deprecated; nothing reads the type any more.',
    },
    {
        key: 'engine/Projectile.ts#ProjectileType',
        removeIn: 'first-semver-major',
        note: 'It only picked the retired splat light-sphere colour and the mesh name. Construct with a ProjectileOptions object, which has no type.',
    },
    {
        key: 'engine/Projectile.ts#ProjectileVisualConfig.bloomLayer',
        removeIn: 'first-semver-major',
        note: 'There is no layer bloom: no post-FX pass reads layers, so the option only moves the mesh to RenderLayers.CHARACTERS_AND_EFFECTS, which it does by default. Make a shot glow with a bright, un-tone-mapped material.',
    },
    {
        key: 'engine/RangedWeaponSystem.ts#RangedWeaponSystem.setShootingDelay',
        removeIn: 'first-semver-major',
        note: 'Misread as a cadence control by every reader so far — it is the one-shot gate {@link suppressFireFor}. For shots per second use {@link setFireRate}.',
    },
    {
        key: 'engine/StorageUploadUtil.ts#uploadToS3',
        removeIn: 'first-semver-major',
        note: 'Use uploadFile instead',
    },
    {
        key: 'engine/ThirdPersonCamera.ts#ThirdPersonCamera.getPitchAngle',
        removeIn: 'first-semver-major',
        note: 'See FirstPersonCamera.getPitchAngle.',
    },
    {
        key: 'engine/ThirdPersonCamera.ts#ThirdPersonCamera.getVerticalAngle',
        removeIn: 'first-semver-major',
        note: 'See FirstPersonCamera.getPitchAngle.',
    },
    {
        key: 'engine/ThirdPersonCamera.ts#ThirdPersonCamera.height',
        removeIn: 'next-release',
        note: 'No effect: nothing ever read it. The orbit radius and polar angle set the camera height.',
    },
    {
        key: 'engine/ThirdPersonCamera.ts#ThirdPersonCamera.setVerticalAngle',
        removeIn: 'first-semver-major',
        note: 'See FirstPersonCamera.getPitchAngle.',
    },
    {
        key: 'engine/ThirdPersonCamera.ts#ThirdPersonCamera.smoothness',
        removeIn: 'next-release',
        note: 'No effect: nothing ever read it. Follow smoothing is fixed half-lives; see setChaseDamping.',
    },
    {
        key: 'engine/TopDownCamera.ts#TopDownCamera.getPitchAngle',
        removeIn: 'first-semver-major',
        note: 'See FirstPersonCamera.getPitchAngle.',
    },
    {
        key: 'engine/TopDownCamera.ts#TopDownCamera.getVerticalAngle',
        removeIn: 'first-semver-major',
        note: 'See FirstPersonCamera.getPitchAngle.',
    },
    {
        key: 'engine/TopDownCamera.ts#TopDownCamera.setVerticalAngle',
        removeIn: 'first-semver-major',
        note: 'See FirstPersonCamera.getPitchAngle.',
    },
    {
        key: 'engine/UnarmedMeleeSystem.ts#UnarmedMeleeConfig.coneAngle',
        removeIn: 'first-semver-major',
        note: 'No effect since strikes moved to the melee-weapon body-volume test (`gatherMeleeBodyHits`) — forgiveness now comes from `hitboxRadius`. Kept so shipped games passing it keep compiling.',
    },
    {
        key: 'engine/VehiclePlatform.ts#PlatformVehicleConfig.friction',
        removeIn: 'first-semver-major',
        note: 'Use frontWheels/rearWheels for per-axle configuration',
    },
    {
        key: 'engine/VehiclePlatform.ts#PlatformVehicleConfig.suspensionDamping',
        removeIn: 'first-semver-major',
        note: 'Use frontWheels/rearWheels for per-axle configuration',
    },
    {
        key: 'engine/VehiclePlatform.ts#PlatformVehicleConfig.suspensionStiffness',
        removeIn: 'first-semver-major',
        note: 'Use frontWheels/rearWheels for per-axle configuration',
    },
    {
        key: 'engine/VehiclePlatform.ts#PlatformVehicleConfig.wheelRadius',
        removeIn: 'first-semver-major',
        note: 'Use frontWheels/rearWheels for per-axle configuration',
    },
    {
        key: 'engine/VehiclePlatform.ts#PlatformVehicleConfig.wheelWidth',
        removeIn: 'first-semver-major',
        note: 'Use frontWheels/rearWheels for per-axle configuration',
    },
    {
        key: 'engine/VehiclePlatform.ts#VehiclePlatformStructure.wheelRadius',
        removeIn: 'first-semver-major',
        note: 'Use wheelConfigs[0].radius or maxWheelRadius',
    },
    {
        key: 'engine/VehiclePlatform.ts#VehiclePlatformStructure.wheelWidth',
        removeIn: 'first-semver-major',
        note: 'Use wheelConfigs[0].width',
    },
    {
        key: 'engine/VehicleUnstuckSystem.ts#VehicleUnstuckOptions.disableDuration',
        removeIn: 'first-semver-major',
        note: 'Ignored since the sensor trick was removed. Flipping a chassis to sensor mode disabled ALL of its contacts, not just car-to-car: for the duration a car could pass through walls and track furniture.',
    },
    {
        key: 'engine/VehicleUnstuckSystem.ts#VehicleUnstuckOptions.maxStuckSpeed',
        removeIn: 'first-semver-major',
        note: 'Ignored. Gating on ABSOLUTE speed was wrong: a welded pair moving at racing speed in lockstep — precisely the case players report as "AI cars driving around stuck in pairs" — never dropped below the gate, so the one…',
    },
    {
        key: 'engine/VoxelTerrainSystem.ts#VoxelTerrainSystem.adjustSpawnPosition',
        removeIn: 'first-semver-major',
        note: 'No longer mutates the spawn position. Kept as a no-op so any stale callers (work-folder copies, custom templates, saved-game restores) don\'t drag back the "scan-down for the topmost solid block" behaviour that…',
    },
    {
        key: 'engine/VoxelTerrainSystem.ts#VoxelTerrainSystem.getVoxelTerrainHeight',
        removeIn: 'first-semver-major',
        note: 'Use getTerrainOnlyHeight() instead',
    },
    {
        key: 'engine/VoxelTerrainSystem.ts#VoxelTerrainSystem.updateDebris',
        removeIn: 'first-semver-major',
        note: 'Debris updates are handled automatically by VoxelDebrisManager',
    },
    {
        key: 'engine/animal/BlockAnimalAnimationController.ts#BlockAnimalAnimationController.getLocomotionMode',
        removeIn: 'next-release',
        note: 'Nothing calls it; AnimalController resolves the locomotion mode itself.',
    },
    {
        key: 'engine/VxlSceneTerrainSystem.ts#VxlSceneTerrainConfig.keepDecodedColumns',
        removeIn: 'next-release',
        note: 'Ignored: decoded columns are always released after a load. The renderer-internal hint rebuild that needed them is gone.',
    },
    {
        key: 'engine/config.ts#AI_CHAT_URL',
        removeIn: 'first-semver-major',
        note: 'Resolved once at import, before an embedder can say which services to use. Use getAiChatUrl().',
    },
    {
        key: 'engine/config.ts#API_SERVER_BASE_URL',
        removeIn: 'first-semver-major',
        note: 'Resolved once at import, before an embedder can say which services to use. Use getApiServerBaseUrl().',
    },
    {
        key: 'engine/config.ts#API_SERVER_TOKEN',
        removeIn: 'first-semver-major',
        note: 'Resolved once at import, before an embedder can say which services to use. Use getApiServerToken(), which is null where no token applies.',
    },
    {
        key: 'engine/config.ts#GAME_DATA_SERVICE_URL',
        removeIn: 'first-semver-major',
        note: 'Resolved once at import, before an embedder can say which services to use. Use getGameDataServiceUrl().',
    },
    {
        key: 'engine/config.ts#GAME_SERVER_HTTP_URL',
        removeIn: 'first-semver-major',
        note: 'Resolved once at import, before an embedder can say which services to use. Use getGameServerHttpUrl().',
    },
    {
        key: 'engine/config.ts#GAME_SERVER_WS_URL',
        removeIn: 'first-semver-major',
        note: 'Resolved once at import, before an embedder can say which services to use. Use getGameServerWsUrl().',
    },
    {
        key: 'engine/config.ts#PLAY_AUTH_URL',
        removeIn: 'first-semver-major',
        note: 'Resolved once at import, before an embedder can say which services to use. Use getPlayAuthUrl().',
    },
    {
        key: 'engine/hosting.ts#EngineHosting.animalSkeletonBaseUrl',
        removeIn: 'next-release',
        note: 'Skeleton animal rigs: nothing loads them, and the files are gone (see `AnimationAssets.animalBaseUrl`).',
    },
    {
        key: 'engine/hud/ThemeManager.ts#DEFAULT_THEME_MANAGER_OPTIONS',
        removeIn: 'next-release',
        note: 'Nothing reads it; pass { root, manageFontLink: true } to ThemeManager.',
    },
    {
        key: 'engine/hud/ThemeTokens.ts#ThemeInput',
        removeIn: 'next-release',
        note: 'Nothing reads it; the engine validates themes with validateAndResolveTheme. Use PartialTheme / ThemeTokens.',
    },
    {
        key: 'engine/physics/PhysicsWorld.ts#PhysicsWorld.addAction',
        removeIn: 'next-release',
        note: 'A no-op left from an earlier physics engine: a vehicle updates its own controller each frame. Delete the call.',
    },
    {
        key: 'engine/physics/PhysicsWorld.ts#PhysicsWorld.addRigidBody',
        removeIn: 'first-semver-major',
        note: 'A no-op: a body joins the world when createRigidBody makes it, and collision groups go on its colliders (ColliderDesc.setCollisionGroups(makeCollisionGroups(group, mask))). Delete the call.',
    },
    {
        key: 'engine/physics/PhysicsWorld.ts#PhysicsWorld.removeAction',
        removeIn: 'next-release',
        note: 'A no-op left from an earlier physics engine: a vehicle releases its controller in its own dispose(). Delete the call.',
    },
    {
        key: 'engine/physics/PlaneLockedPhysics.ts#PlaneLockedPhysics.addRigidBody',
        removeIn: 'first-semver-major',
        note: 'See PhysicsWorld.addRigidBody.',
    },
    {
        key: 'engine/physics/RapierVehicle.ts#RapierVehicle.update',
        removeIn: 'first-semver-major',
        note: 'Use physicsUpdate() and visualUpdate() separately',
    },
    {
        key: 'engine/physics/RapierVehicle.ts#VehicleConfig.friction',
        removeIn: 'first-semver-major',
        note: 'Use wheels[] for per-wheel configuration',
    },
    {
        key: 'engine/physics/RapierVehicle.ts#VehicleConfig.suspensionDamping',
        removeIn: 'first-semver-major',
        note: 'Use wheels[] for per-wheel configuration',
    },
    {
        key: 'engine/physics/RapierVehicle.ts#VehicleConfig.suspensionRestLength',
        removeIn: 'first-semver-major',
        note: 'Use wheels[] for per-wheel configuration',
    },
    {
        key: 'engine/physics/RapierVehicle.ts#VehicleConfig.suspensionStiffness',
        removeIn: 'first-semver-major',
        note: 'Use wheels[] for per-wheel configuration',
    },
    {
        key: 'engine/physics/RapierVehicle.ts#VehicleConfig.wheelPositions',
        removeIn: 'first-semver-major',
        note: 'Use wheels[] for per-wheel configuration',
    },
    {
        key: 'engine/physics/RapierVehicle.ts#VehicleConfig.wheelRadius',
        removeIn: 'first-semver-major',
        note: 'Use wheels[] for per-wheel configuration',
    },
    {
        key: 'engine/physics/RapierVehicle.ts#VehicleConfig.wheelWidth',
        removeIn: 'first-semver-major',
        note: 'Use wheels[] for per-wheel configuration',
    },
    {
        key: 'engine/renderers/PlatformVehicleRenderer.ts#VoxelPlatformRendererOptions',
        removeIn: 'first-semver-major',
        note: 'Unused — the voxel car renderer takes its voxel size from `VoxelCarBodyConfig` instead. See `VoxelCarBodyBuilder.createVoxelRenderer()` in `engine/builders/VoxelCarBodyBuilder.ts`.',
    },
    {
        key: 'engine/ui/bitmagicBranding.ts#getBitmagicLogoUrl',
        removeIn: 'first-semver-major',
        note: 'Nothing in the engine reads it any more; kept so game code that imported it still builds.',
    },
    {
        key: 'types/game.ts#WorldProfileData.baseAnimations',
        removeIn: 'first-semver-major',
        note: 'Core animations are now loaded automatically from predefined packs. Legacy: Full list of base animations. If provided, used instead of animation packs.',
    },
    {
        key: 'types/game.ts#WorldProfileData.environmentObjectsGeneratedProcedurally',
        removeIn: 'first-semver-major',
        note: 'Use GameData.environmentObjectsGeneratedProcedurally (from game.json). Kept for backward compat with old templates.',
    },
    {
        key: 'types/game.ts#WorldProfileData.meleeWeaponAnimations',
        removeIn: 'first-semver-major',
        note: 'Weapon animations are loaded by Game templates via loadAnimationPack(). Legacy: Weapon-specific animations for melee combat.',
    },
    {
        key: 'types/game.ts#WorldProfileData.useBlockCharacter',
        removeIn: 'first-semver-major',
        note: 'Superseded by `useHighResCharacter` (block is now the default). Legacy inverse toggle: `true` forced the block character, `false` forced the skinned mesh. Still honoured for back-compat — when set, it overrides the…',
    },
];
