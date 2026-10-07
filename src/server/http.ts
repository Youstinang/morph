/** Small helpers shared by MORPH's JSON routes. */

export const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * The caller's address for rate limits. Address headers are believed only behind a hosting proxy that
 * overwrites them (Vercel does); anywhere else a caller could forge them to dodge the limits, so every
 * caller shares one bucket.
 */
export function clientId(request: Request, trustProxy: boolean): string {
  if (!trustProxy) return "local";
  const forwarded = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || "local").slice(0, 64);
}

/**
 * Refuses requests that didn't come from MORPH's own page as JSON. A JSON content type can't be sent
 * cross-site without a CORS preflight, which these routes never grant; the origin checks catch the rest.
 */
export function foreignRequest(request: Request): { status: 403 | 415; reason: string } | null {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json(;|$)/i.test(type.trim())) return { status: 415, reason: "The request wasn't readable." };
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return { status: 403, reason: "Requests must come from MORPH itself." };
  const origin = request.headers.get("origin");
  if (origin === null) return null;
  const host = request.headers.get("host");
  try {
    if (host !== null && new URL(origin).host === host) return null;
  } catch {
    // An unparseable origin is refused below.
  }
  return { status: 403, reason: "Requests must come from MORPH itself." };
}

/** Reads a small JSON body: "too_large" past `maxBytes`, "unreadable" if it isn't JSON. */
export async function readJson(request: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; error: "too_large" | "unreadable" }> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return { ok: false, error: "too_large" };
  try {
    const text = await request.text();
    if (text.length > maxBytes) return { ok: false, error: "too_large" };
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, error: "unreadable" };
  }
}
