import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { reflector } from 'three/tsl';
import { isWebGpuActive } from 'engine/RendererType.js';
import placements from './deck8-cabins.json';

const REFLECTION_LAYER = 29;
const PAINTING_RAISE = .7;
const cabinMirrors = [{ template: 'promenade', z: 14 }, { template: 'sea', z: 14 }, ...placements];

/** The exported rooms batch fixtures by material. Raise the two authored prints
 * above the mirror, retaining their frames and artwork. Their measured face bounds
 * exclude the adjacent TV and mirror. Template edits cover every cabin instance. */
function raisePaintings(ship: THREE.Object3D): void {
    ship.updateWorldMatrix(true, true);
    const point = new THREE.Vector3();
    const instance = new THREE.Matrix4();
    ship.traverse(object => {
        if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) ||
            !['navy', 'linen', 'blue'].includes(object.material.name)) return;
        const matrix = object.matrixWorld.clone();
        if (object instanceof THREE.InstancedMesh) {
            object.getMatrixAt(0, instance);
            matrix.multiply(instance);
        }
        const inverse = matrix.clone().invert();
        const positions = object.geometry.getAttribute('position');
        let changed = false;
        for (let index = 0; index < positions.count; index++) {
            point.fromBufferAttribute(positions, index).applyMatrix4(matrix);
            const cabin = cabinMirrors.find(c =>
                (c.template === 'sea' ? [14.1, 15] : [6.9, 7.8]).some(x => Math.abs(point.x - x) <= .336) &&
                point.y >= 5.169 && point.y <= 5.831 &&
                point.z >= c.z - 1.388 && point.z <= c.z - 1.339);
            if (!cabin) continue;
            point.y += PAINTING_RAISE;
            point.applyMatrix4(inverse);
            positions.setXYZ(index, point.x, point.y, point.z);
            changed = true;
        }
        if (changed) {
            positions.needsUpdate = true;
            object.geometry.computeBoundingBox(); object.geometry.computeBoundingSphere();
            if (object instanceof THREE.InstancedMesh) { object.computeBoundingBox(); object.computeBoundingSphere(); }
        }
    });
}

function createSurface() {
    const geometry = new THREE.PlaneGeometry(.53, .97);
    if (isWebGpuActive()) {
        const reflection = reflector({ resolutionScale: .65, bounces: false, samples: 0 });
        const material = new MeshBasicNodeMaterial();
        material.colorNode = reflection;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.add(reflection.target);
        return { mesh, camera: (camera: THREE.Camera) => reflection.reflector.getVirtualCamera(camera),
            dispose: () => { reflection.dispose(); material.dispose(); geometry.dispose(); } };
    }
    const mesh = new Reflector(geometry, { textureWidth: 768, textureHeight: 768,
        color: new THREE.Color(.5, .5, .5), clipBias: .003, multisample: 0 });
    return { mesh, camera: (camera: THREE.Camera) => mesh.getReflectionCamera(camera),
        dispose: () => { mesh.dispose(); geometry.dispose(); } };
}

/** One nearby planar mirror renders the room and a reflection-only copy of the player's rig.
 * The main first-person visibility policy is never changed. Shared avatar assets stay owned
 * by the player loader; only the copied skeleton and mirror targets are owned here. */
export class CabinMirrors {
    private readonly surfaces: ReturnType<typeof createSurface>[] = [];
    private avatar: THREE.Object3D | null = null;
    private pairs: [THREE.Object3D, THREE.Object3D][] = [];
    private readonly eye = new THREE.Vector3();
    private readonly localEye = new THREE.Vector3();
    private source: THREE.Object3D | null = null;

    constructor(private readonly ship: THREE.Object3D, private readonly scene: THREE.Scene) {
        // The authored prints overlap the mirror. Separate them before adding the live surface.
        raisePaintings(ship);
        for (const cabin of cabinMirrors) {
            const surface = createSurface();
            surface.mesh.name = `Cabin mirror ${cabin.template} ${cabin.z}`;
            surface.mesh.position.set(cabin.template === 'sea' ? 14 : 8, 5.12, cabin.z - 1.324);
            surface.mesh.visible = false;
            this.ship.add(surface.mesh);
            this.surfaces.push(surface);
        }
    }

    setAvatar(source: THREE.Object3D): void {
        this.releaseAvatar();
        this.source = source;
        this.avatar = clone(source);
        this.avatar.name = 'Traveler mirror reflection';
        const originals: THREE.Object3D[] = [], copies: THREE.Object3D[] = [];
        source.traverse(object => originals.push(object));
        this.avatar.traverse(object => {
            copies.push(object);
            object.layers.set(REFLECTION_LAYER);
            object.visible = true;
            if (object instanceof THREE.Mesh) { object.castShadow = false; object.frustumCulled = false; }
        });
        this.pairs = originals.map((object, index) => [object, copies[index]!]);
        this.avatar.matrixAutoUpdate = false;
        this.avatar.visible = false;
        this.scene.add(this.avatar);
    }

    update(camera: THREE.Camera): void {
        camera.getWorldPosition(this.eye);
        this.localEye.copy(this.eye); this.ship.worldToLocal(this.localEye);
        let active: ReturnType<typeof createSurface> | undefined;
        if (this.avatar) {
            active = this.surfaces.find(({ mesh }) =>
                Math.abs(this.localEye.x - mesh.position.x) < 2 &&
                Math.abs(this.localEye.y - mesh.position.y) < 1.7 &&
                this.localEye.z > mesh.position.z + .04 && this.localEye.z < mesh.position.z + 2.8);
        }
        for (const surface of this.surfaces) surface.mesh.visible = surface === active;
        if (!this.avatar || !this.source) return;
        this.avatar.visible = !!active;
        if (!active) return;
        const reflectionCamera = active.camera(camera);
        reflectionCamera.layers.mask = camera.layers.mask;
        reflectionCamera.layers.enable(REFLECTION_LAYER);
        this.source.updateWorldMatrix(true, true);
        for (const [source, copy] of this.pairs) {
            copy.position.copy(source.position); copy.quaternion.copy(source.quaternion); copy.scale.copy(source.scale);
        }
        this.avatar.matrix.copy(this.source.matrixWorld);
        this.avatar.updateMatrixWorld(true);
    }

    private releaseAvatar(): void {
        this.avatar?.removeFromParent();
        const skeletons = new Set<THREE.Skeleton>();
        this.avatar?.traverse(object => { if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton); });
        for (const skeleton of skeletons) skeleton.dispose();
        this.avatar = null; this.source = null; this.pairs = [];
    }

    dispose(): void {
        this.releaseAvatar();
        for (const surface of this.surfaces) { surface.mesh.removeFromParent(); surface.dispose(); }
        this.surfaces.length = 0;
    }
}
