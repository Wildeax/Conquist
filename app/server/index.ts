import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { offerCards } from '../packages/rules/trading.ts';
import { Rooms, type Offer, type Command } from './rooms.ts';

export function createRoomServer(directory: string) {
  const rooms = new Rooms(directory);
  const limits = new Map<string, { count: number; reset: number }>();
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, value: unknown) => {
      res.writeHead(status);
      // Older open tabs can keep playing, but must refresh to use the new trade UI.
      const legacyView = (candidate: unknown) => {
        if (
          candidate &&
          typeof candidate === 'object' &&
          'actions' in candidate &&
          'offer' in candidate
        ) {
          if (req.headers['x-conquist-protocol'] === '2' && candidate.offer) {
            const cards = offerCards(candidate.offer as Offer);
            if (
              cards.give.reduce((a, b) => a + b, 0) === 1 &&
              cards.want.reduce((a, b) => a + b, 0) === 1
            )
              return candidate;
          }
          return { ...candidate, offer: null };
        }
        return candidate;
      };
      if (req.headers['x-conquist-protocol'] !== '3') {
        if (value && typeof value === 'object' && 'view' in value)
          value = { ...value, view: legacyView(value.view) };
        else value = legacyView(value);
      }
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/health')
        return send(200, {
          ok: true,
          release: process.env.CONQUIST_RELEASE ?? 'local',
          environment: process.env.CONQUIST_ENVIRONMENT ?? 'local',
        });
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return send(403, { error: 'Cross-origin requests are not allowed.' });
      const ip = req.socket.remoteAddress ?? 'unknown';
      const now = Date.now();
      for (const [key, value] of limits)
        if (value.reset < now) limits.delete(key);
      const limit = limits.get(ip) ?? { count: 0, reset: now + 60000 };
      limits.set(ip, limit);
      if (++limit.count > 1200)
        return send(429, { error: 'Too many requests. Try again shortly.' });
      const match =
        /^\/api\/rooms(?:\/([A-F0-9]{8})(?:\/(join|command|chat))?)?$/.exec(
          url.pathname,
        );
      if (!match) return send(404, { error: 'Not found.' });
      const [, code, operation] = match;
      const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
      if (req.method === 'GET' && code && !operation)
        return send(200, rooms.view(code, token));
      if (req.method !== 'POST')
        return send(405, { error: 'Method not allowed.' });
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 4096) {
          send(413, { error: 'Request too large.' });
          return;
        }
      }
      const input = JSON.parse(body);
      if (!input || typeof input !== 'object')
        throw new Error('Invalid request.');
      if (!code) return send(201, rooms.create(input.name));
      if (operation === 'join') return send(200, rooms.join(code, input.name));
      if (operation === 'chat')
        return send(200, rooms.chat(code, token, input.text, input.clientId));
      if (operation === 'command')
        return send(
          200,
          rooms.command(code, token, input.revision, input.command as Command),
        );
      return send(404, { error: 'Not found.' });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        return send(503, {
          error: 'The room could not be saved. Please try again shortly.',
        });
      }
      const message =
        error instanceof Error ? error.message : 'Unable to update this room.';
      const status = message.includes('session is invalid')
        ? 401
        : message.includes('not found or expired')
          ? 404
          : 400;
      send(status, {
        error:
          status === 400 && !(error instanceof SyntaxError)
            ? message
            : status === 400
              ? 'Invalid request.'
              : message,
      });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT ?? 3102);
  createRoomServer(process.env.CONQUIST_DATA_DIR ?? './.rooms').listen(
    port,
    '0.0.0.0',
    () => {
      console.log(`Conquist rooms listening on ${port}`);
    },
  );
}
