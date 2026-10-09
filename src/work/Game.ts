import { getNpcSkeletonSource } from 'engine/npc/core/NpcSkeletonSource.js';
// AI editor note: This file is overridden by EVERY community template under
// /templates/<slug>/source/Game.ts — it's the one file all 6 templates
// commit a per-template version of. If you rename exports, change the
// constructor signature, or alter the GenreGameInterface this class
// implements, search every overlay for stale references and update them
// in lockstep (pnpm run check does NOT cover templates — drift lands
// silently). See ../../../../templates/README.md for the full contract.
import * as THREE from 'three';
import { TravelerSelection, disposeTravelerAvatar, type TravelerAvatar } from './TravelerSelection.js';
import { travelerAssetUrl, type Traveler, type TravelerId } from './Travelers.js';
import { VoyageLeaderboard } from './VoyageLeaderboard.js';
import type { MobileActionSpec } from 'engine/MobileActionSpec.js';
import { ShipRoomLighting } from './ShipRoomLighting.js';
import { StarlightLighting } from './StarlightLighting.js';
import { NightSky } from './NightSky.js';
import { EntranceMascot } from './EntranceMascot.js';
import { SlotMachine } from './SlotMachine.js';
import { RouletteTable } from './RouletteTable.js';
import { SwellSway, DEFAULT_SWELL_SWAY_OPTIONS } from 'engine/sailing/SwellSway.js';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import { InformationTroubadour } from './InformationTroubadour.js';
import { StarlightMusic, STARLIGHT_MUSIC_ID } from './StarlightMusic.js';
import { FerrySounds, FERRY_SOUNDS } from './FerrySounds.js';
import { Footsteps } from './Footsteps.js';
import { CabinDoorReaders } from './CabinDoorReaders.js';
import { CabinKeyCard } from './CabinKeyCard.js';
import { pickCabin, type CabinAssignment } from './CabinAssignment.js';
import shipLevel from './serenade.mesh-level.json';
import { QuestCelebration } from './QuestCelebration.js';
import { Dizziness } from './Dizziness.js';
import { BeerBar } from './BeerBar.js';
import { CoffeeShop } from './CoffeeShop.js';
import { HeldDrink } from './HeldDrink.js';
import { BEER, COFFEE } from './Drinks.js';
import { PlayerEnergy } from './PlayerEnergy.js';
import { SLEEP_TIME_SCALE, VoyageClock } from './VoyageClock.js';
import { TripPoints } from './TripPoints.js';
import { BonVivantReservation } from './BonVivantReservation.js';
import { compactHud, installPhoneHudLayout } from './PhoneHud.js';
import { StarlightDance } from './StarlightDance.js';
import { StarlightDancers } from './StarlightDancers.js';
import { ReceptionClerk } from './ReceptionClerk.js';
import { PromenadeElevators } from './PromenadeElevators.js';
import { CabinMirrors } from './CabinMirrors.js';
import { ShipAssembly } from './ShipAssembly.js';
import { ChairSeating } from './ChairSeating.js';
import { DEFAULT_FALL_RESCUE_OPTIONS } from 'engine/FallRescue.js';
import type { WorldProfileData, EngineLike, GameData } from 'types/game.js';
import { VoxelPlayerController } from './VoxelPlayerController.js';
import { ThirdPersonCamera } from 'engine/ThirdPersonCamera.js';
import { CameraManager } from 'engine/CameraManager.js';
import { WorldGenerator } from './WorldGenerator.js';
import { SkyboxLoader } from 'engine/loaders/SkyboxLoader.js';
import { PlayerLoader } from 'engine/loaders/PlayerLoader.js';
import { AmbientLighting } from 'engine/lighting/AmbientLighting.js';
// DebugController is only available in development - handled dynamically
import { GameHUD } from './GameHUD.js';
import { bitmagicCharacterFactory, applyBitmagicModifications, updateBitmagicEyeBlink } from './BitmagicPlayerCharacter.js';
import { genreRegistry, type GenreGameInterface } from 'engine/GenreRegistry.js';
import { DEFAULT_PHYSICS } from './PhysicsConfig.js';
import { CONSTANTS } from './Constants.js';
import { VehicleManager } from 'engine/VehicleManager.js';
import { Spawner } from 'engine/Spawner.js';
import { VehicleSpawner } from 'engine/VehicleSpawner.js';
import { mergeCharacterConfig } from 'engine/CharacterConfig.js';
import {
    FirstPersonWeaponSystem,
    DEFAULT_FIRST_PERSON_WEAPON_OPTIONS,
} from 'engine/FirstPersonWeaponSystem.js';

export class VoxelGame implements GenreGameInterface {
    private travelerSelection: TravelerSelection | null = null;
    private travelerAvatar: TravelerAvatar | null = null;
    private disposed = false;
    public travelerId: TravelerId | null = null;
    private travelerName = '';
    private ship: ShipAssembly | null = null;
    private cabinMirrors: CabinMirrors | null = null;
    private chairSeating: ChairSeating | null = null;
    private promenadeElevators: PromenadeElevators | null = null;
    private readonly assignedCabin: CabinAssignment;
    private readonly tourStops: string[];
    private visited = new Set<string>();
    private tourEnded = false;
    private hasBoarded = false;
    private tourHudReady = false;
    private roomEntered = false;
    private clerkMessageUntil = 0;
    private coffeeShop: CoffeeShop | null = null;
    private celebration: QuestCelebration | null = null;
    private dizziness: Dizziness | null = null;
    private beerBar: BeerBar | null = null;
    private beerGlass: HeldDrink | null = null;
    private coffeeMug: HeldDrink | null = null;
    private energy: PlayerEnergy | null = null;
    private voyageClock: VoyageClock | null = null;
    private tripPoints: TripPoints | null = null;
    private voyageEnded = false;
    private bonVivant: BonVivantReservation | null = null;
    private readonly removePhoneHudLayout = installPhoneHudLayout();
    private starlightDance: StarlightDance | null = null;
    private starlightDancers: StarlightDancers | null = null;
    private cabinKeyCard: CabinKeyCard | null = null;
    private cabinDoorReaders: CabinDoorReaders | null = null;
    private ferrySounds: FerrySounds | null = null;
    private footsteps: Footsteps | null = null;
    private starlightMusic: StarlightMusic | null = null;
    private roomLighting: ShipRoomLighting | null = null;
    private nightSky: NightSky | null = null;
    private starlightLighting: StarlightLighting | null = null;
    private entranceMascot: EntranceMascot | null = null;
    private slotMachine: SlotMachine | null = null;
    private rouletteTable: RouletteTable | null = null;
    private informationTroubadour: InformationTroubadour | null = null;
    private readonly swellOptions = { ...DEFAULT_SWELL_SWAY_OPTIONS, amplitudeScale: 0 };
    private readonly shipSwell = new SwellSway(this.swellOptions);
    private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    private engine: EngineLike;
    private worldProfileData: WorldProfileData;
    private world: THREE.Object3D | null;
    private player: THREE.Object3D | null;
    private playerController: VoxelPlayerController | null;
    private cameraController: ThirdPersonCamera | null;
    private cameraManager: CameraManager | null = null;
    public worldGenerator: WorldGenerator | null = null;
    private skyboxLoader: SkyboxLoader;
    private playerLoader: PlayerLoader;
    private ambientLighting: AmbientLighting;
    private debugController: any | null = null;
    public hud: GameHUD;
    private vehicleManager: VehicleManager;
    private spawner: Spawner;
    private vehicleSpawner: VehicleSpawner;
    private gameId: string | null = null;

    private gameData: GameData | null = null;
    private elapsedTime: number = 0; // Track elapsed time for animated textures
    private hemisphereLight: THREE.HemisphereLight | null = null;

    // First-person template: optional weapon system. Disabled by default —
    // the scaffolding in load() / update() / dispose() shows how to enable it.
    private firstPersonWeapon: FirstPersonWeaponSystem | null = null;

    private wasRecordingFrames: boolean = false;
    private cullingWasEnabledBeforeRecording: boolean = false;
    private envCullingWasEnabledBeforeRecording: boolean = false;

    constructor(engine: EngineLike, worldProfileData: WorldProfileData, gameData?: GameData) {
        this.engine = engine;
        this.worldProfileData = worldProfileData;
        this.assignedCabin = pickCabin(worldProfileData, shipLevel.extras.links);
        this.tourStops = ['Bon Vivant', 'Cafe', 'Starlight', 'Sea View Lounge', this.assignedCabin.roomName];
        this.gameData = gameData || null;
        this.world = null;
        this.player = null;
        this.playerController = null;
        this.cameraController = null;

        // Require seed from worldProfileData - throw error if not found
        if (worldProfileData.worldSeed === undefined) {
            throw new Error('worldSeed is required in worldProfileData for consistent world generation');
        }

        try {
            console.log('Creating SkyboxLoader...', { engine: !!engine, worldProfileData: !!worldProfileData });
            this.skyboxLoader = new SkyboxLoader(engine, worldProfileData);
            console.log('SkyboxLoader created successfully:', !!this.skyboxLoader);
        } catch (error) {
            console.error('Failed to create SkyboxLoader:', error);
            throw error;
        }

        this.playerLoader = new PlayerLoader(engine, worldProfileData);

        // Expose playerLoader on engine for debug tools
        this.engine.setPlayerLoader?.(this.playerLoader);

        this.ambientLighting = new AmbientLighting(engine, this.skyboxLoader);
        // DebugController will be initialized lazily in load() method if available
        // gameName is required and must come from game.json (now at top level of gameData)
        const gameName = this.gameData?.gameName;
        if (!gameName) {
            console.error('[VoxelGame] gameData:', this.gameData);
            throw new Error('[VoxelGame] gameName is required in gameData but was not provided. Ensure game.json is loaded and merged correctly.');
        }
        this.hud = new GameHUD();
        this.vehicleManager = new VehicleManager(engine);
        this.spawner = new Spawner(engine);
        this.vehicleSpawner = new VehicleSpawner(this.spawner, this.vehicleManager);

        // Expose Spawner and VehicleSpawner on engine for easy access from templates
        this.engine.setSpawner?.(this.spawner);
        this.engine.setVehicleSpawner?.(this.vehicleSpawner);

        // Provide block character factory using new interface-based approach
        this.engine.blockCharacterFactory = bitmagicCharacterFactory;

        // Provide Bitmagic modifications callback for post-creation scaling/physics
        this.engine.applyCharacterModifications = applyBitmagicModifications;
    }

    declareMobileActions(): MobileActionSpec[] {
        return [
            { action: 'stand', iconKey: 'stand', desktopKeys: ['KeyF'], label: 'STAND', behavior: 'tap', preferredSlot: 'ascend', initiallyVisible: false },
        ];
    }

    async load(gameId: string): Promise<void> {
        try {
            // Store gameId for WorldGenerator
            this.gameId = gameId;

            // Bloom is now configured automatically from world.json in GameEngine.loadGame()

            // Create WorldGenerator now that we have gameId
            if (!this.worldGenerator) {
                // Determine initial world size from ground type settings if available, otherwise default to 128
                const initialWorldSize = this.worldProfileData.groundWorldSizeX
                    ? Math.max(this.worldProfileData.groundWorldSizeX, this.worldProfileData.groundWorldSizeZ || 128)
                    : 128;

                // worldSeed is already validated in constructor, so we know it's defined
                const seed = this.worldProfileData.worldSeed!;

                // Pass gameId and gameData to WorldGenerator so it can load saved heightmaps and pass data to systems
                this.worldGenerator = new WorldGenerator(initialWorldSize, seed, this.worldProfileData, this.engine, gameId, this.gameData);

                // Expose findValidVoxelSpawnPosition for proper animal/NPC spawning in voxel terrain
                this.engine.findValidVoxelSpawnPosition = (x: number, z: number, fromY?: number) => {
                    return this.worldGenerator?.findValidVoxelSpawnPosition(x, z, fromY) || null;
                };
            }

            // Always generate full world in Voxel mode
            await this.worldGenerator.generateWorld();
            this.world = this.worldGenerator.getWorld();

            if (!this.world) {
                throw new Error('WorldGenerator failed to create world object');
            }

            // Ground physics is now created automatically with visual chunks via generateGroundChunks()
            // which properly tracks both visual mesh and physics body together.
            // Physics bodies are added to physics world during chunk generation.

            // Add all other physics bodies (scenery, etc.) to physics world
            this.worldGenerator.getWorldBodies().forEach(body => {
                if (this.engine.physicsWorld && body) {
                    this.engine.physicsWorld.addRigidBody(body);
                }
            });


            await this.skyboxLoader.loadSkybox();
            this.ambientLighting.updateFromScene();

            // Set up warm sunset lighting for the voxel art style (skipped for low-poly games)
            this.setupVoxelLighting();

            // Physics step for terrain colliders is now done in WorldGenerator.generateWorld()
            // after finalizeTerrain(), so all physics bodies created afterward work correctly

            // Connect terrain system to DynamicObjectManager for chunk-based hibernation
            const voxelTerrain = this.worldGenerator.getVoxelTerrainSystem();
            if (voxelTerrain && this.engine.getDynamicObjectManager) {
                this.engine.getDynamicObjectManager().setTerrainSystem(voxelTerrain);
            }

            // Preserve the existing boarding camera and collision capsule.
            // The selected rig replaces this first-person-hidden model.
            this.player = await this.playerLoader.loadPlayer();

            // Enable bloom effect on player if configured
            this.engine.enableBloomOnObject?.(this.player);

            this.setupCamera();

            // ═══════════════════════════════════════════════════════════════════════════════
            // FIRST-PERSON WEAPON — a real view model: sway, bob, recoil with a camera
            // kick, aim down sights (right mouse), muzzle flash, ejected casings, a
            // crosshair that opens with your accuracy, and the engine ammo counter.
            // Rendered in its own layer, so it cannot clip into walls.
            //
            // Swap the weapon with any RangedWeaponRegistry id ('pistol', 'shotgun',
            // 'bazooka', 'bow', 'laser_blaster', ...) or call equipWeapon() at runtime.
            // For first-person MELEE use FirstPersonMeleeSystem — see after
            // setupPlayerController() below.
            // ═══════════════════════════════════════════════════════════════════════════════
            // Initialize DebugController if available (development only) - before setupPlayerController
            try {
                const { DebugController } = await import('engine/DebugController.js');
                this.debugController = new DebugController(this.engine);
            } catch (error) {
                // DebugController not available - this is fine for production builds
                console.log('DebugController not available (expected in production)');
            }

            await this.setupPlayerController();
            this.engine.enableMuteControl?.();
            this.footsteps = new Footsteps(this.engine);
            this.ferrySounds = new FerrySounds(this.engine, this.worldProfileData,
                () => this.playerController!.getPosition());
            await this.engine.preloadAudio?.(Object.values(FERRY_SOUNDS));
            const disco = this.gameData?.assets?.find(asset => asset.id === STARLIGHT_MUSIC_ID);
            if (!disco?.url) throw new Error('Missing Starlight disco music asset');
            this.starlightMusic = new StarlightMusic(this.engine);
            await this.starlightMusic.load(disco.url);
            this.ship = new ShipAssembly(this.engine);
            await this.ship.load();
            this.cabinMirrors = new CabinMirrors(this.ship.getRoot(), this.engine.scene!);
            this.chairSeating = new ChairSeating(this.ship.getRoot(), this.playerController!, this.player!,
                this.cameraManager!.getFirstPersonCamera(), this.hud, this.engine.physicsWorld!);
            this.starlightLighting = new StarlightLighting(this.engine);
            this.roomLighting = new ShipRoomLighting(this.engine);
            this.nightSky = new NightSky(this.engine);
            this.nightSky.attachScenery();
            const banknote = this.gameData?.assets?.find(asset => asset.id === 'asset_1789039625919_4vvbjh');
            if (!banknote?.url) throw new Error('Missing Finnish mark banknote image');
            if (!this.engine.scene) throw new Error('Quest celebration requires the loaded scene');
            this.celebration = new QuestCelebration(this.hud, this.engine.scene, this.reducedMotion);
            this.energy = new PlayerEnergy(this.hud);
            this.voyageClock = new VoyageClock(this.hud);
            this.tripPoints = new TripPoints(this.hud);
            this.starlightDance = new StarlightDance(this.engine, this.playerController!,
                this.chairSeating, this.energy, this.reducedMotion);
            this.dizziness = new Dizziness(this.hud, this.reducedMotion);
            this.playerController!.impairWalking = direction => this.dizziness?.affectWalking(direction);
            this.coffeeMug = new HeldDrink(this.engine,
                () => this.cameraManager!.getFirstPersonCamera().getCamera(), this.chairSeating,
                () => {
                    this.energy!.drinkCoffee();
                    this.completeQuest('first-coffee', 'First coffee', 'A warm start to the crossing.', 25);
                }, () => this.coffeeShop?.remindSeatedDrinking(), COFFEE);
            this.beerGlass = new HeldDrink(this.engine,
                () => this.cameraManager!.getFirstPersonCamera().getCamera(), this.chairSeating,
                () => {
                    this.energy!.drinkBeer(); this.dizziness!.drinkBeer();
                    this.completeQuest('first-beer', 'First beer', 'Cheers — pace yourself!', 25);
                }, () => this.beerBar?.remindSeatedDrinking(), BEER);
            this.playerController!.seatedInteraction = () => {
                if (!this.chairSeating?.isSeated) return false;
                if (!this.playerController!.keys.stand && this.chairSeating.isSettledSeated) (this.beerGlass?.hasDrink ? this.beerGlass : this.coffeeMug)?.drink();
                return true;
            };
            this.playerController!.isSeated = () => this.chairSeating?.isSeated ?? false;
            this.coffeeShop = new CoffeeShop(this.engine, this.hud,
                () => this.cameraManager!.getFirstPersonCamera().getCamera(), banknote.url, this.coffeeMug, () => this.beerGlass?.canOrder ?? true);
            // NPC spawning gives up its inline wait after two seconds. Wait for
            // the shared rig first so a slower download cannot abort game startup.
            const npcSkeleton = getNpcSkeletonSource(this.engine);
            npcSkeleton.ensureLoaded();
            const skeletonDeadline = performance.now() + 30_000;
            while (!npcSkeleton.getSkeletonGLTF()) {
                if (performance.now() >= skeletonDeadline) throw new Error('NPC skeleton did not load within 30 seconds');
                await new Promise<void>(resolve => setTimeout(resolve, 100));
            }
            await this.coffeeShop.load();
            this.beerBar = new BeerBar(this.engine, this.hud, this.coffeeShop, this.beerGlass, this.coffeeMug);
            await this.beerBar.load();
            this.bonVivant = new BonVivantReservation(this.engine, this.hud, this.coffeeShop,
                () => this.engine.getPointerLockManager?.() ?? null,
                () => {},
                () => {
                    this.energy!.eatMeal(25);
                    this.completeQuest('bon-vivant-dinner', 'Dinner at Bon Vivant', 'A fine meal at sea · +25% energy', 150);
                },
                () => {});
            await this.bonVivant.load();
            this.slotMachine = new SlotMachine(this.engine, this.playerController!,
                () => this.cameraManager!.getFirstPersonCamera().getCamera(), this.coffeeShop,
                jackpot => { if (jackpot) this.completeQuest('slot-jackpot', 'Silja jackpot', 'Three ships on the payline!', 250); });
            await this.slotMachine.load();
            this.rouletteTable = new RouletteTable(this.engine, this.playerController!,
                () => this.cameraManager!.getFirstPersonCamera().getCamera(), this.coffeeShop, this.hud,
                () => this.completeQuest('first-roulette', 'First roulette round', 'Took a turn at the Starlight table!', 100));
            await this.rouletteTable.load();
            const clerk = this.engine.registerNpc('information_clerk', new ReceptionClerk(() => {
                const doors = this.engine.getDoorSystem?.();
                if (!doors) return;
                if (!doors.getKeyring().has(this.assignedCabin.keyId)) {
                    doors.getKeyring().grant(this.assignedCabin.keyId);
                    this.completeQuest('room-key', 'Room key collected', `Room ${this.assignedCabin.id} is yours!`, 50);
                    this.cabinKeyCard ??= new CabinKeyCard(this.hud, this.assignedCabin);
                    const attendant = this.engine.getNpcRegistry?.()?.get('information_clerk')?.getAllNpcs()[0];
                    const handover = attendant
                        ? attendant.getCharacter().getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.1, 0))
                        : new THREE.Vector3(5.5, 1.15, 18);
                    this.cabinKeyCard.collect(handover, this.cameraManager!.getFirstPersonCamera().getCamera());
                }
                this.clerkMessageUntil = this.elapsedTime + 9;
            }), {
                characterAssetId: 'asset_1789656952894_jm2h3d',
                importance: 'hero',
                damageable: { canDie: false },
            });
            await clerk.spawn(5.5, 18, 1.5);
            // The standard spawn search requires 1.2 m clearance; this authored
            // staff aisle is narrower, but fits the clerk's actual capsule.
            const clerkController = this.engine.getNpcRegistry?.()?.get('information_clerk')?.getAllNpcs()[0];
            if (!clerkController) throw new Error('Information clerk failed to spawn');
            clerkController.teleportTo(5.5, 0.05, 18);
            clerkController.setRetreatFromPlayerOverlap(false);
            clerkController.getCharacter().rotation.y = -Math.PI / 2;
            this.informationTroubadour = new InformationTroubadour(this.engine);
            await this.informationTroubadour.load();
            this.starlightDancers = new StarlightDancers(this.engine, this.gameData!);
            await this.starlightDancers.load();
            this.entranceMascot = new EntranceMascot(this.engine);
            await this.entranceMascot.load();
            const spawn = this.ship.landmark('spawn');
            this.playerController!.teleportTo(...spawn.position, spawn.yaw);
            // Camera looks along -Z; turn it toward the spawn landmark’s gameplay heading.
            this.cameraManager!.getFirstPersonCamera().setHorizontalAngle(spawn.yaw + Math.PI);
            this.cameraManager!.getFirstPersonCamera().setViewPitch(0);
            this.playerController!.configureFallRescue({ ...DEFAULT_FALL_RESCUE_OPTIONS, killPlaneY: -50 });

            // Hand the weapon to the controller: this is what wires left click, the
            // Enter action key and the mobile action button to firing.
            if (this.firstPersonWeapon && this.playerController) {
                this.playerController.setAttackSystem(this.firstPersonWeapon);
            }
            // ═══════════════════════════════════════════════════════════════════════════════
            // FIRST-PERSON MELEE — swap for the ranged weapon above to make this a
            // sword game. Procedural view-model swings, so it needs no character
            // skeleton and works with hasPlayerCharacter: false.
            // ═══════════════════════════════════════════════════════════════════════════════
            // const melee = new FirstPersonMeleeSystem(this.engine, {
            //     ...DEFAULT_FIRST_PERSON_MELEE_OPTIONS,
            //     weaponType: WeaponType.SWORD,
            // });
            // this.playerController.setAttackSystem(melee);

            // Enable player gravity NOW that terrain is fully loaded
            // Physics won't actually step until GameState becomes PLAYING (on Play button click)
            this.playerLoader.enablePlayerGravity();

            console.log('✅ Game loaded - waiting for Play button');

            // Show the HUD
            this.hud.show();
            this.playerController!.setControlsEnabled(false);
            this.playerController!.setInteractionsSuppressed(true);
            this.travelerSelection = new TravelerSelection(
                traveler => this.prepareTraveler(traveler),
                (traveler, avatar) => this.boardAsTraveler(traveler, avatar),
                () => this.engine.getPointerLockManager?.() ?? null,
                () => { this.engine.setStartupUiMode?.('engine'); this.engine.startGame?.(); });
            // The traveler screen replaces the engine's start screen. Without those engine
            // hooks it falls back to opening after the engine's own Play button.
            if (this.engine.setStartupUiMode && this.engine.startGame) {
                this.engine.setStartupUiMode('external');
                try {
                    this.travelerSelection.show();
                } catch (error) {
                    // Never fail the whole load over the start screen: fall back to the engine's
                    // Play button, after which the selection opens as it used to.
                    console.error('Traveler screen could not open as the start screen:', error);
                    this.engine.setStartupUiMode('engine');
                }
            }

            console.log('Voxel game loaded successfully');
        } catch (error) {
            console.error('Failed to load Voxel game:', error);
            throw error;
        }
    }

    private async prepareTraveler(traveler: Traveler): Promise<TravelerAvatar> {
        const url = travelerAssetUrl(traveler, this.gameData);
        const loader = new PlayerLoader(this.engine, {
            ...this.worldProfileData, characterUrl: url,
            hasPlayerCharacter: true, useBlockCharacter: false, useHighResCharacter: true,
        });
        loader.prefetchPlayerAnimations();
        try {
            const root = await loader.loadPlayer({ customPhysicsBody: this.playerController!.playerBody });
            root.removeFromParent();
            loader.setCapsuleDimensions(this.playerController!.characterHeight, this.playerController!.capsuleRadius);
            return { loader, root, url };
        } catch (error) {
            loader.getLoadedGLTF()?.scene?.parent?.removeFromParent();
            loader.dispose();
            throw error;
        }
    }

    private boardAsTraveler(traveler: Traveler, avatar: TravelerAvatar): void {
        if (this.travelerId || this.disposed) throw new Error('This voyage already has a traveler');
        const controller = this.playerController!;
        const oldPlayer = this.player!;
        const eyeHeight = this.cameraManager!.getFirstPersonCamera().getEyeHeight();
        avatar.root.position.copy(oldPlayer.position);
        avatar.root.rotation.copy(oldPlayer.rotation);
        this.engine.scene!.add(avatar.root);
        this.playerLoader.dispose();
        oldPlayer.removeFromParent();
        this.playerLoader = avatar.loader;
        this.travelerAvatar = avatar;
        this.engine.setPlayerLoader?.(avatar.loader);
        controller.player = avatar.root;
        controller.setAnimationController(avatar.loader.getAnimationController());
        this.engine.getPlayerVisibility().setSkeletonRoot(avatar.loader.getSkinnedSkeletonRoot());
        controller.setPlayerLoader(avatar.loader);
        controller.onPlayerChanged?.(avatar.root);
        this.chairSeating!.setPlayerObject(avatar.root);
        this.cameraManager!.getFirstPersonCamera().setEyeHeight(eyeHeight);
        this.energy!.initializeTraveler(traveler.energy);
        this.voyageClock!.start();
        this.coffeeShop!.initializeTraveler(traveler.marks);
        for (const hands of [this.coffeeMug, this.beerGlass, this.starlightDance]) hands?.setHandLook(traveler.hands);
        if (traveler.skinnedHands) {
            this.coffeeMug!.useAvatarHand(avatar.root);
            this.beerGlass!.useAvatarHand(avatar.root);
            this.starlightDance!.useAvatarHands(avatar.root);
        }
        // Keep a stable identity and model URL on the session and avatar. A
        // later multiplayer layer can resolve this catalog without UI state.
        this.travelerId = traveler.id;
        this.travelerName = traveler.name;
        avatar.root.userData.travelerId = traveler.id;
        avatar.root.userData.characterUrl = avatar.url;
        this.cabinMirrors!.setAvatar(avatar.root);
        // Phones keep the top corners for live status; the traveler was just chosen on screen.
        if (!compactHud) this.hud.createIconText('traveler-identity', { anchor: 'top-left', text: `${traveler.name} · ${traveler.category}` });
        controller.setInteractionsSuppressed(false);
        controller.setControlsEnabled(true);
        controller.fireCharacterReady();
        this.loadCustomAnimations().catch(error => console.warn('Traveler optional animations unavailable:', error));
    }

    private setupCamera(): void {
        if (this.engine.camera && this.engine.renderer) {
            // Read camera mode from configuration, default to third-person
            const cameraMode = this.worldProfileData.cameraMode || 'third-person';
            
            // Create CameraManager with configured camera mode
            this.cameraManager = new CameraManager(
                this.engine.getDefaultCamera(),
                this.player!,
                this.engine.renderer.domElement,
                this.engine,
                cameraMode
            );

            // Get reference to the active camera controller (could be ThirdPerson, FirstPerson, or TopDown)
            // Fall back to ThirdPersonCamera for backward compatibility if no active controller
            this.cameraController = (this.cameraManager.getActiveController() as ThirdPersonCamera)
                ?? this.cameraManager.getThirdPersonCamera();
        }
    }

    /**
     * Set up warm sunset lighting for the voxel art style.
     * Adds HemisphereLight for soft ambient lighting. A low-poly game (game.json
     * artStyle: "low-poly") skips it: its MeshLevel brings its own hemisphere light,
     * and the two stacked wash out an interior.
     */
    private setupVoxelLighting(): void {
        if (!this.engine.scene) return;
        if (this.gameData?.artStyle === 'low-poly') return;

        // HemisphereLight: warm sky color, cool ground color for soft ambient
        // Sky: warm sunset orange-yellow, Ground: dark blue-ish for contrast
        this.hemisphereLight = new THREE.HemisphereLight(
            0xffeeb1,  // Sky color - warm golden
            0x080820,  // Ground color - dark blue
            1.0        // Intensity
        );
        this.engine.scene.add(this.hemisphereLight);

        console.log('✨ Voxel lighting setup complete');
    }

    /**
     * Get the hemisphere light for runtime adjustments.
     * 
     * Use this to adjust ambient lighting based on location (outdoors vs dungeon):
     * ```typescript
     * const hemi = game.getHemisphereLight();
     * if (hemi) {
     *     hemi.color.setHex(0xffeeb1);      // Sky color (surfaces facing up)
     *     hemi.groundColor.setHex(0x101010); // Ground color (surfaces facing down)
     *     hemi.intensity = 0.3;              // Overall intensity
     * }
     * ```
     */
    getHemisphereLight(): THREE.HemisphereLight | null {
        return this.hemisphereLight;
    }

    private async setupPlayerController(): Promise<void> {
        const playerBody = this.playerLoader.getPlayerBody();
        if (!playerBody) {
            throw new Error('Player physics body not created');
        }

        if (!this.engine.physicsWorld) {
            throw new Error('Physics world not initialized');
        }

        console.log('🎮 VoxelGame: Using VoxelPlayerController');
        this.playerController = new VoxelPlayerController(
            this.player!,
            playerBody,
            this.engine.physicsWorld,
            this.cameraController!,
            this.engine,
            DEFAULT_PHYSICS,
            this.worldGenerator,
            undefined, // movementSystem
            CONSTANTS
        );

        // Register playerController with engine for debug systems (NpcManager projectile detection)
        this.engine.registerPlayerController(this.playerController);

        // Disable jump physics/animations and hide the mobile jump button.
        this.playerController.setJumpInputSuppressed(true);

        // Apply movement speed from characterConfig (runSpeed is used as the default movement speed)
        const charConfig = mergeCharacterConfig(this.worldProfileData.characterConfig);
        this.playerController.getMovementSystem().setMoveSpeed(charConfig.runSpeed);

        // Set the calculated capsule dimensions for accurate ground detection
        this.playerController.setCapsuleDimensions(
            this.playerLoader.getCapsuleHeight(),
            this.playerLoader.getCapsuleRadius(),
        );

        // Set voxel block size for step climbing (player + all dynamic objects)
        if (this.worldGenerator) {
            const voxelBlockSize = this.worldGenerator.getVoxelBlockSize();
            this.playerController.voxelBlockSize = voxelBlockSize;
            // Set for all dynamic objects (animals, NPCs) - both existing and future
            this.engine.getDynamicObjectManager?.()?.setVoxelBlockSize(voxelBlockSize);
        }

        // Connect animation controller to player controller
        this.playerController.setAnimationController(this.playerLoader.getAnimationController());

        // Connect PlayerLoader to PlayerController for character switching
        this.playerController.setPlayerLoader(this.playerLoader);

        // Connect vehicle manager to player controller
        this.playerController.setVehicleManager(this.vehicleManager);

        // Set up callback for when player object changes (for character switching)
        this.playerController.setOnPlayerChangedCallback((newPlayer: THREE.Object3D) => {
            this.player = newPlayer;

            // Enable bloom effect on new player if configured
            this.engine.enableBloomOnObject?.(newPlayer);

            // Update camera target to follow new player
            if (this.cameraController) {
                this.cameraController.setTarget(newPlayer);
            }

            console.log('VoxelGame: Player object and camera target updated for character switching');
        });

        // Connect DebugController to Game for debug features (F8 animations, etc.)
        if (this.debugController) {
            this.debugController.setGame(this);
        }

        // Apply character modifications now that PlayerController is ready
        this.playerLoader.applyCharacterModifications(this.player!, this.playerController);

        // Connect HUD to PlayerController for dynamic control display
        this.hud.setPlayerController(this.playerController);
        // Set HUD reference on PlayerController so it can show controls when movement system changes
        this.playerController.hud = this.hud;
    }

    private async loadCustomAnimations(): Promise<void> {
        try {
            const animController = this.playerLoader.getAnimationController();
            if (!animController) {
                console.warn('No animation controller found');
                return;
            }
            await animController.loadAllAnimationAssets({ normalizeRootMotion: true, loop: false });
        } catch (error) {
            console.error('Failed to load custom animations:', error);
        }
    }

    public getAnimationController(): any {
        return this.playerLoader.getAnimationController();
    }

    update(deltaTime: number): void {
        // Process deferred terrain chunks and foliage before gameplay starts.
        // Ensures all terrain is fully built before the player can see it.
        // Comment out for games with a tunnel/corridor start where terrain
        // can build progressively in the background while the player is hidden.
        const vt = this.worldGenerator?.getVoxelTerrainSystem();
        if (vt?.hasDeferredWork) {
            vt.processDeferredWork();
            return;
        }

        this.nightSky?.update(this.voyageClock?.shipMinutes ?? 0);
        if (!this.travelerId) return;

        // Track elapsed time for animated textures
        this.elapsedTime += deltaTime;

        // MechanismSystem is initialized by the engine after genre load completes.
        if (!this.promenadeElevators && this.ship && this.playerController && this.engine.getMechanismSystem?.()) {
            this.promenadeElevators = new PromenadeElevators(this.engine, this.playerController, this.ferrySounds!);
        }
        this.promenadeElevators?.update(deltaTime);
        this.chairSeating?.prepareInteractions();
        this.starlightDance?.prepareInteractions();
        if (this.cabinKeyCard && this.playerController && this.engine.getDoorSystem?.()) {
            this.cabinDoorReaders ??= new CabinDoorReaders(this.engine, this.worldProfileData, this.hud,
                this.cabinKeyCard, this.assignedCabin, () => this.cameraManager!.getFirstPersonCamera().getCamera(), this.ferrySounds!);
            this.cabinDoorReaders.update(deltaTime, this.playerController.getPosition());
        }

        // Sleeping fast-forwards ship time, and the dizziness wears off with it.
        const sleeping = this.chairSeating?.isSleeping ?? false;
        this.voyageClock?.update(deltaTime, sleeping);
        this.dizziness?.update(sleeping ? deltaTime * SLEEP_TIME_SCALE : deltaTime);
        if (this.playerController) {
            // Snap-to-ground can settle just inside the collision skin of a
            // convex lift floor and stall boarding. Gravity handles these flat
            // decks and stair descents; the engine still supplies platform carry.
            if (this.ship && this.engine.physicsWorld) this.engine.physicsWorld.getCharacterController().disableSnapToGround();
            this.playerController.update(deltaTime);
            this.chairSeating?.update(deltaTime);
            this.footsteps?.update(deltaTime, this.playerController, this.dizziness?.severity ?? 0);
        }

        this.coffeeShop?.update(deltaTime);
        this.beerBar?.update(deltaTime);
        if (this.bonVivant && this.voyageClock && this.playerController) this.bonVivant.update(deltaTime, {
            shipMinutes: this.voyageClock.shipMinutes,
            seatName: this.chairSeating?.settledSeatName ?? null,
            tablePosition: this.chairSeating?.getMugTablePosition() ?? null,
            playerPosition: this.playerController.getPosition(),
        });
        this.slotMachine?.update(deltaTime);
        this.rouletteTable?.update(deltaTime);
        this.starlightDance?.update(deltaTime);
        this.energy?.update(deltaTime, this.starlightDance?.active ?? false, this.chairSeating?.isSleeping ?? false);
        this.updateWelcomeTour();
        this.checkVoyageOutcome();
        this.ferrySounds?.updateDoors();
        this.starlightLighting?.update(deltaTime);
        this.roomLighting?.update(deltaTime, this.playerController?.getPosition());
        if (this.playerController) this.entranceMascot?.update(deltaTime, this.playerController.getPosition());
        if (this.playerController) this.informationTroubadour?.update(deltaTime, this.playerController.getPosition());
        if (this.playerController) this.starlightMusic?.update(this.playerController.getPosition());

        // Update vehicles
        this.vehicleManager.update();

        // Update block character animation if present
        this.playerLoader.updateBlockCharacter();

        // Update Bitmagic eye blinking animation
        updateBitmagicEyeBlink(deltaTime);

        // Update voxel terrain animated textures (e.g., lava) and visibility culling
        if (this.worldGenerator) {
            // Disable frustum culling during recording — the recording camera has a different
            // aspect ratio than the editor camera, so the frustum doesn't match and chunks
            // outside the editor frustum (but inside the recording frustum) get hidden.
            const isRecording = this.engine.isRecordingFrames?.() ?? false;

            const voxelTerrain = this.worldGenerator.getVoxelTerrainSystem();
            if (voxelTerrain) {
                voxelTerrain.update(this.elapsedTime);

                if (isRecording && !this.wasRecordingFrames) {
                    this.cullingWasEnabledBeforeRecording = voxelTerrain.isCullingEnabled();
                    voxelTerrain.setCullingEnabled(false);
                    const envSys = this.worldGenerator.getEnvironmentObjectSystem();
                    if (envSys) {
                        this.envCullingWasEnabledBeforeRecording = envSys.isCullingEnabled();
                        envSys.setCullingEnabled(false);
                    }
                } else if (!isRecording && this.wasRecordingFrames) {
                    if (this.cullingWasEnabledBeforeRecording) {
                        voxelTerrain.setCullingEnabled(true);
                    }
                    const envSys = this.worldGenerator.getEnvironmentObjectSystem();
                    if (envSys && this.envCullingWasEnabledBeforeRecording) {
                        envSys.setCullingEnabled(true);
                    }
                }
                this.wasRecordingFrames = isRecording;

                if (this.engine.camera && !isRecording) {
                    voxelTerrain.updateVisibility(this.engine.camera, this.player?.position);
                }

                // Progressive chunk building for large worlds (lazy generation)
                // Builds 1 chunk per frame as player explores beyond initial radius
                if (this.player && !voxelTerrain.isLazyGenerationComplete()) {
                    voxelTerrain.buildPendingChunksNear(
                        this.player.position.x,
                        this.player.position.z,
                        1,  // Build 1 chunk per frame (~8ms overhead)
                        200 // Only build chunks within 200m of player
                    );
                }
            }

            // Per-frame LOD selection for baked chunked-VXL worlds (the
            // voxelize-as-level path). Drop-in alternative to the
            // chunk-grid `voxelTerrain` block above — only one of the two
            // systems is non-null per world. Without this call the level
            // still renders at LOD 0 (default-visible), but distance-based
            // LOD switching wouldn't happen.
            const vxlChunked = this.worldGenerator.getVxlChunkedTerrain();
            if (vxlChunked) {
                vxlChunked.update(this.elapsedTime);
                if (this.engine.camera && !isRecording) {
                    vxlChunked.updateVisibility(this.engine.camera, this.player?.position);
                }
            }

            // Update foliage debris physics
            const foliageSystem = this.worldGenerator.getFoliageSystem();
            if (foliageSystem) {
                foliageSystem.updateDebris(deltaTime);
            }

            // Update environment object visibility culling (trees, rocks, buildings)
            const envSystem = this.worldGenerator.getEnvironmentObjectSystem();
            if (envSystem && this.engine.camera && !isRecording) {
                envSystem.updateVisibility(this.engine.camera);
            }
        }

        // Only sync player physics from body when the movement system doesn't handle it.
        // Ski and vehicle movement systems sync player position themselves;
        // running syncPlayerPhysics would overwrite their position causing visual twitching.
        if (!this.playerController?.handlesPlayerPositionSync()) {
            this.syncPlayerPhysics();
        }

        this.chairSeating?.syncView();

        // Let PlayerController handle camera updates (supports vehicle camera switching)
        if (this.playerController && this.playerController.getCameraController) {
            const activeCamera = this.playerController.getCameraController();
            if (activeCamera && activeCamera.update) {
                activeCamera.update(deltaTime);
            }
        } else if (this.cameraController) {
            // Fallback to direct camera update
            this.cameraController.update(deltaTime);
        }

        // The engine camera rebuilds its pose each frame. Apply absolute swell
        // afterwards, before the held mug follows the camera, without moving physics.
        if (this.ship && this.playerController && this.engine.camera === this.cameraManager?.getFirstPersonCamera().getCamera()) {
            const dt = getGameStateManager().isState(GameState.PLAYING) ? Math.max(0, Math.min(deltaTime, .1)) : 0;
            const aboard = this.ship.volumesAt(this.playerController.getPosition())
                .some(volume => volume.name !== 'Boarding gangway');
            const strength = aboard && !this.reducedMotion.matches ? .5 : 0;
            this.swellOptions.amplitudeScale = THREE.MathUtils.lerp(this.swellOptions.amplitudeScale, strength, 1 - Math.exp(-1.5 * dt));
            this.shipSwell.update(dt);
            this.shipSwell.apply(this.engine.camera, 0);
            this.dizziness?.applyView(this.engine.camera);
            this.starlightDance?.applyView(this.engine.camera, !!(this.coffeeMug?.root.visible || this.beerGlass?.root.visible));
        }

        // The first-person weapon is installed as the player's attack system, so
        // the engine updates it every frame — nothing to drive from here.
        if (this.engine.camera) this.ship?.updateExteriorVisibility(this.engine.camera);
        if (this.engine.camera) this.celebration?.update(getGameStateManager().isState(GameState.PLAYING) ? deltaTime : 0, this.engine.camera);
        if (this.engine.camera) this.cabinMirrors?.update(this.engine.camera);
        this.coffeeMug?.update(deltaTime);
        this.beerGlass?.update(deltaTime);
        if (this.chairSeating?.isSeated && this.playerController) {
            const hint = this.beerGlass?.seatedDrinkHint ?? this.coffeeMug?.seatedDrinkHint;
            if (hint && this.playerController.getControlsEnabled()) {
                this.playerController.showInteractionPrompt(hint, undefined, !hint.startsWith('Drinking '));
            } else this.playerController.hideInteractionPrompt();
        }
    }

    private syncPlayerPhysics(): void {
        const playerBody = this.playerLoader.getPlayerBody();
        if (!playerBody || !this.player) return;

        // Use Rapier translation for position syncing
        const pos = playerBody.translation();

        const capsuleHeight = this.playerLoader.getCapsuleHeight();
        const halfHeight = capsuleHeight / 2;

        // Position the visual player so its feet align with the physics capsule bottom
        // Physics capsule center is at pos.y, so capsule bottom is at pos.y - halfHeight
        // For block characters, there's an offset from playerGroup origin to the actual feet
        const capsuleBottom = pos.y - halfHeight;
        const feetOffsetY = this.playerLoader.getFeetOffsetY();
        const playerGroupY = capsuleBottom - feetOffsetY;
        this.player.position.set(pos.x, playerGroupY, pos.z);

        if (this.playerController) {
            this.player.rotation.y = this.playerController.rotation;
        }
    }

    private updateWelcomeTour(): void {
        if (!this.playerController || !this.ship || this.tourEnded) return;
        if (!this.tourHudReady) {
            this.hud.createIconText('area', { anchor: 'top-center', icon: '⚓', text: 'Boarding · Gangway' });
            this.hud.createIconText('tour', { anchor: 'top-center', icon: '◇', text: 'Walk aboard · Deck 7 entrance' });
            this.cabinKeyCard ??= new CabinKeyCard(this.hud, this.assignedCabin);
            this.tourHudReady = true;
        }
        const hasKey = this.engine.getDoorSystem?.()?.getKeyring().has(this.assignedCabin.keyId) === true;
        const p = this.playerController.getPosition();
        const cabinDoor = this.worldProfileData.doors?.find(door => door.id === this.assignedCabin.id);
        const nearCabinDoor = cabinDoor !== undefined && p.y > 2.8
            && Math.hypot(p.x - cabinDoor.position.x, p.z - cabinDoor.position.z) < 3;
        if (p.y < -6) {
            this.endVoyage('lose', 'Off the passenger deck', 'Start again at the boarding gangway.', 'Back aboard');
            return;
        }
        const room = this.ship.volumesAt(p)[0];
        if (room) {
            if (room.name === 'Promenade') this.hasBoarded = true;
            // Deck labels follow the real separation of promenade and accommodation.
            const area = room.name === 'Promenade'
                ? (p.z > 15 && p.z < 22 ? 'Information' : 'Promenade')
                : room.name;
            this.hud.updateIconText('area', { text: area === 'Boarding gangway' ? 'Boarding · Gangway' : `Deck ${p.y > 2.8 ? 8 : 7} · ${area === 'Cafe' ? 'Coffee & Co' : area}` });
            // Bon Vivant is reservation-only: the stop counts once the host has been consulted.
            const objectiveMet = area === 'Starlight' ? this.starlightDance?.active === true
                : area === 'Bon Vivant' ? (this.bonVivant?.state ?? 'none') !== 'none' : true;
            if (this.roomEntered && this.tourStops.includes(area) && !this.visited.has(area) && objectiveMet) {
                this.visited.add(area);
                this.completeQuest(area === 'Starlight' ? 'dance-Starlight' : `visit-${area}`,
                    area === 'Starlight' ? 'Danced at the Starlight disco' : `${area === 'Cafe' ? 'Coffee & Co' : area} explored`,
                    this.visited.size === this.tourStops.length ? 'All objectives complete! Return to Information.' : `${this.visited.size} / ${this.tourStops.length} objectives complete`,
                    area === 'Starlight' ? 100 : 50);
            }
        }
        if (!this.hasBoarded) {
            this.hud.updateIconText('tour', { text: 'Walk aboard · Visit Information for your room key' });
            return;
        }
        if (!hasKey) {
            this.hud.updateIconText('tour', { text: nearCabinDoor
                ? `${this.assignedCabin.id} is locked · Collect your key at Information on deck 7`
                : 'First task · Speak to the Information clerk on deck 7' });
            return;
        }
        if (!this.roomEntered) {
            if (room?.name === this.assignedCabin.roomName && p.y > 3 && p.y < 5) {
                this.roomEntered = true;
                this.visited.add(this.assignedCabin.roomName);
                this.completeQuest('check-in', `Checked into room ${this.assignedCabin.id}`, `Welcome to your ${this.assignedCabin.view.toLowerCase()} cabin!`, 100);
                this.clerkMessageUntil = this.elapsedTime + 7;
            } else {
                const instruction = this.elapsedTime < this.clerkMessageUntil
                    ? `Clerk: Welcome aboard! Your room is ${this.assignedCabin.id}, deck 8. Here is your key.`
                    : p.y < 2.8
                        ? `Key ${this.assignedCabin.id} · Take the lifts ahead or aft stairs to deck 8`
                        : nearCabinDoor
                            ? `Key ${this.assignedCabin.id} · Interact with door ${this.assignedCabin.id} to unlock, then walk inside`
                            : `Key ${this.assignedCabin.id} · Find room ${this.assignedCabin.id} along the deck 8 cabin corridor`;
                this.hud.updateIconText('tour', { text: instruction });
                return;
            }
        }
        if (this.elapsedTime < this.clerkMessageUntil) {
            this.hud.updateIconText('tour', { text: `Room ${this.assignedCabin.id} · Check-in complete! Your key is yours to keep.` });
            return;
        }
        if (this.celebration?.has('welcome-tour')) {
            this.hud.updateIconText('tour', { text: 'Enjoy the crossing · Stockholm 09:30 Swedish time' });
            return;
        }
        const nextStop = this.tourStops.find(name => !this.visited.has(name));
        this.hud.updateIconText('tour', { text: this.visited.size === this.tourStops.length
            ? `5 / 5 · Return to Information`
            : `${nextStop === 'Starlight' ? 'Dance at the Starlight disco'
                : nextStop === 'Bon Vivant' && this.bonVivant?.state === 'none' ? 'Book a table with the Bon Vivant host, then step inside'
                : `Visit ${nextStop === 'Cafe' ? 'Coffee & Co' : nextStop}`} · ${this.visited.size} / ${this.tourStops.length}` });
        if (this.visited.size === this.tourStops.length && p.y < 1 && Math.hypot(p.x, p.z - 18) < 2.5) {
            this.completeQuest('welcome-tour', 'Welcome tour complete', 'You know your way around the ship!', 200);
        }
    }

    /** Celebrates a quest once and awards its trip points. */
    private completeQuest(id: string, title: string, detail: string, points: number): void {
        if (!this.celebration || this.celebration.has(id)) return;
        this.tripPoints?.award(points);
        this.celebration.complete(id, title, `+${points} trip points · ${detail}`);
    }

    private checkVoyageOutcome(): void {
        if (this.voyageEnded || !this.voyageClock || !getGameStateManager().isState(GameState.PLAYING)) return;
        if (this.voyageClock.arrived) {
            this.endVoyage('win', 'Welcome to Stockholm!',
                'You survived the whole crossing from Helsinki to Stockholm.', 'Sail again');
        } else if (this.energy && this.energy.value <= 0) {
            this.endVoyage('lose', 'You passed out',
                'Your energy ran out. Coffee, a beer or a nap in your cabin keeps you going.', 'Try again');
        } else if (this.dizziness?.blackedOut) {
            this.endVoyage('lose', 'Too dizzy to stand',
                'One beer too many — the crew helped you back to your cabin. Pace your drinks.', 'Try again');
        }
    }

    private endVoyage(outcome: 'win' | 'lose', title: string, message: string, replayLabel: string): void {
        if (this.voyageEnded) return;
        this.voyageEnded = this.tourEnded = true;
        this.engine.endGame({ outcome, title, message, replayLabel, stats: [
            { label: 'Trip points', value: `${this.tripPoints?.total ?? 0}` },
            { label: 'Quests completed', value: `${this.celebration?.count ?? 0}` },
            { label: 'Ship time', value: this.voyageClock?.time.label ?? '17:00 · Finnish time' },
            { label: 'Energy', value: `${Math.ceil(this.energy?.value ?? 0)}%` },
        ] });
        // Only arrivals rank: surviving the crossing is the goal. Every end screen shows the board.
        void new VoyageLeaderboard(this.engine).showOnEndScreen(
            outcome === 'win' ? this.tripPoints?.total ?? 0 : null, this.travelerName);
    }

    dispose(): void {
        this.disposed = true;
        this.travelerSelection?.dispose();
        this.footsteps?.dispose();
        this.celebration?.dispose();
        this.rouletteTable?.dispose();
        this.slotMachine?.dispose();
        this.dizziness?.dispose();
        if (this.playerController) this.playerController.impairWalking = null;
        this.beerBar?.dispose();
        this.bonVivant?.dispose();
        this.removePhoneHudLayout();
        this.beerGlass?.dispose();
        this.coffeeMug?.dispose();
        this.starlightDance?.dispose();
        this.starlightDancers?.dispose();
        this.energy?.dispose();
        this.voyageClock?.dispose();
        this.tripPoints?.dispose();
        this.coffeeShop?.dispose();
        this.chairSeating?.dispose();
        this.entranceMascot?.dispose();
        this.informationTroubadour?.dispose();
        this.roomLighting?.dispose();
        this.nightSky?.dispose();
        this.starlightLighting?.dispose();
        this.starlightMusic?.dispose();
        this.cabinDoorReaders?.dispose();
        this.cabinKeyCard?.dispose();
        this.promenadeElevators?.dispose();
        this.cabinMirrors?.dispose();
        this.ship?.dispose();
        if (this.firstPersonWeapon) {
            this.firstPersonWeapon.dispose();
            this.firstPersonWeapon = null;
        }

        if (this.playerController) {
            this.playerController.dispose();
        }

        if (this.travelerAvatar) {
            disposeTravelerAvatar(this.travelerAvatar);
            this.travelerAvatar = null;
        } else if (this.playerLoader) {
            this.playerLoader.dispose();
        }

        if (this.cameraManager) {
            this.cameraManager.dispose();
        } else if (this.cameraController) {
            this.cameraController.dispose();
        }

        if (this.player && this.engine.scene) {
            this.engine.scene.remove(this.player);
        }

        this.ambientLighting.dispose();
        if (this.debugController) {
            this.debugController.dispose();
        }
        this.hud.dispose();

        const playerBody = this.playerLoader.getPlayerBody();
        if (playerBody && this.engine.physicsWorld) {
            this.engine.physicsWorld.removeRigidBody(playerBody);
        }

        if (this.engine.physicsWorld && this.worldGenerator) {
            this.worldGenerator.getWorldBodies().forEach(body => {
                this.engine.physicsWorld!.removeRigidBody(body);
            });
        }
    }

    onWindowResize(): void {
        // Handle window resize if needed
        // Camera controller doesn't have a resize method, handled automatically by THREE.js
    }

    getWorldSeed(): number {
        if (!this.worldGenerator) {
            throw new Error('WorldGenerator not initialized');
        }
        return this.worldGenerator.getSeed();
    }

    getCurrentPlayer(): any | null {
        return this.playerController;
    }

    /**
     * Get the generic Spawner instance for spawning any type of entity
     * Use this for ground height detection and positioning of non-vehicle entities
     */
    getSpawner(): Spawner {
        return this.spawner;
    }

    /**
     * Get the VehicleSpawner instance for spawning vehicles
     * This is the recommended way to spawn vehicles - it handles all vehicle-specific logic
     */
    getVehicleSpawner(): VehicleSpawner {
        return this.vehicleSpawner;
    }
}

// Register the VoxelGame with the genre registry
genreRegistry.registerGenre('Voxel', VoxelGame);
