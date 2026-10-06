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
    await startVoyage(page);
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
                pc.cameraController.setVerticalAngle(0);
            },{x,z});
            await page.waitForTimeout(50);
        }
        throw new Error(`Stair route blocked toward ${[x,y,z]} from ${await position()}`);
        } finally { await drive(false); }
    };
    for (const side of ['Port','Starboard']) {
    const route=level.extras.walkingRoutes[`${side} lift foyer deck 7|${side} lift foyer deck 8`];
    const cabins=level.extras.walkingRoutes[`${side} lift foyer deck 8|Deck 8 cabins`];
    const starlight=level.extras.walkingRoutes[`${side} lift foyer deck 8|Starlight`];
    assert.ok(route?.length>5 && cabins?.length>3,`${side} stairs and cabin route declared`);
    assert.ok(starlight?.length>=4,`${side} open Starlight upper-floor route declared`);
    await page.evaluate(([x,y,z])=>window.gameTemplate.getGameEngine().getPlayerController().teleportTo(x,y+.15,z),route[0]);
    await page.waitForTimeout(600);
    for (const [direction,points] of [['up',route.slice(1)],['down',[...route].reverse().slice(1)]]) {
        for (const point of points) await walk(point);
        const p=await position();
        assert.ok(Math.abs(p[1]-(direction==='up'?3.4:0))<.15,`Reached ${direction} landing without teleporting`);
        await page.screenshot({path:`.bitmagic/lift-stairs/${platform}-${side}-${direction}.png`});
        if(direction==='up') {
            for(const point of cabins.slice(1)) await walk(point);
            const p=await position();
            assert.ok(Math.hypot(p[0]-11,p[2]-14)<.2 && Math.abs(p[1]-3.4)<.15,'Reached cabin doors on deck 8');
            await page.screenshot({path:`.bitmagic/lift-stairs/${platform}-${side}-cabins.png`});
            for(const point of [...cabins].reverse().slice(1)) await walk(point);
            for(const point of starlight.slice(1)) await walk(point);
            assert.ok(Math.abs((await position())[1]-3.4)<.15,'Reached Starlight upper gallery');
            await page.screenshot({path:`.bitmagic/lift-stairs/${platform}-${side}-starlight.png`});
            for(const point of [...starlight].reverse().slice(1)) await walk(point);
        }
    }
    await page.evaluate(side=>{
        const pc=window.gameTemplate.getGameEngine().getPlayerController();
        pc.teleportTo(side==='Port'?-11.45:11.45,.15,31.05);
        pc.cameraController.setHorizontalAngle(Math.PI);
        pc.cameraController.setVerticalAngle(-.27);
    },side);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.ship.exteriorMeshes.some(m=>m.visible)),false,'Original shell hidden in stairwell');
    await page.screenshot({path:`.bitmagic/lift-stairs/${platform}-${side}-stairwell.png`});
    console.log('PASS',platform,side,'stairs, open cabin and Starlight upper-floor routes in both directions, deck heights and interior visibility');
    }
    assert.deepEqual(errors,[]);
    await page.close();
}} finally { await browser.close(); }
