import * as THREE from 'three';

type Vertex = { point: THREE.Vector3; values: number[][] };
const epsilon = .00001;

/** Keep one side of a line, carrying the original vertex attributes through cuts. */
function half(polygon: Vertex[], a: THREE.Vector3, b: THREE.Vector3, sign: number): Vertex[] {
    const distance = (p: THREE.Vector3) => sign * ((b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x));
    const result: Vertex[] = [];
    for (let i=0; i<polygon.length; i++) {
        const v=polygon[i]!, w=polygon[(i+1)%polygon.length]!;
        const dv=distance(v.point), dw=distance(w.point);
        if (dv>=0) result.push(v);
        if ((dv>0 && dw<0)||(dv<0 && dw>0)) {
            const t=dv/(dv-dw);
            result.push({point:v.point.clone().lerp(w.point,t), values:v.values.map((values,j)=>values.map((n,k)=>n+(w.values[j]![k]!-n)*t))});
        }
    }
    return result;
}
function subtract(polygon: Vertex[], cover: THREE.Vector3[]): Vertex[][] {
    if (['x','z'].some(axis => {
        const key=axis as 'x'|'z';
        return Math.max(...polygon.map(v=>v.point[key])) <= Math.min(...cover.map(v=>v[key]))+epsilon ||
            Math.min(...polygon.map(v=>v.point[key])) >= Math.max(...cover.map(v=>v[key]))-epsilon;
    })) return [polygon];
    const result: Vertex[][]=[];
    let inside=polygon;
    // Upward triangles have clockwise winding in the XZ plane.
    for(let i=0;i<3;i++) {
        const a=cover[i]!, b=cover[(i+1)%3]!;
        const outside=half(inside,a,b,1);
        if(outside.length>=3) result.push(outside);
        inside=half(inside,a,b,-1);
        if(inside.length<3) break;
    }
    return result;
}

/** Repair the existing exported slabs without changing collision or raising thresholds.
 * Larger triangles own shared top surfaces. Covers come from the actual exported
 * triangles, preserving cutouts made by earlier Blender repairs. Downward faces on a walk plane are hidden wall/trim bottoms, not floors.
 * Call on cabin templates before instancing, in their authored coordinate frame.
 */
export function repairFloorSeams(root: THREE.Object3D): void {
    root.updateWorldMatrix(true, true);
    const meshes: THREE.Mesh[]=[];
    root.traverse(object=>{if(object instanceof THREE.Mesh && !Array.isArray(object.material) &&
        !object.material.name.startsWith('Exterior sided ') && !(object instanceof THREE.InstancedMesh && object.count!==1)) meshes.push(object);});
    const covers: {mesh:THREE.Mesh; offset:number; points:THREE.Vector3[]; area:number}[]=[];
    const matrixFor=(mesh:THREE.Mesh)=>{
        const matrix=mesh.matrixWorld.clone();
        if(mesh instanceof THREE.InstancedMesh){const instance=new THREE.Matrix4();mesh.getMatrixAt(0,instance);matrix.multiply(instance);}
        return matrix;
    };
    for(const mesh of meshes){
        const geometry:THREE.BufferGeometry=mesh.geometry, position=geometry.getAttribute('position'), matrix=matrixFor(mesh);
        for(let offset=0;offset<(geometry.index?.count??position.count);offset+=3){
            const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(position,geometry.index?geometry.index.getX(offset+j):offset+j).applyMatrix4(matrix));
            if(![0,3.4].some(y=>points.every(p=>Math.abs(p.y-y)<.001)) || !points.every(p=>Math.abs(p.y-points[0]!.y)<epsilon))continue;
            const area=new THREE.Vector3().subVectors(points[1]!,points[0]!).cross(new THREE.Vector3().subVectors(points[2]!,points[0]!)).y;
            if(area>epsilon && !(!Array.isArray(mesh.material) && mesh.material.name==='cabin_white'))covers.push({mesh,offset,points,area});
        }
    }
    covers.sort((a,b)=>b.area-a.area);
    const rank=new Map(covers.map((c,i)=>[`${c.mesh.uuid}:${c.offset}`,i]));
    meshes.forEach(object => {
        if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) ||
            object.material.name.startsWith('Exterior sided ')) return;
        const matrix = object.matrixWorld.clone();
        if (object instanceof THREE.InstancedMesh) {
            if (object.count !== 1) throw new Error('Repair cabin geometry before instancing');
            const instance = new THREE.Matrix4(); object.getMatrixAt(0, instance); matrix.multiply(instance);
        }
        const source: THREE.BufferGeometry = object.geometry;
        const entries = Object.entries(source.attributes);
        const position = source.getAttribute('position');
        const count = source.index?.count ?? position.count;
        const output: number[][] = entries.map(() => []);
        let changed = false;
        for (let offset = 0; offset < count; offset += 3) {
            const vertices: Vertex[] = [0, 1, 2].map(j => {
                const index = source.index ? source.index.getX(offset + j) : offset + j;
                return { point: new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(matrix),
                    values: entries.map(([, attr]) => Array.from({ length: attr.itemSize }, (_, k) => attr.getComponent(index, k))) };
            });
            let polygons = [vertices];
            const y = vertices[0]!.point.y;
            if ([0, 3.4].some(deck => Math.abs(y - deck) < .001) && vertices.every(v => Math.abs(v.point.y - y) < epsilon)) {
                const normal = new THREE.Vector3().subVectors(vertices[1]!.point, vertices[0]!.point)
                    .cross(new THREE.Vector3().subVectors(vertices[2]!.point, vertices[0]!.point));
                // Cut cabin walls have some reversed bottom faces; their white material
                // is wall cladding, never a walking surface. Exclude either winding.
                if (object.material.name === 'cabin_white' || normal.y < -epsilon) { polygons = []; changed = true; }
                else if (normal.y > epsilon) {
                    const owner=rank.get(`${object.uuid}:${offset}`)!;
                    for (const cover of covers.slice(0,owner)) {
                        if(Math.abs(cover.points[0]!.y-y)>.001)continue;
                        const next=polygons.flatMap(p=>subtract(p,cover.points));
                        if(next.length!==polygons.length || next.some((p,i)=>p!==polygons[i]))changed=true;
                        polygons=next;
                        if(!polygons.length)break;
                    }
                }
            }
            for (const polygon of polygons) for (let j = 1; j < polygon.length - 1; j++) {
                for (const vertex of [polygon[0]!, polygon[j]!, polygon[j + 1]!]) {
                    vertex.values.forEach((values, i) => output[i]!.push(...values));
                }
            }
        }
        if (!changed) return;
        const geometry = new THREE.BufferGeometry();
        entries.forEach(([name, attr], i) => geometry.setAttribute(name, new THREE.Float32BufferAttribute(output[i]!, attr.itemSize)));
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        object.geometry = geometry;
        source.dispose();
        if (object instanceof THREE.InstancedMesh) { object.computeBoundingBox(); object.computeBoundingSphere(); }
    });
}
