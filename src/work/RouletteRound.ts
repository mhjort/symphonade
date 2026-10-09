export const ROULETTE_SPIN_SECONDS = 8;
export const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
export const ROULETTE_STAKES = [5,10,25] as const;
export type RouletteBet = number | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high';
export type RouletteWallet = { readonly balance: number; trySpend(amount: number): boolean; credit(amount: number): void };
export type RouletteResult = { number: number; bet: RouletteBet; stake: number; returned: number };
export const rouletteColor = (n: number): 'green' | 'red' | 'black' => n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black';
export function validBet(bet: RouletteBet): boolean {
    return typeof bet === 'number' ? Number.isInteger(bet) && bet >= 0 && bet <= 36
        : ['red','black','odd','even','low','high'].includes(bet);
}
/** Gross return includes the original stake. Zero loses all outside bets. */
export function rouletteReturn(bet: RouletteBet, n: number, stake: number): number {
    if (!validBet(bet) || !Number.isInteger(n) || n < 0 || n > 36 || !Number.isSafeInteger(stake) || stake <= 0) return 0;
    if (typeof bet === 'number') return bet === n ? stake * 36 : 0;
    if (n === 0) return 0;
    const win = bet === 'red' ? RED_NUMBERS.has(n) : bet === 'black' ? !RED_NUMBERS.has(n)
        : bet === 'odd' ? n % 2 === 1 : bet === 'even' ? n % 2 === 0 : bet === 'low' ? n <= 18 : n >= 19;
    return win ? stake * 2 : 0;
}

export class RouletteRound {
    pending: { bet: RouletteBet; stake: number; number: number; elapsed: number } | null = null;
    result: RouletteResult | null = null;
    constructor(private readonly wallet: RouletteWallet, private readonly random: () => number = Math.random) {}
    start(bet: RouletteBet, stake: number): 'started' | 'busy' | 'funds' | 'invalid' {
        if (this.pending) return 'busy';
        if (!validBet(bet) || !ROULETTE_STAKES.some(n => n === stake)) return 'invalid';
        if (!this.wallet.trySpend(stake)) return 'funds';
        this.pending = { bet, stake, number: Math.min(36, Math.max(0, Math.floor(this.random() * 37))), elapsed: 0 };
        this.result = null;
        return 'started';
    }
    update(dt: number): RouletteResult | null {
        if (!this.pending || !Number.isFinite(dt) || dt <= 0) return null;
        const p = this.pending;
        p.elapsed += dt;
        if (p.elapsed < ROULETTE_SPIN_SECONDS) return null;
        const returned = rouletteReturn(p.bet, p.number, p.stake);
        this.pending = null;
        this.result = { number: p.number, bet: p.bet, stake: p.stake, returned };
        if (returned) this.wallet.credit(returned);
        return this.result;
    }
    cancel(): void {
        if (!this.pending) return;
        const stake = this.pending.stake;
        this.pending = null;
        this.wallet.credit(stake);
    }
}
