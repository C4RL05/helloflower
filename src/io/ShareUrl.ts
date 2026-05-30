/**
 * Encode/decode a flower description into a shareable URL. The description is
 * the exact `helloflower1.x` serialization, so a shared link reopens the same
 * flower (and stays compatible with the original format).
 *
 * Two forms are supported:
 *   - `#/f/<base64url>`        — compact, the canonical share link
 *   - `?flower=<urlencoded>`   — human-debuggable fallback
 *
 * Base64 here is UTF-8-safe and works in both the browser and Node (so it is
 * unit-testable). Compression (deflate) is a possible future optimization;
 * descriptions are short enough that plain base64url stays well under URL limits.
 */
const HASH_PREFIX = "#/f/";

export function encodeFlowerHash(description: string): string {
  return HASH_PREFIX + base64UrlEncode(description);
}

export function buildShareUrl(
  origin: string,
  pathname: string,
  description: string,
): string {
  return origin + pathname + encodeFlowerHash(description);
}

/** Extract a flower description from a location's hash/search, or null. */
export function decodeFlowerFromLocation(
  hash: string,
  search: string,
): string | null {
  if (hash.startsWith(HASH_PREFIX)) {
    const decoded = base64UrlDecode(hash.slice(HASH_PREFIX.length));
    if (decoded) return decoded;
  }
  const params = new URLSearchParams(search);
  const f = params.get("flower");
  return f && f.length > 0 ? f : null;
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
