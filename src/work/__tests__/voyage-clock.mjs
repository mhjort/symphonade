import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
const browser = await chromium.launch({channel:'chrome', headless:true, args:['--enable-unsafe-webgpu']});
const g = 'window.gameTemplate.getGameEngine().genreModule';
const open = async (mobile) => {
    const page = await browser.newPage({serviceWorkers:'block', ...(mobile ? {...devices['iPhone 14']} : {viewport:{width:1280,height:900}})});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.slotMachine?.body,null,{timeout:90000});
    await startVoyage(page);
    return { page, errors };
};
const clock = page => page.evaluate(new Function(`const c=${g}.voyageClock;return {minutes:c.shipMinutes,label:c.time.label,ended:${g}.voyageEnded,points:${g}.tripPoints.total};`));
const ended = page => page.waitForFunction(new Function(`return ${g}.voyageEnded`));
try {
    for (const mobile of [false, true]) {
        const label = mobile ? 'mobile' : 'desktop';
        // Clock, pause, clock change, trip points and arrival win.
        {
            const { page, errors } = await open(mobile);
            assert.ok((await page.locator('body').innerText()).includes('17:0'), 'Clock shows departure time');
            const a = await clock(page);
            assert.ok(a.label.startsWith('17:0') && a.label.endsWith('Finnish time'));
            await page.waitForTimeout(2000);
            const b = await clock(page);
            assert.ok(b.minutes > a.minutes + .3 && b.minutes < a.minutes + 1, `Clock runs ~17.5x (${b.minutes - a.minutes} ship min in 2 s)`);
            await page.evaluate(()=>window.gameTemplate.getGameEngine().gameStateManager.setPaused(true,'system'));
            const c = await clock(page); await page.waitForTimeout(800);
            assert.equal((await clock(page)).minutes, c.minutes, 'Paused clock does not advance');
            await page.evaluate(()=>window.gameTemplate.getGameEngine().gameStateManager.setPaused(false,'system'));
            await page.evaluate(new Function(`${g}.voyageClock.elapsedShipMinutes = 479.9`));
            await page.waitForFunction(new Function(`return ${g}.voyageClock.time.zone === 'SE'`));
            assert.match((await clock(page)).label, /^00:0\d · Swedish time$/);
            await page.waitForFunction(()=>document.body.innerText.includes('clocks go back one hour'));
            assert.ok((await page.locator('body').innerText()).includes('Swedish time'));
            await page.screenshot({path:`.bitmagic/voyage-clock-${label}.png`});
            // Room key quest: +50 TP once.
            await page.evaluate(()=>{const p=window.gameTemplate.getGameEngine().getPlayerController();p.teleportTo(4,.15,18);p.cameraController.setHorizontalAngle(-Math.PI/2);p.cameraController.setVerticalAngle(0);});
            await page.waitForTimeout(800);
            const interact = async () => { if (mobile) { const box = await page.locator('.hud-interaction-prompt').boundingBox(); assert.ok(box); await page.touchscreen.tap(box.x+box.width/2, box.y+box.height/2); } else { await page.keyboard.down('KeyE'); await page.waitForTimeout(100); await page.keyboard.up('KeyE'); } };
            await interact();
            await page.waitForFunction(new Function(`return ${g}.tripPoints.total === 50`));
            await interact(); await page.waitForTimeout(400);
            assert.equal((await clock(page)).points, 50, 'Repeated quest does not award again');
            assert.ok((await page.locator('body').innerText()).includes(mobile ? '50 TP' : '50 trip points'));
            // Finishing the welcome tour no longer ends the voyage.
            await page.evaluate(new Function(`const m=${g};for(const s of m.tourStops)m.visited.add(s);m.roomEntered=true;m.clerkMessageUntil=0;window.gameTemplate.getGameEngine().getPlayerController().teleportTo(1.5,.15,18);`));
            await page.waitForFunction(new Function(`return ${g}.celebration.has('welcome-tour')`));
            await page.waitForTimeout(500);
            const afterTour = await clock(page);
            assert.equal(afterTour.points, 250); assert.equal(afterTour.ended, false, 'Tour completion keeps the voyage going');
            // Activity quests: first coffee, first beer and the Silja jackpot pay once; ordinary slot wins pay nothing.
            await page.evaluate(new Function(`const m=${g};m.coffeeMug.onDrink();m.coffeeMug.onDrink();m.beerGlass.onDrink();m.slotMachine.onWin(false);`));
            assert.equal((await clock(page)).points, 300, 'Coffee and beer quests award 25 TP once each');
            await page.evaluate(new Function(`const m=${g};m.slotMachine.onWin(true);m.slotMachine.onWin(true);`));
            assert.equal((await clock(page)).points, 550, 'Jackpot quest awards 250 TP once');
            for (const id of ['first-coffee','first-beer','slot-jackpot'])
                assert.ok(await page.evaluate(new Function('id', `return ${g}.celebration.has(id)`), id));
            await page.evaluate(new Function(`${g}.voyageClock.elapsedShipMinutes = 1049.9`));
            await ended(page);
            await page.waitForFunction(()=>document.body.innerText.includes('Welcome to Stockholm!'));
            const text = await page.locator('body').innerText();
            assert.ok(text.includes('550'), 'Win screen shows trip points');
            assert.ok(text.includes('09:30 · Swedish time'));
            await page.screenshot({path:`.bitmagic/voyage-win-${label}.png`});
            assert.deepEqual(errors, []);
            await page.close();
        }
        // Exhaustion and too-dizzy loses.
        for (const [name, cause, title] of [
            ['energy', `${g}.energy.amount = 0`, 'You passed out'],
            ['dizzy', `const d=${g}.dizziness;d.drinkBeer();d.drinkBeer();d.drinkBeer();`, 'Too dizzy to stand'],
        ]) {
            const { page, errors } = await open(mobile);
            await page.waitForTimeout(500);
            if (name === 'dizzy') {
                await page.evaluate(new Function(`const d=${g}.dizziness;d.drinkBeer();d.drinkBeer();`));
                await page.waitForTimeout(300);
                assert.equal((await clock(page)).ended, false, 'Two quick beers are survivable');
                assert.ok((await page.locator('body').innerText()).includes(mobile ? '⚠' : 'one more is too many'));
                await page.evaluate(new Function(`${g}.dizziness.drinkBeer()`));
            } else await page.evaluate(new Function(cause));
            await ended(page);
            await page.waitForFunction(t=>document.body.innerText.includes(t), title);
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('PASS', label, 'clock start/rate/pause/clock change, trip points, tour continues, arrival win, exhaustion and dizziness loses');
    }
} finally { await browser.close(); }
