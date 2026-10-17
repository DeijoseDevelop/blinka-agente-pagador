import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, parse, resolve } from "node:path";

/** SHA-256 de un archivo en disco. */
export function sha256File(absolutePath: string): string {
  const bytes = readFileSync(absolutePath);
  return createHash("sha256").update(bytes).digest("hex");
}

/** Lee un archivo de texto quitando el BOM UTF-8 si esta presente. */
export function readText(absolutePath: string): string {
  return readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "");
}

/**
 * Resuelve una ruta relativa al cwd; si no existe, sube por los directorios
 * padres hasta encontrarla (permite ejecutar la API desde apps/api y encontrar
 * recursos compartidos como tests/expected_results.json).
 */
export function resolveUpward(relativePath: string): string {
  let dir = process.cwd();
  const root = parse(dir).root;
  while (true) {
    const candidate = resolve(dir, relativePath);
    if (existsSync(candidate)) return candidate;
    if (dir === root) break;
    dir = dirname(dir);
  }
  return resolve(process.cwd(), relativePath);
}

/** Carga un JSON oficial (sin BOM) relativo a la raiz del proyecto. */
export function loadJson<T>(relativePath: string): T {
  return JSON.parse(readText(resolveUpward(relativePath))) as T;
}
