import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startVoyage } from './start-voyage.mjs';
const {chromium,devices}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const {gamePort}=JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
await fs.mkdir('.bitmagic/roulette',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try {for(const mobile of [false,true]) {
 const platform=mobile?'mobile':'desktop';
 const page=await browser.newPage(mobile?devices['iPhone 14']:{viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const loaded=page.waitForEvent('console',{predicate:m=>m.text().includes('Player controls disabled - waiting for Play button'),timeout:180000});
 await page.goto(`http://localhost:${gamePort}/`);await loaded;await page.waitForTimeout(500);await startVoyage(page);
 const snapshot=()=>page.evaluate(()=>{const e=window.gameTemplate.getGameEngine(),g=e.genreModule;return {points:g.tripPoints.total,quest:g.celebration.has("first-roulette"),audio:!!g.rouletteTable.audioSource,balance:g.coffeeShop.balance,pending:g.rouletteTable.round.pending,result:g.rouletteTable.round.result,controls:e.getPlayerController().getControlsEnabled(),state:e.gameStateManager.getCurrentState()};});
 const point=async(x,z,yaw,pitch=0)=>{await page.evaluate(({x,z,yaw,pitch})=>{const p=window.gameTemplate.getGameEngine().getPlayerController();p.teleportTo(x,.15,z);p.cameraController.setHorizontalAngle(yaw);p.cameraController.setViewPitch(pitch);},{x,z,yaw,pitch});await page.waitForTimeout(1100);};
 const interact=async(text)=>{
  await page.waitForFunction(text=>document.querySelector('.hud-interaction-prompt[data-visible]')?.textContent.includes(text),text,{timeout:10000});
  if(mobile){const b=await page.locator('.hud-interaction-prompt').boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}
  else {await page.keyboard.down('KeyE');await page.waitForTimeout(100);await page.keyboard.up('KeyE');}
  await page.waitForTimeout(200);
 };
 const click=async(selector)=>{const l=page.locator(selector);if(mobile)await l.tap();else await l.click();};
 await point(-5.7,39.7,Math.PI,.4);
 const aim=async(kind,value)=>{
  await page.evaluate(({kind,value})=>{
   const e=window.gameTemplate.getGameEngine(),t=e.genreModule.rouletteTable,p=e.getPlayerController();
   const s=t.spots.find(s=>kind==='spin'?s.spin:s[kind]===value);
   const camera=t.camera(),v=camera.position.clone();camera.getWorldPosition(v);
   const tx=-5.7+s.x,tz=41.1+s.z,ty=1.06;
   p.cameraController.setHorizontalAngle(Math.atan2(v.x-tx,v.z-tz));
   p.cameraController.setViewPitch(Math.atan2(v.y-ty,Math.hypot(v.x-tx,v.z-tz)));
  },{kind,value});await page.waitForTimeout(350);
 };
 const play=async(kind,value)=>{await aim(kind,value);await interact(kind==='spin'?'Spin roulette':kind==='stake'?'Stake':'Bet on');};
 await page.screenshot({path:`.bitmagic/roulette/${platform}-casino.png`});
 assert.equal(await page.locator('dialog.starlight-roulette').count(),0);
 assert.equal(await page.evaluate(()=>!!window.gameTemplate.getGameEngine().genreModule.rouletteTable.dealer),true);
 await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.rouletteTable.round.random=()=>1.1/37);
 await play('bet','red');await play('stake',5);await play('spin');
 assert.equal((await snapshot()).balance,95);assert.equal((await snapshot()).controls,true);
 assert.equal((await snapshot()).points,0);assert.equal((await snapshot()).audio,true);
 await page.waitForTimeout(5100);assert.ok((await snapshot()).pending,'longer than five seconds');
 await page.waitForTimeout(800);
 await page.screenshot({path:`.bitmagic/roulette/${platform}-spinning.png`});
 await page.waitForFunction(()=>!window.gameTemplate.getGameEngine().genreModule.rouletteTable.round.pending,null,{timeout:18000});
 assert.equal((await snapshot()).balance,105);assert.equal((await snapshot()).points,100);assert.equal((await snapshot()).quest,true);assert.equal((await snapshot()).audio,false);
 const alignment=await page.evaluate(()=>{const t=window.gameTemplate.getGameEngine().genreModule.rouletteTable;
  return {x:t.ball.position.x,z:t.ball.position.z,angle:t.wheel.rotation.y,message:t.message};});
 assert.ok(Math.abs(alignment.x+1.27)<.001);assert.ok(Math.abs(alignment.z+.35)<.001);
 assert.match(alignment.message,/1 RED.*RETURN 10/);
 await page.screenshot({path:`.bitmagic/roulette/${platform}-win.png`});
 await play('bet','black');await play('spin');
 await page.evaluate(()=>window.gameTemplate.getGameEngine().gameStateManager.setPaused(true,'interactive-ui'));
 assert.equal((await snapshot()).audio,false);
 const elapsed=(await snapshot()).pending.elapsed;await page.waitForTimeout(1000);
 assert.equal((await snapshot()).pending.elapsed,elapsed);
 await page.evaluate(()=>window.gameTemplate.getGameEngine().gameStateManager.setPaused(false,'interactive-ui'));
 await point(-3,38.8,0);
 await page.waitForFunction(()=>!window.gameTemplate.getGameEngine().genreModule.rouletteTable.round.pending,null,{timeout:18000});
 assert.equal((await snapshot()).balance,100);assert.equal((await snapshot()).result.returned,0);
 await point(-5.7,39.7,Math.PI,.4);
 await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.rouletteTable.round.random=()=>0);
 await play('bet',0);await play('stake',10);await play('spin');
 await page.waitForFunction(()=>!window.gameTemplate.getGameEngine().genreModule.rouletteTable.round.pending,null,{timeout:18000});
 assert.equal((await snapshot()).points,100,'quest awarded only once');
 assert.equal((await snapshot()).balance,450);assert.equal((await snapshot()).result.returned,360);
 await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.coffeeShop.initializeTraveler(4));
 await play('spin');assert.equal((await snapshot()).pending,null);assert.equal((await snapshot()).balance,4);
 assert.equal((await snapshot()).controls,true);
 // A player on the upper platform cannot play through its floor.
 await page.evaluate(()=>{const e=window.gameTemplate.getGameEngine(),p=e.getPlayerController();p.teleportTo(-5.7,3.55,39);});await page.waitForTimeout(800);
 assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.rouletteTable.accessible()),false);
 // All four new chairs use the existing sit/stand controls.
 for(const [k,x,z] of [[0,4.0,39.2],[1,7.3,39.2],[2,4.0,41.7],[3,7.3,41.7]]) {
  const dx=5.65-x,dz=40.45-z,len=Math.hypot(dx,dz);
  const px=x+dx/len*1.15,pz=z+dz/len*1.15;
  await point(px,pz,Math.atan2(px-x,pz-z),.45);
  await interact('Sit down');await page.waitForTimeout(1450);
  assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.chairSeating.settledSeatName),`Starlight terrace lower lounge chair ${k} body`);
  if(k===0)await page.screenshot({path:`.bitmagic/roulette/${platform}-seating.png`});
  if(mobile)await page.getByText('STAND',{exact:true}).tap();else {await page.keyboard.down('KeyF');await page.waitForTimeout(100);await page.keyboard.up('KeyF');}
  await page.waitForTimeout(1300);
  assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.chairSeating.isSeated),false);
 }
 assert.deepEqual(errors,[]);console.log('PASS',platform,'roulette input, payouts, zero, insufficient funds, pause/leave, floor isolation and all four chairs');
 await page.close();
}}finally{await browser.close();}
