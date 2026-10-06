import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
const browser = await chromium.launch({channel:'chrome', headless:true, args:['--enable-unsafe-webgpu']});
try { for (const mobile of [false,true]) {
    const page=await browser.newPage({serviceWorkers:'block', ...(mobile ? {...devices['iPhone 14']} : {viewport:{width:1280,height:900}})});
    // Exercise both row ends and both cabin types without changing production RNG.
    await page.route('**/CabinAssignment.*', async route => {
        const response = await route.fetch();
        const source = await response.text();
        assert.ok(source.includes('random = Math.random'));
        await route.fulfill({ response, body: source.replace('random = Math.random', `random = () => ${mobile ? '0.999' : '0'}`) });
    });
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.slotMachine?.body,null,{timeout:90000});
    await startVoyage(page);
    const place=async(x,y,z)=>{await page.evaluate(({x,y,z})=>{const p=window.gameTemplate.getGameEngine().getPlayerController();p.teleportTo(x,y,z);p.cameraController.setHorizontalAngle(-Math.PI/2);p.cameraController.setVerticalAngle(0);},{x,y,z});await page.waitForTimeout(800);};
    await page.waitForTimeout(2000);
    await place(4,.15,18);
    const interact=async()=>{if(mobile){const box=await page.locator('.hud-interaction-prompt').boundingBox();assert.ok(box);await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);}else {await page.keyboard.down('KeyE');await page.waitForTimeout(100);await page.keyboard.up('KeyE');}};
    await interact();
    await page.waitForFunction(()=>window.gameTemplate.getGameEngine().genreModule.celebration.completed.has('room-key'));
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.hud-toast',{hasText:'Quest complete'}).count(),1);
    await page.screenshot({path:`.bitmagic/quest-${mobile?'mobile':'desktop'}.png`});
    await interact();await page.waitForTimeout(300);assert.equal(await page.locator('.hud-toast',{hasText:'Quest complete'}).count(),1,'Repeated clerk interaction does not celebrate again');
    const assigned = await page.evaluate(() => {
        const g=window.gameTemplate.getGameEngine().genreModule;
        return { ...g.assignedCabin, position:g.ship.landmark(g.assignedCabin.roomName).position };
    });
    assert.equal(assigned.id, mobile ? '8418' : '8401');
    const card = await page.locator('img[alt*="cabin key card"]').getAttribute('src');
    const artwork = decodeURIComponent(card.split(',')[1]);
    assert.ok(artwork.includes(`Cabin ${assigned.id}`));
    assert.ok(artwork.includes(assigned.view));
    await place(13,3.45,14);
    assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.roomEntered),false,'Wrong cabin does not complete check-in');
    await page.waitForFunction(()=>!window.gameTemplate.getGameEngine().genreModule.cabinKeyCard.busy);
    const wrong = String(Number(assigned.id) + (Number(assigned.id)%2 ? 1 : -1));
    await place(11,3.45,assigned.position[2]);
    assert.equal(await page.evaluate(id=>window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders.tryDoor(id),wrong),true);
    await page.waitForFunction(()=>window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders.active?.checked);
    assert.ok((await page.locator('body').innerText()).includes(`Wrong cabin — card is for ${assigned.id}`));
    assert.equal(await page.evaluate(id=>window.gameTemplate.getGameEngine().getDoorSystem().getDoorState(id),wrong),'closed');
    await page.waitForFunction(()=>!window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders.active);
    assert.equal(await page.evaluate(id=>window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders.tryDoor(id),assigned.id),true);
    await page.waitForFunction(id=>window.gameTemplate.getGameEngine().getDoorSystem().getDoorState(id)==='open',assigned.id);
    await place(assigned.position[0],3.45,assigned.position[2]);
    await page.waitForFunction(()=>window.gameTemplate.getGameEngine().genreModule.celebration.completed.has('check-in'));
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.celebration.completed.size),2);
    await page.emulateMedia({reducedMotion:'reduce'});
    await place(9,.15,-4);
    assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.celebration.has('visit-Bon Vivant')),false,'Bon Vivant stop needs a reservation');
    await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.bonVivant.book('19:30'));
    await place(0,.15,0);await place(9,.15,-4);
    await page.waitForFunction(()=>window.gameTemplate.getGameEngine().genreModule.celebration.completed.has('visit-Bon Vivant'));
    assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.celebration.root.visible),false);
    await place(0,.15,0);await place(9,.15,-4);
    assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.celebration.completed.size),3,'Revisiting does not repeat a quest');
    await page.waitForTimeout(6500);assert.equal(await page.locator('.hud-toast').count(),0,
        `Celebrations dismiss automatically: ${await page.locator('.hud-toast').allTextContents()}`);
    assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.assignedCabin.id),assigned.id,'Assignment remains stable during play');
    assert.deepEqual(errors,[]);console.log('PASS',mobile?'mobile':'desktop','key handover, cabin, destination, deduplication, reduced motion and automatic dismissal');await page.close();
}} finally {await browser.close();}
