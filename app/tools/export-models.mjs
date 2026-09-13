import { mkdir, writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { MODEL_NAMES, createModel } from '../lib/scene/models.ts';
class BlobReader {
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((value) => {
      this.result = value;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    void blob.arrayBuffer().then((value) => {
      this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;
      this.onloadend?.();
    });
  }
}
globalThis.FileReader = BlobReader;
await mkdir(new URL('../public/models/', import.meta.url), { recursive: true });
for (const name of MODEL_NAMES) {
  const data = await new GLTFExporter().parseAsync(createModel(name), {
    binary: true,
  });
  await writeFile(
    new URL(`../public/models/${name}.glb`, import.meta.url),
    Buffer.from(data),
  );
  console.log(`${name}.glb`, data.byteLength, 'bytes');
}
