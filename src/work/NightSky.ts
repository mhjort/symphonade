import * as THREE from 'three';
import type { EngineLike } from 'types/game.js';
import { DEPART_FINNISH_MINUTE } from './VoyageClock.js';

/** Finnish clock minutes (may exceed 24h) for an early-October Baltic night. */
const SUNSET = 18 * 60 + 40;
const SUNRISE = 24 * 60 + 8 * 60 + 30; // 07:30 Swedish time
/** Degrees per hour the sun climbs or sinks near the horizon at 60°N in October. */
const SUN_RATE = 7.2;
const DOME_RADIUS = 900;

const deg = THREE.MathUtils.degToRad;
const hex = (value: number) => new THREE.Color(value);

/** Sky palette by sun elevation (degrees), from deep night to full afternoon. */
const PALETTE = [
    { elevation: -18, zenith: hex(0x01030a), horizon: hex(0x081226), glow: hex(0x000000) },
    { elevation: -11, zenith: hex(0x050b24), horizon: hex(0x18264a), glow: hex(0x1a1430) },
    { elevation: -6, zenith: hex(0x121c4a), horizon: hex(0x4a3f6e), glow: hex(0x8a3f52) },
    { elevation: -2, zenith: hex(0x223a78), horizon: hex(0xb0627a), glow: hex(0xff6a3a) },
    { elevation: 1, zenith: hex(0x2e5296), horizon: hex(0xf08a5a), glow: hex(0xffa050) },
    { elevation: 5, zenith: hex(0x3a68b0), horizon: hex(0xe8b890), glow: hex(0xffc070) },
    { elevation: 12, zenith: hex(0x3f78c8), horizon: hex(0xaecbe2), glow: hex(0xfff0d0) },
];

/** Outdoor scenery brightness and tint by sun elevation. */
const SCENERY = [
    { elevation: -14, light: 0.13, tint: hex(0x7088c8) },
    { elevation: -6, light: 0.3, tint: hex(0x9080b8) },
    { elevation: 0, light: 0.65, tint: hex(0xffb08a) },
    { elevation: 6, light: 0.9, tint: hex(0xffe0c0) },
    { elevation: 12, light: 1, tint: hex(0xffffff) },
];

/** Low cloud banks (degrees from the bow toward port), bunched where the sun sets and rises. */
const CLOUD_BANKS = [
    { fromBow: 28, elevation: 4, width: 260, height: 34 }, { fromBow: 52, elevation: 7.5, width: 200, height: 26 },
    { fromBow: 72, elevation: 3, width: 300, height: 30 }, { fromBow: 118, elevation: 5, width: 240, height: 32 },
    { fromBow: 146, elevation: 8, width: 190, height: 24 }, { fromBow: 168, elevation: 3.5, width: 280, height: 30 },
    { fromBow: -10, elevation: 9, width: 180, height: 22 }, { fromBow: -48, elevation: 4.5, width: 270, height: 32 },
    { fromBow: -95, elevation: 6, width: 230, height: 28 }, { fromBow: -140, elevation: 3, width: 300, height: 34 },
    { fromBow: -178, elevation: 7, width: 210, height: 26 },
];
const DAY_CLOUD = hex(0xeef1f6);
const NIGHT_CLOUD = hex(0x121828);

const OUTDOOR_MATERIAL = /^(ocean_|island_)/;
/** Window panes are lit by the room lamps; at night that tint would veil the dark sky. Door glass stays. */
const WINDOW_GLASS = /glass/i;
const INTERIOR_GLASS = /^door_glass/;

function samplePalette<T extends { elevation: number }>(table: T[], elevation: number): [T, T, number] {
    const first = table[0]!;
    if (elevation <= first.elevation) return [first, first, 0];
    for (let i = 1; i < table.length; i++) {
        const a = table[i - 1]!, b = table[i]!;
        if (elevation <= b.elevation) {
            return [a, b, THREE.MathUtils.smoothstep(elevation, a.elevation, b.elevation)];
        }
    }
    const last = table[table.length - 1]!;
    return [last, last, 0];
}

/** Elevation in degrees of the sun at a Finnish clock minute. */
export function sunElevationAt(finnishMinute: number): number {
    const midnight = (SUNSET + SUNRISE) / 2;
    const hours = finnishMinute < midnight ? (SUNSET - finnishMinute) / 60 : (finnishMinute - SUNRISE) / 60;
    return Math.max(-40, hours * SUN_RATE);
}

/** Bow is +Z, port is −X. `fromBow` turns toward port. */
function skyDirection(fromBowDeg: number, elevationDeg: number, target: THREE.Vector3): THREE.Vector3 {
    const a = deg(fromBowDeg), e = deg(elevationDeg);
    return target.set(-Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}

function discTexture(draw: (c: CanvasRenderingContext2D, size: number) => void, size = 128): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d')!, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** Billboard quad facing the dome centre at `direction`. */
function placeOnDome(mesh: THREE.Object3D, direction: THREE.Vector3, radius: number): void {
    mesh.position.copy(direction).multiplyScalar(radius);
    mesh.lookAt(0, 0, 0);
}

/**
 * Outside daylight tied to the ship clock: a procedural sky dome, sun and moon,
 * stars, a glitter path on the sea, and the sea/skerry materials and fog dimmed
 * to match. Interiors keep their own lamps; only what is seen through glass changes.
 */
export class NightSky {
    private readonly root = new THREE.Group();
    private readonly dome: THREE.Mesh;
    private readonly domeColors: THREE.BufferAttribute;
    private readonly domeDirections: THREE.Vector3[] = [];
    private readonly stars: THREE.Mesh;
    private readonly sun: THREE.Mesh;
    private readonly moon: THREE.Mesh;
    private readonly moonHalo: THREE.Mesh;
    private readonly glitter: THREE.Mesh;
    private readonly clouds: { mesh: THREE.Mesh; direction: THREE.Vector3 }[] = [];
    private readonly cloudColor = new THREE.Color();
    private readonly disposables: { dispose(): void }[] = [];
    // The daytime environment map would otherwise keep reflecting off the sea and glass at night.
    private readonly scenery: { material: THREE.MeshStandardMaterial; color: THREE.Color; emissive: THREE.Color; env: number }[] = [];
    private readonly windows: { material: THREE.MeshStandardMaterial; color: THREE.Color; env: number }[] = [];
    private readonly sunDirection = new THREE.Vector3();
    private readonly moonDirection = new THREE.Vector3();
    private readonly zenith = new THREE.Color();
    private readonly horizon = new THREE.Color();
    private readonly glow = new THREE.Color();
    private readonly tint = new THREE.Color();
    private readonly scratch = new THREE.Color();
    private readonly cameraPosition = new THREE.Vector3();
    private hiddenSkybox: THREE.Object3D | null = null;
    private appliedMinute = -1;

    constructor(private readonly engine: EngineLike) {
        const scene = engine.scene;
        if (!scene) throw new Error('[NightSky] needs engine.scene');
        this.root.name = 'Voyage sky';

        const domeGeometry = new THREE.SphereGeometry(DOME_RADIUS, 48, 24);
        const positions = domeGeometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
            this.domeDirections.push(new THREE.Vector3().fromBufferAttribute(positions, i).normalize());
        }
        this.domeColors = new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
        domeGeometry.setAttribute('color', this.domeColors);
        const domeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide,
            depthWrite: false, fog: false });
        this.dome = new THREE.Mesh(domeGeometry, domeMaterial);
        this.dome.name = 'Voyage sky dome';
        this.dome.renderOrder = -10;
        this.disposables.push(domeGeometry, domeMaterial);

        this.stars = this.createStars();
        this.sun = this.createDisc('Sun', 46, discTexture((c, s) => {
            const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            g.addColorStop(0, 'rgba(255,250,235,1)');
            g.addColorStop(0.32, 'rgba(255,235,190,1)');
            g.addColorStop(0.4, 'rgba(255,190,120,0.55)');
            g.addColorStop(1, 'rgba(255,140,60,0)');
            c.fillStyle = g; c.fillRect(0, 0, s, s);
        }));
        this.moonHalo = this.createDisc('Moon halo', 90, discTexture((c, s) => {
            const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            g.addColorStop(0, 'rgba(200,215,255,0.5)');
            g.addColorStop(0.25, 'rgba(160,180,240,0.18)');
            g.addColorStop(1, 'rgba(120,140,220,0)');
            c.fillStyle = g; c.fillRect(0, 0, s, s);
        }));
        this.moon = this.createDisc('Moon', 22, discTexture((c, s) => {
            const r = s * 0.46;
            c.fillStyle = '#eef0f6';
            c.beginPath(); c.arc(s / 2, s / 2, r, 0, Math.PI * 2); c.fill();
            c.fillStyle = 'rgba(150,160,185,0.45)';
            for (const [x, y, size] of [[.38, .4, .12], [.6, .33, .08], [.55, .62, .14], [.36, .66, .07], [.68, .52, .06]] as const) {
                c.beginPath(); c.arc(s * x, s * y, s * size, 0, Math.PI * 2); c.fill();
            }
        }, 256));
        (this.moonHalo.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
        (this.sun.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;

        // A bright path on the water under the low sun or the moon.
        const glitterTexture = discTexture((c, s) => {
            for (let y = 0; y < s; y++) {
                const along = y / s;
                for (let i = 0; i < 18; i++) {
                    const spread = 0.08 + 0.42 * along;
                    const x = s / 2 + (Math.random() - 0.5) * s * spread * 2;
                    const a = (1 - along) * 0.25 + Math.random() * 0.35 * (1 - along * 0.6);
                    c.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
                    c.fillRect(x, y, 1 + Math.random() * 3, 1);
                }
            }
        }, 256);
        const glitterGeometry = new THREE.PlaneGeometry(1, 1);
        glitterGeometry.rotateX(-Math.PI / 2);
        glitterGeometry.translate(0, 0, 0.5);
        const glitterMaterial = new THREE.MeshBasicMaterial({ map: glitterTexture, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 });
        this.glitter = new THREE.Mesh(glitterGeometry, glitterMaterial);
        this.glitter.name = 'Sea glitter path';
        this.glitter.scale.set(160, 1, 700);
        this.disposables.push(glitterTexture, glitterGeometry, glitterMaterial);

        this.createClouds();
        for (const object of [this.dome, this.stars, this.sun, this.moonHalo, this.moon, ...this.clouds.map(c => c.mesh)]) {
            object.frustumCulled = false;
            this.root.add(object);
        }
        this.glitter.frustumCulled = false;
        scene.add(this.root, this.glitter);
    }

    /** Collect the sea and skerry materials once the ship model is in the scene. */
    attachScenery(): void {
        this.scenery.length = 0;
        this.windows.length = 0;
        const seen = new Set<THREE.Material>();
        this.engine.scene?.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (seen.has(material) || !(material instanceof THREE.MeshStandardMaterial)) continue;
                if (WINDOW_GLASS.test(material.name) && !INTERIOR_GLASS.test(material.name)) {
                    seen.add(material);
                    this.windows.push({ material, color: material.color.clone(), env: material.envMapIntensity });
                }
                if (!OUTDOOR_MATERIAL.test(material.name)) continue;
                seen.add(material);
                this.scenery.push({ material, color: material.color.clone(), emissive: material.emissive.clone(),
                    env: material.envMapIntensity });
            }
        });
        if (this.scenery.length === 0) throw new Error('[NightSky] no ocean_/island_ materials in the ship model');
        this.appliedMinute = -1;
    }

    update(elapsedShipMinutes: number): void {
        const camera = this.engine.camera;
        if (camera) {
            camera.getWorldPosition(this.cameraPosition);
            this.root.position.copy(this.cameraPosition);
        }
        // The engine skybox loads async and may be recreated; keep ours in charge.
        const skybox = this.engine.scene?.getObjectByName('Skybox') ?? null;
        if (skybox && skybox.visible) { skybox.visible = false; this.hiddenSkybox = skybox; }

        const minute = Math.round(elapsedShipMinutes * 4) / 4;
        if (minute !== this.appliedMinute) {
            this.appliedMinute = minute;
            this.applyTime(DEPART_FINNISH_MINUTE + minute);
        }
        this.placeGlitter();
    }

    private applyTime(finnishMinute: number): void {
        const elevation = sunElevationAt(finnishMinute);
        // Sunset ahead on the port bow, sunrise astern to port; the moon rides to starboard.
        const night = THREE.MathUtils.clamp((finnishMinute - SUNSET) / (SUNRISE - SUNSET), 0, 1);
        const sunFromBow = finnishMinute < SUNSET
            ? THREE.MathUtils.mapLinear(finnishMinute, DEPART_FINNISH_MINUTE, SUNSET, 60, 45)
            : finnishMinute > SUNRISE ? 135 - (finnishMinute - SUNRISE) / 10 : 45 + night * 90;
        skyDirection(sunFromBow, elevation, this.sunDirection);
        const moonElevation = 6 + Math.sin(night * Math.PI) * 26;
        skyDirection(-60 - night * 50, moonElevation, this.moonDirection);

        const [a, b, t] = samplePalette(PALETTE, elevation);
        this.zenith.lerpColors(a.zenith, b.zenith, t);
        this.horizon.lerpColors(a.horizon, b.horizon, t);
        this.glow.lerpColors(a.glow, b.glow, t);
        const darkness = 1 - THREE.MathUtils.smoothstep(elevation, -12, -3);
        const glowStrength = 1 - THREE.MathUtils.smoothstep(Math.abs(elevation - 1), 0, 14);

        const colors = this.domeColors.array as Float32Array;
        this.domeDirections.forEach((dir, i) => {
            const up = Math.max(0, dir.y);
            const toward = Math.max(0, dir.dot(this.sunDirection));
            this.scratch.lerpColors(this.horizon, this.zenith, Math.pow(up, 0.45));
            // The horizon opposite the sun stays cooler.
            this.scratch.lerp(this.zenith, (1 - toward) * 0.35 * glowStrength * (1 - up));
            this.scratch.lerp(this.glow, glowStrength * (Math.pow(toward, 6) * 0.85 + Math.pow(toward, 40) * 0.6)
                * (1 - up * 0.7));
            const moonlit = Math.pow(Math.max(0, dir.dot(this.moonDirection)), 24) * 0.12 * darkness;
            colors[i * 3] = this.scratch.r + moonlit * 0.6;
            colors[i * 3 + 1] = this.scratch.g + moonlit * 0.7;
            colors[i * 3 + 2] = this.scratch.b + moonlit;
        });
        this.domeColors.needsUpdate = true;

        placeOnDome(this.sun, this.sunDirection, DOME_RADIUS * 0.9);
        this.sun.visible = elevation > -2;
        (this.sun.material as THREE.MeshBasicMaterial).color.lerpColors(hex(0xff7a3a), hex(0xfff2dc),
            THREE.MathUtils.smoothstep(elevation, 0, 10));
        placeOnDome(this.moon, this.moonDirection, DOME_RADIUS * 0.85);
        placeOnDome(this.moonHalo, this.moonDirection, DOME_RADIUS * 0.86);
        this.moon.visible = this.moonHalo.visible = darkness > 0.01;
        (this.moon.material as THREE.MeshBasicMaterial).opacity = darkness;
        (this.moonHalo.material as THREE.MeshBasicMaterial).opacity = darkness;
        (this.stars.material as THREE.MeshBasicMaterial).opacity = darkness;
        this.stars.visible = darkness > 0.01;

        // Clouds take the sky's colour: white by day, sunset-lit toward the sun, dark silhouettes at night.
        this.scratch.lerpColors(this.horizon, this.glow, 0.6);
        const dim = 1 - THREE.MathUtils.smoothstep(elevation, -9, 4);
        for (const { mesh, direction } of this.clouds) {
            const toward = 0.5 + 0.5 * direction.dot(this.sunDirection);
            const material = mesh.material as THREE.MeshBasicMaterial;
            this.cloudColor.lerpColors(DAY_CLOUD, NIGHT_CLOUD, dim)
                .lerp(this.scratch, glowStrength * 0.85 * (1 - darkness))
                .lerp(this.glow, glowStrength * Math.pow(toward, 3) * (1 - darkness));
            material.color.copy(this.cloudColor);
            material.opacity = THREE.MathUtils.lerp(0.92, 0.75, darkness);
        }

        const fog = this.engine.scene?.fog;
        if (fog) fog.color.copy(this.horizon);
        const background = this.engine.scene?.background;
        if (background instanceof THREE.Color) background.copy(this.horizon);

        const [sa, sb, st] = samplePalette(SCENERY, elevation);
        const light = THREE.MathUtils.lerp(sa.light, sb.light, st);
        this.tint.lerpColors(sa.tint, sb.tint, st).multiplyScalar(light);
        for (const { material, color, emissive, env } of this.scenery) {
            material.color.copy(color).multiply(this.tint);
            material.emissive.copy(emissive).multiply(this.tint);
            material.envMapIntensity = env * light * light;
        }
        // Lamp-lit panes in front of a black sky read as fog; keep only a faint sheen.
        const pane = 0.03 + 0.97 * light * light;
        for (const { material, color, env } of this.windows) {
            material.color.copy(color).multiplyScalar(pane);
            material.envMapIntensity = env * pane;
        }

        // Glitter follows whichever light is low over the water.
        const sunGlitter = elevation > -1 && elevation < 14 ? 1 - THREE.MathUtils.smoothstep(elevation, 4, 14) : 0;
        const source = sunGlitter > 0 ? this.sunDirection : this.moonDirection;
        const material = this.glitter.material as THREE.MeshBasicMaterial;
        material.opacity = sunGlitter > 0 ? sunGlitter * 0.8 : darkness * 0.35;
        material.color.copy(sunGlitter > 0 ? this.glow : hex(0xb8c8ff));
        this.glitter.rotation.y = Math.atan2(source.x, source.z);
        this.glitter.visible = material.opacity > 0.01;
    }

    private placeGlitter(): void {
        // Wavelets sit a few centimetres above the sea plane at y = −15.5.
        this.glitter.position.set(this.cameraPosition.x, -15.42, this.cameraPosition.z);
    }

    private createClouds(): void {
        const random = mulberry32(5150);
        const textures = [0, 1, 2].map(() => discTexture(c => {
            c.canvas.width = 512; c.canvas.height = 128;
            for (let i = 0; i < 46; i++) {
                const along = random();
                const x = 40 + along * 432, edge = Math.sin(along * Math.PI);
                const y = 70 - random() * 26 * edge, rx = 24 + random() * 54 * edge, ry = 10 + random() * 20 * edge;
                const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
                g.addColorStop(0, 'rgba(255,255,255,0.55)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                c.save(); c.translate(x, y); c.scale(rx, ry);
                c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill();
                c.restore();
            }
            // Shade the flat undersides.
            c.globalCompositeOperation = 'source-atop';
            const shade = c.createLinearGradient(0, 30, 0, 100);
            shade.addColorStop(0, 'rgba(255,255,255,0)');
            shade.addColorStop(1, 'rgba(120,125,140,0.6)');
            c.fillStyle = shade; c.fillRect(0, 0, 512, 128);
        }));
        this.disposables.push(...textures);
        const geometry = new THREE.PlaneGeometry(1, 1);
        this.disposables.push(geometry);
        CLOUD_BANKS.forEach((bank, index) => {
            const material = new THREE.MeshBasicMaterial({ map: textures[index % textures.length]!, transparent: true,
                depthWrite: false, fog: false });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `Cloud bank ${index + 1}`;
            mesh.renderOrder = -8;
            const direction = skyDirection(bank.fromBow, bank.elevation, new THREE.Vector3());
            placeOnDome(mesh, direction, DOME_RADIUS * 0.8);
            mesh.scale.set(bank.width * 1.6, bank.height * 4, 1);
            this.disposables.push(material);
            this.clouds.push({ mesh, direction });
        });
    }

    private createDisc(name: string, size: number, texture: THREE.Texture): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, fog: false });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.renderOrder = -9;
        this.disposables.push(geometry, material, texture);
        return mesh;
    }

    private createStars(): THREE.Mesh {
        const random = mulberry32(19900909);
        const count = 1400;
        const positions = new Float32Array(count * 4 * 3);
        const uvs = new Float32Array(count * 4 * 2);
        const colors = new Float32Array(count * 4 * 3);
        const indices: number[] = [];
        const dir = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
        const radius = DOME_RADIUS * 0.95;
        for (let i = 0; i < count; i++) {
            // Uniform over the upper hemisphere, kept just clear of the horizon haze.
            const y = 0.04 + random() * 0.96;
            const angle = random() * Math.PI * 2, ring = Math.sqrt(1 - y * y);
            dir.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
            right.crossVectors(dir, Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
            up.crossVectors(right, dir);
            const magnitude = Math.pow(random(), 3);
            const size = 1.1 + magnitude * 3.2;
            const brightness = (0.35 + magnitude * 0.65) * THREE.MathUtils.smoothstep(y, 0.04, 0.3);
            const warm = random();
            for (let corner = 0; corner < 4; corner++) {
                const sx = corner === 0 || corner === 3 ? -1 : 1, sy = corner < 2 ? -1 : 1;
                const v = i * 4 + corner;
                positions[v * 3] = dir.x * radius + (right.x * sx + up.x * sy) * size;
                positions[v * 3 + 1] = dir.y * radius + (right.y * sx + up.y * sy) * size;
                positions[v * 3 + 2] = dir.z * radius + (right.z * sx + up.z * sy) * size;
                uvs[v * 2] = (sx + 1) / 2; uvs[v * 2 + 1] = (sy + 1) / 2;
                colors[v * 3] = brightness * (warm > 0.8 ? 1 : 0.85);
                colors[v * 3 + 1] = brightness * 0.9;
                colors[v * 3 + 2] = brightness * (warm > 0.8 ? 0.75 : 1);
            }
            const k = i * 4;
            indices.push(k, k + 1, k + 2, k, k + 2, k + 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        const texture = discTexture((c, s) => {
            const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = g; c.fillRect(0, 0, s, s);
        }, 32);
        const material = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'Stars';
        mesh.renderOrder = -9;
        this.disposables.push(geometry, material, texture);
        return mesh;
    }

    dispose(): void {
        this.root.removeFromParent();
        this.glitter.removeFromParent();
        if (this.hiddenSkybox) this.hiddenSkybox.visible = true;
        for (const { material, color, emissive, env } of this.scenery) {
            material.color.copy(color);
            material.emissive.copy(emissive);
            material.envMapIntensity = env;
        }
        for (const { material, color, env } of this.windows) {
            material.color.copy(color);
            material.envMapIntensity = env;
        }
        for (const item of this.disposables) item.dispose();
    }
}

function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
