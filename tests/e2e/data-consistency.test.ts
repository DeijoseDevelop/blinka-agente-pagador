import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256File } from "@agente/pipeline";

/**
 * Consistencia de datos oficiales:
 * - Las copias dentro de apps/api deben ser identicas a las raices (sin drift).
 * - Cada source_pdf.sha256 declarado corresponde al archivo real en disco.
 * - El oraculo (expected_results.json) es coherente con el dataset de facturas.
 */

const ROOT = process.cwd();
const load = (rel: string) =>
  JSON.parse(readFileSync(resolve(ROOT, rel), "utf8").replace(/^﻿/, ""));

describe("consistencia de datos: raiz vs apps/api", () => {
  const pairs = [
    ["data/invoices.json", "apps/api/data/invoices.json"],
    ["data/reference_data.json", "apps/api/data/reference_data.json"],
    ["config/company_policy.json", "apps/api/config/company_policy.json"]
  ];

  for (const [a, b] of pairs) {
    it(`${a} es identico a ${b}`, () => {
      expect(load(b!)).toEqual(load(a!));
    });
  }

  it("los PDFs duplicados entre data/ y apps/api/data/ son identicos", async () => {
    const { existsSync, readdirSync } = await import("node:fs");
    const rootPdfs = readdirSync(resolve(ROOT, "data/pdfs")).filter((f) => f.endsWith(".pdf"));
    for (const name of rootPdfs) {
      const mirror = resolve(ROOT, "apps/api/data/pdfs", name);
      if (existsSync(mirror)) {
        expect(sha256File(mirror)).toBe(sha256File(resolve(ROOT, "data/pdfs", name)));
      }
    }
  });
});

describe("consistencia del dataset y el oraculo", () => {
  const invoices = load("data/invoices.json").invoices as Array<{
    id: string;
    invoice_number: string;
    supplier_id: string;
    source_pdf: { path: string; sha256?: string };
  }>;
  const reference = load("data/reference_data.json") as {
    suppliers: Array<{ supplier_id: string; registered_bank_account: string }>;
  };
  const expected = load("tests/expected_results.json") as {
    processing_order: string[];
    results: Array<{ invoice_id: string; expected_decision: string }>;
  };

  it("cada source_pdf.sha256 corresponde al archivo real", () => {
    for (const inv of invoices) {
      expect(sha256File(resolve(ROOT, inv.source_pdf.path)), inv.id).toBe(inv.source_pdf.sha256);
    }
  });

  it("todo supplier_id de factura existe en el registro maestro", () => {
    const ids = new Set(reference.suppliers.map((s) => s.supplier_id));
    for (const inv of invoices) {
      expect(ids.has(inv.supplier_id), `${inv.id} supplier ${inv.supplier_id}`).toBe(true);
    }
  });

  it("processing_order solo contiene facturas existentes y cubre el oraculo", () => {
    const ids = new Set(invoices.map((i) => i.id));
    for (const id of expected.processing_order) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const r of expected.results) {
      expect(expected.processing_order).toContain(r.invoice_id);
    }
  });

  it("las decisiones esperadas usan el vocabulario oficial", () => {
    for (const r of expected.results) {
      expect(["PAY", "ESCALATE", "BLOCK"]).toContain(r.expected_decision);
    }
  });
});
