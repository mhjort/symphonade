import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startVoyage } from './start-voyage.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
await fs.mkdir('.bitmagic/mirrors',{recursive:true});
try {
 for(const renderer of process.env.TEST_RENDERER ? [process.env.TEST_RENDERER] : ['webgpu','webgl']) {
  for(const mobile of process.env.TEST_PLATFORM==='desktop' ? [false] : [false,true]) {
   const page=await browser.newPage({serviceWorkers:'block',...(mobile ? {...devices['iPhone 14']} : {viewport:{width:1280,height:900}})});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.goto(`http://localhost:${gamePort}/?renderer=${renderer}`);
   await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.travelerSelection,null,{timeout:120000});
   await startVoyage(page);
   await page.evaluate(()=>{
    const e=window.gameTemplate.getGameEngine(),g=e.genreModule;
    e.getPlayerController().teleportTo(8,3.5,14.1);
    const camera=g.cameraManager.getFirstPersonCamera();camera.setHorizontalAngle(0);camera.setVerticalAngle(0);
   });
   await page.waitForTimeout(2500);
   const state=await page.evaluate(()=>{
    const e=window.gameTemplate.getGameEngine(),g=e.genreModule,m=g.cabinMirrors;
    const active=m.surfaces.filter(s=>s.mesh.visible);
    let skins=0;m.avatar.traverse(o=>{if(o.isSkinnedMesh)skins++;});
    return {count:m.surfaces.length,active:active.length,visible:m.avatar.visible,skins,
     original:g.playerLoader.getSkinnedSkeletonRoot().visible,eye:e.camera.position.toArray(),
     source:g.player.position.toArray(),reflection:m.avatar.position.toArray(),
     id:g.travelerId,reflectionId:m.avatar.userData.travelerId,
     cameraMask:e.camera.layers.mask,mirrorMask:active[0]?.camera(e.camera).layers.mask};
   });
   console.log(renderer,mobile?'mobile':'desktop',state);
   assert.equal(state.count,36);assert.equal(state.active,1);assert.equal(state.visible,true);
   assert.ok(state.skins>0);assert.equal(state.original,false);
   assert.equal(state.reflectionId,state.id);
   assert.equal(state.cameraMask & (1<<29),0);assert.ok(state.mirrorMask & (1<<29));
   await page.screenshot({path:`.bitmagic/mirrors/${renderer}-${mobile?'mobile':'desktop'}.png`});
   await page.evaluate(()=>{
    const e=window.gameTemplate.getGameEngine();e.getPlayerController().teleportTo(8.8,3.5,14.95);
    e.genreModule.cameraManager.getFirstPersonCamera().setHorizontalAngle(.25);
   });
   await page.waitForTimeout(500);
   await page.screenshot({path:`.bitmagic/mirrors/${renderer}-${mobile?'mobile':'desktop'}-layout.png`});
   await page.evaluate(()=>window.gameTemplate.getGameEngine().getPlayerController().teleportTo(8.35,3.5,14.1));
   await page.waitForTimeout(400);
   assert.ok(await page.evaluate(()=>{
    const g=window.gameTemplate.getGameEngine().genreModule;
    return g.cabinMirrors.avatar.matrixWorld.elements.every((value,index)=>Math.abs(value-g.player.matrixWorld.elements[index])<.001)
      && g.cabinMirrors.pairs.filter(([a])=>a.isBone).every(([a,b])=>a.quaternion.toArray().every((value,index)=>Math.abs(value-b.quaternion.toArray()[index])<1e-6));
   }),'Reflected position and bone poses follow the player');
   await page.evaluate(()=>window.gameTemplate.getGameEngine().getPlayerController().teleportTo(14,3.5,-5));
   await page.waitForTimeout(700);
   assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.cabinMirrors.surfaces.filter(s=>s.mesh.visible).length),1,'Instanced sea cabin mirror active');
   await page.evaluate(()=>window.gameTemplate.getGameEngine().getPlayerController().teleportTo(0,.1,0));
   await page.waitForTimeout(500);
   assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.cabinMirrors.avatar.visible),false,'Reflection stops outside cabins');
   assert.deepEqual(errors,[]);
   console.log('PASS mirror',renderer,mobile?'mobile':'desktop');await page.close();
  }
 }
}finally{await browser.close();}
