import * as THREE from 'three';
import type { PlayerController } from 'engine/PlayerController.js';
import type { EngineLike } from 'types/game.js';
import { InteractableComponent } from 'engine/InteractableComponent.js';
import { getInteractionManager } from 'engine/InteractionManager.js';
import { GameState, getGameStateManager } from 'engine/GameStateManager.js';
import type { ChairSeating } from './ChairSeating.js';
import type { PlayerEnergy } from './PlayerEnergy.js';
import shipLevel from './serenade.mesh-level.json';
import { FirstPersonHand, type HandLook, type HandModel } from './FirstPersonHand.js';
import { AvatarHand } from './AvatarHand.js';

/** First-person disco moves, reached through the ordinary interaction action. */
export class StarlightDance {
    active = false;
    private enabled = false;
    private phase = 0;
    private readonly anchor = new THREE.Object3D();
    private readonly interaction: InteractableComponent;
    private readonly root = new THREE.Group();
    private readonly hands = [new THREE.Group(), new THREE.Group()];
    private readonly handModels: HandModel[] = [new FirstPersonHand('left'), new FirstPersonHand('right')];
    private readonly tilt = new THREE.Quaternion();
    private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
    private readonly room = shipLevel.volumes.find(volume => volume.name === 'Starlight dance floor')!;

    constructor(engine: EngineLike, private readonly player: PlayerController,
        private readonly seating: ChairSeating, private readonly energy: PlayerEnergy,
        private readonly reducedMotion: MediaQueryList) {
        this.root.name = 'First-person dancing hands';
        this.root.visible = false;
        engine.getWorldGroup().add(this.root);
        for (const [i, hand] of this.hands.entries()) {
            hand.name = i === 0 ? 'Left dance hand' : 'Right dance hand';
            this.root.add(hand);
            // Raise the hand fingers-up with the forearm angling back toward the camera.
            const model = this.handModels[i]!;
            model.root.scale.setScalar(1.15);
            hand.add(model.root);
        }
        this.interaction = new InteractableComponent(engine.physicsWorld!, {
            object3D: this.anchor, radius: 1,
            interactable: {
                interactionEnabled: () => this.enabled,
                getInteractStartDisplayName: () => this.prompt,
                onInteractStart: () => {
                    if (!this.available()) return false;
                    this.active = !this.active;
                    this.phase = 0;
                    return true;
                },
            },
        });
    }

    /** Match the dancing hands to the chosen traveler's skin and sleeve. */
    setHandLook(look: HandLook): void {
        for (const model of this.handModels) if (model instanceof FirstPersonHand) model.setLook(look);
    }

    /** Dance with the traveler's own skinned hands when their avatar is rigged for it. */
    useAvatarHands(avatar: THREE.Object3D): void {
        this.handModels.forEach((current, i) => {
            const next = AvatarHand.fromAvatar(avatar, i === 0 ? 'left' : 'right');
            if (!next) return;
            next.root.scale.copy(current.root.scale);
            next.setPose(current.pose);
            this.hands[i]!.add(next.root);
            current.dispose();
            this.handModels[i] = next;
        });
    }

    private get prompt(): string {
        return this.active ? 'Stop dancing · Energy use 3×' : 'Dance · Energy use 3×';
    }

    private available(): boolean {
        const p = this.player.getGroundPosition(), { position: c, size } = this.room;
        return getGameStateManager().isState(GameState.PLAYING) && this.player.getControlsEnabled()
            && Math.abs(p.x - c[0]!) < size[0]! / 2 && Math.abs(p.z - c[2]!) < size[2]! / 2
            && p.y >= -.2 && p.y < .3 && !this.seating.isSeated && this.energy.value > 0
            && this.player.isGrounded && this.player.moveDirection.lengthSq() < .001 && !this.player.keys.ascend;
    }

    prepareInteractions(): void {
        // Temporarily exclude ourselves so nearby chairs and service points win.
        this.enabled = false;
        this.anchor.position.copy(this.player.getPosition());
        this.anchor.updateMatrixWorld(true);
        this.interaction.syncPosition();
        this.enabled = this.available() && (this.active
            || !getInteractionManager().getNearestInteractable(this.player.getPosition()));
    }

    update(dt: number): void {
        if (this.active && !this.available()) this.active = false;
        if (this.active) this.phase += Math.max(0, dt);
        this.root.visible = this.active;
        // The dance has no prop to aim at: expose the same contextual prompt
        // on desktop that the controller already exposes for nearby phone actions.
        if (this.enabled && this.available()) this.player.showInteractionPrompt(this.prompt);
    }

    /** Called after the normal camera update, so motion never accumulates. */
    applyView(camera: THREE.Camera, holdingDrink: boolean): void {
        if (!this.active) return;
        const beat = this.phase * Math.PI * 2 * 116 / 60;
        if (!this.reducedMotion.matches) {
            this.euler.set(Math.sin(beat) * .012, Math.sin(beat / 2) * .009, Math.sin(beat / 2) * .018);
            camera.quaternion.multiply(this.tilt.setFromEuler(this.euler));
            camera.position.y += Math.sin(beat) * .014;
        }
        this.root.position.copy(camera.position);
        this.root.quaternion.copy(camera.quaternion);
        const narrow = camera instanceof THREE.PerspectiveCamera && camera.aspect < 1;
        for (const [i, hand] of this.hands.entries()) {
            const side = i === 0 ? -1 : 1, swing = beat / 2 + i * Math.PI;
            hand.visible = i === 0 || !holdingDrink;
            // Alternating fist pumps and inward sweeps, within portrait framing.
            hand.position.set(side * ((narrow ? .13 : .24) + Math.sin(swing) * .035),
                -.22 + Math.sin(swing) * .09, -.52 - Math.cos(swing) * .055);
            hand.rotation.set(-.28 + Math.sin(swing) * .35, side * -.2, side * (.18 + Math.cos(swing) * .28));
            // Open, spread fingers on the sweep; a loose fist at the top of each pump.
            const pump = Math.max(0, Math.sin(swing));
            // The fist tips forward so its knuckles, not the flat back of the hand, face the camera.
            const model = this.handModels[i]!;
            model.root.rotation.set(1 - pump * 1.05, 0, -side * pump * .35);
            model.setPose({ curl: .3 + pump * 1.15, thumb: .25 + pump * .9, spread: .25 * (1 - pump), wrist: -.5 + pump * .3 });
        }
    }

    dispose(): void {
        this.active = false;
        this.interaction.dispose();
        this.root.removeFromParent();
        for (const model of this.handModels) model.dispose();
    }
}
