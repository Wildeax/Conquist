import { it } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createModel, MODEL_NAMES, terrainGeometry } from './models.ts';
it('all game models have finite geometry and remain within miniature scale', () => {
  for (const name of MODEL_NAMES) {
    const model = createModel(name);
    const bounds = new T.Box3().setFromObject(model);
    assert.ok(!bounds.isEmpty());
    assert.ok(bounds.getSize(new T.Vector3()).length() < 2);
    model.traverse((o) => {
      if (o instanceof T.Mesh) {
        const p = o.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++)
          assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)));
      }
    });
  }
});
it('terrain atlas UVs stay in the assigned cell and terrain normals face up', () => {
  for (let t = 0; t < 6; t++) {
    const geo = terrainGeometry(t, 42),
      uv = geo.getAttribute('uv'),
      n = geo.getAttribute('normal');
    for (let i = 0; i < uv.count; i++) {
      assert.ok(uv.getX(i) >= (t % 3) / 3 && uv.getX(i) <= ((t % 3) + 1) / 3);
      assert.ok(
        uv.getY(i) >= (1 - Math.floor(t / 3)) / 2 &&
          uv.getY(i) <= (2 - Math.floor(t / 3)) / 2,
      );
      if (i > 36) assert.ok(n.getY(i) > 0);
    }
    geo.dispose();
  }
});
