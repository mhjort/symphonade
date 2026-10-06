import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
const world=JSON.parse(await fs.readFile('src/work/world.json','utf8'));
const family=world.assets.find(asset=>asset.name==='traveler_family');
assert.ok(family?.url);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try {
 const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1280,height:900}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route(url=>url.href.startsWith(family.url),route=>route.abort());
 await page.goto(`http://localhost:${gamePort}/`);
 await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.travelerSelection,null,{timeout:120000});
 await page.getByRole('button',{name:'Step aboard',exact:true}).click({force:true});
 await page.getByRole('button',{name:'Retry preview',exact:true}).waitFor({timeout:60000});
 assert.equal(await page.getByRole('button',{name:'Board the ferry',exact:true}).isDisabled(),true);
 assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.travelerId),null);
 await page.unrouteAll({behavior:'wait'});
 await page.getByRole('button',{name:'Retry preview',exact:true}).click();
 await page.getByText('Ready to board',{exact:true}).waitFor({timeout:120000});
 await page.evaluate(()=>{
  const button=document.querySelector('.traveler-board'); button.click(); button.click();
 });
 await page.waitForFunction(()=>window.gameTemplate.getGameEngine().genreModule.travelerId==='family');
 assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.coffeeShop.balance),110);
 assert.equal(await page.locator('dialog.traveler-selection').count(),0);
 await page.reload();
 await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.travelerSelection,null,{timeout:120000});
 assert.equal(await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.travelerId),null);
 await page.getByRole('button',{name:'Step aboard',exact:true}).click({force:true});
 await page.locator('dialog[open]').waitFor();
 assert.equal(await page.locator('[data-traveler="family"]').getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);
 console.log('PASS avatar load failure, retry, duplicate confirmation and fresh voyage');
} finally { await browser.close(); }
