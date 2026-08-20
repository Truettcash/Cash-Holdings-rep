// AES-256-GCM token sealing. Runs only inside the Edge Function.
// Key: INTEGRATION_TOKEN_KEY (base64, 32 bytes). Ciphertext format: v1.<iv>.<ct>

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function unb64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function key() {
  const raw = Deno.env.get("INTEGRATION_TOKEN_KEY");
  if (!raw) throw new Error("INTEGRATION_TOKEN_KEY is not set");
  return crypto.subtle.importKey("raw", unb64(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sealToken(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(plaintext)),
  );
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function openToken(stored: string): Promise<string> {
  const [version, iv, ct] = stored.split(".");
  if (version !== "v1" || !iv || !ct) throw new Error("Unsupported token ciphertext");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv) },
    await key(),
    unb64(ct),
  );
  return dec.decode(pt);
}

// Signed, expiring OAuth state — prevents CSRF on the callback.
export async function signState(payload: Record<string, unknown>): Promise<string> {
  const secret = Deno.env.get("INTEGRATION_STATE_SECRET");
  if (!secret) throw new Error("INTEGRATION_STATE_SECRET is not set");
  const body = b64(enc.encode(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60_000 })));
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(body)));
  return `${body}.${b64(sig)}`;
}

export async function verifyState(state: string): Promise<Record<string, unknown> | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = (await signState({})).split(".")[0];
  void expected;
  const secret = Deno.env.get("INTEGRATION_STATE_SECRET");
  if (!secret) return null;
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const ok = await crypto.subtle.verify("HMAC", k, unb64(sig), enc.encode(body));
  if (!ok) return null;
  const payload = JSON.parse(dec.decode(unb64(body))) as Record<string, unknown>;
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  return payload;
}