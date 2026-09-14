import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Run from app/. Shipping models are committed; Blender is only needed to reauthor them.
const source = resolve('../art/blender/output/web-v01');
const target = resolve('public/diorama/v1');
const names = [
  'Stone',
  'Clay',
  'Grain',
  'Desert',
  'Timber',
  'Wool',
  'SheepRig',
  'Settlement',
  'City',
  'Road',
  'Port',
  'Robber',
  'Cargo',
];
await mkdir(target, { recursive: true });
const files = [];
for (const name of names) {
  const file = name + '.glb',
    bytes = await readFile(resolve(source, file));
  if (bytes.toString('ascii', 0, 4) !== 'glTF')
    throw Error('Invalid GLB: ' + file);
  files.push({
    file,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  await copyFile(resolve(source, file), resolve(target, file));
}
await copyFile(
  resolve(source, 'board-pieces-report.json'),
  resolve(target, 'pieces.json'),
);
await writeFile(
  resolve(target, 'manifest.json'),
  JSON.stringify({ version: 1, files }, null, 2) + '\n',
);
console.log(
  'Published ' +
    files.length +
    ' models, ' +
    files.reduce((n, f) => n + f.bytes, 0) +
    ' bytes',
);
