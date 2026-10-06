/** Casual onboard play: 19% regular wins, 1% boat jackpots, 80% misses. */
export const SLOT_ODDS = { jackpot: .01, regularWin: .19 } as const;

export function rollSlotReels(random: () => number = Math.random): number[] {
    const outcome = random();
    if (outcome < SLOT_ODDS.jackpot) return [4, 4, 4];
    if (outcome < SLOT_ODDS.jackpot + SLOT_ODDS.regularWin) {
        const symbol = Math.floor(random() * 4);
        return [symbol, symbol, symbol];
    }
    const reels = Array.from({ length: 3 }, () => Math.floor(random() * 5));
    // Keep the losing branch from accidentally adding more wins to the odds.
    if (reels.every(symbol => symbol === reels[0])) {
        reels[2] = (reels[0]! + 1 + Math.floor(random() * 4)) % 5;
    }
    return reels;
}
