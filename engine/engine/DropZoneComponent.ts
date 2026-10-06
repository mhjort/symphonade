/**
 * DropZoneComponent - An area for depositing carried objects
 *
 * Defines an area where players can place objects they are carrying
 * (via CarryableComponent). Maintains a static registry so CarryableComponent
 * can efficiently find nearby zones when the player drops an object.
 */

import * as THREE from 'three';
import type { PhysicsWorld } from 'engine/physics/PhysicsWorld.js';

export interface DropZoneConfig {
	/** World position of the zone center */
	position: THREE.Vector3;
	/** Detection radius (default: 5.0) */
	radius?: number;
	/** Unique identifier for this zone */
	name: string;
	/** Human-readable name shown in UI prompts (e.g., "breeding pen") */
	displayName: string;
	/** Called when an object is placed in this zone */
	onObjectPlaced?: (objectName: string, object3D: THREE.Object3D) => void;
	/** Optional capacity limit (-1 = unlimited, default: -1) */
	capacity?: number;
}

export class DropZoneComponent {
	/** Global registry of all active drop zones */
	private static registry: Set<DropZoneComponent> = new Set();

	private position: THREE.Vector3;
	private radius: number;
	private _name: string;
	private _displayName: string;
	private onObjectPlacedCallback: ((objectName: string, object3D: THREE.Object3D) => void) | null;
	private capacity: number;
	private placedCount: number = 0;

	private _disposed: boolean = false;

	/**
	 * `physicsWorld` is unused: zone membership is a distance check against the registry
	 * (`findZoneAtPosition`), not a physics sensor. The parameter stays for existing callers.
	 */
	constructor(_physicsWorld: PhysicsWorld, config: DropZoneConfig) {
		this.position = config.position.clone();
		this.radius = config.radius ?? 5.0;
		this._name = config.name;
		this._displayName = config.displayName;
		this.onObjectPlacedCallback = config.onObjectPlaced ?? null;
		this.capacity = config.capacity ?? -1;

		// Register in the global registry
		DropZoneComponent.registry.add(this);
	}

	// ---- Static registry API ----

	/**
	 * Find the nearest drop zone to a position within range.
	 * Returns null if no zone is within its own radius.
	 */
	static findZoneAtPosition(position: THREE.Vector3): DropZoneComponent | null {
		let nearest: DropZoneComponent | null = null;
		let nearestDist = Infinity;

		for (const zone of DropZoneComponent.registry) {
			if (zone._disposed || !zone.canAccept()) continue;
			const dist = position.distanceTo(zone.position);
			if (dist <= zone.radius && dist < nearestDist) {
				nearestDist = dist;
				nearest = zone;
			}
		}

		return nearest;
	}

	/**
	 * Find a drop zone by name.
	 */
	static findZoneByName(name: string): DropZoneComponent | null {
		for (const zone of DropZoneComponent.registry) {
			if (!zone._disposed && zone._name === name) return zone;
		}
		return null;
	}

	/**
	 * Clear all zones from the registry (call on game cleanup).
	 */
	static clearRegistry(): void {
		DropZoneComponent.registry.clear();
	}

	// ---- Public API ----

	get name(): string {
		return this._name;
	}

	get displayName(): string {
		return this._displayName;
	}

	/**
	 * Check if this zone can accept more objects.
	 */
	canAccept(): boolean {
		if (this.capacity === -1) return true;
		return this.placedCount < this.capacity;
	}

	/**
	 * Get the center position of this zone.
	 */
	getPosition(): THREE.Vector3 {
		return this.position.clone();
	}

	/**
	 * Get the zone radius.
	 */
	getRadius(): number {
		return this.radius;
	}

	/**
	 * Get the number of objects placed in this zone.
	 */
	getPlacedCount(): number {
		return this.placedCount;
	}

	/**
	 * Notify the zone that an object has been placed in it.
	 * Called by CarryableComponent when dropping in a zone.
	 */
	notifyObjectPlaced(objectName: string, object3D: THREE.Object3D): void {
		this.placedCount++;
		if (this.onObjectPlacedCallback) {
			this.onObjectPlacedCallback(objectName, object3D);
		}
	}

	/**
	 * Check if this component has been disposed.
	 */
	isDisposed(): boolean {
		return this._disposed;
	}

	/**
	 * Clean up physics resources and unregister from the global registry.
	 */
	dispose(): void {
		if (this._disposed) return;
		this._disposed = true;

		DropZoneComponent.registry.delete(this);
	}
}
