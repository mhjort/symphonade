import { startVoyage } from './start-voyage.mjs';
// PLAYWRIGHT_MODULE may point to the CLI's installed playwright-core/index.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
await fs.mkdir('.bitmagic/context-controls', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try { for (const mobile of (process.env.TEST_PLATFORM === 'mobile' ? [true] : [false, true])) {
    const page = await browser.newPage(mobile ? { ...devices['iPhone 14'] } : { viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(() => window.gameTemplate?.getGameEngine()?.genreModule?.slotMachine?.body, null, { timeout: 90000 });
    await startVoyage(page);
    await page.waitForTimeout(1000);
    const state = () => page.evaluate(() => {
        const e = window.gameTemplate.getGameEngine(), g = e.genreModule;
        return { balance: g.coffeeShop.balance, full: g.coffeeMug.hasDrink, energy: g.energy.value,
            seated: g.chairSeating.isSeated, settled: g.chairSeating.isSettledSeated,
            motion: g.coffeeMug.motion?.kind, spin: g.slotMachine.spin, left: g.coffeeMug.leftEmpties.length,
            standVisible: !!e.getPlayerController().getMobileControls().getButton('stand')?.getBoundingClientRect().width };
    });
    const place = async (x, y, z, yaw = 0) => {
        await page.evaluate(({ x, y, z, yaw }) => {
            const pc = window.gameTemplate.getGameEngine().getPlayerController();
            pc.teleportTo(x, y, z); pc.cameraController.setHorizontalAngle(yaw); pc.cameraController.setVerticalAngle(0);
        }, { x, y, z, yaw });
        await page.waitForTimeout(650);
    };
    const key = async code => { await page.keyboard.down(code); await page.waitForTimeout(100); await page.keyboard.up(code); };
    const interact = async text => {
        if (mobile) {
            // The engine refreshes prompt innerHTML every frame; tap its screen
            // coordinates like a finger rather than retaining a transient span.
            await page.waitForFunction(text => document.querySelector('.hud-interaction-prompt[data-visible]')?.textContent.includes(text), text);
            const box = await page.locator('.hud-interaction-prompt').boundingBox();
            assert.ok(box, `Missing phone action: ${text}`);
            await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        }
        else await key('KeyE');
        await page.waitForTimeout(100);
    };
    const stand = async () => { if (mobile) await page.getByText('STAND', { exact: true }).tap(); else await key('KeyF'); await page.waitForTimeout(1300); };
    assert.equal((await state()).standVisible, false);
    assert.deepEqual(await page.evaluate(() => window.gameTemplate.getGameEngine().genreModule.declareMobileActions().map(a => a.desktopKeys)), [['KeyF']]);

    await place(-3.8, .1, 33.3, Math.PI);
    await page.getByText('Spin · 5 mk', { exact: true }).waitFor({ state: 'visible' });
    await page.screenshot({ path: `.bitmagic/context-controls/${mobile ? 'mobile' : 'desktop'}-slot.png` });
    if (!mobile) { for (const old of ['KeyG', 'KeyR', 'KeyL', 'KeyF']) await key(old); assert.equal((await state()).balance, 100); }
    await interact('Spin · 5 mk');
    assert.equal((await state()).balance, 95, 'One interaction debits exactly once');
    await page.evaluate(() => { window.gameTemplate.getGameEngine().genreModule.slotMachine.spin.result = [0, 1, 2]; });
    if (!mobile) { await page.keyboard.down('KeyE'); await page.waitForTimeout(4000); await page.keyboard.up('KeyE'); }
    else await page.waitForTimeout(4000);
    assert.equal((await state()).balance, 95, 'Holding E cannot repeat the spin');
    assert.equal((await state()).spin, null);
    await place(-3.8, .1, 33.3, 0);
    assert.equal(await page.evaluate(() => window.gameTemplate.getGameEngine().genreModule.slotMachine.accessible()), false, 'Facing restriction remains');
    assert.equal((await state()).balance, 95);
    console.log('PASS', mobile ? 'phone' : 'desktop', 'slot input, nearest-target prompt, held key, old keys and facing');

    await place(-11.25, .1, 3);
    await interact('Buy coffee · 10 mk');
    await page.waitForTimeout(3000);
    assert.equal((await state()).balance, 85);
    assert.equal((await state()).full, true);
    await place(-9, .1, 5.35);
    await page.getByText('Sit down', { exact: true }).waitFor({ state: 'visible' });
    if (!mobile) { await key('KeyF'); assert.equal((await state()).seated, false); }
    await interact('Sit down'); await page.waitForTimeout(2100);
    assert.equal((await state()).settled, true);
    assert.equal((await state()).full, true, 'The sit press must not also drink');
    assert.equal((await state()).balance, 85, 'Sitting must not trigger another purchase');
    if (mobile) {
        assert.equal((await state()).standVisible, true);
        assert.equal(await page.evaluate(() => {
            const a = document.querySelector('[data-action="stand"]').getBoundingClientRect();
            const b = document.querySelector('.hud-interaction-prompt').getBoundingClientRect();
            return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        }), false, 'Stand and Drink touch targets must not overlap');
    }
    await page.screenshot({ path: `.bitmagic/context-controls/${mobile ? 'mobile' : 'desktop'}-seated.png` });
    await stand();
    assert.equal((await state()).seated, false);
    assert.equal((await state()).full, true, 'Standing never requires drinking');
    assert.equal((await state()).standVisible, false);
    await interact('Sit down'); await page.waitForTimeout(2100);
    const beforeCancel = await state();
    await interact('Drink coffee · +10% energy');
    assert.equal((await state()).motion, 'drinking');
    await stand();
    assert.equal((await state()).full, true, 'Interrupted sip retains coffee');
    assert.ok((await state()).energy <= beforeCancel.energy);
    await interact('Sit down'); await page.waitForTimeout(2100);
    const beforeDrink = await state();
    await interact('Drink coffee · +10% energy'); await page.waitForTimeout(2100);
    assert.equal((await state()).full, false);
    assert.ok(Math.abs((await state()).energy - beforeDrink.energy - 10) < .2);
    await stand();
    assert.equal((await state()).left, 1);
    console.log('PASS', mobile ? 'phone' : 'desktop', 'buy, E sit, F stand, seated drink, interruption, exactly one energy award');
    await page.evaluate(() => {
        const e = window.gameTemplate.getGameEngine(), lift = e.genreModule.promenadeElevators.lifts[0];
        e.getPlayerController().teleportTo(lift.x, lift.height + .05, lift.z);
        e.getPlayerController().cameraController.setHorizontalAngle(-Math.PI / 2);
    });
    await page.waitForTimeout(900);
    await interact('Travel to deck 8');
    await page.waitForFunction(() => window.gameTemplate.getGameEngine().genreModule.promenadeElevators.lifts[0].floor === 1, null, { timeout: 15000 });
    assert.ok(await page.evaluate(() => window.gameTemplate.getGameEngine().getPlayerController().getPosition().y > 3));
    await interact('Travel to deck 7');
    await page.waitForFunction(() => window.gameTemplate.getGameEngine().genreModule.promenadeElevators.lifts[0].floor === 0, null, { timeout: 15000 });
    console.log('PASS', mobile ? 'phone' : 'desktop', 'E lift travel both directions');

    await place(-3.8, .1, 33.3, Math.PI);
    await page.evaluate(() => window.gameTemplate.getGameEngine().gameStateManager.setPaused(true, 'system'));
    const paused = await state();
    await key('KeyE'); await key('KeyF');
    await page.waitForTimeout(500);
    assert.deepEqual(await state(), paused, 'Pause blocks input and freezes gameplay');
    await page.evaluate(() => window.gameTemplate.getGameEngine().gameStateManager.setPaused(false, 'system'));
    await page.waitForTimeout(400);
    assert.equal((await state()).spin, null, 'Paused input cannot replay on resume');
    console.log('PASS', mobile ? 'phone' : 'desktop', 'pause and stale input');
    assert.deepEqual(errors, []);
    await page.close();
} } finally { await browser.close(); }
