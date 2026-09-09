'use client';
import { useEffect, useRef } from 'react';
import {
  legalActions,
  score,
  hand,
  type Game,
  type Action,
} from '@/packages/rules/game';

type Context = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
/** Optional WebMCP access shares the exact rules and UI dispatch. */
export function useGameTools(
  game: Game,
  playing: boolean,
  blocked: boolean,
  dispatch: (action: Action) => void,
) {
  const state = useRef({ game, playing, blocked, dispatch });
  useEffect(() => {
    state.current = { game, playing, blocked, dispatch };
  }, [game, playing, blocked, dispatch]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const read = () => {
      const { game, playing, blocked } = state.current;
      return {
        playing,
        phase: game.phase,
        turn: game.turn,
        active: game.active,
        players: game.players.map((p, i) => ({
          name: p.name,
          points: score(game, i, true),
          handSize: hand(game, i),
        })),
        legalActions: playing && !blocked ? legalActions(game) : [],
      };
    };
    const tools = [
      {
        name: 'read_conquist_table',
        description:
          'Read the current local table and legal actions without revealing opponents’ resource composition.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => read(),
      },
      {
        name: 'make_conquist_move',
        description:
          'Complete one legal local game move by its index in read_conquist_table. Only available for the active human player.',
        inputSchema: {
          type: 'object',
          properties: { index: { type: 'integer', minimum: 0 } },
          required: ['index'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input: unknown) => {
          const current = state.current;
          if (!current.playing || current.blocked)
            throw new Error('No active human turn.');
          if (
            typeof input !== 'object' ||
            input === null ||
            !('index' in input) ||
            !Number.isInteger(input.index)
          )
            throw new Error('An integer move index is required.');
          const action = legalActions(current.game)[input.index as number];
          if (!action) throw new Error('Move index is out of range.');
          current.dispatch(action);
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return read();
        },
      },
    ];
    for (const tool of tools)
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    return () => lifecycle.abort();
  }, []);
}
