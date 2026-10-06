import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface HandLook { skin: number; sleeve: number }
/** Joint angles in radians. Curl bends every finger joint toward the palm. */
export interface HandPose {
    curl: number; thumb: number; spread?: number;
    /** Wrist extension (+ bends the forearm toward the back of the hand) and pinky-side deviation. */
    wrist?: number; deviation?: number;
}

// Right hand at rest: wrist at the origin, fingers along -Z, palm facing -Y,
// thumb toward -X and forearm along +Z. The left hand mirrors X.
const FINGERS = [
    { x: -.028, z: -.088, r: .0088, lengths: [.040, .025, .020], splay: -.10 },
    { x: -.0095, z: -.092, r: .0090, lengths: [.044, .028, .021], splay: -.02 },
    { x: .0095, z: -.090, r: .0085, lengths: [.041, .027, .020], splay: .05 },
    { x: .027, z: -.083, r: .0074, lengths: [.033, .020, .018], splay: .13 },
] as const;
// Distal joints bend less than the knuckles in a natural grip.
const CURL_SHARE = [1, 1.15, .75];

/** A posable first-person hand in the frame described below. */
export interface HandModel {
    readonly root: THREE.Object3D;
    readonly pose: HandPose;
    setPose(pose: HandPose): void;
    dispose(): void;
}

/** A rounded, jointed first-person hand and forearm with a traveler-colored sleeve. */
export class FirstPersonHand implements HandModel {
    readonly root = new THREE.Group();
    pose: HandPose = { curl: .25, thumb: .2 };
    private readonly skin = new THREE.MeshStandardMaterial({ color: 0xe0b68a, roughness: .62 });
    private readonly nail = new THREE.MeshStandardMaterial({ color: 0xf0d0bc, roughness: .35 });
    private readonly sleeve = new THREE.MeshStandardMaterial({ color: 0x254963, roughness: .85 });
    private readonly geometries: THREE.BufferGeometry[] = [];
    private readonly fingers: THREE.Object3D[][] = [];
    private readonly thumb: THREE.Object3D[] = [];
    private readonly forearm = new THREE.Group();
    private readonly sleeveParts: THREE.Mesh[] = [];
    private readonly mirror: number;

    constructor(side: 'left' | 'right') {
        this.mirror = side === 'left' ? -1 : 1;
        this.root.name = `First-person ${side} hand`;
        const m = this.mirror;

        const palmGeometry = this.keep(new RoundedBoxGeometry(.080, .028, .094, 4, .0135));
        // Narrow the heel of the palm toward the wrist and dome the back of the hand.
        const position = palmGeometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i), y = position.getY(i);
            const t = THREE.MathUtils.clamp((position.getZ(i) + .047) / .094, 0, 1);
            position.setX(i, x * THREE.MathUtils.lerp(.98, .78, t));
            position.setY(i, y + (y > 0 ? .008 : .002) * (1 - (x / .04) ** 2));
        }
        palmGeometry.computeVertexNormals();
        this.mesh(palmGeometry, this.skin, this.root, [0, 0, -.047]);
        // Thenar pad under the thumb and the fleshy outer edge of the palm.
        const bulge = this.keep(new THREE.SphereGeometry(1, 16, 12));
        this.mesh(bulge, this.skin, this.root, [-.019 * m, -.007, -.026], [.021, .013, .032]);
        this.mesh(bulge, this.skin, this.root, [.022 * m, -.006, -.034], [.015, .011, .034]);

        for (const finger of FINGERS) {
            // Knuckle bump on the back of the hand.
            this.mesh(bulge, this.skin, this.root, [finger.x * m, .0085, finger.z + .006], [finger.r * 1.15, finger.r * .8, finger.r * 1.2]);
            const chain: THREE.Object3D[] = [];
            let parent: THREE.Object3D = this.root;
            let at = new THREE.Vector3(finger.x * m, .002, finger.z);
            finger.lengths.forEach((length, i) => {
                const joint = new THREE.Group();
                joint.position.copy(at);
                parent.add(joint);
                const radius = finger.r * (1 - i * .08);
                this.mesh(this.capsule(radius, length), this.skin, joint);
                if (i === finger.lengths.length - 1) {
                    const nail = this.mesh(this.keep(new RoundedBoxGeometry(radius * 1.45, .002, length * .6, 2, .0009)),
                        this.nail, joint, [0, radius * .78, -length * .55]);
                    nail.rotation.x = -.05;
                }
                chain.push(joint);
                parent = joint;
                at = new THREE.Vector3(0, 0, -length);
            });
            this.fingers.push(chain);
        }

        // Thumb: a metacarpal hinged at the heel of the palm, then two phalanges.
        let thumbParent: THREE.Object3D = this.root;
        [[.036, .0118], [.030, .0108], [.026, .0098]].forEach(([length, radius], i) => {
            const joint = new THREE.Group();
            if (i === 0) joint.position.set(-.024 * m, -.006, -.012);
            else joint.position.set(0, 0, -[.036, .030][i - 1]!);
            thumbParent.add(joint);
            this.mesh(this.capsule(radius!, length!), this.skin, joint);
            if (i === 2) this.mesh(this.keep(new RoundedBoxGeometry(radius! * 1.4, .002, length! * .5, 2, .0009)),
                this.nail, joint, [0, radius! * .8, -length! * .58]);
            this.thumb.push(joint);
            thumbParent = joint;
        });

        // Forearm, tapered from wrist to elbow and flattened like a real one;
        // a rounded wrist blends it into the heel of the palm.
        this.root.add(this.forearm);
        this.mesh(bulge, this.skin, this.forearm, [0, -.001, .004], [.031, .019, .032]);
        const arm = this.keep(new THREE.CylinderGeometry(.021, .034, .34, 20, 1));
        arm.rotateX(Math.PI / 2).translate(0, 0, .17);
        this.mesh(arm, this.skin, this.forearm, [0, -.002, .012], [1.3, .82, 1]);
        const cuffArm = this.keep(new THREE.CylinderGeometry(.030, .039, .30, 20, 1));
        cuffArm.rotateX(Math.PI / 2).translate(0, 0, .15);
        this.sleeveParts.push(this.mesh(cuffArm, this.sleeve, this.forearm, [0, -.002, .045], [1.25, .88, 1]));
        const cuff = this.keep(new THREE.TorusGeometry(.0295, .0055, 8, 24));
        this.sleeveParts.push(this.mesh(cuff, this.sleeve, this.forearm, [0, -.002, .047], [1.25, .88, 1]));
        this.setPose({ curl: .25, thumb: .2 });
    }

    setLook(look: HandLook): void {
        this.skin.color.setHex(look.skin);
        this.nail.color.setHex(look.skin).lerp(new THREE.Color(0xffe4dc), .22);
        this.sleeve.color.setHex(look.sleeve);
        // A sleeve in skin color means bare forearms (short sleeves).
        for (const part of this.sleeveParts) part.visible = look.sleeve !== look.skin;
    }

    setPose(pose: HandPose): void {
        this.pose = pose;
        const m = this.mirror, spread = pose.spread ?? .1;
        this.fingers.forEach((chain, f) => chain.forEach((joint, i) => {
            joint.rotation.set(-pose.curl * CURL_SHARE[i]!, i === 0 ? -FINGERS[f]!.splay * spread * 6 * m : 0, 0);
        }));
        // Thumb swings from beside the index finger across toward the palm.
        const [base, middle, tip] = this.thumb;
        base!.rotation.set(-.35 - pose.thumb * .45, (.45 - pose.thumb * .3) * m, (.45 + pose.thumb * .45) * m, 'YXZ');
        middle!.rotation.set(-pose.thumb * .55, 0, 0);
        tip!.rotation.set(-pose.thumb * .7, 0, 0);
        this.forearm.rotation.set(pose.wrist ?? 0, (pose.deviation ?? 0) * m, 0);
    }

    dispose(): void {
        this.root.removeFromParent();
        for (const geometry of this.geometries) geometry.dispose();
        this.skin.dispose(); this.nail.dispose(); this.sleeve.dispose();
    }

    private capsule(radius: number, length: number): THREE.BufferGeometry {
        const geometry = this.keep(new THREE.CapsuleGeometry(radius, Math.max(.001, length - radius), 4, 10));
        return geometry.rotateX(-Math.PI / 2).translate(0, 0, -length / 2);
    }

    private keep<T extends THREE.BufferGeometry>(geometry: T): T {
        this.geometries.push(geometry);
        return geometry;
    }

    private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D,
        at: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...at); mesh.scale.set(...scale);
        mesh.castShadow = true; mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }
}
