import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
await fs.mkdir('.bitmagic/promenade-lighting', { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(() => window.gameTemplate?.getGameEngine()?.genreModule?.promenadeLighting, null, { timeout: 120000 });
    await startVoyage(page);
    await page.waitForTimeout(15000);
    await page.evaluate(() => {
        const e = window.gameTemplate.getGameEngine();
        e.getPlayerController().teleportTo(0, .15, -17);
        e.getPlayerController().cameraController.setHorizontalAngle(Math.PI);
        e.getPlayerController().cameraController.setVerticalAngle(1.4);
        e.genreModule.voyageClock.update = () => {};
    });
    const at = async minutes => {
        await page.evaluate(minutes => {
            const g = window.gameTemplate.getGameEngine().genreModule;
            g.voyageClock.elapsedShipMinutes = minutes;
            g.promenadeLighting.update(minutes);
        }, minutes);
        await page.waitForTimeout(2000);
        return page.evaluate(() => {
            const p = window.gameTemplate.getGameEngine().genreModule.promenadeLighting;
            return { blend: p.applied, lamps: p.lamps.map(({light}) => [light.color.getHex(), light.intensity]),
                materials: p.materials.map(({material}) => [material.name, material.color.getHex(), material.emissive.getHex(), material.emissiveIntensity]),
                washes: p.washes.map(light => light.intensity) };
        });
    };
    const day = await at(0);
    assert.equal(day.lamps.length, 3);
    assert.equal(day.materials.length, 2);
    await page.screenshot({ path: '.bitmagic/promenade-lighting/day.png' });
    const dusk = await at(210);
    assert.ok(dusk.blend > 0 && dusk.blend < 1);
    const night = await at(300);
    assert.equal(night.blend, 1);
    assert.notDeepEqual(night.lamps, day.lamps);
    assert.ok(night.washes.every(i => i === 55));
    await page.screenshot({ path: '.bitmagic/promenade-lighting/evening.png' });
    assert.deepEqual(await at(479.99), await at(480), 'Clock rollback keeps the evening lighting');
    assert.deepEqual(await at(930), day, 'Morning restores all authored colors and brightness');
    await page.evaluate(() => {
        const e = window.gameTemplate.getGameEngine();
        const pc = e.getPlayerController();
        pc.teleportTo(11, 3.42, 12);
        pc.cameraController.setHorizontalAngle(Math.PI);
        pc.cameraController.setVerticalAngle(1.57);
    });
    await at(0);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: '.bitmagic/promenade-lighting/corridor-day.png' });
    await at(300);
    await page.screenshot({ path: '.bitmagic/promenade-lighting/corridor-evening.png' });
    assert.deepEqual(errors, []);
    console.log('PROMENADE_DAY_DUSK_NIGHT_CLOCK_ROLLBACK_MORNING_PASS');
} finally { await browser.close(); }
