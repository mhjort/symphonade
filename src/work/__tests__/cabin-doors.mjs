import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
const world = JSON.parse(await fs.readFile('src/work/world.json', 'utf8'));
const cabinZ = world.worldProfileData.doors.find(door => door.id === '8402').position.z;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
 const page = await browser.newPage({serviceWorkers:'block',viewport:{width:1100,height:900}});
 await page.route('**/CabinAssignment.*', async route => {
  const response = await route.fetch(); const source = await response.text();
  assert.ok(source.includes('random = Math.random'));
  await route.fulfill({response, body:source.replace('random = Math.random','random = () => 0.06')});
 });
 await page.goto(`http://localhost:${gamePort}/`);
 await page.waitForFunction(() => window.gameTemplate?.getGameEngine()?.genreModule?.travelerSelection,null,{timeout:90000});
 await startVoyage(page);
 await page.waitForFunction(() => window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders?.readers.every(r=>r.leaf),null,{timeout:10000});
 const place = async (x,z,yaw) => {
  await page.evaluate(({x,z,yaw})=>{
   const e=window.gameTemplate.getGameEngine(), pc=e.getPlayerController();
   pc.teleportTo(x,3.42,z); pc.cameraController.setHorizontalAngle(yaw); pc.cameraController.setVerticalAngle(0);
  },{x,z,yaw});
  await page.waitForTimeout(400);
 };
 await place(10.7,cabinZ,Math.PI/2);
 await fs.mkdir('.bitmagic/cabin-doors',{recursive:true});
 await page.screenshot({path:'.bitmagic/cabin-doors/closed.png'});
 await page.evaluate(()=>window.gameTemplate.getGameEngine().getPlayerController().cameraController.setVerticalAngle(.95));
 await page.waitForTimeout(200);
 await page.screenshot({path:'.bitmagic/cabin-doors/floor-closed.png'});
 await page.evaluate(()=>window.gameTemplate.getGameEngine().getPlayerController().cameraController.setVerticalAngle(0));
 await page.evaluate(()=>window.gameTemplate.getGameEngine().getDoorSystem().getKeyring().grant('room-8402'));
 await page.keyboard.down('e'); await page.waitForTimeout(150); await page.keyboard.up('e');
 await page.waitForFunction(()=>!window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders.active,null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().getDoorSystem().getDoorState('8401')),'closed');
 await place(11.3,cabinZ,-Math.PI/2);
 await page.keyboard.down('e'); await page.waitForTimeout(150); await page.keyboard.up('e');
 await page.waitForFunction(()=>window.gameTemplate.getGameEngine().getDoorSystem().getDoorState('8402')==='open',null,{timeout:10000});
 const open = await page.evaluate(()=>{
  const e=window.gameTemplate.getGameEngine(), r=e.genreModule.cabinDoorReaders.readers.find(r=>r.id==='8402');
  return {state:e.getDoorSystem().getDoorState('8402'),x:r.leaf.position.x,targetX:r.position.x};
 });
 assert.equal(open.state,'open'); assert.ok(open.x>12.4,'8402 leaf must swing into right cabin'); assert.ok(open.targetX>12.7,'Reader follows the swinging handle');
 await page.screenshot({path:'.bitmagic/cabin-doors/open.png'});
 await page.keyboard.down('w');
 await page.waitForTimeout(700);
 await page.keyboard.up('w');
 assert.ok(await page.evaluate(()=>window.gameTemplate.getGameEngine().getPlayerController().getPosition().x>12.2),'Player can walk through open doorway');
 await place(13.1,cabinZ,Math.PI/2);
 await page.evaluate(()=>window.gameTemplate.getGameEngine().getPlayerController().cameraController.setVerticalAngle(.95));
 await page.waitForTimeout(200);
 await page.screenshot({path:'.bitmagic/cabin-doors/floor-open.png'});
 // A passenger inside an unowned cabin can always operate its exit handle.
 await place(9,cabinZ,-Math.PI/2);
 assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders.tryDoor('8401')),true);
 await page.waitForTimeout(900);
 assert.ok(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.cabinDoorReaders.readers.find(r=>r.id==='8401').leaf.position.x<9.6),'8401 swings into left cabin');
 console.log('PASS: wrong card rejected; matching card opens; both swings inward; reader follows handle; free inside exit.');
} finally {await browser.close();}
