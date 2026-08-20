// Crypto helpers for the instagram-integrations Edge Function.
// Nothing here ever leaves the function: tokens are sealed with AES-256-GCM
// (INTEGRATION_TOKEN_KEY) and OAuth state is HMAC-signed (INTEGRATION_STATE_SECRET).

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function aesKey() {
  const raw = Deno.env.get("INTEGRATION_TOKEN_KEY");
  if (!raw) throw new Error("INTEGRATION_TOKEN_KEY is not set");
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("INTEGRATION_TOKEN_KEY must be base64 of 32 bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Never store a raw provider token — always seal first. */
export async function sealToken(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), enc.encode(plaintext)),
  );
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function openToken(stored: string): Promise<string> {
  const [version, iv, ct] = stored.split(".");
  if (version !== "v1" || !iv || !ct) throw new Error("Unsupported token ciphertext");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64url(iv) },
    await aesKey(),
    unb64url(ct),
  );
  return dec.decode(pt);
}

async function hmacKey(usage: "sign" | "verify") {
  const secret = Deno.env.get("INTEGRATION_STATE_SECRET");
  if (!secret) throw new Error("INTEGRATION_STATE_SECRET is not set");
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export type OAuthState = {
  /** Supabase auth user id that initiated the connect. */
  uid: string;
  /** Brand slug the account is being routed to (never hardcoded). */
  brand_key: string | null;
  /** Approved dashboard origin to return the browser to. */
  origin: string;
  /** Issued-at (ms) and single-use nonce. */
  iat: number;
  exp: number;
  nonce: string;
};

const STATE_TTL_MS = 10 * 60_000;

export async function signState(input: Omit<OAuthState, "iat" | "exp" | "nonce">): Promise<{
  state: string;
  nonce: string;
  expiresAt: string;
}> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const now = Date.now();
  const payload: OAuthState = { ...input, iat: now, exp: now + STATE_TTL_MS, nonce };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey("sign"), enc.encode(body)));
  return {
    state: `${body}.${b64url(sig)}`,
    nonce,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

/** Returns null for a malformed, tampered, or expired state. */
export async function verifyState(state: string): Promise<OAuthState | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey("verify"), unb64url(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const payload = JSON.parse(dec.decode(unb64url(body))) as OAuthState;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (!payload.uid || !payload.origin || !payload.nonce) return null;
    return payload;
  } catch {
    return null;
  }
}