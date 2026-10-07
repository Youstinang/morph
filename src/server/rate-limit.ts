/**
 * In-memory sliding-window limits, per client and for the whole server process. Enough for one showcase
 * instance; it resets on restart and isn't shared between instances.
 */
export interface RateLimiter {
  take(clientId: string): { ok: true } | { ok: false; retryAfterSeconds: number };
}

interface Window {
  limit: number;
  windowMs: number;
}

const MAX_CLIENTS = 2000;

export function createRateLimiter(options: { perClient: Window; global: Window; now?: () => number }): RateLimiter {
  const now = options.now ?? Date.now;
  const clients = new Map<string, number[]>();
  let everyone: number[] = [];

  const recent = (stamps: number[], window: Window, t: number) => stamps.filter((stamp) => t - stamp < window.windowMs);
  const wait = (stamps: number[], window: Window, t: number) => Math.max(1, Math.ceil((stamps[0]! + window.windowMs - t) / 1000));

  return {
    take(clientId) {
      const t = now();
      everyone = recent(everyone, options.global, t);
      const mine = recent(clients.get(clientId) ?? [], options.perClient, t);
      if (mine.length >= options.perClient.limit) return { ok: false, retryAfterSeconds: wait(mine, options.perClient, t) };
      if (everyone.length >= options.global.limit) return { ok: false, retryAfterSeconds: wait(everyone, options.global, t) };
      mine.push(t);
      everyone.push(t);
      clients.delete(clientId);
      clients.set(clientId, mine);
      if (clients.size > MAX_CLIENTS) clients.delete(clients.keys().next().value!);
      return { ok: true };
    },
  };
}
