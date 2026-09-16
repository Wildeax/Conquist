// Keep all rules IDs and topology; only the presentation coordinates change.
export const BOARD_SPACING = 0.955;
export function compactLayout(source) {
  return {
    ...source,
    hexes: source.hexes.map((h) => ({
      ...h,
      x: h.x * BOARD_SPACING,
      z: h.z * BOARD_SPACING,
    })),
    vertices: source.vertices.map((v) => ({
      ...v,
      x: v.x * BOARD_SPACING,
      z: v.z * BOARD_SPACING,
    })),
    edges: source.edges.map((e) => ({ ...e })),
  };
}
export function boardPorts(layout) {
  const ports = [],
    seen = new Set();
  for (const edge of layout.edges) {
    const a = layout.vertices[edge.a],
      b = layout.vertices[edge.b];
    if (
      a.harbour === null ||
      a.harbour !== b.harbour ||
      seen.has(a.id) ||
      seen.has(b.id)
    )
      continue;
    const shared = a.hexes.filter((id) => b.hexes.includes(id));
    if (shared.length !== 1) continue;
    const land = layout.hexes[shared[0]],
      x = (a.x + b.x) / 2,
      z = (a.z + b.z) / 2;
    let dx = -(b.z - a.z),
      dz = b.x - a.x;
    const length = Math.hypot(dx, dz);
    dx /= length;
    dz /= length;
    if (dx * (x - land.x) + dz * (z - land.z) < 0) {
      dx = -dx;
      dz = -dz;
    }
    ports.push({
      id: ports.length,
      edgeId: edge.id,
      a: a.id,
      b: b.id,
      type: a.harbour,
      x,
      z,
      dx,
      dz,
    });
    seen.add(a.id);
    seen.add(b.id);
  }
  return ports;
}

// A deterministic composition to review the art, not a saved or live match.
// Building locations obey the distance rule and routes use actual graph edges.
export function sampleConstruction(layout) {
  const buildings = [],
    roads = [],
    takenEdges = new Set();
  function available(v) {
    return buildings.every(
      (b) =>
        b.id !== v.id &&
        !layout.edges.some(
          (e) =>
            (e.a === v.id && e.b === b.id) || (e.b === v.id && e.a === b.id),
        ),
    );
  }
  for (let owner = 0; owner < 4; owner++)
    for (let upgrade = 0; upgrade < 2; upgrade++) {
      const angle = (owner * Math.PI) / 2 + (upgrade ? 0.32 : -0.32),
        tx = Math.cos(angle) * 2.8,
        tz = Math.sin(angle) * 2.8;
      const vertex = layout.vertices
        .filter(available)
        .sort(
          (a, b) =>
            Math.hypot(a.x - tx, a.z - tz) - Math.hypot(b.x - tx, b.z - tz),
        )[0];
      buildings.push({ id: vertex.id, owner, city: !!upgrade });
    }
  for (let owner = 0; owner < 4; owner++) {
    const [start, end] = buildings.filter((b) => b.owner === owner),
      queue = [start.id],
      previous = new Map([[start.id, null]]);
    while (queue.length && !previous.has(end.id)) {
      const current = queue.shift();
      for (const id of layout.vertices[current].edges) {
        const edge = layout.edges[id],
          next = edge.a === current ? edge.b : edge.a;
        if (
          takenEdges.has(id) ||
          previous.has(next) ||
          buildings.some((b) => b.id === next && b.owner !== owner)
        )
          continue;
        previous.set(next, { vertex: current, edge: id });
        queue.push(next);
      }
    }
    if (!previous.has(end.id)) throw Error('No connected preview route');
    let cursor = end.id;
    while (cursor !== start.id) {
      const hop = previous.get(cursor);
      roads.push({ id: hop.edge, owner });
      takenEdges.add(hop.edge);
      cursor = hop.vertex;
    }
  }
  return {
    buildings,
    roads,
    raider: layout.hexes.find((h) => !h.resource || h.resource === 'Desert').id,
  };
}
