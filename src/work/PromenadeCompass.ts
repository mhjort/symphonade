import * as THREE from 'three';

/** Flat painted compass rose opposite Information, with timber visible in the gaps. */
export function createPromenadeCompass(): THREE.Group {
    const rose = new THREE.Group();
    rose.name = 'Promenade compass painting';
    // Timber boards top out at .032 m. A 2 mm separation prevents coplanar flicker.
    rose.position.set(0, .034, 18);
    const cream = new THREE.MeshStandardMaterial({ color: 0xcac5a6, roughness: .82,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const charcoal = new THREE.MeshStandardMaterial({ color: 0x454846, roughness: .85,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.receiveShadow = true;
        rose.add(mesh);
    };
    add('Ivory compass border', new THREE.RingGeometry(2.13, 2.4, 128).rotateX(-Math.PI / 2), cream);
    add('Fine inner border', new THREE.RingGeometry(2.04, 2.065, 128).rotateX(-Math.PI / 2), charcoal);

    // Eight split points: long cardinal arms and shorter diagonal arms.
    for (let point = 0; point < 8; point++) {
        const angle = point * Math.PI / 4;
        const radius = point % 2 === 0 ? 2.14 : 1.65;
        const width = point % 2 === 0 ? .36 : .25;
        const tip = new THREE.Vector2(Math.sin(angle) * radius, Math.cos(angle) * radius);
        // Keep each shoulder within its 45-degree sector so adjacent paint faces never overlap.
        const neck = new THREE.Vector2(Math.sin(angle) * .9, Math.cos(angle) * .9);
        const side = new THREE.Vector2(Math.cos(angle) * width, -Math.sin(angle) * width);
        for (const sign of [-1, 1]) {
            const shoulder = neck.clone().addScaledVector(side, sign);
            // Winding faces up on the XZ floor plane.
            const vertices: [THREE.Vector2, THREE.Vector2] = sign === 1 ? [tip, shoulder] : [shoulder, tip];
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute([
                0, 0, 0, vertices[0].x, 0, vertices[0].y, vertices[1].x, 0, vertices[1].y,
            ], 3));
            geometry.computeVertexNormals();
            add(`Compass point ${point + 1} ${sign === 1 ? 'ivory' : 'charcoal'}`,
                geometry, sign === 1 ? cream : charcoal);
        }
    }
    const centre = new THREE.CircleGeometry(.38, 64).rotateX(-Math.PI / 2);
    centre.translate(0, .001, 0);
    add('Charcoal compass centre', centre, charcoal);
    return rose;
}
