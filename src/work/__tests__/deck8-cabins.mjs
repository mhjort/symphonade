import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
const worldData = JSON.parse(await fs.readFile('src/work/world.json', 'utf8'));
const placements = worldData.worldProfileData.doors.filter(door => door.keyId?.startsWith('room-'))
    .sort((a, b) => a.position.z - b.position.z || a.position.x - b.position.x)
    .map(door => ({ id: door.id, template: door.position.x > 11 ? 'sea' : 'promenade', z: door.position.z }));
assert.deepEqual(placements.map(cabin => cabin.id), Array.from({length:18}, (_, i) => String(8401+i)),
    'Cabins ascend in consecutive odd/even pairs from aft to forward');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    if (process.env.LOCAL_CABIN_ASSETS) {
        // Pre-upload review: serve local GLBs to this test page only. Nothing is
        // uploaded and the production asset registry is not modified.
        const world = JSON.parse(await fs.readFile('src/work/world.json', 'utf8'));
        for (const [id, file, height] of [
            ['ship-base', 'base', 56.61973571777344],
            ['cabin-promenade', 'cabin-promenade', 3.65],
            ['cabin-sea', 'cabin-sea', 3.65],
            ['cabin-door-shared', 'cabin-door-shared', 2.2],
        ]) {
            const url = `http://localhost:${gamePort}/__cabin-test/${file}.glb`;
            world.assets = world.assets.filter(asset => asset.id !== id);
            world.assets.push({ id, name: id, type: 'glb', url, sourceGlbUrl: url, targetHeight: height });
            await page.route(url, route => route.fulfill({
                path: `build/level/deck8-cabins/${file}.glb`, contentType: 'model/gltf-binary',
            }));
        }
        await page.route('**/src/work/world.json*', route => route.fulfill({
            body: JSON.stringify(world), contentType: 'application/json',
        }));
    }
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(() => {
        const e = window.gameTemplate?.getGameEngine();
        const readers = e?.genreModule?.cabinDoorReaders?.readers;
        return readers?.length === 18 && readers.every(r => r.leaf)
            && e.getWorldGroup().getObjectByName('Cabin instances: sea');
    }, null, { timeout: 120000 });
    await startVoyage(page);
    const place = async (x, z, yaw) => {
        await page.evaluate(({ x, z, yaw }) => {
            const pc = window.gameTemplate.getGameEngine().getPlayerController();
            pc.teleportTo(x, 3.42, z);
            pc.cameraController.setHorizontalAngle(yaw);
            pc.cameraController.setVerticalAngle(0);
        }, { x, z, yaw });
        await page.waitForTimeout(400);
    };
    const walk = async (ms) => {
        await page.keyboard.down('w'); await page.waitForTimeout(ms); await page.keyboard.up('w');
    };
    const stats = await page.evaluate(() => {
        const e = window.gameTemplate.getGameEngine();
        return ['promenade', 'sea'].map(template => {
            const group = e.getWorldGroup().getObjectByName(`Cabin instances: ${template}`);
            return group.children.map(mesh => ({ instances: mesh.count, instanced: mesh.isInstancedMesh }));
        });
    });
    assert.ok(stats.every(group => group.length > 0 && group.every(mesh => mesh.instanced && mesh.instances === 8)));
    await fs.mkdir('.bitmagic/deck8-cabins', { recursive: true });
    const assigned = await page.evaluate(() => {
        const e=window.gameTemplate.getGameEngine(), cabin=e.genreModule.assignedCabin;
        e.getDoorSystem().getKeyring().grant(cabin.keyId); return cabin;
    });
    for (const cabin of placements) {
        const sea = cabin.template === 'sea';
        await place(sea ? 11.3 : 10.7, cabin.z, sea ? -Math.PI / 2 : Math.PI / 2);
        // A closed leaf must physically block entry, including both row ends.
        await walk(500);
        const blocked = await page.evaluate(() => window.gameTemplate.getGameEngine().getPlayerController().getPosition().x);
        assert.ok(sea ? blocked < 12 : blocked > 10, `${cabin.id}: closed door blocks entry`);
        if (cabin.id !== assigned.id) {
            await page.evaluate(id => window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders.tryDoor(id), cabin.id);
            await page.waitForFunction(() => !window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders.active);
            assert.equal(await page.evaluate(id => window.gameTemplate.getGameEngine().getDoorSystem().getDoorState(id), cabin.id), 'closed', `${cabin.id}: rejects assigned cabin card`);
        }
        await page.evaluate(id => {
            const e = window.gameTemplate.getGameEngine();
            e.getDoorSystem().getKeyring().grant(`room-${id}`);
            e.genreModule.cabinDoorReaders.tryDoor(id);
        }, cabin.id);
        await page.waitForFunction(id => window.gameTemplate.getGameEngine().getDoorSystem().getDoorState(id) === 'open', cabin.id);
        await walk(900);
        const inside = await page.evaluate(() => {
            const p = window.gameTemplate.getGameEngine().getPlayerController().getPosition();
            return { x: p.x, y: p.y, z: p.z };
        });
        assert.ok(sea ? inside.x > 12.4 : inside.x < 9.6, `${cabin.id}: walks through the real opening (${inside.x})`);
        assert.ok(inside.y > 3.2 && inside.y < 3.8, `${cabin.id}: stands on cabin floor`);
        if (['8403', '8404', '8417', '8418'].includes(cabin.id)) {
            await page.screenshot({ path: `.bitmagic/deck8-cabins/${cabin.id}.png` });
        }
        await page.waitForFunction(() => !window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders.active);
        await place(sea ? 13 : 9, cabin.z, sea ? Math.PI / 2 : -Math.PI / 2);
        assert.equal(await page.evaluate(id => window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders.tryDoor(id), cabin.id), true);
        await walk(850);
        const outside = await page.evaluate(() => window.gameTemplate.getGameEngine().getPlayerController().getPosition().x);
        assert.ok(outside > 10 && outside < 12, `${cabin.id}: can exit to corridor (${outside})`);
        console.log(`PASS ${cabin.id}: lock, card rejection, entry, floor, exit`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: all 18 cabins numbered in order and walkable; two shared instanced room assets.');
} finally { await browser.close(); }
