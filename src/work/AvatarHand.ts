import * as THREE from 'three';
import type { HandModel, HandPose } from './FirstPersonHand.js';

const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'] as const;
// Index splays toward the thumb, pinky away from it (radians per unit spread).
const SPLAY = [.6, .12, -.3, -.78];
const CURL_SHARE = [1, 1.15, .75];
const THUMB_SHARE = [.5, .6, .7];
// Wrist to middle knuckle, matching the procedural hand the grips were tuned for.
// (Caricature fingers vary too much in length to scale by.)
const PALM_LENGTH = .092;

interface Joint { bone: THREE.Bone; rest: THREE.Quaternion; flex: THREE.Vector3; share: number; spread?: THREE.Vector3; splay?: number }

/**
 * The traveler's own forearm, hand and fingers cut from their skinned avatar,
 * re-rooted at the forearm and posed in the same frame as {@link FirstPersonHand}:
 * wrist at the origin, fingers along -Z, palm facing -Y, forearm along +Z.
 */
export class AvatarHand implements HandModel {
    readonly root = new THREE.Group();
    pose: HandPose = { curl: .25, thumb: .2 };
    private readonly align = new THREE.Group();
    private readonly fingers: Joint[] = [];
    private readonly thumb: Joint[] = [];
    private readonly meshes: THREE.SkinnedMesh[] = [];
    private readonly handRest = new THREE.Quaternion();
    private readonly toCanonical = new THREE.Matrix4();
    private readonly canonicalInLocal = new THREE.Quaternion();
    private readonly handBone: THREE.Bone;
    private readonly forearmBind: THREE.Matrix4;
    private readonly mirror: number;

    /** Null when the avatar has no rigged forearm and fingers for that side. */
    static fromAvatar(avatar: THREE.Object3D, side: 'left' | 'right'): AvatarHand | null {
        let source: THREE.SkinnedMesh | null = null;
        const prefix = side === 'left' ? 'Left' : 'Right';
        avatar.traverse(object => {
            const mesh = object as THREE.SkinnedMesh;
            if (!source && mesh.isSkinnedMesh
                && mesh.skeleton.bones.some(bone => bone.name.endsWith(`${prefix}HandMiddle3`))) source = mesh;
        });
        return source ? new AvatarHand(source, side) : null;
    }

    private constructor(source: THREE.SkinnedMesh, side: 'left' | 'right') {
        this.mirror = side === 'left' ? -1 : 1;
        this.root.name = `First-person ${side} avatar hand`;
        const prefix = side === 'left' ? 'Left' : 'Right';
        const sourceBones = source.skeleton.bones;
        const find = (suffix: string) => sourceBones.findIndex(bone => bone.name.endsWith(prefix + suffix));
        const forearm = find('ForeArm'), hand = find('Hand');
        // Bind-pose world matrices in skeleton space.
        const bind = source.skeleton.boneInverses.map(inverse => inverse.clone().invert());

        // The forearm subtree becomes the new skeleton; everything else is welded to the forearm.
        const chain: number[] = [];
        const collect = (index: number) => {
            chain.push(index);
            for (const child of sourceBones[index]!.children) {
                const i = sourceBones.indexOf(child as THREE.Bone);
                if (i >= 0) collect(i);
            }
        };
        collect(forearm);
        const remap = new Map(chain.map((source, i) => [source, i]));
        const bones = chain.map(i => {
            const bone = new THREE.Bone();
            bone.name = sourceBones[i]!.name;
            return bone;
        });
        chain.forEach((sourceIndex, i) => {
            const parent = sourceBones[sourceIndex]!.parent as THREE.Bone;
            const parentIndex = remap.get(sourceBones.indexOf(parent));
            const local = parentIndex === undefined ? bind[sourceIndex]!.clone()
                : bind[chain[parentIndex]!]!.clone().invert().multiply(bind[sourceIndex]!);
            local.decompose(bones[i]!.position, bones[i]!.quaternion, bones[i]!.scale);
            (parentIndex === undefined ? this.align : bones[parentIndex]!).add(bones[i]!);
        });
        this.root.add(this.align);
        this.align.matrixAutoUpdate = false;
        this.handBone = bones[remap.get(hand)!]!;
        this.handRest.copy(this.handBone.quaternion);
        this.forearmBind = bind[forearm]!.clone();
        const skeleton = new THREE.Skeleton(bones, chain.map(i => source.skeleton.boneInverses[i]!.clone()));

        // Positions in the hand bone's bind frame define the canonical hand frame.
        const handInverse = bind[hand]!.clone().invert();
        const at = (suffix: string) => new THREE.Vector3().setFromMatrixPosition(handInverse.clone().multiply(bind[find(suffix)]!));
        const middle = [at('HandMiddle1'), at('HandMiddle2'), at('HandMiddle3')];
        const z = middle[0]!.clone().normalize().negate();
        // Auto-rigged knuckle bones can bunch up, so take the palm plane from the skin itself.
        const handBones = sourceBones.flatMap((bone, i) => bone.name.includes(`${prefix}Hand`) && !bone.name.includes('Thumb') ? [i] : []);
        const y = AvatarHand.backOfHand(source, handInverse, handBones, z, at('HandThumb3'));
        const x = new THREE.Vector3().crossVectors(y, z).normalize();
        const basis = new THREE.Matrix4().makeBasis(x, y, z);
        this.canonicalInLocal.setFromRotationMatrix(basis);
        const scale = PALM_LENGTH / middle[0]!.length();
        this.toCanonical.makeScale(scale, scale, scale).multiply(basis.clone().transpose());

        // Express a canonical-frame axis in a bone's bind-local frame.
        const localAxis = (suffix: string, canonical: THREE.Vector3) => {
            const rotation = new THREE.Quaternion();
            handInverse.clone().multiply(bind[find(suffix)]!).decompose(new THREE.Vector3(), rotation, new THREE.Vector3());
            return canonical.clone().applyQuaternion(this.canonicalInLocal).applyQuaternion(rotation.invert()).normalize();
        };
        const joint = (suffix: string, flex: THREE.Vector3, share: number): Joint => {
            const bone = bones[remap.get(find(suffix))!]!;
            return { bone, rest: bone.quaternion.clone(), flex: localAxis(suffix, flex), share };
        };
        const xAxis = new THREE.Vector3(1, 0, 0), yAxis = new THREE.Vector3(0, 1, 0);
        FINGERS.forEach((finger, f) => [1, 2, 3].forEach(n => {
            const j = joint(`Hand${finger}${n}`, xAxis, CURL_SHARE[n - 1]!);
            if (n === 1) { j.spread = localAxis(`Hand${finger}1`, yAxis); j.splay = SPLAY[f]! * this.mirror; }
            this.fingers.push(j);
        }));
        // The thumb folds toward the palm and across it to the pinky side.
        const thumbPoints = [at('HandThumb1'), at('HandThumb2'), at('HandThumb3')];
        const fold = new THREE.Vector3(.6 * this.mirror, -1, 0).normalize();
        [1, 2, 3].forEach(n => {
            const from = thumbPoints[Math.min(n, 2) - 1]!, to = thumbPoints[Math.min(n, 2)]!;
            const direction = to.clone().sub(from).applyQuaternion(this.canonicalInLocal.clone().invert()).normalize();
            const axis = new THREE.Vector3().crossVectors(direction, fold).normalize();
            this.thumb.push(joint(`HandThumb${n}`, axis, THUMB_SHARE[n - 1]!));
        });

        // Copy only the triangles that belong to the forearm and hand into a compact geometry.
        const geometry = source.geometry;
        const sourceIndex = geometry.index;
        const skinIndex = geometry.attributes.skinIndex as THREE.BufferAttribute;
        const skinWeight = geometry.attributes.skinWeight as THREE.BufferAttribute;
        const vertexCount = geometry.attributes.position!.count;
        const onChain = new Float32Array(vertexCount);
        for (let v = 0; v < vertexCount; v++)
            for (let k = 0; k < 4; k++) if (remap.has(skinIndex.getComponent(v, k))) onChain[v]! += skinWeight.getComponent(v, k);
        // Keep the lower third of the upper-arm sleeve too, welded straight onto the forearm,
        // so the cut edge stays out of view when the forearm points at the camera.
        const upperArm = find('Arm');
        const elbow = new THREE.Vector3().setFromMatrixPosition(bind[forearm]!);
        const towardShoulder = new THREE.Vector3().setFromMatrixPosition(bind[upperArm]!).sub(elbow);
        const point = new THREE.Vector3();
        const keep = (v: number) => {
            if (onChain[v]! > .5) return true;
            let heaviest = 0;
            for (let k = 1; k < 4; k++) if (skinWeight.getComponent(v, k) > skinWeight.getComponent(v, heaviest)) heaviest = k;
            if (skinIndex.getComponent(v, heaviest) !== upperArm) return false;
            point.fromBufferAttribute(geometry.attributes.position as THREE.BufferAttribute, v).applyMatrix4(source.bindMatrix).sub(elbow);
            return point.dot(towardShoulder) < .35 * towardShoulder.lengthSq();
        };
        const triangles = sourceIndex ? sourceIndex.count : vertexCount;
        const used = new Map<number, number>();
        const indices: number[] = [];
        for (let t = 0; t < triangles; t += 3) {
            const corners = [0, 1, 2].map(c => sourceIndex ? sourceIndex.getX(t + c) : t + c);
            if (!corners.every(keep)) continue;
            for (const v of corners) {
                if (!used.has(v)) used.set(v, used.size);
                indices.push(used.get(v)!);
            }
        }
        const subset = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv'] as const) {
            const attribute = geometry.attributes[name] as THREE.BufferAttribute | undefined;
            if (!attribute) continue;
            const array = new Float32Array(used.size * attribute.itemSize);
            for (const [v, i] of used) for (let k = 0; k < attribute.itemSize; k++) array[i * attribute.itemSize + k] = attribute.getComponent(v, k);
            subset.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize));
        }
        // Weight on bones outside the forearm (the upper arm) welds to the forearm root.
        const indexArray = new Uint16Array(used.size * 4), weightArray = new Float32Array(used.size * 4);
        for (const [v, i] of used) for (let k = 0; k < 4; k++) {
            indexArray[i * 4 + k] = remap.get(skinIndex.getComponent(v, k)) ?? 0;
            weightArray[i * 4 + k] = skinWeight.getComponent(v, k);
        }
        subset.setAttribute('skinIndex', new THREE.BufferAttribute(indexArray, 4));
        subset.setAttribute('skinWeight', new THREE.BufferAttribute(weightArray, 4));
        subset.setIndex(indices);

        const materials = (Array.isArray(source.material) ? source.material : [source.material]).map(material => {
            const copy = material.clone();
            // The cut elbow is open; render its inside rather than a see-through hole.
            copy.side = THREE.DoubleSide;
            return copy;
        });
        const mesh = new THREE.SkinnedMesh(subset, materials[0]);
        mesh.name = 'First-person avatar forearm';
        mesh.frustumCulled = false;
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.bind(skeleton, source.bindMatrix.clone());
        this.root.add(mesh);
        this.meshes.push(mesh);
        this.setPose(this.pose);
    }

    /**
     * The back-of-hand direction (in the hand bone's bind frame): the flattest axis of the
     * hand's vertices across the finger direction, turned away from the side the thumb hangs on.
     */
    private static backOfHand(source: THREE.SkinnedMesh, handInverse: THREE.Matrix4, handBones: number[],
        fingers: THREE.Vector3, thumbTip: THREE.Vector3): THREE.Vector3 {
        const position = source.geometry.attributes.position as THREE.BufferAttribute;
        const skinIndex = source.geometry.attributes.skinIndex as THREE.BufferAttribute;
        const skinWeight = source.geometry.attributes.skinWeight as THREE.BufferAttribute;
        const toHand = handInverse.clone().multiply(source.bindMatrix);
        const e1 = new THREE.Vector3(1, 0, 0);
        if (Math.abs(e1.dot(fingers)) > .9) e1.set(0, 1, 0);
        e1.sub(fingers.clone().multiplyScalar(e1.dot(fingers))).normalize();
        const e2 = new THREE.Vector3().crossVectors(fingers, e1);
        const points: THREE.Vector3[] = [];
        for (let v = 0; v < position.count; v++) {
            let heaviest = 0;
            for (let k = 1; k < 4; k++) if (skinWeight.getComponent(v, k) > skinWeight.getComponent(v, heaviest)) heaviest = k;
            if (handBones.includes(skinIndex.getComponent(v, heaviest))) points.push(new THREE.Vector3().fromBufferAttribute(position, v).applyMatrix4(toHand));
        }
        const centre = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(Math.max(1, points.length));
        let xx = 0, yy = 0, xy = 0;
        for (const p of points) {
            const a = p.clone().sub(centre).dot(e1), b = p.clone().sub(centre).dot(e2);
            xx += a * a; yy += b * b; xy += a * b;
        }
        // Widest direction across the fingers; the palm normal is perpendicular to it.
        const angle = .5 * Math.atan2(2 * xy, xx - yy);
        const across = e1.clone().multiplyScalar(Math.cos(angle)).addScaledVector(e2, Math.sin(angle));
        const normal = new THREE.Vector3().crossVectors(fingers, across).normalize();
        return thumbTip.clone().sub(centre).dot(normal) > 0 ? normal.negate() : normal;
    }

    setPose(pose: HandPose): void {
        this.pose = pose;
        const curl = new THREE.Quaternion(), spread = new THREE.Quaternion();
        for (const joint of this.fingers) {
            joint.bone.quaternion.copy(joint.rest);
            if (joint.spread) joint.bone.quaternion.multiply(spread.setFromAxisAngle(joint.spread, joint.splay! * (pose.spread ?? .1)));
            joint.bone.quaternion.multiply(curl.setFromAxisAngle(joint.flex, -pose.curl * joint.share));
        }
        for (const joint of this.thumb)
            joint.bone.quaternion.copy(joint.rest).multiply(curl.setFromAxisAngle(joint.flex, pose.thumb * joint.share));
        // Bend the wrist by turning the hand against the forearm, then re-anchor the hand at the origin.
        const wrist = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.wrist ?? 0, (pose.deviation ?? 0) * this.mirror, 0)).invert();
        this.handBone.quaternion.copy(this.handRest).multiply(
            this.canonicalInLocal.clone().multiply(wrist).multiply(this.canonicalInLocal.clone().invert()));
        this.handBone.updateMatrix();
        // The forearm bone's local matrix is its bind matrix, so this lands the hand bone on toCanonical.
        this.align.matrix.copy(this.toCanonical).multiply(this.forearmBind.clone().multiply(this.handBone.matrix).invert());
        this.align.matrixWorldNeedsUpdate = true;
    }

    dispose(): void {
        this.root.removeFromParent();
        for (const mesh of this.meshes) {
            mesh.geometry.dispose();
            mesh.skeleton.dispose();
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
        }
    }
}
