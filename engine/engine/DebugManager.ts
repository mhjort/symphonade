import type { EngineLike } from 'types/game.js';
import { areDebugHotkeysEnabled } from 'engine/CreatorMode.js';

/**
 * True when a text field owns the keyboard. Single-letter debug keys must not
 * fire while the user is typing — the creator's prompt box sits in the parent
 * document, but an in-game HUD input would be here.
 */
function isTextEntryFocused(): boolean {
    const el = typeof document !== 'undefined' ? document.activeElement : null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable === true;
}

/** A debug key another module adds to the one table (see `DebugManager.addKeyBinding`). */
export interface DebugKeyBinding {
    /** `KeyboardEvent.code`, e.g. 'F7'. */
    code: string;
    /** Whether Shift must be held. The built-in keys fire only without Shift. */
    shift: boolean;
    /** What the key does, for the debug panel's key list. */
    label: string;
    run: () => void;
}

/** A key as the debug panel names it, e.g. 'Shift+F7', 'N', '`'. */
function keyName(code: string, shift: boolean): string {
    const base = code === 'Backquote' ? '`' : code.replace(/^Key/, '');
    return shift ? `Shift+${base}` : base;
}

/** The built-in keys, in the order the debug panel lists them. */
export const BUILT_IN_DEBUG_KEYS: ReadonlyArray<{ code: string; label: string }> = [
    { code: 'F5', label: 'Test Placement' },
    { code: 'F6', label: 'Toggle Flying' },
    { code: 'F7', label: 'Spawn Test Box + Enemy + Vehicle' },
    { code: 'F8', label: 'Screenshot to Clipboard' },
    { code: 'KeyN', label: 'Toggle NPCs (perf A/B)' },
    { code: 'Backquote', label: 'Toggle Debug Info' },
];

interface DebugCallbacks {
    onSpawnTestObjects?: () => void;
    onTestPlacement?: () => void;
    onToggleFlyingMovement?: () => void;
    onToggleDebugInfo?: () => void;
    /** Debug perf A/B: freeze and hide every NPC/animal (see GameEngine.setDebugDisableNpcs). */
    onToggleNpcs?: () => void;
    onTakeScreenshot?: () => void;
}

/**
 * DebugManager handles debug-only functionality that should not be in production.
 * This is in the engine folder so templates can access it.
 *
 * Debug features include:
 * - Debug key bindings (F5-F8, backtick, etc.)
 * - Debug state flags
 * - Debug spawning utilities
 *
 * The keys exist only where `areDebugHotkeysEnabled` holds (the Creator, `bitmagic dev` and dev
 * builds): a published build starts with them off and `enableDebug()` cannot turn them on.
 *
 * Other modules add their keys to the same table with `addKeyBinding` instead of listening
 * on `document` themselves, so no key ever fires two unrelated actions.
 *
 * NOTE: Editor functionality (F2 toggle, scene editing) is in editor/EditorManager.ts
 */
export class DebugManager {
    private engine: EngineLike;
    private isDebugEnabled: boolean = areDebugHotkeysEnabled;
    private debugInfoVisible: boolean = false;
    private callbacks: DebugCallbacks = {};
    private bindings: DebugKeyBinding[] = [];

    constructor(engine: EngineLike) {
        this.engine = engine;
    }

    enableDebug(): void {
        this.isDebugEnabled = areDebugHotkeysEnabled;
    }

    disableDebug(): void {
        this.isDebugEnabled = false;
    }

    isDebugActive(): boolean {
        return this.isDebugEnabled;
    }

    setCallbacks(callbacks: DebugCallbacks): void {
        this.callbacks = { ...callbacks };
    }

    /**
     * Add a debug key to the table. Returns the function that removes it. A key that is
     * already taken (a built-in, or another binding) is refused with a warning rather than
     * firing two actions on one press.
     */
    addKeyBinding(binding: DebugKeyBinding): () => void {
        const builtIn = !binding.shift && BUILT_IN_DEBUG_KEYS.some((k) => k.code === binding.code);
        const taken = builtIn || this.bindings.some((b) => b.code === binding.code && b.shift === binding.shift);
        if (taken) {
            console.warn(`[DebugManager] ${keyName(binding.code, binding.shift)} is already a debug key; '${binding.label}' not bound`);
            return () => {};
        }
        this.bindings.push(binding);
        return () => { this.bindings = this.bindings.filter((b) => b !== binding); };
    }

    /** Every key the table serves, built-ins first, for the debug panel's key list. */
    getKeyBindings(): Array<{ key: string; label: string }> {
        return [
            ...BUILT_IN_DEBUG_KEYS.map((k) => ({ key: keyName(k.code, false), label: k.label })),
            ...this.bindings.map((b) => ({ key: keyName(b.code, b.shift), label: b.label })),
        ];
    }

    /**
     * Handle debug key events. Returns true if the key was handled.
     */
    onKeyDown(event: KeyboardEvent): boolean {
        if (!this.isDebugEnabled) return false;

        const added = this.bindings.find((b) => b.code === event.code && b.shift === event.shiftKey);
        if (added) {
            event.preventDefault();
            added.run();
            return true;
        }
        // The built-ins are unshifted; a shifted press is either an added binding or nothing.
        if (event.shiftKey) return false;

        switch (event.code) {
            case 'F5':
                event.preventDefault();
                this.callbacks.onTestPlacement?.();
                return true;

            case 'F6':
                event.preventDefault();
                this.callbacks.onToggleFlyingMovement?.();
                return true;

            case 'F7':
                event.preventDefault();
                this.callbacks.onSpawnTestObjects?.();
                return true;

            case 'Backquote':
                event.preventDefault();
                this.debugInfoVisible = !this.debugInfoVisible;
                this.callbacks.onToggleDebugInfo?.();
                return true;

            case 'KeyN':
                // Perf A/B toggle. A KEY rather than a panel checkbox because
                // gameplay holds pointer lock — clicking the checkbox means
                // alt-tabbing out, which perturbs the very frame rate being
                // measured. Ignore it while a text field has focus so typing an
                // 'n' into the creator prompt does not silently freeze the NPCs.
                if (isTextEntryFocused()) return false;
                event.preventDefault();
                this.callbacks.onToggleNpcs?.();
                return true;

            case 'F8':
                event.preventDefault();
                this.callbacks.onTakeScreenshot?.();
                return true;
        }

        return false;
    }

    isDebugInfoVisible(): boolean {
        return this.debugInfoVisible;
    }

    setDebugInfoVisible(visible: boolean): void {
        this.debugInfoVisible = visible;
    }

    dispose(): void {
        this.callbacks = {};
        this.bindings = [];
    }
}
