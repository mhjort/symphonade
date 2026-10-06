import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
const out = '.bitmagic/pub-lighting';
await fs.mkdir(out, { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(() => window.gameTemplate?.getGameEngine()?.genreModule?.roomLighting, null, { timeout: 120000 });
    await startVoyage(page);
    const place = async (z, y = .15) => {
        await page.evaluate(({ z, y }) => {
            const pc = window.gameTemplate.getGameEngine().getPlayerController();
            pc.teleportTo(0, y, z);
            pc.cameraController.setHorizontalAngle(-.32);
            pc.cameraController.setVerticalAngle(.02);
        }, { z, y });
        await page.waitForTimeout(3000);
    };
    const state = () => page.evaluate(() => {
        const e = window.gameTemplate.getGameEngine();
        let lights = 0;
        const hemispheres = [];
        e.scene.traverse(o => {
            if (o.isLight) lights++;
            if (o.isHemisphereLight) hemispheres.push([o.intensity, o.color.getHex()]);
        });
        return { config: e.getLightingConfig(), hemispheres, lights };
    });
    await place(-20);
    const base = await state();
    await place(-28);
    const pub = await state();
    assert.ok(pub.config.ambientFloor < base.config.ambientFloor * .4, 'Pub dims ambient fill');
    assert.ok(pub.config.environmentIntensity < base.config.environmentIntensity, 'Pub reduces daylight');
    assert.equal(pub.lights, base.lights, 'Entering never changes the light count');
    await page.screenshot({ path: `${out}/sea-pub-warm.png` });
    await place(-20);
    assert.deepEqual(await state(), base, 'Leaving restores baseline lighting exactly');
    await place(44);
    const club = await state();
    assert.ok(club.config.ambientFloor < pub.config.ambientFloor, 'Starlight retains its darker mood');
    assert.equal(club.lights, base.lights);
    await place(-28);
    assert.deepEqual(await state(), pub, 'Direct Starlight-to-pub transition does not inherit nightclub lighting');
    await place(-28, 4.1);
    assert.deepEqual(await state(), base, 'Deck above pub does not activate pub ambience');
    await place(-20);
    assert.deepEqual(await state(), base);
    assert.deepEqual(errors, []);
    console.log('PUB_DIMMING_RESTORE_CLUB_TRANSITION_UPPER_DECK_AND_CONSTANT_LIGHT_COUNT_PASS');
} finally { await browser.close(); }
