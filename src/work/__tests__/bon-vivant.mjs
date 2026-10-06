import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
await fs.mkdir('.bitmagic/bon-vivant', { recursive: true });
const browser = await chromium.launch({channel:'chrome', headless:true, args:['--enable-unsafe-webgpu']});
const g = 'window.gameTemplate.getGameEngine().genreModule';
const run = (page, body, arg) => page.evaluate(new Function('arg', body), arg);
try { for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'desktop';
    const page = await browser.newPage({serviceWorkers:'block', ...(mobile ? {...devices['iPhone 14']} : {viewport:{width:1280,height:900}})});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.bonVivant?.npc,null,{timeout:120000});
    await startVoyage(page);
    await page.waitForTimeout(1500);
    const state = () => run(page, `const m=${g},b=m.bonVivant;return {state:b.state,seating:b.bookedSeating,eating:b.isEating,
        plate:b.plate.visible,food:b.food.visible,balance:m.coffeeShop.balance,energy:m.energy.value,points:m.tripPoints.total,
        paused:window.gameTemplate.getGameEngine().gameStateManager.getCurrentState(),settled:m.chairSeating.isSettledSeated,
        quest:m.celebration.has('bon-vivant-dinner')};`);
    const place = async (x, y, z, yaw) => { await run(page, `const pc=window.gameTemplate.getGameEngine().getPlayerController();pc.teleportTo(arg[0],arg[1],arg[2]);pc.cameraController.setHorizontalAngle(arg[3]);pc.cameraController.setVerticalAngle(0);`, [x, y, z, yaw]); await page.waitForTimeout(700); };
    const key = async code => { await page.keyboard.down(code); await page.waitForTimeout(100); await page.keyboard.up(code); };
    const interact = async text => {
        if (mobile) {
            await page.waitForFunction(t => document.querySelector('.hud-interaction-prompt[data-visible]')?.textContent.includes(t), text);
            const box = await page.locator('.hud-interaction-prompt').boundingBox();
            await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        } else {
            await page.waitForFunction(t => document.querySelector('.hud-interaction-prompt')?.textContent.includes(t), text);
            await key('KeyE');
        }
        await page.waitForTimeout(200);
    };
    const stand = async () => { if (mobile) await page.getByText('STAND', { exact: true }).tap(); else await key('KeyF'); await page.waitForTimeout(1400); };
    const setClock = minutes => run(page, `${g}.voyageClock.elapsedShipMinutes=arg;`, minutes);
    // A Bon Vivant chair and its approach spot.
    const chair = await run(page, `const s=${g}.chairSeating.seats.find(s=>s.name==='Bon Vivant table 10.7 -4 chair 1 envelope');
        return {name:s.name,x:s.position.x+s.forward.z*.75,z:s.position.z-s.forward.x*.75,yaw:Math.atan2(-s.forward.x,-s.forward.z)};`);
    const sitAtBonVivant = async () => { await place(chair.x, .1, chair.z, chair.yaw); await interact('Sit down'); await page.waitForTimeout(2200); const st = await state(); if (!st.settled) { console.log(chair, st, await run(page, `const c=${g}.chairSeating;return {seated:c.isSeated,avail:c.availableSeat?.name,prompt:document.querySelector(".hud-interaction-prompt")?.textContent,pos:window.gameTemplate.getGameEngine().getPlayerController().getPosition().toArray()}`)); await page.screenshot({path:`.bitmagic/bon-vivant/${label}-fail.png`}); } assert.equal(st.settled, true, `Seated at ${chair.name}`); };

    // Without a reservation the waiter turns the passenger away.
    await sitAtBonVivant();
    await page.waitForFunction(()=>document.body.innerText.includes('Tables are by reservation only'));
    assert.equal((await state()).eating, false);
    await stand();

    // Host at the entrance offers the three seatings; 18:00 has passed.
    await setClock(70);
    await place(3.9, .1, -8.35, -Math.PI / 2);
    await page.getByText('Book a table · Bon Vivant').waitFor({ state: 'visible' });
    await page.screenshot({path:`.bitmagic/bon-vivant/${label}-host.png`});
    await interact('Book a table · Bon Vivant');
    await page.locator('dialog.bon-vivant-booking[open]').waitFor();
    assert.equal((await state()).paused, 'paused', 'Booking pauses the voyage');
    assert.equal(await page.locator('[data-seating="18:00"]').isDisabled(), true, 'Past seating is closed');
    await page.screenshot({path:`.bitmagic/bon-vivant/${label}-dialog.png`});
    if (mobile) await page.locator('[data-seating="19:30"]').tap(); else await page.locator('[data-seating="19:30"]').click();
    await page.locator('dialog.bon-vivant-booking[open]').waitFor({ state: 'detached' }).catch(() => {});
    await page.waitForFunction(()=>!document.querySelector('dialog.bon-vivant-booking')?.open);
    // Headless Chrome cannot regain pointer lock, so the engine raises its pause card; a player clicks Resume.
    await page.waitForTimeout(500);
    await page.evaluate(()=>{const m=window.gameTemplate.getGameEngine().gameStateManager;if(m.getPauseReasons().has('manual'))m.setPaused(false,'manual');});
    await page.waitForFunction(()=>window.gameTemplate.getGameEngine().gameStateManager.getCurrentState()==='playing',null,{timeout:5000})
        .catch(async e => { console.log('REASONS', await page.evaluate(()=>[...window.gameTemplate.getGameEngine().gameStateManager.getPauseReasons()]), await state()); throw e; });
    let s = await state();
    assert.equal(s.state, 'booked'); assert.equal(s.seating, '19:30');
    assert.equal(await page.locator('#hud-icontext-bon-vivant').innerText().then(t => t.trim().replace(/^\S+\s*/, '')), mobile ? '19:30' : 'Bon Vivant table 19:30');

    // Too early: no service.
    await sitAtBonVivant();
    await page.waitForFunction(()=>document.body.innerText.includes('we start serving at 19:15'));
    assert.equal((await state()).eating, false);
    await stand();

    // In the window: served, charged, eaten, rewarded.
    await setClock(150);
    await run(page, `${g}.energy.initializeTraveler(50);`);
    const before = await state();
    await sitAtBonVivant();
    await page.waitForFunction(new Function(`return ${g}.bonVivant.plate.visible`));
    assert.equal((await state()).balance, before.balance - 30, 'Dinner costs 30 mk');
    await page.waitForTimeout(1500);
    await page.screenshot({path:`.bitmagic/bon-vivant/${label}-dinner.png`});
    await page.waitForFunction(new Function(`return ${g}.bonVivant.state==='eaten'`), null, { timeout: 15000 });
    s = await state();
    assert.equal(s.quest, true); assert.equal(s.points, before.points + 150);
    assert.ok(s.energy > before.energy + 20, 'Dinner restores energy');
    assert.equal(s.food, false, 'Plate is cleared of food');
    await stand();
    assert.deepEqual(errors, []);
    await page.close();

    // Missing the seating fails the quest for the voyage.
    const page2 = await browser.newPage({serviceWorkers:'block', ...(mobile ? {...devices['iPhone 14']} : {viewport:{width:1280,height:900}})});
    await page2.goto(`http://localhost:${gamePort}/`);
    await page2.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.bonVivant?.npc,null,{timeout:120000});
    await startVoyage(page2);
    await run(page2, `${g}.bonVivant.book('18:00');`);
    await run(page2, `${g}.voyageClock.elapsedShipMinutes=91;`);
    await page2.waitForFunction(new Function(`return ${g}.bonVivant.state==='missed'`));
    await page2.waitForFunction(()=>document.body.innerText.includes('Dinner quest failed'));
    assert.equal(await run(page2, `return ${g}.bonVivant.book('21:00');`), false, 'No rebooking after a missed seating');
    await page2.close();
    console.log('PASS', label, 'reservation-only service, host dialog, closed seatings, early refusal, served dinner, payment, energy, trip points, missed seating');
} } finally { await browser.close(); }
