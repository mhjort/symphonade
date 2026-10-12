import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
const level = JSON.parse(await fs.readFile('src/work/serenade.mesh-level.json','utf8'));
await fs.mkdir('.bitmagic/lift-stairs', { recursive:true });
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try { for (const mobile of [false,true]) {
    const platform = mobile ? 'mobile' : 'desktop';
    const page = await browser.newPage(mobile ? devices['iPhone 14'] : {viewport:{width:1280,height:900}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.slotMachine?.body,null,{timeout:90000});
    await page.waitForTimeout(5000);
    await startVoyage(page);
    await page.waitForTimeout(1500);
    const touch = mobile ? await page.context().newCDPSession(page) : null;
    const position = () => page.evaluate(()=>window.gameTemplate.getGameEngine().getPlayerController().getGroundPosition().toArray());
    const drive = async active => {
        if (touch) {
            const y=page.viewportSize().height-150;
            if (active) {
                await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y,id:1}]});
                await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:80,y:y-40,id:1}]});
            } else await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        } else if(active) await page.keyboard.down('KeyW'); else await page.keyboard.up('KeyW');
    };
    const walk = async ([x,y,z]) => {
        const deadline=Date.now()+12000;
        await drive(true);
        try { while(Date.now()<deadline) {
            const p=await position();
            if(Math.hypot(p[0]-x,p[2]-z)<.16) {
                // A capsule contacts the slope ahead of its centre near a ramp
                // transition. Check exact deck height separately on the flat foyer.
                assert.ok(Math.abs(p[1]-y)<.4,`Expected deck/ramp height ${y}, got ${p}`);
                return;
            }
            await page.evaluate(({x,z})=>{
                const pc=window.gameTemplate.getGameEngine().getPlayerController(),p=pc.getPosition();
                pc.cameraController.setHorizontalAngle(Math.atan2(p.x-x,p.z-z));
                pc.cameraController.setViewPitch(0);
            },{x,z});
            await page.waitForTimeout(50);
        }
        await page.screenshot({path:'.bitmagic/deck9-stair-failure.png'});
        console.log(await page.evaluate(()=>{const e=window.gameTemplate.getGameEngine(),p=e.getPlayerController();return {state:e.gameStateManager.getCurrentState(),enabled:p.getControlsEnabled(),keys:p.keys,body:document.body.innerText.slice(-1800)}}));
        throw new Error(`Stair route blocked toward ${[x,y,z]} from ${await position()}`);
        } finally { await drive(false); }
    };
    for (const side of ['Port','Starboard']) {
        const route=level.extras.walkingRoutes[`${side} lift foyer deck 8|${side} lift foyer deck 9`];
        const cabins=level.extras.walkingRoutes[`${side} lift foyer deck 9|Deck 9 cabins`];
        await page.evaluate(([x,y,z])=>window.gameTemplate.getGameEngine().getPlayerController().teleportTo(x,y+.1,z),route[0]);
        await page.waitForTimeout(500);
        for (const point of route.slice(1)) await walk(point);
        assert.ok(Math.abs((await position())[1]-7.05)<.15,'Reached deck 9 by stairs');
        for (const point of cabins.slice(1)) await walk(point);
        await page.screenshot({path:`.bitmagic/lift-stairs/${platform}-${side}-deck9.png`});
        for (const point of [...cabins].reverse().slice(1)) await walk(point);
        for (const point of [...route].reverse().slice(1)) await walk(point);
        assert.ok(Math.abs((await position())[1]-3.4)<.15,'Returned to deck 8');
        console.log('PASS',platform,side,'deck 8/9 stairs and cabin route, both directions');
    }
    assert.deepEqual(errors,[]);
    await page.close();
}} finally { await browser.close(); }
