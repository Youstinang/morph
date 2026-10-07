/** Small helpers shared by MORPH's JSON routes. */

export const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** The client's address as reported by the hosting proxy; "local" when there is none. */
export function clientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip") || "local").slice(0, 64);
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
