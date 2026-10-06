/**
 * Environment Object Factories for Voxel Genre
 *
 * AI AGENTS: This file contains customizable factories for environment objects!
 *
 * You can modify:
 * - Tree colors, dimensions, and shapes
 * - Rock colors, sizes, and shapes
 * - Add entirely new environment object types
 *
 * The EnvironmentObjectSystem in engine/ provides generic infrastructure,
 * while this file contains all the game-specific implementations.
 *
 * For Voxel genre, objects are created using VoxelObject for a consistent
 * blocky aesthetic that matches the terrain.
 *
 * AI editor note: no community template currently overrides this file — it
 * flows into every template's merged source from here. If a template ever
 * starts customizing it, the customization map in templates/README.md will
 * reflect that, and you'll need to update each overriding overlay when
 * changing factory signatures here.
 */

import * as THREE from 'three';
import { SeededRandom } from 'engine/SeededRandom.js';
import { TerrainTypeRegistry, type TerrainTypeProperties } from 'engine/TerrainTypes.js';
import type { TerrainHeightProvider } from 'engine/TerrainTypeProvider.js';
import { VoxelObject } from 'engine/VoxelObject.js';
import { BlockType, type BlockTypeId, getVoxelTextureAtlas } from 'engine/VoxelTextureAtlas.js';
import type { PhysicsWorld } from 'engine/physics/PhysicsWorld.js';
import { enableStructuralCollapse } from 'engine/VoxelStructuralCollapse.js';
import type { EnvironmentObjectSystem, EnvironmentObjectData } from 'engine/EnvironmentObjectSystem.js';

function getBlockIdByName(name: string): BlockTypeId {
    const atlas = getVoxelTextureAtlas();
    const id = atlas.getBlockTypeByName(name);
    if (id === undefined) {
        console.warn(`[EnvironmentObjects] Block type '${name}' not found, using NONE`);
        return BlockType.NONE;
    }
    return id as BlockTypeId;
}

// ============================================================================
// VOXEL-BASED OBJECT FACTORIES
// ============================================================================

/**
 * Configuration for voxel tree generation.
 */
export interface VoxelTreeConfig {
    /** Size of each voxel block (default: 0.5m) */
    voxelSize?: number;
    /** Minimum trunk height in blocks (default: 6) */
    minTrunkHeight?: number;
    /** Maximum trunk height in blocks (default: 10) */
    maxTrunkHeight?: number;
    /** Number of layers of leaves (default: 4) */
    leavesLayers?: number;
}

/**
 * Configuration for voxel rock generation.
 */
export interface VoxelRockConfig {
    /** Size of each voxel block (default: 0.5m) */
    voxelSize?: number;
    /** Minimum width in blocks (default: 2) */
    minWidth?: number;
    /** Maximum width in blocks (default: 4) */
    maxWidth?: number;
    /** Minimum height in blocks (default: 1) */
    minHeight?: number;
    /** Maximum height in blocks (default: 3) */
    maxHeight?: number;
}

/**
 * Create a voxel-based tree using VoxelObject with texture atlas.
 * See BlockType in VoxelTextureAtlas.ts for available types. For custom colors, use BlockType.COLOR with RGB hex.
 */
export function createVoxelTree(
    rng: SeededRandom,
    config?: VoxelTreeConfig
): VoxelObject {
    const voxelSize = config?.voxelSize ?? 0.5;
    const minTrunkHeight = config?.minTrunkHeight ?? 6;
    const maxTrunkHeight = config?.maxTrunkHeight ?? 10;
    const leavesLayers = config?.leavesLayers ?? 4;
    
    const voxelTree = new VoxelObject({
        voxelSize,
        useAtlas: true,
        shadows: true
    });
    voxelTree.name = 'VoxelTree';
    
    // Random trunk height
    const trunkHeight = minTrunkHeight + Math.floor(rng.next() * (maxTrunkHeight - minTrunkHeight + 1));
    
    // Create trunk (single column of TRUNK blocks)
    const trunkBlockId = getBlockIdByName('trunk');
    const leavesBlockId = getBlockIdByName('leaves');
    for (let y = 0; y < trunkHeight; y++) {
        voxelTree.setVoxel(0, y, 0, trunkBlockId);
    }
    
    // Create leaves in layers above and around the trunk top
    const leavesStartY = trunkHeight - 2;
    
    for (let layer = 0; layer < leavesLayers; layer++) {
        const y = leavesStartY + layer;
        const isTopLayer = layer === leavesLayers - 1;
        const isBottomLayer = layer === 0;
        
        // Determine radius based on layer position
        let radius: number;
        if (isTopLayer) {
            radius = 1; // Small top
        } else if (isBottomLayer) {
            radius = 2; // Medium bottom
        } else {
            radius = 3; // Large middle layers
        }
        
        // Fill a roughly circular area with leaves
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                // Skip the trunk position for lower layers
                if (dx === 0 && dz === 0 && layer < 2) continue;
                
                // Circular shape (roughly)
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist <= radius + 0.5) {
                    // Add some randomness to edges
                    if (dist > radius - 0.5 && rng.next() > 0.6) continue;
                    
                    voxelTree.setVoxel(dx, y, dz, leavesBlockId);
                }
            }
        }
    }
    
    voxelTree.finalize();
    return voxelTree;
}

/**
 * Create a voxel-based rock using VoxelObject with texture atlas.
 * Rocks use STONE texture with irregular shapes.
 */
export function createVoxelRock(
    rng: SeededRandom,
    config?: VoxelRockConfig
): VoxelObject {
    const voxelSize = config?.voxelSize ?? 0.5;
    const minWidth = config?.minWidth ?? 2;
    const maxWidth = config?.maxWidth ?? 4;
    const minHeight = config?.minHeight ?? 1;
    const maxHeight = config?.maxHeight ?? 3;
    
    const voxelRock = new VoxelObject({
        voxelSize,
        useAtlas: true,
        shadows: true
    });
    voxelRock.name = 'VoxelRock';
    
    // Random dimensions
    const width = minWidth + Math.floor(rng.next() * (maxWidth - minWidth + 1));
    const depth = minWidth + Math.floor(rng.next() * (maxWidth - minWidth + 1));
    const height = minHeight + Math.floor(rng.next() * (maxHeight - minHeight + 1));
    
    // Create irregular rock shape
    const halfW = Math.floor(width / 2);
    const halfD = Math.floor(depth / 2);
    const stoneBlockId = getBlockIdByName('stone');
    
    for (let y = 0; y < height; y++) {
        // Taper slightly at top
        const yRatio = y / height;
        const layerScale = 1 - (yRatio * 0.3);
        const effectiveHalfW = Math.ceil(halfW * layerScale);
        const effectiveHalfD = Math.ceil(halfD * layerScale);
        
        for (let dx = -effectiveHalfW; dx <= effectiveHalfW; dx++) {
            for (let dz = -effectiveHalfD; dz <= effectiveHalfD; dz++) {
                // Add some randomness for natural look
                if (Math.abs(dx) === effectiveHalfW || Math.abs(dz) === effectiveHalfD) {
                    if (rng.next() > 0.7) continue; // Skip some edge blocks
                }
                
                voxelRock.setVoxel(dx, y, dz, stoneBlockId);
            }
        }
    }
    
    voxelRock.finalize();
    return voxelRock;
}

// ============================================================================
// REGISTRATION HELPERS
// ============================================================================

/**
 * Snap a position to the center of a terrain voxel.
 * @param pos Position to snap
 * @param terrainVoxelSize Size of terrain voxels
 */
function snapToTerrainVoxelCenter(pos: number, terrainVoxelSize: number): number {
    return Math.floor(pos / terrainVoxelSize) * terrainVoxelSize + terrainVoxelSize / 2;
}

/**
 * Pending VoxelObjects that need physics bodies created.
 * These are collected during scenery generation and processed afterward.
 */
const pendingVoxelObjectPhysics: Array<{ obj: VoxelObject; parent: THREE.Object3D }> = [];

/**
 * Add a VoxelObject to the pending physics list.
 */
export function addPendingVoxelObjectPhysics(voxelObject: VoxelObject, parent?: THREE.Object3D): void {
    pendingVoxelObjectPhysics.push({ obj: voxelObject, parent: parent ?? voxelObject.parent ?? new THREE.Object3D() });
}

/**
 * Create physics bodies for all pending VoxelObjects.
 * Call this after scenery generation when physics world is ready.
 * @param physicsWorld The Rapier physics world
 */
export function createPendingVoxelObjectPhysics(physicsWorld: PhysicsWorld): void {
    console.log(`[EnvironmentObjects] Creating physics for ${pendingVoxelObjectPhysics.length} voxel objects`);
    for (const { obj, parent } of pendingVoxelObjectPhysics) {
        obj.createPhysicsBody(physicsWorld);
        enableStructuralCollapse(obj, physicsWorld, parent);
    }
    // Clear the pending list
    pendingVoxelObjectPhysics.length = 0;
}

/** Options shared by the voxel tree and rock registrars. */
interface VoxelObjectTypeOptions {
    proceduralCount?: number;
    getTerrainHeight: (x: number, z: number) => number; // REQUIRED - must query actual voxel terrain
    terrainVoxelSize?: number;
}

/**
 * Register a VoxelObject-based environment type. Each instance is added to the
 * world on its own (no instancing), snapped to a terrain voxel centre, and
 * queued for physics, which is created after scenery generation via
 * createPendingVoxelObjectPhysics.
 */
function registerVoxelObjectType(
    system: EnvironmentObjectSystem,
    spec: {
        typeName: string;
        create: () => VoxelObject;
        canPlace: (terrainProps: TerrainTypeProperties) => boolean;
        defaultProceduralCount: number;
        clearRadius: number;
        clearSize: number;
    },
    options: VoxelObjectTypeOptions
): void {
    const getTerrainHeight = options.getTerrainHeight;
    const terrainVoxelSize = options.terrainVoxelSize ?? 1.0;

    // Height of the terrain voxel under (x, z), sampled at its centre
    const snappedPosition = (x: number, z: number): { x: number; y: number; z: number } => {
        const snappedX = snapToTerrainVoxelCenter(x, terrainVoxelSize);
        const snappedZ = snapToTerrainVoxelCenter(z, terrainVoxelSize);
        return { x: snappedX, y: getTerrainHeight(snappedX, snappedZ), z: snappedZ };
    };

    system.registerEnvironmentObjectType({
        typeName: spec.typeName,
        factory: () => {
            const voxelObject = spec.create();
            // Return a compatible data structure
            return {
                cubes: [],
                mergedGeometry: new THREE.BufferGeometry(), // Placeholder
                mesh: voxelObject,
                voxelObject
            };
        },
        canPlace: (x: number, z: number, terrainHeightProvider: TerrainHeightProvider, terrainRegistry: TerrainTypeRegistry) => {
            const terrainProps = terrainRegistry.getType(terrainHeightProvider.getTerrainTypeAt(x, z));
            return terrainProps ? spec.canPlace(terrainProps) : false;
        },
        proceduralCount: options.proceduralCount ?? spec.defaultProceduralCount,
        createInstancedMesh: (instances, instancedMesh, _instanceData, world) => {
            const resultInstances: EnvironmentObjectData[] = [];

            for (const instance of instances) {
                if (!instance.data.voxelObject) continue;

                const voxelObject = instance.data.voxelObject as VoxelObject;
                const { x, y, z } = snappedPosition(instance.x, instance.z);
                voxelObject.position.set(x, y, z);
                if (instance.rotation) {
                    voxelObject.rotation.y = instance.rotation;
                }
                world.add(voxelObject);

                // Physics will be created after scenery generation
                addPendingVoxelObjectPhysics(voxelObject, world);

                resultInstances.push({
                    ...instance.data,
                    instanceId: resultInstances.length
                });
            }

            // No instancing for VoxelObjects - the incoming instancedMesh is passed through
            return { instancedMesh: instancedMesh!, instanceData: resultInstances };
        },
        createPhysics: () => {
            // Physics is created after scenery generation via createPendingVoxelObjectPhysics
        },
        getPlacementY: (instance, _terrainHeightProvider, groundOffset) =>
            snappedPosition(instance.x, instance.z).y + groundOffset,
        getClearRadius: () => spec.clearRadius,
        getClearSize: () => ({ width: spec.clearSize, depth: spec.clearSize })
    });
}

/**
 * Register voxel tree type with the environment object system.
 * Uses VoxelObject for blocky aesthetic.
 *
 * @param system - The EnvironmentObjectSystem instance
 * @param options - Configuration options (getTerrainHeight is REQUIRED for voxel terrain)
 */
export function registerVoxelTreeType(
    system: EnvironmentObjectSystem,
    options: VoxelObjectTypeOptions & { treeConfig?: VoxelTreeConfig }
): void {
    registerVoxelObjectType(system, {
        typeName: 'voxelTree',
        create: () => createVoxelTree(system.getRng(), options.treeConfig),
        canPlace: terrainProps => terrainProps.canPlaceTrees ?? false,
        defaultProceduralCount: 20,
        clearRadius: 1.5,
        clearSize: 3
    }, options);
}

/**
 * Register voxel rock type with the environment object system.
 * Uses VoxelObject for blocky aesthetic.
 *
 * @param system - The EnvironmentObjectSystem instance
 * @param options - Configuration options (getTerrainHeight is REQUIRED for voxel terrain)
 */
export function registerVoxelRockType(
    system: EnvironmentObjectSystem,
    options: VoxelObjectTypeOptions & { rockConfig?: VoxelRockConfig }
): void {
    registerVoxelObjectType(system, {
        typeName: 'voxelRock',
        create: () => createVoxelRock(system.getRng(), options.rockConfig),
        canPlace: terrainProps => terrainProps.canPlaceRocks ?? false,
        defaultProceduralCount: 10,
        clearRadius: 1.0,
        clearSize: 2
    }, options);
}
