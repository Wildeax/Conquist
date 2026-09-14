import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReviewServer } from './serve-browser-review.mjs';
import { compactLayout,boardPorts,sampleConstruction,BOARD_SPACING } from './browser-layout.mjs';

const output=fileURLToPath(new URL('./output/web-v01/',import.meta.url));
await mkdir(output,{recursive:true});
const perAsset=[];
for(const [kind,stem] of Object.entries({Stone:'stone-relief',Clay:'clay-relief',Grain:'wheat-fields',Desert:'desert-relief',Timber:'forest'})){
  const load=async path=>{const b=await readFile(path);return {b,g:JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)))};};
  const {b,g}=await load(resolve(output,kind+'.glb'));
  const {b:oldBytes,g:old}=await load(resolve(output,'..',stem+'-v03',stem+'-v03.glb'));
  const triangles=g=>g.nodes.reduce((s,n)=>s+(n.mesh===undefined?0:g.meshes[n.mesh].primitives.reduce((t,p)=>t+g.accessors[p.indices].count/3,0)),0);
  const current=triangles(g),before=triangles(old);
  assert.ok(current<80000&&current<before*.2,kind+': insufficient geometry reduction');
  assert.ok(g.extensionsRequired.includes('KHR_draco_mesh_compression'));
  assert.ok(g.images.every(i=>i.bufferView!==undefined&&!i.uri),'Embedded textures required');
  assert.ok(g.meshes.every(m=>m.primitives.every(p=>p.extensions?.KHR_draco_mesh_compression)));
  assert.ok(g.materials.every(m=>m.pbrMetallicRoughness.baseColorTexture&&m.normalTexture&&m.pbrMetallicRoughness.metallicRoughnessTexture));
  perAsset.push({resource:kind,beforeTriangles:before,triangles:current,beforeBytes:oldBytes.length,bytes:b.length});
}
console.log('Asset structure and compression verified: '+JSON.stringify(perAsset));
const joinedLayout=compactLayout(JSON.parse(await readFile(resolve(output,'..','layout.json'),'utf8')));
const ports=boardPorts(joinedLayout),construction=sampleConstruction(joinedLayout);
assert.equal(ports.length,9);assert.equal(new Set(ports.flatMap(p=>[p.a,p.b])).size,18);
for(const a of joinedLayout.hexes)for(const b of joinedLayout.hexes){
  if(a.id>=b.id||a.vertices.filter(v=>b.vertices.includes(v)).length!==2)continue;
  assert.ok(Math.abs(Math.hypot(a.x-b.x,a.z-b.z)-Math.sqrt(3)*BOARD_SPACING)<1e-8,'Neighboring hex rims must meet');
}
assert.equal(construction.buildings.length,8);
for(const a of construction.buildings)for(const b of construction.buildings){
  if(a.id===b.id)continue;
  assert.ok(!joinedLayout.edges.some(e=>(e.a===a.id&&e.b===b.id)||(e.b===a.id&&e.a===b.id)),'Construction preview must obey the settlement distance rule');
}
const pieceAssets=[];
for(const kind of ['Settlement','City','Road','Port','Robber','Cargo']){
  const b=await readFile(resolve(output,kind+'.glb')),g=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
  assert.ok(g.extensionsRequired.includes('KHR_draco_mesh_compression'));assert.ok(g.images.every(i=>i.bufferView!==undefined&&!i.uri));
  assert.ok(b.length<2*1048576);pieceAssets.push({kind,bytes:b.length});
}
// Wool has no high-poly predecessor: it is a new browser-native prefab.
const woolBytes=await readFile(resolve(output,'Wool.glb'));
const wool=JSON.parse(woolBytes.toString('utf8',20,20+woolBytes.readUInt32LE(12)));
const woolTriangles=wool.nodes.reduce((s,n)=>s+(n.mesh===undefined?0:wool.meshes[n.mesh].primitives.reduce((t,p)=>t+wool.accessors[p.indices].count/3,0)),0);
assert.ok(woolTriangles<30000&&woolTriangles>5000);assert.ok(woolBytes.length<5*1048576);
assert.ok(wool.extensionsRequired.includes('KHR_draco_mesh_compression'));
assert.ok(wool.images.every(i=>i.bufferView!==undefined&&!i.uri));
assert.ok(wool.materials.every(m=>m.pbrMetallicRoughness.baseColorTexture&&m.normalTexture&&m.pbrMetallicRoughness.metallicRoughnessTexture));
assert.ok(wool.nodes.some(n=>n.extras?.resource==='Wool'&&n.extras?.sheepCount===8));
perAsset.push({resource:'Wool',triangles:woolTriangles,bytes:woolBytes.length,source:'New browser-native asset; same prefab in both comparison modes'});
const browserPath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
assert.ok(browserPath,'Chromium browser is required');
const server=createReviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=spawn(browserPath,['--headless=new','--remote-debugging-port=9431',
  '--user-data-dir='+resolve(output,'benchmark-profile'),'--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--enable-unsafe-swiftshader','about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try{
  let tabs;
  for(let i=0;i<80;i++){try{tabs=await(await fetch('http://127.0.0.1:9431/json/list')).json();if(tabs.length)break;}catch{}await pause(150);}
  assert.ok(tabs?.length,'Browser startup failed');
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(m.error):p.resolve(m.result);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(Error('Timed out: '+method));},120000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:base});
  let ready=false;
  for(let i=0;i<300;i++){
    const state=await evaluate(`({ready:!!window.boardReview?.ready,error:window.boardReview?.error})`);
    assert.ok(!state.error,state.error);if(state.ready){ready=true;break;}await pause(100);
  }
  assert.ok(ready,'Board assets did not load');
  console.log('Renderer: '+await evaluate('boardReview.rendererName()'));
  assert.equal(await evaluate('boardReview.snapshots().lifeMotion'),true);
  await evaluate('boardReview.setLifeMotion(false)');
  assert.equal(await evaluate('boardReview.snapshots().water'),true,'Water enabled by default');
  const waterAngles=[];
  for(const elevation of [12,42,75])for(const azimuth of [0,45,90,140.2,180,225,270,315]){
    const view=await evaluate(`boardReview.inspectWaterView(${azimuth},${elevation})`);
    assert.equal(await evaluate('boardReview.inspectTags().overlaps'),0,'Floating labels must remain separate while orbiting the board');
    waterAngles.push(view);
    assert.equal(view.webglError,0);assert.ok(view.samples>20);
    if(elevation===42&&azimuth===140.2){
      const capture=await call('Page.captureScreenshot',{format:'png'});
      await writeFile(resolve(output,'water-sun-angle.png'),Buffer.from(capture.data,'base64'));
    }
  }
  console.log('Water angle brightness: '+JSON.stringify(waterAngles));
  assert.ok(waterAngles.every(v=>v.whiteFraction<.01&&v.medianBrightness<.72),'Open water must retain its color when looking into the sun reflection');
  await evaluate('boardReview.reset()');
  await evaluate('boardReview.setWater(false)');
  await pause(300);const idleBefore=await evaluate('boardReview.snapshots().frames');
  await pause(300);const idleAfter=await evaluate('boardReview.snapshots().frames');
  assert.equal(idleAfter,idleBefore,'Idle board must not render continuously');
  assert.equal(await evaluate('boardReview.snapshots().shadows'),true,'Shadows enabled by default');
  await evaluate('boardReview.setShadows(false)');
  const optimized=await evaluate(`boardReview.benchmark('optimized',30)`);
  assert.equal(optimized.webglError,0);assert.ok(optimized.triangles<900000);assert.ok(optimized.drawCalls<110);
  assert.equal(optimized.chimneys,16);assert.equal(optimized.smokeParticles,224);assert.equal(optimized.cargoDisplays,9);
  assert.equal(optimized.playerFlags,8);
  assert.equal(optimized.materialReflections,false);assert.equal(optimized.environmentFaceSize,0);
  assert.equal(optimized.environmentCapturesPerFrame,0);
  assert.equal(optimized.triangles,562522-4*24+4*woolTriangles+optimized.constructionTriangles,'All four pastures and construction meshes must be accounted for');
  const tags=await evaluate('boardReview.inspectTags()');
  assert.equal(tags.total,27);assert.equal(tags.visible,27);assert.equal(tags.overlaps,0,'Floating tags must not overlap in the board overview');
  const readableTags=await evaluate(`Array.from(document.querySelectorAll('.board-tag')).map(el=>({label:el.getAttribute('aria-label'),w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}))`);
  assert.ok(readableTags.every(t=>t.label&&t.w>=42&&t.h>=32),'Floating tags must preserve their screen-space text size');
  const coastalRocks=await evaluate('boardReview.inspectRocks()');
  for(let i=0;i<coastalRocks.length;i++)for(let j=i+1;j<coastalRocks.length;j++){
    const a=coastalRocks[i],b=coastalRocks[j];
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=1.35*(a.radius+b.radius)+.06,'Coastal rock bases must not overlap');
  }
  assert.equal(optimized.settlements,4);assert.equal(optimized.cities,4);assert.equal(optimized.ports,9);
  assert.equal(optimized.numberTokens,18);assert.equal(optimized.robber,1);
  let screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'board-optimized.png'),Buffer.from(screenshot.data,'base64'));
  console.log('Optimized board: '+JSON.stringify(optimized));
  const original=await evaluate(`boardReview.benchmark('original',30)`);
  assert.equal(original.webglError,0);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'board-original.png'),Buffer.from(screenshot.data,'base64'));
  console.log('Original board: '+JSON.stringify(original));
  assert.ok(optimized.triangles<original.triangles*.15);
  assert.ok(optimized.drawCalls<original.drawCalls*.1);
  assert.ok(optimized.transferBytes<original.transferBytes*.3);
  // A second optimized pass checks that switching the comparison does not break it.
  await evaluate(`boardReview.switchMode('optimized')`);
  const again=await evaluate('boardReview.snapshots()');
  assert.equal(again.triangles,optimized.triangles);assert.equal(again.drawCalls,optimized.drawCalls);
  await evaluate('boardReview.setShadows(true)');
  const withShadows=await evaluate(`boardReview.benchmark('optimized',30)`);
  assert.equal(withShadows.webglError,0);assert.equal(withShadows.shadowMapSize,2048);
  assert.ok(withShadows.shadowDraws>0,'Shadow casters must actually render');
  assert.equal(withShadows.shadowDrawsDuringMovement,0,'Camera movement must reuse shadows');
  assert.equal(withShadows.triangles,optimized.triangles);assert.equal(withShadows.drawCalls,optimized.drawCalls);
  assert.equal(withShadows.transferBytes,optimized.transferBytes);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'board-shadows.png'),Buffer.from(screenshot.data,'base64'));
  await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:600,y:550,deltaX:0,deltaY:-550});
  await pause(200);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'board-shadows-detail.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('#mountain').click()`);await pause(200);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'mountain-browser.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('#forest').click()`);await pause(200);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'forest-browser.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('#pasture').click()`);await pause(200);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'pasture-browser.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('#sides').click()`);await pause(200);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'forest-sides-browser.png'),Buffer.from(screenshot.data,'base64'));
  console.log('Cached shadows: '+JSON.stringify(withShadows));
  const refreshedShadows=await evaluate(`boardReview.benchmark('optimized',30,true)`);
  assert.equal(refreshedShadows.webglError,0);assert.ok(refreshedShadows.shadowDrawsDuringMovement>0);
  console.log('Shadow refresh each frame (comparison only): '+JSON.stringify(refreshedShadows));
  // Exercise the visible toggle and check its accessible state and shadow cache.
  await evaluate(`document.querySelector('#shadows').click()`);
  await pause(100);assert.equal(await evaluate('boardReview.snapshots().shadows'),false);
  await evaluate(`document.querySelector('#shadows').click()`);
  await pause(100);assert.equal(await evaluate(`document.querySelector('#shadows').getAttribute('aria-pressed')`),'true');
  const idleShadowBefore=await evaluate('boardReview.snapshots()');await pause(300);
  const idleShadowAfter=await evaluate('boardReview.snapshots()');
  assert.equal(idleShadowBefore.frames,idleShadowAfter.frames);assert.equal(idleShadowBefore.shadowDraws,idleShadowAfter.shadowDraws);
  await evaluate('boardReview.setWater(true)');await pause(200);
  const withWater=await evaluate(`boardReview.benchmark('optimized',30)`);
  assert.equal(withWater.webglError,0);assert.equal(withWater.drawCalls,withShadows.drawCalls+withWater.waterDrawCalls);
  assert.equal(withWater.triangles,withShadows.triangles+withWater.waterTriangles);
  assert.ok(withWater.waterTriangles<40000);assert.ok(withWater.waterRockCount>=16);
  assert.equal(withWater.reflectionResolution,512);assert.ok(withWater.reflectionUpdates>0);
  assert.equal(withWater.shadowDrawsDuringMovement,0,'Waves must not regenerate terrain shadows');
  await pause(150);screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'board-water.png'),Buffer.from(screenshot.data,'base64'));
  const motionBefore=await evaluate('boardReview.snapshots()');await pause(400);
  const motionAfter=await evaluate('boardReview.snapshots()');
  const animatedScreenshot=await call('Page.captureScreenshot',{format:'png'});
  assert.notEqual(animatedScreenshot.data,screenshot.data,'Wave animation must change rendered pixels');
  assert.ok(motionAfter.waterTime>motionBefore.waterTime);assert.ok(motionAfter.frames>motionBefore.frames);
  assert.equal(motionAfter.reflectionUpdates,motionBefore.reflectionUpdates,'Stationary camera must reuse the reflected scene');
  assert.ok(motionAfter.frames-motionBefore.frames<=20,'Water should render at a limited cadence');
  await evaluate(`document.querySelector('#waves').click()`);await pause(100);
  const pausedBefore=await evaluate('boardReview.snapshots()');await pause(300);
  const pausedAfter=await evaluate('boardReview.snapshots()');
  assert.equal(pausedAfter.waterMotion,false);assert.equal(pausedAfter.waterTime,pausedBefore.waterTime);
  assert.equal(pausedAfter.frames,pausedBefore.frames,'Paused waves must return to on-demand rendering');
  await evaluate(`document.querySelector('#waves').click()`);
  await call('Emulation.setDeviceMetricsOverride',{width:1917,height:818,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.querySelector('#sea').click()`);await pause(200);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'sea-low-angle.png'),Buffer.from(screenshot.data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.querySelector('#rocks').click()`);await pause(200);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'coastal-rocks-detail.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('#city').click()`);await pause(150);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'city-browser.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('#house').click();boardReview.setLifeMotion(true)`);await pause(500);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'house-browser.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate('boardReview.setLifeMotion(false)');
  await evaluate(`document.querySelector('#robber').click()`);await pause(150);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'robber-browser.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('#port').click()`);await pause(150);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'port-browser.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('#pieces').click()`);await pause(100);
  assert.equal(await evaluate('boardReview.snapshots().piecesVisible'),false);
  assert.equal(await evaluate('document.querySelector(".board-tags").hidden'),true);
  await evaluate(`document.querySelector('#pieces').click()`);await pause(100);
  assert.equal(await evaluate('boardReview.snapshots().piecesVisible'),true);
  assert.equal(await evaluate('document.querySelector(".board-tags").hidden'),false);
  await evaluate('boardReview.reset()');
  console.log('Animated water: '+JSON.stringify(withWater));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('boardReview.reset()');await pause(200);
  const mobileTags=await evaluate('boardReview.inspectTags()');
  assert.equal(mobileTags.overlaps,0,'Floating labels must remain separate on a narrow screen');
  assert.ok(mobileTags.boxes.every(b=>b.x>=0&&b.y>=0&&b.x+b.w<=390&&b.y+b.h<=844));
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'tags-mobile.png'),Buffer.from(screenshot.data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate('boardReview.reset()');
  // Check a whole flock cycle against the hex boundary and one another, using
  // the same poses that drive the instanced body/head/leg matrices.
  const lifeSamples=[];
  for(let t=0;t<=24;t+=.5){
    const state=await evaluate(`boardReview.inspectLifeTime(${t})`);
    assert.equal(state.sheepCount,32);assert.equal(state.snowParticles,270);assert.ok(state.windBatches>=6);
    for(const s of state.sheepStates){
      const margin=Math.min(...Array.from({length:6},(_,i)=>.955*Math.sqrt(3)/2-s.x*Math.cos(i*Math.PI/3)-s.z*Math.sin(i*Math.PI/3)));
      assert.ok(margin>.11,'Sheep must stay inside its hex');assert.ok(Number.isFinite(s.y));
      for(const other of state.sheepStates){if(other.hexId!==s.hexId||other.index<=s.index)continue;
        assert.ok(Math.hypot(s.x-other.x,s.z-other.z)>.085*(s.scale+other.scale),'Sheep paths must not intersect');}
    }
    if(t===0||t===2||t===8)lifeSamples.push(state);
  }
  assert.notEqual(lifeSamples[0].sheepStates[0].x,lifeSamples[1].sheepStates[0].x,'Walking must move the sheep');
  assert.ok(lifeSamples[2].sheepStates[0].headPitch<-.8,'Grazing must lower the head');
  await evaluate(`document.querySelector('#pasture').click();boardReview.inspectLifeTime(2)`);await pause(100);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'sheep-walking.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate('boardReview.inspectLifeTime(8)');await pause(100);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'sheep-grazing.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('#mountain').click()`);await pause(100);
  screenshot=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve(output,'mountain-snowdrift.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate('boardReview.setWaterMotion(false);boardReview.setLifeMotion(true)');
  const aliveBefore=await evaluate('boardReview.snapshots()');
  const livePixelsBefore=await call('Page.captureScreenshot',{format:'png'});await pause(1100);
  const aliveAfter=await evaluate('boardReview.snapshots()');
  const livePixelsAfter=await call('Page.captureScreenshot',{format:'png'});
  assert.notEqual(livePixelsBefore.data,livePixelsAfter.data,'Land animation must change pixels independently of the waves');
  assert.ok(aliveAfter.lifeTime>aliveBefore.lifeTime);
  const allowedRefreshes=Math.ceil((aliveAfter.lifeTime-aliveBefore.lifeTime)/.25)+1;
  assert.ok(aliveAfter.reflectionUpdates-aliveBefore.reflectionUpdates<=allowedRefreshes,'Stationary reflections refresh at most four times per animation second, including screenshot capture time');
  await evaluate(`document.querySelector('#life').click()`);await pause(150);
  const lifePauseBefore=await evaluate('boardReview.snapshots()');await pause(350);
  const lifePauseAfter=await evaluate('boardReview.snapshots()');
  assert.equal(lifePauseAfter.lifeMotion,false);assert.equal(lifePauseBefore.lifeTime,lifePauseAfter.lifeTime);
  assert.equal(lifePauseBefore.frames,lifePauseAfter.frames,'Pausing waves and map life must stop idle frames');
  await evaluate('boardReview.setWaterMotion(true);boardReview.setLifeMotion(true)');
  const withLife=await evaluate(`boardReview.benchmark('optimized',30)`);assert.equal(withLife.webglError,0);
  console.log('Living board: '+JSON.stringify(withLife));
  const report={createdAt:new Date().toISOString(),scope:'19 joined terrain tiles, six resources, animated sheep, wind and chimney smoke; four medieval settlements, four walled cities, eight roads, nine cargo ports with sailing ships, hooded robber, eight player flags and 27 floating labels. Art-review composition; no gameplay UI. Shadows and animated water measured separately.',
    viewport:'1200 x 900, pixel ratio 1',perAsset,pieceAssets,optimized,original,withShadows,refreshedShadows,withWater,withLife,waterAngles,mobileTags,idleFramesOver300ms:idleAfter-idleBefore,
    limitations:'Local headless Chromium. GPU/backend is recorded. Render timings use gl.finish and exclude network and full-game logic; not a mobile-device or full-game FPS guarantee.'};
  await writeFile(resolve(output,'browser-benchmark.json'),JSON.stringify(report,null,2));
  console.log('PASS: assets, geometry and draw-call budgets, shadows, wave rendering and pixel animation, paused idle rendering, version switching and visible controls.');
}finally{ws?.close();browser.kill();await new Promise(r=>server.close(r));}
