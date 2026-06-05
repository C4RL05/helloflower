/**
 * Encode/decode a flower description (+ optional background gradient) into a
 * shareable URL. The description is the exact `helloflower1.x` serialization, so
 * a shared link reopens the same flower (and stays compatible with the original
 * format).
 *
 * Forms:
 *   - `#/f/<base64url>`               — flower only (canonical, legacy-compatible)
 *   - `#/f/<base64url>/g/<12 hex>`    — flower + share gradient (top6 + bottom6)
 *   - `?flower=<urlencoded>`          — human-debuggable fallback
 *
 * Base64 here is UTF-8-safe and works in both the browser and Node (so it is
 * unit-testable). `/g/` is a safe delimiter — base64url never contains `/`.
 */
const HASH_PREFIX = "#/f/";
const GRAD_SEP = "/g/";

/** [topColor, bottomColor] as 0xRRGGBB ints — the share background gradient. */
export type Gradient = [number, number];

export interface SharedFlower {
  description: string;
  gradient: Gradient | null;
}

export function encodeFlowerHash(
  description: string,
  gradient?: Gradient | null,
): string {
  let hash = HASH_PREFIX + base64UrlEncode(description);
  if (gradient) hash += GRAD_SEP + hex6(gradient[0]) + hex6(gradient[1]);
  return hash;
}

export function buildShareUrl(
  origin: string,
  pathname: string,
  description: string,
  gradient?: Gradient | null,
): string {
  return origin + pathname + encodeFlowerHash(description, gradient);
}

/** Extract a flower (and gradient) from a location's hash/search, or null. */
export function decodeFlowerFromLocation(
  hash: string,
  search: string,
): SharedFlower | null {
  if (hash.startsWith(HASH_PREFIX)) {
    let payload = hash.slice(HASH_PREFIX.length);
    let gradient: Gradient | null = null;
    const gi = payload.indexOf(GRAD_SEP);
    if (gi >= 0) {
      const g = payload.slice(gi + GRAD_SEP.length);
      payload = payload.slice(0, gi);
      if (/^[0-9a-fA-F]{12}$/.test(g)) {
        gradient = [parseInt(g.slice(0, 6), 16), parseInt(g.slice(6), 16)];
      }
    }
    const decoded = base64UrlDecode(payload);
    if (decoded) return { description: decoded, gradient };
  }
  const params = new URLSearchParams(search);
  const f = params.get("flower");
  return f && f.length > 0 ? { description: f, gradient: null } : null;
}

function hex6(n: number): string {
  return (n & 0xffffff).toString(16).padStart(6, "0");
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): string | null {
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
