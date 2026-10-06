import { startVoyage } from './start-voyage.mjs';
// PLAYWRIGHT_MODULE may point to the CLI's installed playwright-core/index.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
await fs.mkdir('.bitmagic/beer-service', { recursive: true });
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
        return { beer: g.beerGlass.hasDrink, serving: g.beerBar.isServing,
            poured: g.beerBar.elapsed, fill: g.beerGlass.vessel.liquid.scale.y, beerMotion: g.beerGlass.motion?.kind,
            beerPosition: g.beerGlass.root.position.toArray(), table: g.beerGlass.tablePosition?.toArray(),
            beerLeft: g.beerGlass.leftEmpties.length, foam: g.beerGlass.vessel.foam.visible,
            balance: g.coffeeShop.balance, full: g.coffeeMug.hasDrink, energy: g.energy.value,
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
            await page.waitForFunction(text => document.querySelector('.hud-interaction-prompt[data-visible]')?.textContent.includes(text), text).catch(async error => { console.log('FAILED_ACTION', text, await state(), await page.locator('.hud-interaction-prompt').textContent()); await page.screenshot({ path: '.bitmagic/beer-service/failure.png' }); throw error; });
            const box = await page.locator('.hud-interaction-prompt').boundingBox();
            assert.ok(box, `Missing phone action: ${text}`);
            await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        }
        else await key('KeyE');
        await page.waitForTimeout(100);
    };
    const stand = async () => { if (mobile) await page.getByText('STAND', { exact: true }).tap(); else await key('KeyF'); await page.waitForTimeout(1300); };
    const label = mobile ? 'mobile' : 'desktop';
    const bar = async () => { await place(1.25, .1, -31, -.486); await page.getByText('Buy beer · 20 mk', { exact: true }).waitFor({ state: 'visible' }); };
    const pause = enabled => page.evaluate(enabled => window.gameTemplate.getGameEngine().gameStateManager.setPaused(enabled, 'system'), enabled);
    const startingMarks = (await state()).balance;
    await bar();
    await interact('Buy beer · 20 mk');
    assert.equal((await state()).balance,startingMarks-20);
    await page.waitForTimeout(950);
    await pause(true);
    const pouring = await state();
    assert.equal(pouring.serving,true);
    assert.ok(pouring.fill > .01 && pouring.fill < .225);
    await page.screenshot({path:`.bitmagic/beer-service/${label}-pour.png`});
    await page.waitForTimeout(600);
    assert.deepEqual(await state(), pouring, 'Pause freezes the pour and wallet');
    await pause(false);
    await key('KeyE');
    await page.waitForTimeout(4200);
    assert.equal((await state()).balance,startingMarks-20,'Repeated interaction cannot debit twice');
    assert.equal((await state()).beer,true);
    assert.equal((await state()).foam,true);
    assert.equal((await state()).serving,false);
    await page.screenshot({path:`.bitmagic/beer-service/${label}-held.png`});
    assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.beerGlass.drink()),false,'Standing cannot drink');
    await place(-11.25,.1,3);
    await interact('Buy coffee · 10 mk');
    await page.waitForTimeout(2300);
    assert.equal((await state()).balance,startingMarks-20,'Coffee cannot overlap a full beer');
    assert.equal((await state()).full,false);
    await place(-1.45,.1,-28.5,Math.PI/2);
    await interact('Sit down'); await page.waitForTimeout(2200);
    let seated = await state();
    assert.equal(seated.settled,true);
    assert.ok(seated.table, 'Pub lounge chair has a tabletop');
    assert.ok(Math.abs(seated.table[1]-.864)<.01,'Glass rests on the round tabletop');
    await page.screenshot({path:`.bitmagic/beer-service/${label}-table.png`});
    await interact('Drink beer'); await stand();
    assert.equal((await state()).beer,true,'Standing interrupts an unfinished drink');
    await interact('Sit down'); await page.waitForTimeout(2200);
    const energy = (await state()).energy;
    await interact('Drink beer'); await page.waitForTimeout(2200);
    assert.equal((await state()).beer,false);
    assert.ok(Math.abs((await state()).energy-Math.min(110,energy+15))<.2,'Beer grants 15 energy points up to 110%' );
    assert.ok(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.dizziness.severity > .38), 'Completed beer adds dizziness');
    await stand();
    assert.equal((await state()).beerLeft,1,'Empty glass remains on the table');
    await bar(); await interact('Buy beer · 20 mk');
    await place(0,.1,-25);
    assert.equal((await state()).balance,startingMarks-20,'Walking away before service refunds the order');
    assert.equal((await state()).serving,false);
    await bar(); await interact('Buy beer · 20 mk'); await page.waitForTimeout(5000);
    assert.equal((await state()).balance,startingMarks-40);
    await place(2.15,.1,-27.44,-Math.PI/2);
    await interact('Sit down'); await page.waitForTimeout(2200);
    assert.ok((await state()).table,'Booth has a tabletop');
    assert.ok(Math.abs((await state()).table[1]-.844)<.01);
    await page.screenshot({path:`.bitmagic/beer-service/${label}-booth.png`});
    await interact('Drink beer'); await page.waitForTimeout(2200); await stand();
    assert.equal((await state()).beerLeft,2);
    await page.evaluate(()=>{const w=window.gameTemplate.getGameEngine().genreModule.coffeeShop; w.trySpend(w.balance);});
    await bar(); await interact('Buy beer · 20 mk'); await page.waitForTimeout(500);
    assert.equal((await state()).balance,0);
    assert.equal((await state()).serving,false);
    await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.coffeeShop.credit(20));
    await place(-11.25,.1,3);
    await interact('Buy coffee · 10 mk'); await page.waitForTimeout(3000);
    assert.equal((await state()).balance,10); assert.equal((await state()).full,true);
    await place(-9,.1,5.35); await interact('Sit down'); await page.waitForTimeout(2200);
    const beforeCoffee = (await state()).energy;
    await interact('Drink coffee · +10% energy'); await page.waitForTimeout(2200);
    assert.equal((await state()).full,false);
    assert.ok(Math.abs((await state()).energy-Math.min(110,beforeCoffee+10))<.2,'Coffee grants 10 energy points up to 110%');
    await stand();
    assert.deepEqual(errors,[]);
    console.log('PASS',label,'purchase, visible pour, pause, debit once, refund, drink exclusivity, seated sip, interruption, lounge/booth tables, empty glasses, insufficient funds and coffee regression');
    await page.close();
} } finally { await browser.close(); }
