import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { apply, chooseBotAction, createGame } from '../packages/rules/game.ts';

// Run against a compiled local instance. Uses a separate browser profile and no external accounts.
const url = process.env.CONQUIST_TEST_URL || 'http://localhost:4320';
const browserPath =
  process.env.CONQUIST_TEST_BROWSER ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => existsSync(p));
if (!browserPath)
  throw new Error(
    'Set CONQUIST_TEST_BROWSER to a Chromium browser executable.',
  );
const output = resolve('outputs/diorama-check');
await mkdir(output, { recursive: true });
const chrome = spawn(
  browserPath,
  [
    '--headless=new',
    '--remote-debugging-port=9422',
    `--user-data-dir=${output}/chrome-profile`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--enable-unsafe-swiftshader',
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const errors = [];
let ws, call;
try {
  let tabs;
  for (let n = 0; n < 60; n++) {
    try {
      tabs = await (await fetch('http://127.0.0.1:9422/json/list')).json();
      if (tabs.length) break;
    } catch {}
    await sleep(200);
  }
  if (!tabs?.length)
    throw new Error('Browser debugging endpoint did not become ready.');
  ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data),
      p = pending.get(msg.id);
    if (
      msg.method === 'Runtime.consoleAPICalled' &&
      msg.params.type === 'error'
    )
      console.error(
        'BROWSER',
        msg.params.args.map((a) => a.description ?? a.value),
      );
    if (msg.method === 'Runtime.exceptionThrown')
      errors.push(
        msg.params.exceptionDetails.text +
          JSON.stringify(msg.params.exceptionDetails.exception),
      );
    if (p) {
      pending.delete(msg.id);
      clearTimeout(p.timeout);
      if (msg.error) p.reject(msg.error);
      else p.resolve(msg.result);
    }
  };
  call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const timeout = setTimeout(() => {
        pending.delete(n);
        reject(new Error(`Timed out: ${method}`));
      }, 15000);
      pending.set(n, { resolve, reject, timeout });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let n = 0; n < 300; n++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const click = (text) =>
    evaluate(
      `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(${JSON.stringify(text)}));if(!b||b.disabled)throw Error('Button missing or disabled: '+${JSON.stringify(text)});b.click()})()`,
    );
  const snapshot = () =>
    evaluate(
      `JSON.parse(document.querySelector('.board-canvas').dataset.dioramaState)`,
    );
  const move = (predicate) =>
    evaluate(
      `(()=>{const t=window.testTools.read_conquist_table.execute();const index=t.legalActions.findIndex(${predicate});if(index<0)throw Error('Missing legal move');return window.testTools.make_conquist_move.execute({index})})()`,
    );
  const shot = async (name) => {
    const r = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(`${output}/${name}.png`, Buffer.from(r.data, 'base64'));
  };
  const load = async (game) => {
    await evaluate(
      `localStorage.setItem('conquist-local-v1',${JSON.stringify(JSON.stringify(game))})`,
    );
    await call('Page.reload');
    await sleep(800);
    await waitFor(
      `!!document.querySelector('.welcome')&&!!window.testTools?.read_conquist_table`,
    );
    await click('Continue your local game');
    await waitFor(
      `document.querySelector('.board-canvas')?.dataset.dioramaReady==='true'`,
    );
  };
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source:
      'window.testTools={};document.modelContext={registerTool(t){window.testTools[t.name]=t}};',
  });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Page.navigate', { url });
  await waitFor(
    `!!document.querySelector('.welcome')&&!!window.testTools?.read_conquist_table`,
  );
  await click('Pass & play');
  await waitFor(
    `document.querySelector('.board-canvas')?.dataset.dioramaReady==='true'`,
  );
  assert.equal((await snapshot()).buildings.length, 0);
  assert.equal((await snapshot()).roads.length, 0);
  assert.equal(
    await evaluate(
      `document.querySelectorAll('.board-tags .number-tag').length`,
    ),
    18,
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.board-tags .port-tag').length`),
    9,
  );
  await shot('empty-match');
  // Click the actual projected legal marker, exercising raycasting and UI dispatch.
  await sleep(1000);
  const location = await evaluate(`(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {createGame}=await import('/packages/rules/game.ts');
    const action=window.testTools.read_conquist_table.execute().legalActions.find(a=>a.type==='settlement');
    const v=createGame(42817,true).vertices[action.id],r=document.querySelector('.board-canvas canvas').getBoundingClientRect();
    const c=new T.PerspectiveCamera(36,r.width/r.height,.1,350),target=new T.Vector3(0,.12,0);
    const angle=Math.atan(Math.tan(T.MathUtils.degToRad(18))*Math.min(c.aspect,1));
    c.position.set(0,9.7,12).sub(target).normalize().multiplyScalar(5.65/Math.sin(angle)).add(target);
    c.setViewOffset(r.width,r.height,0,Math.round(r.height*.065),r.width,r.height);c.lookAt(target);c.updateMatrixWorld();
    const p=new T.Vector3(v.x*.955,.12,v.z*.955).project(c);
    return {x:r.left+(p.x*.5+.5)*r.width,y:r.top+(-p.y*.5+.5)*r.height,id:action.id};
  })()`);
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: location.x,
    y: location.y,
  });
  await sleep(150);
  await shot('placement-preview');
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: location.x,
    y: location.y,
    button: 'left',
    clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: location.x,
    y: location.y,
    button: 'left',
    clickCount: 1,
  });
  await waitFor(
    `JSON.parse(document.querySelector('.board-canvas').dataset.dioramaState).buildings.length===1`,
  );
  await move(`a=>a.type==='road'`);
  await waitFor(
    `JSON.parse(document.querySelector('.board-canvas').dataset.dioramaState).roads.length===1`,
  );
  checks.push('Actual setup actions create one owned house and one road');
  let game = createGame(42, true);
  while (game.phase.startsWith('setup'))
    game = apply(game, chooseBotAction(game));
  game.phase = 'main';
  game.players[game.active].resources[3] += 2;
  game.players[game.active].resources[4] += 3;
  game.bank[3] -= 2;
  game.bank[4] -= 3;
  await load(game);
  assert.equal((await snapshot()).buildings.length, 8);
  assert.equal((await snapshot()).roads.length, 8);
  await move(`a=>a.type==='city'`);
  await waitFor(
    `JSON.parse(document.querySelector('.board-canvas').dataset.dioramaState).buildings.some(b=>b.city)`,
  );
  assert.equal((await snapshot()).buildings.length, 8);
  await shot('city-upgrade');
  checks.push('Reload restores all owners; city replaces its settlement');
  const saved = await evaluate(
    `JSON.parse(localStorage.getItem('conquist-local-v1'))`,
  );
  saved.phase = 'raider';
  await load(saved);
  const previous = (await snapshot()).raider;
  await move(`a=>a.type==='raider'&&a.id!==${previous}`);
  await waitFor(
    `JSON.parse(document.querySelector('.board-canvas').dataset.dioramaState).raider!==${previous}`,
  );
  const raider = (await snapshot()).raider;
  assert.equal(
    await evaluate(
      `document.querySelector('.number-tag.blocked')?.dataset.tagId??null`,
    ),
    saved.hexes[raider].number ? 'hex-' + raider : null,
  );
  await shot('raider-moved');
  checks.push('Raider moves to the selected tile and marks blocked production');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await sleep(400);
  await shot('mobile');
  assert.equal(
    await evaluate(`document.querySelectorAll('.board-tags').length`),
    1,
  );
  assert.equal(
    await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),
    true,
  );
  checks.push(
    'Mobile board renders a single label layer without horizontal overflow',
  );
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(200);
  await evaluate(`document.querySelector('[aria-label="Settings"]').click()`);
  await click('Lite graphics');
  await waitFor(
    `document.querySelector('.board-canvas')?.dataset.dioramaReady==='true'`,
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.board-tags').length`),
    1,
  );
  checks.push(
    'Lite graphics reloads the detailed board without duplicate labels',
  );
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['*/diorama/v1/Stone.glb'] });
  await call('Page.reload');
  await sleep(800);
  await waitFor(`!!document.querySelector('.welcome')`);
  await click('Continue your local game');
  await waitFor(`document.body.innerText.includes('Detailed art unavailable')`);
  assert.equal(
    await evaluate(`document.querySelectorAll('.board-tags').length`),
    0,
  );
  checks.push('A failed model request falls back to a playable basic board');
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log('PASS', checks);
} catch (error) {
  if (call) {
    try {
      const r = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(`${output}/failure.png`, Buffer.from(r.data, 'base64'));
      console.error(
        await call('Runtime.evaluate', {
          expression: 'document.body.innerText',
          returnByValue: true,
        }),
      );
    } catch {}
  }
  console.error(errors);
  throw error;
} finally {
  ws?.close();
  chrome.kill();
}
