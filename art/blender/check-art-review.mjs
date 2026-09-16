// Local gallery and real Three.js GLB loading check, in an isolated headless browser.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'art/blender/output');
const version = process.argv[2] || 'v02';
assert.ok(['v02', 'v03'].includes(version));
const prefix = version === 'v03' ? 'ground' : 'textured';
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
assert.ok(chromePath, 'Chromium browser is required');
await mkdir(resolve(output, 'review-browser-profile'), { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + pathname);
    if (![resolve(root, 'art/blender/output') + sep, resolve(root, 'app/node_modules/three') + sep].some(p => path.startsWith(p))) {
      res.writeHead(403).end(); return;
    }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9429',
  `--user-data-dir=${resolve(output, 'review-browser-profile')}`, '--no-first-run',
  '--no-default-browser-check', '--disable-background-networking', '--enable-unsafe-swiftshader', 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
let ws;
const pause = ms => new Promise(r => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 80; i++) {
    try { tabs = await (await fetch('http://127.0.0.1:9429/json/list')).json(); if (tabs.length) break; } catch {}
    await pause(150);
  }
  assert.ok(tabs?.length, 'Browser did not start');
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data), item = pending.get(message.id);
    if (item) { pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(message.error) : item.resolve(message.result); }
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error('Timed out: ' + method)); }, 45000);
    pending.set(key, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: base + `/art/blender/output/review-${version}.html` });
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`document.querySelectorAll('.preview img').length===5`)) break;
    await pause(100);
  }
  const loaded = await evaluate(`(async()=>{const images=[...document.querySelectorAll('.preview img')];
    images.forEach(i=>i.loading='eager');await Promise.all(images.map(i=>i.decode()));return images.every(i=>i.naturalWidth===1400)})()`);
  assert.equal(loaded, true);
  await evaluate(`document.querySelector('[data-mode="before"]').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.preview img[src$="${version === 'v03' ? 'textured' : 'relief'}-perspective.png"]').length`), 5);
  await evaluate(`document.querySelector('[data-mode="after"]').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.preview img[src$="${prefix}-perspective.png"]').length`), 5);
  console.log('Gallery: five images loaded; original/current toggle works.');

  await evaluate(`(()=>{const map=document.createElement('script');map.type='importmap';
    map.textContent=JSON.stringify({imports:{three:'/app/node_modules/three/build/three.module.js'}});
    document.head.appendChild(map);})()`);
  await evaluate(`(async()=>{window.THREE=await import('three');
    window.GLTFLoader=(await import('/app/node_modules/three/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader;
    document.body.innerHTML='';document.body.style.margin='0';
    window.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(1200,900);renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.appendChild(renderer.domElement);
    window.scene=new THREE.Scene();scene.background=new THREE.Color(0xb9b9b9);
    scene.add(new THREE.HemisphereLight(0xffffff,0x5e594f,2));
    const key=new THREE.DirectionalLight(0xfff5e8,3);key.position.set(-3,5,4);scene.add(key);
    window.camera=new THREE.OrthographicCamera(-1.4,1.4,1.05,-1.05,0.01,100);
    camera.position.set(2.2,2.7,3.3);camera.lookAt(0,0.18,0);})()`);
  for (const stem of ['stone-relief', 'clay-relief', 'wheat-fields', 'desert-relief', 'forest']) {
    const result = await evaluate(`(async()=>{
      const asset=await new GLTFLoader().loadAsync('/art/blender/output/${stem}-${version}/${stem}-${version}.glb');
      let meshes=0,complete=true;asset.scene.traverse(o=>{if(o.isMesh){meshes++;
        for(const m of Array.isArray(o.material)?o.material:[o.material]) complete=complete&&!!(m.map&&m.normalMap&&m.roughnessMap);}});
      scene.add(asset.scene);renderer.render(scene,camera);
      const error=renderer.getContext().getError();scene.remove(asset.scene);
      asset.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){
        m.map?.dispose();m.normalMap?.dispose();m.roughnessMap?.dispose();m.dispose();}}});
      return {meshes,complete,error};})()`);
    assert.ok(result.complete && result.meshes > 0);
    assert.equal(result.error, 0);
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(output, `${stem}-${version}/glb-browser-preview.png`), Buffer.from(screenshot.data, 'base64'));
    console.log(`${stem}: ${result.meshes} meshes rendered in Three.js with color, normal and roughness maps.`);
  }
} finally {
  ws?.close();
  browser.kill();
  await new Promise(r => server.close(r));
}
