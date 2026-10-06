import type { GameData } from 'types/game.js';

export type TravelerId = 'family' | 'senior' | 'party' | 'shopper' | 'road' | 'driver';
export interface Traveler {
    readonly id: TravelerId;
    readonly name: string;
    readonly category: string;
    readonly description: string;
    readonly assetName: string;
    readonly marks: number;
    readonly energy: number;
    /** First-person hand colors sampled from the avatar texture; sleeve is skin for bare forearms. */
    readonly hands: { readonly skin: number; readonly sleeve: number };
    /** False when the avatar's fingers are modelled clenched around a prop, so its skinned hand cannot pose. */
    readonly skinnedHands: boolean;
}

export const TRAVELERS: readonly Traveler[] = [
    { id: 'family', name: 'Sari', category: 'Family vacationer', description: 'Snacks packed. Plush toy aboard. Now, where is the buffet?', assetName: 'traveler_family', marks: 110, energy: 90, hands: { skin: 0xf2b59a, sleeve: 0xbb3739 }, skinnedHands: true },
    { id: 'senior', name: 'Eero', category: 'Senior cruise regular', description: 'Knows every deck, every dance, and exactly when dinner starts.', assetName: 'traveler_senior', marks: 120, energy: 80, hands: { skin: 0xf4ba9d, sleeve: 0x3c3a45 }, skinnedHands: true },
    { id: 'party', name: 'Milla', category: 'Partygoer', description: 'One overnight cruise. Enough enthusiasm for an entire weekend.', assetName: 'traveler_party', marks: 80, energy: 110, hands: { skin: 0xedb59b, sleeve: 0x784eb4 }, skinnedHands: true },
    { id: 'shopper', name: 'Jari', category: 'Tax-free shopper', description: 'Came for the sea air. Brought extra bags just in case.', assetName: 'traveler_shopper', marks: 130, energy: 70, hands: { skin: 0xe0b5a0, sleeve: 0xe0b5a0 }, skinnedHands: false },
    { id: 'road', name: 'Anu', category: 'Road traveler', description: 'The car is parked below. The next adventure can wait until morning.', assetName: 'traveler_road', marks: 100, energy: 100, hands: { skin: 0xedc49a, sleeve: 0x65985f }, skinnedHands: false },
    { id: 'driver', name: 'Timo', category: 'Professional driver', description: 'Freight secured, thermos filled. Time for a well-earned break.', assetName: 'traveler_driver', marks: 90, energy: 105, hands: { skin: 0xdda483, sleeve: 0x20539d }, skinnedHands: true },
];

export function travelerAssetUrl(traveler: Traveler, data: GameData | null): string {
    const asset = data?.assets?.find(asset => asset.name === traveler.assetName);
    if (!asset?.url) throw new Error(`The ${traveler.category.toLowerCase()} avatar is unavailable. Please try again.`);
    return asset.url;
}
