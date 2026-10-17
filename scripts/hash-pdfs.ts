import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readText, sha256File } from "@agente/pipeline";

/**
 * Calcula el SHA-256 real de cada PDF referenciado en data/invoices.json
 * y escribe el resultado en `source_pdf.sha256`. Idempotente.
 */

const ROOT = process.cwd();
const INVOICES_PATH = resolve(ROOT, "data", "invoices.json");

interface SourcePdf {
  path: string;
  sha256?: string;
}
interface InvoiceRecord {
  id: string;
  source_pdf: SourcePdf;
  [key: string]: unknown;
}
interface InvoicesFile {
  dataset_version: string;
  invoices: InvoiceRecord[];
}

export function hashPdfs(): InvoicesFile {
  const data = JSON.parse(readText(INVOICES_PATH)) as InvoicesFile;
  for (const invoice of data.invoices) {
    const abs = resolve(ROOT, invoice.source_pdf.path);
    invoice.source_pdf.sha256 = sha256File(abs);
  }
  writeFileSync(INVOICES_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return data;
}

if (process.argv[1]?.endsWith("hash-pdfs.ts") || process.argv[1]?.endsWith("hash-pdfs.js")) {
  const data = hashPdfs();
  console.log("SHA-256 de PDFs escrito en data/invoices.json:");
  for (const invoice of data.invoices) {
    console.log(`  ${invoice.id}  ${invoice.source_pdf.sha256}`);
  }
}
