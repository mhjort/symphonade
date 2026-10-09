import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
const level = JSON.parse(await fs.readFile('src/work/serenade.mesh-level.json','utf8'));
await fs.mkdir('.bitmagic/starlight-terraces', { recursive:true });
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try { for (const mobile of [false,true]) {
    const platform = mobile ? 'mobile' : 'desktop';
    const page = await browser.newPage(mobile ? devices['iPhone 14'] : {viewport:{width:1280,height:900}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    const loaded=page.waitForEvent('console',{predicate:m=>m.text().includes('Player controls disabled - waiting for Play button'),timeout:120000});
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.slotMachine?.body,null,{timeout:90000});
    await loaded;
    await page.waitForTimeout(500); // Standalone template finishes its post-load control gate.
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
                pc.cameraController.setViewPitch(0);
            },{x,z});
            await page.waitForTimeout(50);
        }
        await page.screenshot({path:`.bitmagic/starlight-terraces/${platform}-blocked.png`});
        console.log(await page.evaluate(()=>{const e=window.gameTemplate.getGameEngine(),pc=e.getPlayerController();return {state:e.gameStateManager.getCurrentState(),enabled:pc.getControlsEnabled(),keys:pc.keys,mobile:pc.getMobileControls().isEnabled()};}));
        throw new Error(`Stair route blocked toward ${[x,y,z]} from ${await position()}`);
        } finally { await drive(false); }
    };
    const entry=level.extras.walkingRoutes['Promenade|Starlight'].slice(1);
    await page.evaluate(([x,y,z])=>window.gameTemplate.getGameEngine().getPlayerController().teleportTo(x,y+.15,z),entry[0]);
    await page.waitForTimeout(800);
    for(const p of entry.slice(1)) await walk(p);
    assert.ok(Math.abs((await position())[1]-3.4)<.15);
    for(const side of [-1,1]) {
        const route=level.extras.walkingRoutes[`Starlight terraces ${side}`];
        for(const p of route.slice(1)) await walk(p);
        assert.ok(Math.abs((await position())[1])<.15);
        await page.screenshot({path:`.bitmagic/starlight-terraces/${platform}-floor-${side}.png`});
        for(const p of [...route].reverse().slice(1)) await walk(p);
        const upper=level.extras.walkingRoutes[`Starlight upper connection ${side}`];
        for(const p of upper.slice(1)) await walk(p);
        for(const p of [...upper].reverse().slice(1)) await walk(p);
    }
    await page.evaluate(()=>{const pc=window.gameTemplate.getGameEngine().getPlayerController();pc.cameraController.setHorizontalAngle(Math.PI);pc.cameraController.setViewPitch(.28);});
    await page.screenshot({path:`.bitmagic/starlight-terraces/${platform}-terraces.png`});
    for(const p of [...entry].reverse().slice(1)) await walk(p);
    await page.evaluate(()=>{const pc=window.gameTemplate.getGameEngine().getPlayerController();pc.cameraController.setHorizontalAngle(Math.PI);pc.cameraController.setViewPitch(-.15);});
    await page.screenshot({path:`.bitmagic/starlight-terraces/${platform}-entrance.png`});
    assert.deepEqual(errors,[]);
    console.log('PASS',platform,'entrance stair, both descending aisles and gallery connections in both directions');
    await page.close();
}} finally { await browser.close(); }
