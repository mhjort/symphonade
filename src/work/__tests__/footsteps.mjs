import { startVoyage } from './start-voyage.mjs';
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
const { gamePort } = JSON.parse(await fs.readFile(".bitmagic/dev.json", "utf8"));
const browser = await chromium.launch({channel:"chrome",headless:true,args:["--enable-unsafe-webgpu"]});
try { for (const mobile of [false,true]) {
 const page=await browser.newPage(mobile ? {...devices["iPhone 14"]} : {viewport:{width:1280,height:900}});
 const errors=[]; page.on("pageerror", e=>errors.push(e.message));
 await page.goto(`http://localhost:${gamePort}/`);
 await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.footsteps,null,{timeout:90000});
 await startVoyage(page);
 await page.evaluate(()=>{const e=window.gameTemplate.getGameEngine();window.steps=[];const log=e.logSoundEvent.bind(e);e.logSoundEvent=(name,recipe)=>{if(name.startsWith("footstep"))window.steps.push({name,recipe});log(name,recipe);};});
 const place=async()=>{await page.evaluate(()=>{const p=window.gameTemplate.getGameEngine().getPlayerController();p.teleportTo(0,.15,12);p.cameraController.setHorizontalAngle(0);p.cameraController.setVerticalAngle(0);});await page.waitForTimeout(700);};
 const touch=mobile?await page.context().newCDPSession(page):null;
 const walk=async()=>{await place();await page.evaluate(()=>window.steps=[]);
 if(touch){const y=page.viewportSize().height-150;await touch.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:80,y,id:1}]});await touch.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:80,y:y-40,id:1}]});}else await page.keyboard.down("KeyW");
 await page.waitForTimeout(1800);
 if(touch)await touch.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});else await page.keyboard.up("KeyW");
 return page.evaluate(()=>window.steps);};
 const normal=await walk();assert.ok(normal.length>=2,`Normal walking emits steps: ${normal.length}`);assert.ok(normal.every(s=>s.name==="footstep"));
 await page.waitForTimeout(200);const idle=await page.evaluate(()=>window.steps.length);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.steps.length),idle,"Stationary is silent");
 await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.dizziness.drinkBeer());
 const dizzy=await walk();assert.ok(dizzy.length>=2);assert.ok(dizzy.every(s=>s.name==="footstep-dizzy"));assert.ok(dizzy[0].recipe.dur>normal[0].recipe.dur,"Dizzy shoes have a longer scuff");assert.ok(dizzy[0].recipe.layers[0].freq[0]<normal[0].recipe.layers[0].freq[0],"Dizzy steps are lower pitched");
 await page.evaluate(()=>window.gameTemplate.getGameEngine().genreModule.dizziness.update(180));const recovered=await walk();assert.ok(recovered.every(s=>s.name==="footstep"));assert.ok(recovered.length>=2);assert.deepEqual(errors,[]);
 console.log("PASS",mobile?"phone":"desktop",{normal:normal.length,dizzy:dizzy.length,recovered:recovered.length});await page.close();
}} finally {await browser.close();}
