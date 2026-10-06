import { isMobileRuntime } from 'engine/isMobileRuntime.js';

/** Touch runtimes get shorter status labels so the top corners stay narrow. */
export const compactHud = isMobileRuntime();

let installed: HTMLStyleElement | null = null;

/**
 * Portrait phones have room for only one row across the top: the corner
 * stacks keep their compact labels and the area/objective stack drops below
 * them, inset clear of the engine's mute and pause buttons.
 */
export function installPhoneHudLayout(): () => void {
    if (!compactHud || installed) return () => {};
    document.documentElement.dataset.partyBoatPhone = 'true';
    const style = installed = document.createElement('style');
    style.textContent = `
        @media (max-width: 600px) {
            [data-party-boat-phone] .hud-anchor-top-center {
                top: calc(var(--hud-pad) + 84px);
                max-width: calc(100vw - 2 * (var(--hud-pad) + 66px));
            }
        }`;
    document.head.append(style);
    return () => {
        style.remove(); installed = null;
        delete document.documentElement.dataset.partyBoatPhone;
    };
}
