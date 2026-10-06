import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try { for (const mobile of [false, true]) {
    const page = await browser.newPage(mobile ? { ...devices['iPhone 14'] } : { viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(() => window.gameTemplate?.getGameEngine()?.genreModule?.slotMachine?.body, null, { timeout: 90000 });
    await startVoyage(page);
    const sample = () => page.evaluate(() => {
        const e = window.gameTemplate.getGameEngine(), g = e.genreModule, pc = e.getPlayerController();
        return { strength: g.swellOptions.amplitudeScale, roll: g.shipSwell.getRoll(), heave: g.shipSwell.getHeave(),
            q: e.camera.quaternion.toArray(), y: e.camera.position.y, ground: pc.getGroundPosition().toArray(),
            baseY: pc.player.position.y + g.cameraManager.getFirstPersonCamera().getEyeHeight() };
    });
    const place = async (x, z) => {
        await page.evaluate(({x,z}) => {
            const pc = window.gameTemplate.getGameEngine().getPlayerController();
            pc.teleportTo(x, .15, z); pc.cameraController.setHorizontalAngle(0); pc.cameraController.setVerticalAngle(0);
        }, {x,z});
        await page.waitForTimeout(1200);
    };
    assert.equal((await sample()).strength, 0, 'Gangway starts steady');
    await place(0, 18);
    const frames = [];
    for (let i = 0; i < 20; i++) { await page.waitForTimeout(200); frames.push(await sample()); }
    assert.ok(frames.at(-1).strength > .49, 'Swell fades in aboard');
    assert.ok(Math.max(...frames.map(f => f.roll)) - Math.min(...frames.map(f => f.roll)) > .002, 'Roll changes over time');
    for (const f of frames) {
        assert.ok(Math.abs(f.roll) <= .0115 && Math.abs(f.heave) <= .075, 'Swell stays gentle');
        assert.ok(Math.abs(f.q[2] - Math.sin(f.roll / 2)) < .001, 'Render camera receives the roll');
        assert.ok(Math.abs(f.y - f.baseY - f.heave) < .005, 'Heave applies once without drift');
        assert.ok(Math.hypot(f.ground[0], f.ground[2] - 18) < .02, 'Physics remains stationary');
    }
    await page.evaluate(() => window.gameTemplate.getGameEngine().gameStateManager.setPaused(true, 'system'));
    await page.waitForTimeout(200); const paused = await sample();
    await page.waitForTimeout(600); const later = await sample();
    assert.equal(later.roll, paused.roll); assert.equal(later.heave, paused.heave);
    assert.ok(Math.abs(later.y - paused.y) < .005, 'Paused sway cannot accumulate');
    await page.evaluate(() => window.gameTemplate.getGameEngine().gameStateManager.setPaused(false, 'system'));
    await place(-9, 5.35);
    if (mobile) {
        const r = await page.locator('.hud-interaction-prompt').boundingBox();
        await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
    } else await page.keyboard.press('KeyE');
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(() => window.gameTemplate.getGameEngine().genreModule.chairSeating.isSettledSeated), true);
    const seated = await sample();
    assert.ok(Math.abs(seated.y - seated.baseY - seated.heave) < .005, 'Seated camera retains the swell');
    await page.screenshot({ path: `.bitmagic/swell-${mobile ? 'mobile' : 'desktop'}.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(5000);
    assert.ok((await sample()).strength < .001, 'Reduced motion fades out sway');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    if (mobile) await page.getByText('STAND', { exact: true }).tap();
    else { await page.keyboard.down('KeyF'); await page.waitForTimeout(100); await page.keyboard.up('KeyF'); }
    await page.waitForTimeout(1400);
    assert.equal(await page.evaluate(() => window.gameTemplate.getGameEngine().genreModule.chairSeating.isSeated), false);
    await place(-27, 14.25); await page.waitForTimeout(5000);
    assert.ok((await sample()).strength < .001, 'Returning to gangway fades out sway');
    assert.deepEqual(errors, []);
    console.log('PASS', mobile ? 'phone' : 'desktop', 'swell, stable physics, no drift, pause, seating, reduced motion, gangway');
    await page.close();
} } finally { await browser.close(); }
