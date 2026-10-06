/**
 * The popup a world ad opens in: the engine's modal card holding the same
 * "Up next" tile as the end screen, and a Close button. The tile counts its
 * impression and takes its click exactly as it does anywhere else; the popup
 * only puts it up and takes it down.
 *
 * It is an interactive HUD element (the mouse is released). Opened during play,
 * it freezes the engine's player controls, and gives them back on close only
 * while the game is still in play: when the game ended or paused meanwhile,
 * the end or pause screen has them. The game keeps running behind it: an
 * ongoing game's clock is the game's business. Keys go nowhere but the popup
 * while it is open; Esc, Close and a click on the backdrop close it. One popup
 * at a time: opening another replaces it at once.
 */

import type { IGameHUD } from 'engine/IGameHUD.js';
import type { GameExchangeCard } from 'engine/exchange/GameExchangeCard.js';
import { GAME_EXCHANGE_HOST_CLASS } from 'engine/exchange/GameExchangeCard.js';
import { injectModalCardStyles, ScreenLeave } from 'engine/ui/modalCard.js';

/** The HUD element id of the popup. */
export const GAME_EXCHANGE_POPUP_ID = 'engine-exchange-popup';

/** The class on the popup's card; the tile's stylesheet sizes the tile by it. */
export const GAME_EXCHANGE_POPUP_CLASS = 'gx-popup';

/** What the popup needs from the engine while it is open. */
export interface GameExchangePopupHost {
    hud: IGameHUD;
    /** Whether the game is in play: only then are the player's controls the popup's to take and give back. */
    isPlaying(): boolean;
    enterInteractiveUI(): void;
    exitInteractiveUI(): void;
}

const POPUP_HTML = `
    <div class="ui-modal-overlay ui-modal-overlay--animated">
        <div class="ui-modal-card ${GAME_EXCHANGE_HOST_CLASS} ${GAME_EXCHANGE_POPUP_CLASS}" data-accent="neutral" role="dialog" aria-modal="true">
            <div class="ui-modal-stack">
                <button class="ui-modal-button gx-popup-close" type="button" data-variant="secondary">Close</button>
            </div>
        </div>
    </div>
`;

interface OpenPopup {
    tile: GameExchangeCard;
    host: GameExchangePopupHost;
    overlay: HTMLElement;
    /** It opened during play and froze the player's controls. */
    tookControls: boolean;
}

export class GameExchangePopup {
    private current: OpenPopup | null = null;
    private readonly leave = new ScreenLeave();
    /** The take-down of a popup that is fading out. */
    private finishing: (() => void) | null = null;
    private keysGuarded = false;

    /**
     * Keep every key press from the game while a popup is open. Call it once,
     * before any game code runs: listeners on one target and phase run in the
     * order they were added, so this capture listener on `target` runs before
     * every listener the game adds later, its own capture listeners on window
     * included, and stopImmediatePropagation keeps the key from all of them. A
     * listener added only when a popup opens would run after those. Kept for
     * the page's life; it does nothing while no popup is open. Later calls do
     * nothing.
     */
    guardKeys(target: Window): void {
        if (this.keysGuarded) return;
        this.keysGuarded = true;
        target.addEventListener('keydown', this.onKeyDown, true);
    }

    /** While a popup is open: no key reaches the game, and Esc closes the popup instead of opening the pause card. */
    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (!this.current) return;
        event.stopImmediatePropagation();
        if (event.key !== 'Escape') return;
        event.preventDefault();
        if (!event.repeat) this.close();
    };

    /**
     * Put `tile` up in a new popup, replacing any other. Returns false (and
     * disposes the tile) when the HUD did not build the element.
     */
    show(tile: GameExchangeCard, host: GameExchangePopupHost): boolean {
        this.close(false);
        this.finishLeave();
        injectModalCardStyles();
        // Held in an object: `onCreate` assigns it from inside the HUD's call.
        const built: { overlay: HTMLElement | null } = { overlay: null };
        host.hud.createCustomElement(GAME_EXCHANGE_POPUP_ID, {
            anchor: 'middle-center',
            interactive: true,
            html: POPUP_HTML,
            onCreate: (container) => {
                built.overlay = container.querySelector<HTMLElement>('.ui-modal-overlay');
                const card = built.overlay?.querySelector<HTMLElement>('.ui-modal-card');
                card?.insertBefore(tile.element, card.firstChild);
            },
        });
        const shown = built.overlay;
        if (!shown || !tile.element.isConnected) {
            tile.dispose();
            host.hud.removeElement(GAME_EXCHANGE_POPUP_ID);
            return false;
        }

        // A backdrop click closes only when it also began on the backdrop: the
        // click that opened the popup can end on the backdrop that just appeared.
        let pressedBackdrop = false;
        shown.addEventListener('pointerdown', (event) => {
            pressedBackdrop = event.target === shown;
        });
        shown.addEventListener('click', (event) => {
            if (event.target === shown && pressedBackdrop) this.close();
            pressedBackdrop = false;
        });
        shown.querySelector<HTMLButtonElement>('.gx-popup-close')?.addEventListener('click', () => this.close());

        // Keys are held by the listener guardKeys() put up; it reads `current`.
        // Outside play a menu, the pause card or the end screen already has the
        // player's controls, and is the one to give them back.
        const tookControls = host.isPlaying();
        this.current = { tile, host, overlay: shown, tookControls };
        if (tookControls) host.enterInteractiveUI();
        tile.start();
        return true;
    }

    /** Take the open popup down: animated, or at once. Does nothing when none is open. */
    close(animate = true): void {
        const open = this.current;
        if (!open) return;
        this.current = null;
        // The game has the player back at once; the fading card lets clicks through.
        // Only while it is still in play: enter and exit are not counted, so after the
        // game ended or paused behind the popup, exiting would hand the controls and
        // the pointer lock back under the end or pause screen.
        if (open.tookControls && open.host.isPlaying()) open.host.exitInteractiveUI();
        this.finishing = () => {
            open.tile.dispose();
            open.host.hud.removeElement(GAME_EXCHANGE_POPUP_ID);
        };
        this.leave.start(animate ? open.overlay : null, () => this.finishLeave());
    }

    /** Run a pending take-down now, so it can never remove a newer popup. */
    private finishLeave(): void {
        this.leave.cancel();
        const finish = this.finishing;
        this.finishing = null;
        finish?.();
    }
}
