import type { Game } from '../../packages/rules/game.ts';

export const DIORAMA_SPACING = 0.955;
export const RAIDER_OFFSET = [-0.7, 0] as const;

/** Presentation coordinates only; rule IDs, ownership and topology stay intact. */
export function dioramaLayout(game: Game): Game {
  return {
    ...game,
    hexes: game.hexes.map((h) => ({
      ...h,
      x: h.x * DIORAMA_SPACING,
      z: h.z * DIORAMA_SPACING,
    })),
    vertices: game.vertices.map((v) => ({
      ...v,
      x: v.x * DIORAMA_SPACING,
      z: v.z * DIORAMA_SPACING,
    })),
    edges: game.edges.map((e) => ({ ...e })),
  };
}

export function constructionState(game: Game) {
  return {
    buildings: game.vertices
      .filter((v) => v.owner !== null)
      .map((v) => ({ id: v.id, owner: v.owner!, city: v.city })),
    roads: game.edges
      .filter((e) => e.owner !== null)
      .map((e) => ({ id: e.id, owner: e.owner! })),
    raider: game.raider,
  };
}
