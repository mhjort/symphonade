import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium,devices}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const {gamePort}=JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try {for(const mobile of [false,true]){
 const page=await browser.newPage(mobile?{...devices['iPhone 14']}:{viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://localhost:${gamePort}/`);await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.slotMachine?.body,null,{timeout:90000});
 await startVoyage(page);await page.waitForTimeout(2500);
 const touch=mobile?await page.context().newCDPSession(page):null;
 for(const side of [-1,1])for(const floor of [0,3.4]){
  await page.evaluate(({side,floor})=>{const p=window.gameTemplate.getGameEngine().getPlayerController();p.teleportTo(side*6.8,floor+.15,31);p.cameraController.setHorizontalAngle(-side*Math.PI/2);p.cameraController.setVerticalAngle(.7);},{side,floor});await page.waitForTimeout(800);
  if(touch){const y=page.viewportSize().height-150;await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y,id:1}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:80,y:y-40,id:1}]});}else await page.keyboard.down('KeyW');
  await page.waitForTimeout(650);
  if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('KeyW');
  const p=await page.evaluate(()=>window.gameTemplate.getGameEngine().getPlayerController().getGroundPosition().toArray());
  assert.ok(Math.abs(p[0])>7.5,'Walk crosses the foyer floor join');assert.ok(Math.abs(p[1]-floor)<.15,'Walking support stays level');
  await page.screenshot({path:`.bitmagic/floor-fixed-${mobile?'mobile':'desktop'}-${side}-${floor}.png`});
 }
 await page.evaluate(()=>{const p=window.gameTemplate.getGameEngine().getPlayerController();p.teleportTo(8.5,3.55,32);p.cameraController.setHorizontalAngle(-Math.PI/4);p.cameraController.setVerticalAngle(.85);});await page.waitForTimeout(700);
 await page.screenshot({path:`.bitmagic/floor-fixed-corridor-${mobile?'mobile':'desktop'}.png`});
 assert.deepEqual(errors,[]);console.log('PASS',mobile?'mobile':'desktop','walking across both lift foyer joins on decks 7 and 8');await page.close();
}}finally{await browser.close();}
