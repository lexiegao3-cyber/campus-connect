/**
 * Password hashing with PBKDF2-SHA256 through the Web Crypto API, which is
 * available natively in Cloudflare Workers (bcrypt/argon2 need WASM or
 * native code). Stored format: pbkdf2$<iterations>$<salt b64>$<hash b64>,
 * so the iteration count can be raised later without breaking old hashes.
 */

const ITERATIONS = 100_000; // Workers caps PBKDF2 at 100k iterations
const KEY_BYTES = 32;

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, KEY_BYTES * 8);
  return new Uint8Array(bits);
}

/** Compare without early exit so timing does not leak the matching prefix length. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const actual = await derive(password, fromB64(salt), Number(iter));
  return timingSafeEqual(actual, fromB64(hash));
}
