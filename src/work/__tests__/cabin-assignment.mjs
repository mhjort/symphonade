import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pickCabin } from '../../../dist/src/work/CabinAssignment.js';

const { worldProfileData: profile } = JSON.parse(await fs.readFile('src/work/world.json', 'utf8'));
const level = JSON.parse(await fs.readFile('src/work/serenade.mesh-level.json', 'utf8'));
const selected = Array.from({length:36}, (_, i) => pickCabin(profile, level.extras.links, () => (i + .5) / 36));
assert.deepEqual(selected.map(c => c.id), [...Array.from({length:18}, (_, i) => String(8401+i)), ...Array.from({length:18}, (_, i) => String(9401+i))]);
for (const cabin of selected) {
    const door = profile.doors.find(d => d.id === cabin.id);
    const room = level.volumes.find(v => v.name === cabin.roomName);
    assert.equal(cabin.keyId, door.keyId);
    assert.equal(cabin.deck, Number(cabin.id[0]));
    assert.ok(Math.abs(cabin.floorY - (cabin.deck === 9 ? 7.05 : 3.4)) < .001);
    assert.equal(room.position[2], door.position.z);
    assert.equal(cabin.view, Number(cabin.id) % 2 ? 'Promenade view' : 'Sea view');
    assert.ok(Object.isFrozen(cabin));
}
assert.equal(pickCabin(profile, level.extras.links, () => 0).id, '8401');
assert.equal(pickCabin(profile, level.extras.links, () => 1-Number.EPSILON).id, '9418');
assert.throws(() => pickCabin({...profile, doors:[]}, level.extras.links), /No playable cabins/);
console.log('PASS: all 36 cabins selectable; correct key, room and view; random range endpoints.');
