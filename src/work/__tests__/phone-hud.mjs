import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
await fs.mkdir('.bitmagic/phone-hud', { recursive: true });
const browser = await chromium.launch({channel:'chrome', headless:true, args:['--enable-unsafe-webgpu']});
// Status texts, objective stack and engine buttons must not overlap on portrait phones.
const ids = ['energy','dizziness','ship-clock','trip-points','bon-vivant','area','tour','mute-button','pause-button'];
try { for (const device of ['iPhone 14', 'iPhone SE', 'Pixel 7']) {
    const page = await browser.newPage({serviceWorkers:'block', ...devices[device]});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.bonVivant?.npc,null,{timeout:120000});
    await startVoyage(page);
    await page.evaluate(()=>{const g=window.gameTemplate.getGameEngine().genreModule;g.bonVivant.book('19:30');g.dizziness.drinkBeer();g.dizziness.drinkBeer();g.tripPoints.award(1250);g.voyageClock.elapsedShipMinutes=500;});
    await page.waitForTimeout(7000); // let the departure and clock-change toasts clear
    const boxes = await page.evaluate(ids => ids.map(id => {
        const el = document.getElementById(`hud-icontext-${id}`) ?? document.getElementById(`hud-custom-${id}`);
        if (!el || getComputedStyle(el).display === 'none') return null;
        const r = el.getBoundingClientRect(); return { id, l: r.left, t: r.top, r: r.right, b: r.bottom, text: el.innerText.replace(/\s+/g, ' ').trim() };
    }).filter(Boolean), ids);
    assert.equal(boxes.length, ids.length, `All status elements visible on ${device}: ${boxes.map(b=>b.id)}`);
    const width = page.viewportSize().width;
    for (const [i, a] of boxes.entries()) {
        assert.ok(a.l >= 0 && a.r <= width, `${a.id} stays on screen on ${device}`);
        for (const b of boxes.slice(i + 1)) {
            const overlap = a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
            assert.ok(!overlap, `${a.id} overlaps ${b.id} on ${device}: ${JSON.stringify([a, b])}`);
        }
    }
    assert.equal(await page.locator('#hud-icontext-traveler-identity').count(), 0);
    const text = Object.fromEntries(boxes.map(b => [b.id, b.text]));
    assert.match(text['ship-clock'], /00:2\d SE$/); assert.match(text['trip-points'], /1250 TP$/);
    await page.screenshot({ path: `.bitmagic/phone-hud/${device.replace(/ /g, '-')}.png` });
    assert.deepEqual(errors, []);
    await page.close();
    console.log('PASS', device, 'phone HUD has no overlaps');
} } finally { await browser.close(); }
