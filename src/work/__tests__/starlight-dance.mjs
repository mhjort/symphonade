import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
await fs.mkdir('.bitmagic/dance', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try { for (const mobile of [false, true]) {
    const page = await browser.newPage(mobile ? { ...devices['iPhone 14'] } : { viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(() => window.gameTemplate?.getGameEngine()?.genreModule?.slotMachine?.body, null, { timeout: 90000 });
    await startVoyage(page);
    const state = () => page.evaluate(() => {
        const g = window.gameTemplate.getGameEngine().genreModule;
        return { active: g.starlightDance.active, camera: g.cameraManager.getMode(), energy: g.energy.value };
    });
    const place = async (x,y,z) => {
        await page.evaluate(p => window.gameTemplate.getGameEngine().getPlayerController().teleportTo(...p), [x,y,z]);
        await page.waitForTimeout(1000);
    };
    const toggle = async () => {
        if (mobile) {
            await page.waitForFunction(() => document.querySelector('.hud-interaction-prompt[data-visible]')?.textContent.toLowerCase().includes('danc'));
            const box = await page.locator('.hud-interaction-prompt').boundingBox();
            assert.ok(box?.width && box.height, 'Existing phone interaction prompt is visible');
            await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        }
        else { await page.keyboard.down('KeyE'); await page.waitForTimeout(100); await page.keyboard.up('KeyE'); }
        await page.waitForTimeout(250);
    };
    await place(0,.1,46);
    // Set up the existing post-check-in tour with only the disco objective left.
    await page.evaluate(() => {
        const e = window.gameTemplate.getGameEngine(), g = e.genreModule;
        e.getDoorSystem().getKeyring().grant(g.assignedCabin.keyId);
        g.hasBoarded = true; g.roomEntered = true; g.clerkMessageUntil = 0;
        g.visited = new Set(['Bon Vivant', 'Cafe', g.assignedCabin.roomName, 'Sea View Lounge']);
    });
    await page.waitForTimeout(500);
    const quest = () => page.evaluate(() => {
        const g = window.gameTemplate.getGameEngine().genreModule;
        return { completed: g.visited.has('Starlight'), count: g.visited.size,
            celebrated: g.celebration.completed.has('dance-Starlight') };
    });
    assert.deepEqual(await quest(), { completed: false, count: 4, celebrated: false }, 'Visiting the disco does not complete the quest');
    await page.getByText('Dance at the Starlight disco · 4 / 5', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.gameTemplate.getGameEngine().genreModule.declareMobileActions().map(a => a.desktopKeys)), [['KeyF']]);
    if (!mobile) { await page.keyboard.press('KeyB'); assert.equal((await state()).active, false); }
    await toggle();
    assert.equal((await state()).active, true);
    assert.deepEqual(await quest(), { completed: true, count: 5, celebrated: true }, 'Actually dancing completes and celebrates the quest');
    assert.equal((await state()).camera, 'first-person');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `.bitmagic/dance/${mobile ? 'mobile' : 'desktop'}.png` });
    const pose = () => page.evaluate(() => {
        const d = window.gameTemplate.getGameEngine().genreModule.starlightDance;
        return { visible: d.root.visible, hands: d.hands.map(h => h.position.toArray()) };
    });
    const firstPose = await pose();
    await page.waitForTimeout(220);
    assert.equal(firstPose.visible, true);
    assert.notDeepEqual((await pose()).hands, firstPose.hands, 'Hands perform animated moves');
    const rates = await page.evaluate(() => {
        const g = window.gameTemplate.getGameEngine().genreModule, e = g.energy;
        const a = e.value; e.update(3, false); const b = e.value; e.update(3, g.starlightDance.active);
        return { normal: a-b, dancing: b-e.value };
    });
    assert.ok(Math.abs(rates.dancing / rates.normal - 3) < 1e-8);
    await toggle();
    assert.equal((await state()).active, false);
    assert.equal((await state()).camera, 'first-person');
    assert.deepEqual(await quest(), { completed: true, count: 5, celebrated: true }, 'Stopping preserves completion');
    await toggle();
    if (!mobile) {
        await page.keyboard.down('KeyW'); await page.waitForTimeout(250); await page.keyboard.up('KeyW');
        assert.equal((await state()).active, false, 'Walking stops the dance');
        await place(0,.1,46); await toggle();
    }
    await place(0,.1,30);
    assert.equal((await state()).active, false);
    if (!mobile) { await toggle(); assert.equal((await state()).active, false); }
    await place(0,.1,46); await toggle();
    await page.evaluate(() => { window.gameTemplate.getGameEngine().genreModule.energy.amount = 0; });
    await page.waitForTimeout(250);
    assert.equal((await state()).active, false);
    assert.deepEqual(errors, []);
    console.log('PASS', mobile ? 'mobile' : 'desktop', 'dance toggle, first-person, exact triple drain, room exit, exhaustion');
    await page.close();
} } finally { await browser.close(); }
