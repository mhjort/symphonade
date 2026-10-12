import {startVoyage} from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium,devices}=await import(process.env.PLAYWRIGHT_MODULE);
const {gamePort}=JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try {for (const mobile of [false,true]) {
 const page=await browser.newPage(mobile?devices['iPhone 14']:{viewport:{width:1280,height:900}});
 await page.goto(`http://localhost:${gamePort}/`);
 await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.slotMachine?.body,null,{timeout:90000});
 await page.waitForTimeout(5000);await startVoyage(page);await page.waitForTimeout(1500);
 for (const i of [0,1]) {
  await page.evaluate(i=>{const e=window.gameTemplate.getGameEngine(),l=e.genreModule.promenadeElevators.lifts[i];e.getPlayerController().teleportTo(l.x,.15,l.z);},i);
  await page.waitForTimeout(800);
  for (const target of [1,2,1,0]) {
   const hint=await page.evaluate(i=>{const e=window.gameTemplate.getGameEngine();return e.genreModule.promenadeElevators.lifts[i].hint(e.getPlayerController().getPosition());},i);
   assert.ok(hint.includes(`deck ${target+7}`),hint);
   if(mobile) {
    const p=page.locator('.hud-interaction-prompt');await p.waitFor({state:'visible'});const b=await p.boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);
   } else {await page.keyboard.down('KeyE');await page.waitForTimeout(100);await page.keyboard.up('KeyE');}
   await page.waitForFunction(({i,target})=>{const l=window.gameTemplate.getGameEngine().genreModule.promenadeElevators.lifts[i];return l.phase==='moving'&&l.target===target;},{i,target});
   assert.equal(await page.evaluate(i=>window.gameTemplate.getGameEngine().genreModule.promenadeElevators.lifts[i].gates.every(g=>g.getState()==='closed'),i),true);
   await page.waitForFunction(({i,target})=>{const l=window.gameTemplate.getGameEngine().genreModule.promenadeElevators.lifts[i];return l.phase==='docked'&&l.floor===target;},{i,target},{timeout:20000});
   await page.waitForTimeout(500);
   const result=await page.evaluate(i=>{const e=window.gameTemplate.getGameEngine(),l=e.genreModule.promenadeElevators.lifts[i];return {height:e.getPlayerController().getGroundPosition().y,floor:l.height};},i);
   assert.ok(Math.abs(result.height-result.floor)<.2,JSON.stringify(result));
   if(target===2)await page.screenshot({path:`.bitmagic/deck9-${mobile?'mobile':'desktop'}-lift-${i}.png`});
  }
  console.log('PASS',mobile?'mobile':'desktop',i,'lift carries rider 7–8–9–8–7, gated during travel');
 }
 await page.close();
}}finally{await browser.close();}
