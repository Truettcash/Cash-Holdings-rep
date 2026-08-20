/**
 * Deterministic content normalization + hashing.
 *
 * Normalization never summarizes or rewrites content — it only makes byte-
 * level representation stable so identical source text always produces the
 * same hash regardless of platform line endings or incidental whitespace.
 */
import { IngestionError } from "./types.ts";

export function normalizeContent(raw: string): string {
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();

  if (normalized.length === 0) {
    throw new IngestionError("content is empty after normalization");
  }

  return normalized;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
