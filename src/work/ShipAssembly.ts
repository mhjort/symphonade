import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { EngineLike } from 'types/game.js';
import { getAssetUrlById } from 'types/game.js';
import { MeshLevel, DEFAULT_MESH_LEVEL_OPTIONS, applyMaterialConventions } from 'engine/meshlevel/MeshLevel.js';
import manifest from './ship-modules.json';
import shipLevel from './serenade.mesh-level.json';
import cabinPlacements from './deck8-cabins.json';
import { createPromenadeCompass } from './PromenadeCompass.js';
import { repairFloorSeams } from './FloorSeams.js';

function texturesIn(root: THREE.Object3D): Set<THREE.Texture> {
    const textures = new Set<THREE.Texture>();
    root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            for (const value of Object.values(material)) {
                if (value instanceof THREE.Texture) textures.add(value);
            }
        }
    });
    return textures;
}

/** Release a downloaded venue that never became part of the level. */
function release(root: THREE.Object3D): void {
    root.removeFromParent();
    for (const texture of texturesIn(root)) texture.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
}

/** The authored blue corridor slab overlaps the oak cabin slabs at y=3.4.
 * Trim its two long edges to the oak boundaries; raising either surface would
 * hide the symptom while retaining overlapping faces. Physics remains level. */
function trimCabinFloorOverlap(root: THREE.Object3D): void {
    root.updateWorldMatrix(true, true);
    const point = new THREE.Vector3(), instance = new THREE.Matrix4();
    root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || object.material.name !== 'navy') return;
        const matrix = object.matrixWorld.clone();
        if (object instanceof THREE.InstancedMesh) { object.getMatrixAt(0, instance); matrix.multiply(instance); }
        const inverse = matrix.clone().invert();
        const positions = object.geometry.getAttribute('position');
        let changed = false;
        for (let index = 0; index < positions.count; index++) {
            point.fromBufferAttribute(positions, index).applyMatrix4(matrix);
            // Exact corner bounds of the corridor floor in the exported assembly.
            const edge = Math.abs(point.x - 9.8) < .001 ? 10.075
                : Math.abs(point.x - 12.2) < .001 ? 11.925 : null;
            if (edge === null || ![3.15, 3.4].some(y => Math.abs(point.y - y) < .001) ||
                ![-12.05, 30.045].some(z => Math.abs(point.z - z) < .001)) continue;
            point.x = edge; point.applyMatrix4(inverse);
            positions.setXYZ(index, point.x, point.y, point.z); changed = true;
        }
        if (changed) {
            positions.needsUpdate = true;
            object.geometry.computeBoundingBox(); object.geometry.computeBoundingSphere();
            if (object instanceof THREE.InstancedMesh) { object.computeBoundingBox(); object.computeBoundingSphere(); }
        }
    });
}

/** Modular visual assets, with one owner for physics, room queries and lighting. */
export class ShipAssembly extends MeshLevel {
    private started = false;
    private cancelled = false;
    private assemblyRoot: THREE.Group | null = null;
    private exteriorMeshes: THREE.Mesh[] = [];
    private exteriorVisible = true;
    private readonly cameraPosition = new THREE.Vector3();
    private readonly interiorViews = shipLevel.volumes
        .filter(room => room.name !== 'Boarding gangway')
        .map(room => new THREE.Box3(
            new THREE.Vector3(...room.position).addScaledVector(new THREE.Vector3(...room.size), -.5),
            new THREE.Vector3(...room.position).addScaledVector(new THREE.Vector3(...room.size), .5),
        ));

    constructor(private readonly shipEngine: EngineLike) {
        super(shipEngine, { glb: { assetId: manifest.base.assetId }, level: { data: { ...shipLevel,
                // Animated promenade lamps are owned by PromenadeLighting.
                lights: shipLevel.lights.filter(light => !light.name.startsWith('Atrium light')),
            } } },
            DEFAULT_MESH_LEVEL_OPTIONS);
    }

    override async load() {
        if (this.started || this.cancelled) throw new Error('[ShipAssembly] Create a new assembly to load again');
        this.started = true;
        const staged: THREE.Group[] = [];
        try {
            const gameData = this.shipEngine.getGameData?.() ?? null;
            // Resolve everything before creating physics or changing global lighting.
            const venues = manifest.venues.map(module => {
                const url = getAssetUrlById(gameData, module.assetId);
                if (!url) throw new Error(`Missing module "${module.name}" (asset ${module.assetId})`);
                return { ...module, url };
            });
            const cabins = ['promenade', 'sea'].map(template => {
                const assetId = `cabin-${template}`;
                const url = getAssetUrlById(gameData, assetId);
                if (!url) throw new Error(`Missing cabin template ${assetId}`);
                return { template, url };
            });
            const result = await super.load().catch(error => {
                throw new Error(`Module "${manifest.base.name}" (${manifest.base.assetId}) failed: ${String(error)}`);
            });
            this.assemblyRoot = this.getRoot();
            if (this.cancelled) throw new Error('Loading cancelled');
            this.assemblyRoot.name = 'Ship assembly';
            trimCabinFloorOverlap(this.assemblyRoot);
            this.assemblyRoot.traverse(object => {
                if (!(object instanceof THREE.Mesh)) return;
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                if (materials.every(material => material.name.startsWith('Exterior sided '))) {
                    this.exteriorMeshes.push(object);
                }
            });
            const loader = new GLTFLoader();
            // Settle every request before cleanup: a late success must not leak a scene.
            const downloads = await Promise.allSettled([...venues.map(async module => {
                try {
                    const gltf = await loader.loadAsync(module.url);
                    staged.push(gltf.scene);
                    gltf.scene.name = `Ship module: ${module.name}`;
                    applyMaterialConventions(gltf.scene);
                    return gltf.scene;
                } catch (error) {
                    throw new Error(`Module "${module.name}" (${module.assetId}) failed: ${String(error)}`);
                }
            }), ...cabins.map(async ({ template, url }) => {
                const gltf = await loader.loadAsync(url);
                // Stage the source first so a construction failure also releases it.
                staged.push(gltf.scene);
                applyMaterialConventions(gltf.scene);
                repairFloorSeams(gltf.scene);
                gltf.scene.updateMatrixWorld(true);
                const placements = cabinPlacements.filter(cabin => cabin.template === template);
                const instances = new THREE.Group();
                instances.name = `Cabin instances: ${template}`;
                gltf.scene.traverse(object => {
                    if (!(object instanceof THREE.Mesh)) return;
                    const mesh = new THREE.InstancedMesh(object.geometry, object.material, placements.length);
                    mesh.name = `${template}: ${object.name}`;
                    mesh.castShadow = object.castShadow;
                    mesh.receiveShadow = true;
                    placements.forEach((cabin, index) => {
                        const matrix = new THREE.Matrix4().makeTranslation(0, 0, cabin.z - 14);
                        mesh.setMatrixAt(index, matrix.multiply(object.matrixWorld));
                    });
                    mesh.instanceMatrix.needsUpdate = true;
                    mesh.computeBoundingSphere();
                    instances.add(mesh);
                });
                // Geometry/materials now belong to the instanced group.
                staged.splice(staged.indexOf(gltf.scene), 1, instances);
                return instances;
            })]);
            for (const download of downloads) if (download.status === 'rejected') throw download.reason;
            if (this.cancelled) throw new Error('Loading cancelled');
            for (const root of staged) this.assemblyRoot.add(root);
            repairFloorSeams(this.assemblyRoot);
            this.assemblyRoot.add(createPromenadeCompass());
            staged.length = 0;
            this.assemblyRoot.updateMatrixWorld(true);
            this.refreshShadows();
            console.log(`[ShipAssembly] Ready: base + ${venues.length} venues; ${result.colliderCount} shared colliders`);
            return result;
        } catch (error) {
            for (const root of staged) release(root);
            this.dispose();
            throw new Error(`[ShipAssembly] ${String(error)}`);
        }
    }

    /** The display-model shell surrounds rooms authored at different deck offsets.
     * Cull it for cameras inside passenger rooms instead of cutting window cones
     * through the hull. Outside cameras still see the complete original ship.
     */
    updateExteriorVisibility(camera: THREE.Camera): void {
        if (!this.assemblyRoot) return;
        camera.getWorldPosition(this.cameraPosition);
        this.assemblyRoot.worldToLocal(this.cameraPosition);
        const visible = !this.interiorViews.some(room => room.containsPoint(this.cameraPosition));
        if (visible === this.exteriorVisible) return;
        this.exteriorVisible = visible;
        for (const mesh of this.exteriorMeshes) mesh.visible = visible;
    }

    override dispose(): void {
        this.cancelled = true;
        let root = this.assemblyRoot;
        if (!root) {
            // A base load can fail after downloading its art but before returning.
            try { root = this.getRoot(); } catch { /* No base scene was loaded. */ }
        }
        if (root) {
            // MeshLevel owns geometry/material disposal, including attached venues.
            for (const texture of texturesIn(root)) texture.dispose();
            root.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
        }
        this.assemblyRoot = null;
        this.exteriorMeshes.length = 0;
        super.dispose();
    }
}
