import * as THREE from 'three';
import type { MobileControls } from 'engine/MobileControls.js';

export interface InteractionPromptUIOptions {
	// Returns the active camera. Returns null if no camera is wired up yet —
	// in that case world-space prompts collapse to opacity:0 until a camera is set.
	getCamera: () => THREE.Camera | null;
	mobileControls: MobileControls;
	// Returns the current input-device label for the "interact" action (e.g.
	// 'E' on keyboard, 'A' / '✕' on gamepad, '' on mobile). Called once per
	// `show()` to render the key glyph.
	getInputLabel: () => string;
	// Called on mobile touchend over the prompt — the caller decides what
	// happens (usually `mobileControls.interactPressed = true`).
	onMobileTap: () => void;
}

// Renders the floating "[E] Open door" prompt above interactable objects.
// Visual styling lives in hud-base.css under .hud-interaction-prompt so the
// prompt recolors with the active theme. This class owns the DOM lifecycle,
// the world→screen projection (left/top set per frame), and the mobile
// touch handlers. Lifted out of PlayerController so the controller doesn't
// own UI directly.
export class InteractionPromptUI {
	private static readonly projectionVec = new THREE.Vector3();

	// Default lift above the anchor point, tuned for ground-level interactables
	// (doors, vehicles). Anchors that already float (weapon pickups) pass a
	// smaller offset via show().
	private static readonly DEFAULT_WORLD_Y_OFFSET = 2.0;

	private element: HTMLDivElement | null;
	// Built once and only re-texted. show() runs every frame while an
	// interactable is in range; replacing the spans would detach the node a
	// finger is on, and its touchend would never reach the root (input-v1).
	private readonly keyEl: HTMLSpanElement;
	private readonly labelEl: HTMLSpanElement;
	// Owned copy of the anchor; null while the prompt is pinned to the viewport.
	private readonly anchor = new THREE.Vector3();
	private interactableWorldPos: THREE.Vector3 | null = null;
	private worldYOffset: number = InteractionPromptUI.DEFAULT_WORLD_Y_OFFSET;
	private readonly opts: InteractionPromptUIOptions;

	constructor(opts: InteractionPromptUIOptions) {
		this.opts = opts;

		const el = document.createElement('div');
		el.className = 'hud-interaction-prompt';
		// Default positioning — world-anchored. show() switches to fallback
		// positioning (centered bottom) when no worldPosition is provided.
		el.style.left = '50%';
		el.style.top = '50%';

		this.keyEl = document.createElement('span');
		this.keyEl.className = 'hud-interaction-prompt__key';
		this.labelEl = document.createElement('span');
		el.append(this.keyEl, this.labelEl);

		// Touch handlers — visual feedback via .is-pressed (CSS inverts the
		// surface/text colors during a tap so it pops against the world).
		el.addEventListener('touchstart', (e) => {
			e.stopPropagation();
			e.preventDefault();
			el.classList.add('is-pressed');
		});
		el.addEventListener('touchend', (e) => {
			e.stopPropagation();
			e.preventDefault();
			el.classList.remove('is-pressed');
			this.opts.onMobileTap();
		});
		el.addEventListener('touchcancel', () => {
			el.classList.remove('is-pressed');
		});

		document.body.appendChild(el);
		this.element = el;
	}

	// Show the prompt with `displayName` as the label. If `worldPosition` is
	// provided, the prompt is anchored to that world point (projected to screen
	// each frame); otherwise it's pinned to the bottom of the viewport.
	//
	// When `actionable` is false the [E] glyph is omitted entirely — the prompt
	// becomes a plain label ("Locked") rather than a misleading "[E] Locked".
	//
	// `worldYOffset` lifts the prompt above the anchor point (world units).
	// Pass a small value when the anchor itself already floats above ground.
	show(displayName: string, worldPosition?: THREE.Vector3, actionable: boolean = true, worldYOffset: number = InteractionPromptUI.DEFAULT_WORLD_Y_OFFSET): void {
		if (!this.element) return;

		const isMobile = !!this.opts.mobileControls?.isEnabled?.();
		this.element.style.pointerEvents = isMobile && actionable ? 'auto' : 'none';

		if (worldPosition) {
			this.interactableWorldPos = this.anchor.copy(worldPosition);
			this.worldYOffset = worldYOffset;
			this.element.style.bottom = '';
			// CSS default transform translate(-50%, -100%) handles world-anchored.
			this.element.style.transform = '';
			this.updateScreenPosition();
		} else {
			this.interactableWorldPos = null;
			this.element.style.left = '50%';
			this.element.style.top = '';
			this.element.style.bottom = '18%';
			// Override the default world-anchored transform for fallback positioning.
			this.element.style.transform = 'translateX(-50%)';
		}

		// Capitalize the first letter so every Interactable's display name reads
		// as Title Case in the HUD ("Open door", not "open door") — Interactables
		// themselves return natural lowercase strings so the convention lives here.
		const label = displayName.length > 0 ? displayName.charAt(0).toUpperCase() + displayName.slice(1) : displayName;
		// On mobile, getInputLabel returns '' — the glyph collapses to an empty pill.
		// Text is assigned only on change, so the spans keep their text nodes too.
		const keyText = this.opts.getInputLabel();
		if (this.keyEl.textContent !== keyText) this.keyEl.textContent = keyText;
		this.keyEl.hidden = !actionable;
		if (this.labelEl.textContent !== label) this.labelEl.textContent = label;
		this.element.dataset.visible = 'true';
	}

	hide(): void {
		if (!this.element) return;
		delete this.element.dataset.visible;
		this.element.style.pointerEvents = 'none';
		this.interactableWorldPos = null;
	}

	// Re-project the world-anchored prompt to screen space. No-op when the
	// prompt is hidden, pinned to viewport, or no camera is available.
	updateScreenPosition(): void {
		if (!this.element || !this.interactableWorldPos) return;
		const camera = this.opts.getCamera();
		if (!camera) return;

		const projected = InteractionPromptUI.projectionVec.copy(this.interactableWorldPos);
		projected.y += this.worldYOffset;
		projected.project(camera);

		if (projected.z > 1) {
			// Behind camera
			delete this.element.dataset.visible;
			return;
		}

		const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
		const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
		this.element.style.left = `${x}px`;
		this.element.style.top = `${y}px`;
		this.element.dataset.visible = 'true';
	}

	dispose(): void {
		this.element?.remove();
		this.element = null;
		this.interactableWorldPos = null;
	}
}
