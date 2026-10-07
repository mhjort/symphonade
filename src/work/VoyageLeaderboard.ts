import type { EngineLike } from 'types/game.js';
import { escapeHtml } from 'engine/ui/modalCard.js';

/** Persistent, shared trip-point board: arrivals in Stockholm submit, every end screen shows the top 5. */
const CATEGORY = 'voyage-trip-points';
const FIELD = 'tripPoints';
const TOP = 5;
const PANEL_ID = 'voyage-leaderboard';

const CSS = `
#${PANEL_ID} { width:100%; margin:4px 0 2px; text-align:left; }
#${PANEL_ID} h3 { margin:0 0 6px; font-size:14px; color:var(--hud-color-text-muted);
    text-transform:var(--hud-font-case, uppercase); letter-spacing:var(--hud-font-tracking-label, 1.4px); }
#${PANEL_ID} ol { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:3px; }
#${PANEL_ID} li { display:flex; gap:8px; font-size:14px; padding:3px 8px; border-radius:var(--hud-radius-card, 8px); }
#${PANEL_ID} li.mine { background:var(--hud-color-surface); color:var(--hud-color-on-surface); font-weight:var(--hud-font-weight-heading, 700); }
#${PANEL_ID} .rank { width:1.6em; color:var(--hud-color-text-muted); }
#${PANEL_ID} .name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#${PANEL_ID} .points { font-weight:var(--hud-font-weight-heading, 700); }
#${PANEL_ID} p { margin:6px 0 0; font-size:13px; color:var(--hud-color-text-muted); }`;

type Row = { id: string; name: string; points: number; traveler: string };

export class VoyageLeaderboard {
    constructor(private readonly engine: EngineLike) {}

    /**
     * Call right after engine.endGame(). Fills a panel on the engine's end card;
     * `submitPoints` is the score to record (null: show the board only).
     */
    async showOnEndScreen(submitPoints: number | null, travelerName: string): Promise<void> {
        const panel = this.mountPanel();
        if (!panel) return;
        const service = this.engine.getGameDataService?.();
        if (!service) { this.render(panel, null, '<p>Leaderboard unavailable.</p>'); return; }

        let mineId: string | null = null;
        let note = '';
        if (submitPoints !== null) {
            try {
                const me = await this.engine.getLeaderboardIdentity?.();
                if (!me) throw new Error('No leaderboard identity');
                const created = await service.create(CATEGORY, {
                    data: {},
                    values: { [FIELD]: submitPoints, name: me.displayName, traveler: travelerName },
                    playerId: me.playerId,
                    verifier: me.verifier,
                });
                mineId = created.id;
                void this.engine.publishLeaderboard?.({
                    category: CATEGORY, label: 'Top trip points', metric: 'score', field: FIELD, levelId: null, ghost: false,
                });
            } catch (error) {
                console.warn('[VoyageLeaderboard] Could not submit score:', error);
                note = '<p>Your score could not be saved. Try again later.</p>';
            }
        }

        let rows: Row[] | null = null;
        try {
            const result = await service.list(CATEGORY, { orderBy: `values.${FIELD}`, orderDir: 'desc', limit: TOP, fields: 'values' });
            rows = result.entries.map(entry => ({
                id: entry.id,
                name: String(entry.values.name ?? 'Traveler'),
                points: Number(entry.values[FIELD] ?? 0),
                traveler: String(entry.values.traveler ?? ''),
            }));
        } catch (error) {
            console.warn('[VoyageLeaderboard] Could not load leaderboard:', error);
        }
        if (rows && mineId && submitPoints !== null && !rows.some(row => row.id === mineId)) {
            try {
                const { rank, total } = await service.rank(CATEGORY, { field: `values.${FIELD}`, value: submitPoints, direction: 'desc' });
                note += `<p>Your voyage: #${rank} of ${total} · ${submitPoints} TP</p>`;
            } catch { /* The top 5 still stands on its own. */ }
        }
        this.render(panel, rows, note, mineId);
    }

    /** Inserted above Play Again so the replay button and the engine's tile/credit keep their order. */
    private mountPanel(): HTMLElement | null {
        const card = document.querySelector<HTMLElement>('#hud-custom-engine-end-overlay .ui-modal-card');
        if (!card) { console.warn('[VoyageLeaderboard] End screen card not found'); return null; }
        card.querySelector(`#${PANEL_ID}`)?.remove();
        const panel = document.createElement('section');
        panel.id = PANEL_ID;
        panel.setAttribute('aria-live', 'polite');
        panel.innerHTML = `<style>${CSS}</style><h3>Top voyages</h3><p>Loading leaderboard…</p>`;
        card.insertBefore(panel, card.querySelector('.end-screen-replay'));
        return panel;
    }

    private render(panel: HTMLElement, rows: Row[] | null, note: string, mineId: string | null = null): void {
        if (!panel.isConnected) return;
        const body = rows === null ? '<p>Leaderboard unavailable.</p>'
            : rows.length === 0 ? '<p>No arrivals yet — reach Stockholm to set the first score.</p>'
            : `<ol>${rows.map((row, index) => `<li class="${row.id === mineId ? 'mine' : ''}">
                <span class="rank">${index + 1}.</span>
                <span class="name">${escapeHtml(row.name)}${row.traveler ? ` · ${escapeHtml(row.traveler)}` : ''}</span>
                <span class="points">${row.points} TP</span></li>`).join('')}</ol>`;
        panel.innerHTML = `<style>${CSS}</style><h3>Top voyages</h3>${body}${note}`;
    }
}
