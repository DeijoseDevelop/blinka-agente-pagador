import { createHash } from "node:crypto";

/**
 * Serializa un valor a JSON canonico: claves ordenadas de forma estable y
 * recursion determinista. Imprescindible para hashes reproducibles.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortValue(obj[key]);
    }
    return out;
  }
  return value;
}

/** SHA-256 hex de un texto. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Hash canonico de un objeto (JSON ordenado) en hex. */
export function hashObject(value: unknown): string {
  return sha256Hex(canonicalize(value));
}
