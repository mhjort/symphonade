import * as THREE from 'three';
import type { FerrySounds } from './FerrySounds.js';
import type { EngineLike, WorldProfileData } from 'types/game.js';
import { DungeonDoor } from 'engine/doors/DungeonDoor.js';
import { getInteractionManager } from 'engine/InteractionManager.js';
import type { GameHUD } from './GameHUD.js';
import type { CabinKeyCard } from './CabinKeyCard.js';
import type { CabinAssignment } from './CabinAssignment.js';

type Reader = { id: string; keyId: string; doorPosition: THREE.Vector3; corridorNormal: THREE.Vector3; height: number; position: THREE.Vector3; leaf: THREE.Object3D | null; lamp: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> };

export class CabinDoorReaders {
    private readonly readers: Reader[] = [];
    private readonly restore: Array<() => void> = [];
    private readonly decorated = new Set<DungeonDoor>();
    private active: { reader: Reader; elapsed: number; contacted: boolean; checked: boolean } | null = null;
    private readonly opened = new Set<string>();
    private readonly numberLabels: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
    private readonly playerPosition = new THREE.Vector3();

    constructor(private readonly engine: EngineLike, profile: WorldProfileData,
        private readonly hud: GameHUD, private readonly card: CabinKeyCard,
        private readonly assignedCabin: CabinAssignment,
        private readonly camera: () => THREE.Camera, private readonly sounds: FerrySounds) {
        const cabins = (profile.doors ?? []).filter(def => def.kind === 'locked' && def.keyId?.startsWith('room-'));
        for (const def of cabins) {
            if (!def.keyId) continue;
            const yaw = def.rotationY;
            const position = new THREE.Vector3(def.position.x, def.position.y, def.position.z);
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), new THREE.MeshBasicMaterial({ color: 0x75bddc }));
            lamp.visible = false;
            engine.getWorldGroup().add(lamp);
            this.readers.push({ id: def.id, keyId: def.keyId, position, leaf: null, lamp,
                doorPosition: new THREE.Vector3(def.position.x, def.position.y, def.position.z),
                corridorNormal: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), height: def.height });
        }
        hud.createIconText('card-reader-status', { anchor: 'bottom-center', icon: '▣', text: '' });
        hud.hideElement('card-reader-status');
    }

    private hasCard(): boolean { return this.engine.getDoorSystem?.()?.getKeyring().has(this.assignedCabin.keyId) === true; }

    private isInside(id: string): boolean {
        const reader = this.readers.find(r => r.id === id);
        if (!reader) return false;
        const offset = this.playerPosition.clone().sub(reader.doorPosition);
        return Math.abs(offset.y) < reader.height && offset.dot(reader.corridorNormal) < -0.08;
    }

    private canInteract(id: string): boolean {
        return this.isInside(id) || (this.hasCard() && !this.active && !this.card.busy);
    }

    private interactionLabel(id: string): string {
        if (this.isInside(id)) return `exit cabin ${id}`;
        return this.active ? 'checking cabin card' : this.hasCard() ? `scan card · cabin ${id}` : 'collect your card at Information';
    }

    tryDoor(id: string): boolean {
        const reader = this.readers.find(r => r.id === id);
        const doors = this.engine.getDoorSystem?.();
        if (!reader || !doors) return false;
        // The inside handle is a free exit, independent of inventory or card animation.
        if (this.isInside(id)) {
            doors.unlockDoor(id);
            doors.openDoor(id);
            this.opened.add(id);
            return true;
        }
        if (!this.hasCard() || this.active || this.card.busy) return false;
        if (doors.getDoorState(id) !== 'closed') return false;
        this.active = { reader, elapsed: 0, contacted: false, checked: false };
        reader.lamp.material.color.setHex(0xffbf47);
        this.hud.updateIconText('card-reader-status', { text: `Cabin ${id} · Checking card…` });
        this.hud.showElement('card-reader-status');
        return true;
    }

    update(dt: number, playerPosition: THREE.Vector3): void {
        this.playerPosition.copy(playerPosition);
        // Adapt the existing door's public interaction methods before the
        // player controller processes E / mobile Interact. The engine retains
        // all lock state, physics, proximity closing and door animation.
        // Authored leaves load asynchronously. Follow the actual animated pivot,
        // keeping the scan target and indicator on the handle throughout a swing.
        for (const reader of this.readers) {
            if (!reader.leaf) {
                reader.leaf = this.engine.getWorldGroup().getObjectByName(`door_${reader.id}_pivot`) ?? null;
                if (reader.leaf) this.addNumber(reader);
            }
            if (!reader.leaf) continue;
            const leaf = reader.leaf;
            leaf.updateWorldMatrix(true, true);
            reader.position.set(0.405 / leaf.scale.x, 0.025 / leaf.scale.y, 0.079 / leaf.scale.z);
            leaf.localToWorld(reader.position);
            const lightPosition = new THREE.Vector3(0.405 / leaf.scale.x, 0.075 / leaf.scale.y, 0.082 / leaf.scale.z);
            leaf.localToWorld(lightPosition);
            reader.lamp.parent!.worldToLocal(lightPosition);
            reader.lamp.position.copy(lightPosition);
            reader.lamp.visible = true;
        }
        const nearby = getInteractionManager().getNearestInteractable(playerPosition)?.interactable;
        if (nearby instanceof DungeonDoor && !this.decorated.has(nearby) && this.readers.some(r => r.id === nearby.id)) {
            const original = { start: nearby.onInteractStart, label: nearby.getInteractStartDisplayName, actionable: nearby.isActionable };
            nearby.onInteractStart = () => this.tryDoor(nearby.id);
            nearby.getInteractStartDisplayName = () => this.interactionLabel(nearby.id);
            nearby.isActionable = () => this.canInteract(nearby.id);
            this.restore.push(() => {
                nearby.onInteractStart = original.start;
                nearby.getInteractStartDisplayName = original.label;
                nearby.isActionable = original.actionable;
            });
            this.decorated.add(nearby);
        }
        const doors = this.engine.getDoorSystem?.();
        for (const id of this.opened) {
            if (doors?.getDoorState(id) === 'closed') { doors.lockDoor(id); this.opened.delete(id); }
        }
        if (!this.active || !doors) return;
        const scan = this.active;
        scan.elapsed += Math.max(0, dt);
        if (!scan.contacted && scan.elapsed >= 0.5) {
            scan.contacted = true;
            this.sounds.play('cardContact', scan.reader.position);
        }
        // 0.5 s to reader, one full second checking, 0.55 s back to HUD.
        if (!scan.checked && scan.elapsed >= 1.5) {
            scan.checked = true;
            const accepted = doors.getKeyring().has(scan.reader.keyId);
            this.sounds.play(accepted ? 'cardAccepted' : 'cardRejected', scan.reader.position);
            scan.reader.lamp.material.color.setHex(accepted ? 0x42e68b : 0xff5353);
            this.hud.updateIconText('card-reader-status', { text: accepted ? `Cabin ${scan.reader.id} · Accepted` : `Cabin ${scan.reader.id} · Wrong cabin — card is for ${this.assignedCabin.id}` });
            if (accepted) {
                doors.unlockDoor(scan.reader.id);
                doors.openDoor(scan.reader.id);
                this.opened.add(scan.reader.id);
            }
        }
        const travel = scan.elapsed < 0.5 ? scan.elapsed / 0.5 : scan.elapsed < 1.5 ? 1 : 1 - (scan.elapsed - 1.5) / 0.55;
        this.card.moveToReader(scan.reader.position, this.camera(), travel);
        if (scan.elapsed >= 2.05) this.card.returnToInventory();
        if (scan.elapsed >= 2.8) {
            scan.reader.lamp.material.color.setHex(0x75bddc);
            this.hud.hideElement('card-reader-status');
            this.active = null;
        }
    }

    /** The approved leaf is shared; only the small number texture is room-specific. */
    private addNumber(reader: Reader): void {
        const leaf = reader.leaf!;
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Cabin number canvas unavailable');
        context.font = 'bold 58px sans-serif';
        context.fillStyle = '#121c1b';
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(reader.id, 128, 64);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const label = new THREE.Mesh(new THREE.PlaneGeometry(.22, .11),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
        label.name = `Cabin ${reader.id} number`;
        label.position.set(0, .58 / leaf.scale.y, .072 / leaf.scale.z);
        label.scale.set(1 / leaf.scale.x, 1 / leaf.scale.y, 1 / leaf.scale.z);
        leaf.add(label);
        this.numberLabels.push(label);
    }

    dispose(): void {
        this.active = null;
        this.card.returnToInventory();
        for (const restore of this.restore) restore();
        for (const label of this.numberLabels) {
            label.removeFromParent();
            label.geometry.dispose(); label.material.map?.dispose(); label.material.dispose();
        }
        for (const reader of this.readers) {
            reader.lamp.removeFromParent();
            reader.lamp.geometry.dispose();
            reader.lamp.material.dispose();
        }
        this.hud.removeElement('card-reader-status');
    }
}
