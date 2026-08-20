/**
 * Structural fingerprinting for live RPC responses.
 *
 * Captures KEY NAMES and value TYPES only — never values — so an owner can
 * inspect the exact payload contract from a signed-in session without any
 * personal information, engagement content or metric values leaving the page.
 */

export type PayloadShape = {
  /** Top-level keys, or `<array>` / `<null>` / a primitive type name. */
  rootKeys: string[];
  /** Keys of the `data` (or equivalent) container, when present. */
  dataKeys: string[];
  /** Keys of the `summary` container, when present. */
  summaryKeys: string[];
  /** Keys of the `meta` container, when present. */
  metaKeys: string[];
  /** Dotted paths that hold arrays, with their length. */
  arrays: { path: string; length: number }[];
  /** Dotted paths that hold nested objects. */
  objects: string[];
  /** path → typeof (arrays reported as `array`, null as `null`). */
  types: Record<string, string>;
  /** Paths whose value is null — candidates for unsupported metrics. */
  nulls: string[];
  /** Where a record count appears to live, when the payload exposes one. */
  recordCountPath: string | null;
  /** True when the payload resolved but every container is empty. */
  empty: boolean;
};

const COUNT_KEYS = new Set([
  "recordcount",
  "record_count",
  "count",
  "total",
  "totalcount",
  "total_count",
  "rows",
  "rowcount",
  "row_count",
]);

const MAX_DEPTH = 3;
const MAX_KEYS = 60;

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Structure of a payload — safe to copy, log and paste. */
export function describeShape(payload: unknown): PayloadShape {
  const shape: PayloadShape = {
    rootKeys: [],
    dataKeys: [],
    summaryKeys: [],
    metaKeys: [],
    arrays: [],
    objects: [],
    types: {},
    nulls: [],
    recordCountPath: null,
    empty: false,
  };

  if (payload === null || payload === undefined) {
    shape.rootKeys = ["<null>"];
    shape.empty = true;
    return shape;
  }

  if (Array.isArray(payload)) {
    shape.rootKeys = ["<array>"];
    shape.arrays.push({ path: "<root>", length: payload.length });
    shape.types["<root>"] = "array";
    shape.empty = payload.length === 0;
    // Inspect the first element's structure only — key names, no values.
    const first = payload[0];
    if (isPlainObject(first)) {
      shape.dataKeys = Object.keys(first).slice(0, MAX_KEYS);
      for (const key of shape.dataKeys) shape.types[`<root>[].${key}`] = typeOf(first[key]);
    }
    return shape;
  }

  if (!isPlainObject(payload)) {
    shape.rootKeys = [typeOf(payload)];
    shape.types["<root>"] = typeOf(payload);
    return shape;
  }

  shape.rootKeys = Object.keys(payload).slice(0, MAX_KEYS);

  const walk = (node: Record<string, unknown>, prefix: string, depth: number) => {
    for (const key of Object.keys(node).slice(0, MAX_KEYS)) {
      const value = node[key];
      const path = prefix ? `${prefix}.${key}` : key;
      const type = typeOf(value);
      shape.types[path] = type;

      if (type === "null") shape.nulls.push(path);
      if (type === "array") shape.arrays.push({ path, length: (value as unknown[]).length });
      if (type === "object") shape.objects.push(path);

      if (!shape.recordCountPath && type === "number" && COUNT_KEYS.has(key.toLowerCase())) {
        shape.recordCountPath = path;
      }

      if (type === "array" && depth < MAX_DEPTH) {
        const first = (value as unknown[])[0];
        if (isPlainObject(first)) {
          for (const child of Object.keys(first).slice(0, MAX_KEYS)) {
            shape.types[`${path}[].${child}`] = typeOf(first[child]);
          }
        }
      }

      if (type === "object" && depth < MAX_DEPTH) {
        walk(value as Record<string, unknown>, path, depth + 1);
      }
    }
  };

  walk(payload, "", 0);

  const container = (key: string) =>
    isPlainObject(payload[key]) ? Object.keys(payload[key] as Record<string, unknown>) : [];
  shape.dataKeys = container("data").length ? container("data") : container("result");
  shape.summaryKeys = container("summary").length ? container("summary") : container("totals");
  shape.metaKeys = container("meta").length ? container("meta") : container("metadata");

  shape.empty =
    shape.arrays.every((a) => a.length === 0) &&
    Object.values(shape.types).every((t) => t === "null" || t === "array" || t === "object");

  return shape;
}

/** Compact one-line signature, handy for diffing two runs. */
export function shapeSignature(shape: PayloadShape): string {
  const arrays = shape.arrays.map((a) => a.path).join(",");
  return `root:[${shape.rootKeys.join(",")}] arrays:[${arrays}] count:${
    shape.recordCountPath ?? "-"
  }`;
}