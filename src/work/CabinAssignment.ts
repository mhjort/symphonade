import type { WorldProfileData } from 'types/game.js';

export interface CabinAssignment {
    readonly id: string;
    readonly deck: number;
    readonly floorY: number;
    readonly keyId: string;
    readonly roomName: string;
    readonly view: 'Sea view' | 'Promenade view';
}

/** Pick once per game, independently of the fixed ship/world seed. */
export function pickCabin(profile: WorldProfileData,
    links: readonly { door?: string | null; to: string }[], random: () => number = Math.random): CabinAssignment {
    const cabins: CabinAssignment[] = [];
    for (const door of profile.doors ?? []) {
        if (door.kind !== 'locked' || !door.keyId?.startsWith('room-')) continue;
        const room = links.find(link => link.door === door.id);
        if (!room) continue;
        cabins.push({ id: door.id, deck: Number(door.id[0]), floorY: door.position.y - door.height / 2, keyId: door.keyId, roomName: room.to,
            view: door.position.x > 11 ? 'Sea view' : 'Promenade view' });
    }
    if (!cabins.length) throw new Error('No playable cabins available for passenger assignment');
    cabins.sort((a, b) => Number(a.id) - Number(b.id));
    const selected = cabins[Math.floor(random() * cabins.length)];
    if (!selected) throw new Error('Cabin selection requires a random value from 0 up to 1');
    return Object.freeze(selected);
}
