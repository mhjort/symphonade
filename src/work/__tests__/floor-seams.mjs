import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE??'playwright-core');
const {gamePort}=JSON.parse(await fs.readFile('.bitmagic/dev.json','utf8'));
const level=JSON.parse(await fs.readFile('src/work/serenade.mesh-level.json','utf8'));
const world=JSON.parse(await fs.readFile('src/work/world.json','utf8'));
const entrances=level.extras.links.filter(l=>l.from==='Promenade').map(l=>{
 const room=level.volumes.find(v=>v.name===l.to);
 const special={'Starlight':[0,36], 'Sea Pub':[0,-24], 'Bon Vivant':[6,-6], 'Port lift foyer deck 7':[-6,31], 'Starboard lift foyer deck 7':[6,31]};
 const [x,z]=special[l.to]??[Math.sign(room.position[0])*6,room.position[2]];
 return {name:l.to,x,z,y:0,alongZ:x===0};
});
entrances.push({name:'Boarding lobby',x:-6,z:13,y:0,alongZ:false});
entrances.push(...world.worldProfileData.doors.filter(d=>/^84/.test(d.id)).map(d=>({name:d.id,x:d.position.x,z:d.position.z,y:3.4,alongZ:false})));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({serviceWorkers:'block',viewport:{width:800,height:650}});
 await page.goto(`http://localhost:${gamePort}/`);
 await page.waitForFunction(()=>window.gameTemplate?.getGameEngine()?.genreModule?.travelerSelection,null,{timeout:90000});
 await startVoyage(page);
 const audit=await page.evaluate(entrances=>{
  const root=window.gameTemplate.getGameEngine().genreModule.ship.getRoot();root.updateWorldMatrix(true,true);
  const triangles=[];
  root.traverse(mesh=>{
   if(!mesh.isMesh || (Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m.name.startsWith('Exterior sided ')))return;
   const g=mesh.geometry,p=g.getAttribute('position');
   for(let instance=0;instance<(mesh.isInstancedMesh?mesh.count:1);instance++){
    const matrix=mesh.matrixWorld.clone();if(mesh.isInstancedMesh){const im=matrix.clone();mesh.getMatrixAt(instance,im);matrix.multiply(im);}
    for(let i=0;i<(g.index?.count??p.count);i+=3){
     const points=[0,1,2].map(j=>mesh.position.clone().fromBufferAttribute(p,g.index?g.index.getX(i+j):i+j).applyMatrix4(matrix));
     if(![-.016,0,3.4].some(y=>points.every(v=>Math.abs(v.y-y)<.001)))continue;
     const area=(points[1].x-points[0].x)*(points[2].z-points[0].z)-(points[1].z-points[0].z)*(points[2].x-points[0].x);
     if(Math.abs(area)>1e-7)triangles.push({points:points.map(p=>[p.x,p.y,p.z]),name:mesh.name,area});
    }
   }
  });
  const failures=[];let samples=0;
  for(const e of entrances)for(let a=-.69;a<.7;a+=.137)for(let b=(/^84/.test(e.name)?-1.2:-.39);b<(/^84/.test(e.name)?1.2:.4);b+=.113){
   const x=e.x+(e.alongZ?b:a),z=e.z+(e.alongZ?a:b);
   const candidates=triangles.filter(t=>{
    if(t.points[0][1]>e.y+.001 || t.points[0][1]<e.y-.03)return false;
    return t.points.every((p,i)=>{const q=t.points[(i+1)%3];return Math.sign(t.area)*((q[0]-p[0])*(z-p[2])-(q[2]-p[2])*(x-p[0]))>=-1e-8;});
   });
   const top=Math.max(...candidates.map(t=>t.points[0][1]));
   const hits=candidates.filter(t=>Math.abs(t.points[0][1]-top)<.001);
   samples++;if(hits.length!==1)failures.push({entry:e.name,x,z,hits:hits.map(h=>h.name)});
  }
  return {samples,failures};
 },entrances);
 await fs.mkdir('.bitmagic/floor-seams',{recursive:true});
 await fs.writeFile('.bitmagic/floor-seams/audit.json',JSON.stringify(audit,null,2));
 for(const e of entrances.filter(e=>!/^84/.test(e.name))){
  await page.evaluate(e=>{const pc=window.gameTemplate.getGameEngine().getPlayerController();const sign=Math.sign(e.x);pc.teleportTo(e.x-sign*1.1,e.y+.04,e.z+(e.alongZ?(e.z>0?-1.1:1.1):0));pc.cameraController.setHorizontalAngle(e.alongZ?(e.z>0?Math.PI:0):-sign*Math.PI/2);pc.cameraController.setVerticalAngle(.8);},e);
  await page.waitForTimeout(180);
  await page.screenshot({path:'.bitmagic/floor-seams/'+e.name.replaceAll(/[^a-z0-9]/gi,'-')+'.png'});
 }
 console.log(JSON.stringify({entrances:entrances.length,samples:audit.samples,failures:audit.failures.slice(0,12),failureCount:audit.failures.length}));
 assert.equal(audit.failures.length,0,'Each entrance sample must have exactly one floor surface');
}finally{await browser.close();}
