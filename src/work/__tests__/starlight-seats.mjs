import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startVoyage } from './start-voyage.mjs';
const {chromium,devices}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const {gamePort}=JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try {for(const mobile of [false,true]) {
 const page=await browser.newPage(mobile?devices['iPhone 14']:{viewport:{width:1280,height:900}});
 const loaded=page.waitForEvent('console',{predicate:m=>m.text().includes('Player controls disabled - waiting for Play button'),timeout:120000});
 await page.goto(`http://localhost:${gamePort}/`);await loaded;await page.waitForTimeout(500);await startVoyage(page);
 for(const t of [0,1,2]) {
  const y=[3.4,3.4*2/3,3.4/3][t],x=t===0?-2.6:-1.25;
  const z=t===0?41.7:[45.2,47.5,49.8][t]+.6*(x/4.8)**2-.85;
  await page.evaluate(({x,y,z})=>{const pc=window.gameTemplate.getGameEngine().getPlayerController();pc.teleportTo(x,y+.1,z-.8);pc.cameraController.setHorizontalAngle(Math.PI);pc.cameraController.setViewPitch(0);},{x,y,z});
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.starlightDance.available()),false,'No dance action on a seating tier');
  if(mobile){await page.waitForFunction(()=>document.querySelector('.hud-interaction-prompt[data-visible]')?.textContent.includes('Sit down'));const b=await page.locator('.hud-interaction-prompt').boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}
  else {await page.keyboard.down('KeyE');await page.waitForTimeout(100);await page.keyboard.up('KeyE');}
  await page.waitForTimeout(1600);
  const s=await page.evaluate(()=>{const g=window.gameTemplate.getGameEngine().genreModule;return {seated:g.chairSeating.isSettledSeated,name:g.chairSeating.settledSeatName,forward:g.chairSeating.seated?.forward.toArray(),seatY:g.chairSeating.seated?.position.y};});
  assert.ok(s.seated && s.name.startsWith(`Starlight terrace chair ${t}`),JSON.stringify(s));assert.deepEqual(s.forward,[0,0,1]);assert.ok(Math.abs(s.seatY-(y+.51))<.02);
  await page.screenshot({path:`.bitmagic/starlight-terraces/${mobile?'mobile':'desktop'}-seat-${t}.png`});
  if(mobile)await page.getByText('STAND',{exact:true}).tap();else {await page.keyboard.down('KeyF');await page.waitForTimeout(100);await page.keyboard.up('KeyF');}
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.chairSeating.isSeated),false);
 }
 console.log('PASS',mobile?'mobile':'desktop','sitting and standing on all three tiers, stage-facing seats and no dancing upstairs');await page.close();
}}finally{await browser.close();}
