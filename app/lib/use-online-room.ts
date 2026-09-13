'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Command, RoomView } from '@/server/rooms';

type Session = { code: string; token: string };
const key = 'conquist-room-v1';
async function request<T = RoomView>(
  path: string,
  token?: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/rooms${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({
    error: 'Online rooms are unavailable. Please try again later.',
  }));
  if (!response.ok)
    throw new Error(
      (result as { error?: string }).error ?? 'Unable to reach the room.',
    );
  return result as T;
}
export function useOnlineRoom() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<RoomView | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const current = useRef<Session | null>(null);
  const locked = useRef(false);
  const viewRef = useRef<RoomView | null>(null);
  const accept = useCallback((next: RoomView, expected: Session) => {
    if (current.current?.token !== expected.token) return;
    if (!viewRef.current || next.revision >= viewRef.current.revision) {
      if (viewRef.current?.revision === next.revision) {
        next.game = viewRef.current.game;
        next.actions = viewRef.current.actions;
      }
      viewRef.current = next;
      setView(next);
    }
    setConnected(true);
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      if (
        saved &&
        /^[A-F0-9]{8}$/.test(saved.code) &&
        /^[a-f0-9]{64}$/.test(saved.token)
      ) {
        current.current = saved;
        // Browser session restoration happens after server rendering.
        // eslint-disable-next-line react/react-compiler
        setSession(saved);
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await request(`/${session!.code}`, session!.token);
        if (!stopped) accept(next, session!);
      } catch (e) {
        if (!stopped) {
          setConnected(false);
          if (e instanceof Error && /invalid|expired/.test(e.message))
            setError(e.message);
        }
      }
      if (!stopped) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [session, accept]);
  async function enter(name: string, code?: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await request<{ token: string; view: RoomView }>(
        code ? `/${code.toUpperCase().trim()}/join` : '',
        undefined,
        { name },
      );
      const next = { code: result.view.code, token: result.token };
      current.current = next;
      viewRef.current = null;
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {}
      setSession(next);
      accept(result.view, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to join.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const send = useCallback(
    async (command: Command) => {
      const active = current.current;
      if (!active || !viewRef.current || locked.current) return;
      locked.current = true;
      setBusy(true);
      setError('');
      try {
        accept(
          await request(`/${active.code}/command`, active.token, {
            revision: viewRef.current.revision,
            command,
          }),
          active,
        );
      } catch (e) {
        if (current.current?.token === active.token) {
          setError(
            e instanceof Error ? e.message : 'Unable to make that move.',
          );
          try {
            accept(await request(`/${active.code}`, active.token), active);
          } catch {
            setConnected(false);
          }
        }
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [accept],
  );
  function leave() {
    current.current = null;
    viewRef.current = null;
    setSession(null);
    setView(null);
    setConnected(false);
    setError('');
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
  return { session, view, busy, connected, error, enter, send, leave };
}
