import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startVoyage } from './start-voyage.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
await fs.mkdir('.bitmagic/sleep', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try { for (const mobile of [false, true]) {
    const page = await browser.newPage(mobile ? { ...devices['iPhone 14'] } : { viewport: { width: 1280, height: 900 } });
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(() => window.gameTemplate?.getGameEngine()?.genreModule?.energy, null, { timeout: 90000 });
    await startVoyage(page);
    const place = async (x, y, z) => {
        await page.evaluate(p => window.gameTemplate.getGameEngine().getPlayerController().teleportTo(...p), [x, y, z]);
        await page.waitForTimeout(1000);
    };
    const state = () => page.evaluate(() => {
        const g = window.gameTemplate.getGameEngine().genreModule;
        return { sleeping: g.chairSeating.isSleeping, energy: g.energy.value, clock: g.voyageClock.shipMinutes,
            dizzy: g.dizziness.secondsRemaining,
            pitch: g.cameraManager.getFirstPersonCamera().getPitchAngle(),
            view: g.player.position.toArray(),
            position: g.playerController.getGroundPosition().toArray(), bed: g.chairSeating.availableSeat?.bed ?? false };
    });
    await place(7.4, 3.4, -6.9);
    assert.equal((await state()).bed, false, 'No sleeping through the back wall');
    await place(7.4, .1, -9);
    assert.equal((await state()).bed, false, 'No bed interaction from the deck below');
    for (const x of [7.4, 14.6]) {
        await place(x, 3.4, -9);
        await page.evaluate(() => window.gameTemplate.getGameEngine().genreModule.energy.initializeTraveler(50));
        const before = await state();
        assert.equal(before.bed, true);
        if (mobile) await page.locator('.hud-interaction-prompt').tap();
        else await page.keyboard.press('KeyE', { delay: 150 });
        try { await page.waitForFunction(() => window.gameTemplate.getGameEngine().genreModule.chairSeating.isSleeping); }
        catch (error) { console.log(await state()); await page.screenshot({ path: '.bitmagic/sleep/failure.png' }); throw error; }
        const asleep = await state();
        assert.ok(asleep.pitch < -1.35, 'Lying on the back faces up toward the ceiling');
        assert.ok(Math.abs(asleep.view[0] - (x + (x < 11 ? -.7 : .7))) < .05, 'Head settles over the authored pillow');
        await page.evaluate(() => window.gameTemplate.getGameEngine().genreModule.dizziness.drinkBeer());
        const dozing = await state();
        await page.waitForTimeout(1200);
        const rested = await state();
        assert.ok(rested.energy > 51, 'Sleeping restores energy over actual frames');
        // Normal rate is 1050 ship minutes per 3600 s; sleep runs it 12x faster.
        const ratio = (rested.clock - dozing.clock) / ((dozing.dizzy - rested.dizzy) * 1050 / 3600);
        assert.ok(rested.clock - dozing.clock > 2.5, `Sleeping fast-forwards the ship clock (${rested.clock - dozing.clock} ship min)`);
        assert.ok(Math.abs(ratio - 1) < .05, `Dizziness wears off on the same accelerated time (${ratio})`);
        assert.ok((await page.locator('body').innerText()).includes('Time flies'));
        await page.keyboard.down('KeyW');
        await page.waitForTimeout(400);
        await page.keyboard.up('KeyW');
        assert.equal((await state()).sleeping, true);
        const capped = await page.evaluate(() => {
            const e = window.gameTemplate.getGameEngine().genreModule.energy;
            e.update(100, false, true);
            return e.value;
        });
        assert.equal(capped, 100, 'Sleep caps normal energy at 100%');
        await page.screenshot({ path: `.bitmagic/sleep/${mobile ? 'mobile' : 'desktop'}-${x}.png` });
        if (mobile) await page.getByText('WAKE', { exact: true }).tap();
        else await page.keyboard.press('KeyF', { delay: 150 });
        await page.waitForTimeout(2300);
        const after = await state();
        assert.equal(after.sleeping, false);
        assert.ok(Math.abs(after.pitch - before.pitch) < .02, 'Waking restores the original upright look angle');
        assert.ok(Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]) < .1,
            'Wake returns the player to the safe position beside the bed');
        assert.ok(after.energy < 100, 'Normal energy drain resumes');
        const awake = after.clock; await page.waitForTimeout(1000);
        assert.ok((await state()).clock - awake < .5, 'Clock returns to normal speed after waking');
    }
    await page.close();
    console.log(`${mobile ? 'Mobile' : 'Desktop'} cabin sleep passed`);
} } finally { await browser.close(); }
