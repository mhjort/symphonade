import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
const cast = [['family',110,90],['senior',120,80],['party',80,110],['shopper',130,70],['road',100,100],['driver',90,105]];
// Explicitly opt in to a known-model fixture when testing trait behavior
// independently of the generation service. Normal runs always use real assets.
const fixture = process.env.TRAVELER_MODEL_FIXTURE === 'family'
    ? JSON.parse(await fs.readFile('src/work/world.json','utf8')).assets.find(asset=>asset.name==='traveler_family') : null;
const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--enable-unsafe-webgpu'] });
await fs.mkdir('.bitmagic/travelers', {recursive:true});
try {
 for (const mobile of process.env.TEST_PLATFORM === 'mobile' ? [true] : process.env.TEST_PLATFORM === 'desktop' ? [false] : [false,true]) {
  for (const [id,marks,energy] of cast.filter(row => !process.env.TRAVELER || row[0] === process.env.TRAVELER)) {
   const page=await browser.newPage({serviceWorkers:'block',...(mobile ? {...devices['iPhone 14']} : {viewport:{width:1280,height:900}})});
   const errors=[]; page.on('pageerror',error=>errors.push(error.message));
   if(fixture) await page.route('**/src/work/world.json*',async route=>{
    const response=await route.fetch(),world=await response.json();
    world.assets=world.assets.filter(asset=>!asset.name?.startsWith('traveler_'));
    for(const [traveler] of cast) world.assets.push({...fixture,id:`test-traveler-${traveler}`,name:`traveler_${traveler}`});
    await route.fulfill({response,json:world});
   });
   await page.goto(`http://localhost:${gamePort}/`);
   await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.travelerSelection,null,{timeout:120000});
   await page.locator('dialog[open]').waitFor();
   await page.waitForFunction(()=>window.gameTemplate.getGameEngine().gameStateManager.getCurrentState() !== 'loading');
   assert.equal(await page.locator('[data-traveler]').count(),6);
   const state=()=>page.evaluate(()=>{
    const e=window.gameTemplate.getGameEngine(),g=e.genreModule,p=e.getPlayerController();
    return {id:g.travelerId,energy:g.energy.value,money:g.coffeeShop.balance,position:p.getPosition().toArray(),
     height:p.characterHeight,radius:p.capsuleRadius,state:e.gameStateManager.getCurrentState(),
     visited:g.visited.size,cabin:g.assignedCabin.id,skinned:g.playerLoader.isRenderingSkinnedMesh()};
   });
   const before=await state();
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('dialog[open]').count(),1,'Escape cannot skip selection');
   await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
   assert.deepEqual(await state(),before,'Gameplay stays frozen behind the selection');
   // Fast changes can complete out of order. Only the final choice may appear.
   if(id==='family') {
    await page.locator('[data-traveler="senior"]').click();
    await page.locator('[data-traveler="party"]').click();
   }
   await page.locator(`[data-traveler="${id}"]`).click();
   await page.getByText('Ready to board',{exact:true}).waitFor({timeout:120000});
   const previewPose = () => page.evaluate(() => {
    const root=window.gameTemplate.getGameEngine().genreModule.travelerSelection.avatar.root;
    const pose=[];
    root.traverse(object=>{ if(object.isBone) pose.push(...object.position.toArray(),...object.quaternion.toArray()); });
    return pose;
   });
   const poseBefore=await previewPose();
   await page.waitForTimeout(600);
   const poseAfter=await previewPose();
   assert.ok(poseAfter.length>0 && poseAfter.every(Number.isFinite),'Preview has a finite skeletal pose');
   assert.ok(poseAfter.some((value,index)=>Math.abs(value-poseBefore[index])>1e-6),'Preview idle animation moves the real rig');
   assert.equal(await page.locator(`[data-traveler="${id}"]`).getAttribute('aria-pressed'),'true');
   assert.ok((await page.locator('.traveler-stats').innerText()).includes(`${marks} mk`));
   await page.screenshot({path:`.bitmagic/travelers/${id}-${mobile?'mobile':'desktop'}${fixture?'-fixture':''}.png`});
   // Real touch/keyboard confirmation, followed by an extra event to catch double initialization.
   const board=page.getByRole('button',{name:'Board solo',exact:true});
   if(mobile) await board.tap(); else { await board.focus(); await page.keyboard.press('Enter'); }
   await page.waitForFunction(()=>window.gameTemplate.getGameEngine().genreModule.travelerId !== null);
   await page.waitForFunction(()=>window.gameTemplate.getGameEngine().gameStateManager.getCurrentState()==='playing');
   const after=await state();
   const identity=await page.evaluate(() => {
    const g=window.gameTemplate.getGameEngine().genreModule;
    return {id:g.player.userData.travelerId,url:g.player.userData.characterUrl};
   });
   const actualWorld=JSON.parse(await fs.readFile('src/work/world.json','utf8'));
   const expectedAsset=fixture ?? actualWorld.assets.find(asset=>asset.name===`traveler_${id}`);
   assert.deepEqual(identity,{id,url:expectedAsset.url},'Selected model and stable identity transfer into gameplay');
   assert.equal(after.id,id); assert.equal(after.money,marks); assert.ok(Math.abs(after.energy-energy)<.15);
   assert.equal(after.height,before.height); assert.equal(after.radius,before.radius);
   assert.equal(after.cabin,before.cabin); assert.equal(after.skinned,true);
   assert.equal(await page.locator('dialog[open]').count(),0);
   assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.playerLoader.getSkinnedSkeletonRoot().visible),false,'First-person hides the avatar');
   await page.evaluate(()=>window.gameTemplate.getGameEngine().gameStateManager.setPaused(true,'system'));
   const paused=await state(); await page.waitForTimeout(250);
   const held=await state();
   assert.equal(held.energy,paused.energy); assert.equal(held.money,paused.money); assert.equal(held.id,paused.id);
   await page.evaluate(()=>window.gameTemplate.getGameEngine().gameStateManager.setPaused(false,'system'));
   await page.waitForTimeout(150);
   assert.equal((await state()).id,id);
   assert.equal((await state()).money,marks);
   assert.deepEqual(errors,[]);
   console.log('PASS',mobile?'mobile':'desktop',id,fixture?'TRAIT FIXTURE (family model)':'REAL AVATAR','preview, paused selection, traits, avatar, capsule, confirmation and pause');
   await page.close();
  }
 }
} finally { await browser.close(); }
