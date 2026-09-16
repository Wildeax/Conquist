import type * as T from 'three';
import type { Game, Action } from '../../../packages/rules/game';
export interface DioramaAssets {
  dispose(): void;
}
export interface DioramaRuntime {
  sync(game: Game): void;
  preview(action: Action): T.Group;
  raiderPosition(id: number): T.Vector3;
  update(elapsed: number, reduced: boolean): void;
  beforeRender(): void;
  afterRender(): void;
  dispose(): void;
}
export function loadDioramaAssets(signal: AbortSignal): Promise<DioramaAssets>;
export function createDiorama(options: {
  scene: T.Scene;
  renderer: T.WebGLRenderer;
  camera: T.Camera;
  host: HTMLElement;
  game: Game;
  assets: DioramaAssets;
  lighting: { apply(root: T.Object3D): void };
  lite: boolean;
  pieces: T.Group;
  targets: T.Group;
}): DioramaRuntime;
