/**
 * Deterministic paragraph-based chunking. No LLM, no semantic rewriting, no
 * fabricated context. Identical normalized input always produces identical
 * chunk boundaries and ordering.
 */
import { sha256Hex } from "./normalize.ts";

export interface ChunkRecord {
  chunk_index: number;
  content: string;
  content_hash: string;
}

const DEFAULT_MAX_CHUNK_CHARS = 2000;

/**
 * Splits on blank-line paragraph boundaries; a paragraph longer than
 * maxChunkChars is further split into fixed-size windows. Ordering and
 * indices are always derived from the source order, never reshuffled.
 */
export function splitIntoChunks(
  normalizedText: string,
  maxChunkChars: number = DEFAULT_MAX_CHUNK_CHARS,
): string[] {
  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChunkChars) {
      chunks.push(paragraph);
      continue;
    }
    for (let start = 0; start < paragraph.length; start += maxChunkChars) {
      chunks.push(paragraph.slice(start, start + maxChunkChars));
    }
  }

  // A normalized, non-empty input with no blank-line paragraph breaks (e.g.
  // a single short note) still yields exactly one chunk.
  if (chunks.length === 0 && normalizedText.length > 0) {
    chunks.push(normalizedText);
  }

  return chunks;
}

export async function chunkContent(
  normalizedText: string,
  maxChunkChars?: number,
): Promise<ChunkRecord[]> {
  const pieces = splitIntoChunks(normalizedText, maxChunkChars);
  const records: ChunkRecord[] = [];
  for (let index = 0; index < pieces.length; index += 1) {
    records.push({
      chunk_index: index,
      content: pieces[index],
      content_hash: await sha256Hex(pieces[index]),
    });
  }
  return records;
}
