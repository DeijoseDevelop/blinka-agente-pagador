import { describe, expect, it } from "vitest";
import type { CompanyData, LedgerEntry } from "@agente/schemas";
import { evaluateAllRules } from "../src/index.js";
import type { RuleId } from "@agente/schemas";
import { makeCompany, makeContext, makeInvoice, NOW } from "./helpers.js";

function rule(ctx: Parameters<typeof evaluateAllRules>[0], id: RuleId) {
  const found = evaluateAllRules(ctx).find((r) => r.id === id);
  if (!found) throw new Error(`regla ${id} no encontrada`);
  return found;
}

function ledgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    invoice_id: "inv_x",
    beneficiary_id: "ben_proveedor_001",
    beneficiary_name: "Proveedor Recurrente S.A.S",
    invoice_number: "INV-OLD",
    concept: "Servicios de desarrollo",
    amount_base_usd: 100,
    file_hash: "other_hash",
    date: "2026-10-05",
    decision: "PAGAR",
    ...overrides
  };
}

describe("R01 datos completos y confianza", () => {
  it("FRENAR si falta la moneda", () => {
    const ctx = makeContext({ invoice: makeInvoice({ amount: { currency: "" } }) });
    expect(rule(ctx, "R01")).toMatchObject({ status: "FAIL", on_fail: "FRENAR", waivable: false });
  });
  it("ESCALAR si la confianza es baja", () => {
    const ctx = makeContext({ invoice: makeInvoice({ field_confidence: { "amount.total": 0.5 } }) });
    expect(rule(ctx, "R01")).toMatchObject({ status: "FAIL", on_fail: "ESCALAR", waivable: true });
  });
  it("PASS con datos y confianza suficientes", () => {
    expect(rule(makeContext(), "R01").status).toBe("PASS");
  });
});

describe("R02 beneficiario en lista blanca", () => {
  it("ESCALAR si el beneficiario no esta registrado", () => {
    const ctx = makeContext({ invoice: makeInvoice({ payee: { name: "Nuevo Proveedor", tax_id: undefined } }) });
    expect(rule(ctx, "R02")).toMatchObject({ status: "FAIL", on_fail: "ESCALAR", waivable: true });
  });
  it("ESCALAR si el beneficiario esta bloqueado", () => {
    const ctx = makeContext({ invoice: makeInvoice({ payee: { name: "Proveedor Bloqueado", tax_id: undefined, bank_ref: "BANK-003" } }) });
    expect(rule(ctx, "R02").status).toBe("FAIL");
  });
  it("PASS si esta habilitado", () => {
    expect(rule(makeContext(), "R02").status).toBe("PASS");
  });
});

describe("R03 cuenta bancaria", () => {
  it("ESCALAR si la cuenta difiere de la registrada", () => {
    const ctx = makeContext({ invoice: makeInvoice({ payee: { bank_ref: "BANK-999" } }) });
    expect(rule(ctx, "R03")).toMatchObject({ status: "FAIL", on_fail: "ESCALAR", waivable: true });
  });
  it("UNKNOWN si la factura no declara cuenta", () => {
    const ctx = makeContext({ invoice: makeInvoice({ payee: { bank_ref: undefined } }) });
    expect(rule(ctx, "R03").status).toBe("UNKNOWN");
  });
  it("PASS si coincide", () => {
    expect(rule(makeContext(), "R03").status).toBe("PASS");
  });
});

describe("R04 moneda soportada", () => {
  it("FRENAR si la moneda no esta soportada", () => {
    const ctx = makeContext({ invoice: makeInvoice({ amount: { currency: "GBP" } }) });
    expect(rule(ctx, "R04")).toMatchObject({ status: "FAIL", on_fail: "FRENAR", waivable: false });
  });
  it("FRENAR si no hay tasa FX", () => {
    const company = makeCompany({ fx_rates: [] });
    const ctx = makeContext({ company, invoice: makeInvoice({ amount: { currency: "COP", total: 800000 } }) });
    expect(rule(ctx, "R04").status).toBe("FAIL");
  });
  it("PASS en moneda base", () => {
    expect(rule(makeContext(), "R04").status).toBe("PASS");
  });
});

describe("R05 tope duro (limite inclusivo)", () => {
  it("PASS justo en el tope (50000)", () => {
    const ctx = makeContext({ invoice: makeInvoice({ amount: { total: 50000 } }) });
    expect(rule(ctx, "R05").status).toBe("PASS");
  });
  it("FRENAR un centavo por encima", () => {
    const ctx = makeContext({ invoice: makeInvoice({ amount: { total: 50000.01 } }) });
    expect(rule(ctx, "R05")).toMatchObject({ status: "FAIL", on_fail: "FRENAR" });
  });
  it("FRENAR por encima del tope (60000)", () => {
    const ctx = makeContext({ invoice: makeInvoice({ amount: { total: 60000 } }) });
    expect(rule(ctx, "R05")).toMatchObject({ status: "FAIL", on_fail: "FRENAR", waivable: false });
  });
});

describe("R06 umbral de aprobacion (limite inclusivo)", () => {
  it("PASS justo en el umbral (5000)", () => {
    const ctx = makeContext({ invoice: makeInvoice({ amount: { total: 5000 } }) });
    expect(rule(ctx, "R06").status).toBe("PASS");
  });
  it("ESCALAR por encima (9200)", () => {
    const ctx = makeContext({ invoice: makeInvoice({ amount: { total: 9200 } }) });
    expect(rule(ctx, "R06")).toMatchObject({ status: "FAIL", on_fail: "ESCALAR", waivable: true });
  });
});

describe("R07 limite acumulado por periodo", () => {
  it("ESCALAR si el proyectado supera el limite mensual", () => {
    const ledger = [ledgerEntry({ amount_base_usd: 116000, invoice_number: "INV-A", date: "2026-10-02" })];
    const ctx = makeContext({ company: makeCompany({ ledger }), invoice: makeInvoice({ amount: { total: 4750 } }) });
    expect(rule(ctx, "R07")).toMatchObject({ status: "FAIL", on_fail: "ESCALAR" });
  });
  it("PASS justo en el limite mensual (inclusivo)", () => {
    const ledger = [ledgerEntry({ amount_base_usd: 115250, invoice_number: "INV-A", date: "2026-10-02" })];
    const ctx = makeContext({ company: makeCompany({ ledger }), invoice: makeInvoice({ amount: { total: 4750 } }) });
    expect(rule(ctx, "R07").status).toBe("PASS");
  });
});

describe("R08 presupuesto", () => {
  it("FRENAR si el presupuesto de la categoria esta agotado", () => {
    const ctx = makeContext({ invoice: makeInvoice({ concept: "Suministros", agreement_ref: undefined }) });
    expect(rule(ctx, "R08")).toMatchObject({ status: "FAIL", on_fail: "FRENAR", waivable: false });
  });
  it("UNKNOWN si no hay presupuesto definido (fail-closed)", () => {
    const ctx = makeContext({ invoice: makeInvoice({ concept: "Magia", agreement_ref: undefined }) });
    expect(rule(ctx, "R08").status).toBe("UNKNOWN");
  });
  it("PASS con presupuesto disponible", () => {
    expect(rule(makeContext(), "R08").status).toBe("PASS");
  });
});

describe("R09 duplicados", () => {
  it("FRENAR por hash de archivo duplicado", () => {
    const ledger = [ledgerEntry({ file_hash: "dup_hash", invoice_number: "INV-X" })];
    const ctx = makeContext({ company: makeCompany({ ledger }), fileHash: "dup_hash" });
    expect(rule(ctx, "R09")).toMatchObject({ status: "FAIL", on_fail: "FRENAR", waivable: false });
  });
  it("FRENAR por mismo beneficiario + numero de factura", () => {
    const ledger = [ledgerEntry({ invoice_number: "INV-1001", amount_base_usd: 10, file_hash: "h2" })];
    const ctx = makeContext({ company: makeCompany({ ledger }) });
    expect(rule(ctx, "R09").status).toBe("FAIL");
  });
  it("FRENAR por duplicado semantico dentro de la ventana", () => {
    const ledger = [ledgerEntry({ invoice_number: "INV-OTHER", amount_base_usd: 4750, date: "2026-10-10" })];
    const ctx = makeContext({ company: makeCompany({ ledger }) });
    expect(rule(ctx, "R09").status).toBe("FAIL");
  });
  it("PASS si el cobro equivalente esta fuera de la ventana", () => {
    const ledger = [ledgerEntry({ invoice_number: "INV-OTHER", amount_base_usd: 4750, date: "2026-01-01" })];
    const ctx = makeContext({ company: makeCompany({ ledger }) });
    expect(rule(ctx, "R09").status).toBe("PASS");
  });
});

describe("R10 conciliacion con acuerdo (bifurcacion)", () => {
  it("ESCALAR (levantable) si no hay acuerdo registrado", () => {
    const ctx = makeContext({ invoice: makeInvoice({ agreement_ref: "agr_missing" }) });
    expect(rule(ctx, "R10")).toMatchObject({ status: "FAIL", on_fail: "ESCALAR", waivable: true });
  });
  it("FRENAR (no levantable) si excede el pactado + tolerancia", () => {
    const ctx = makeContext({ invoice: makeInvoice({ amount: { total: 7000 } }) });
    expect(rule(ctx, "R10")).toMatchObject({ status: "FAIL", on_fail: "FRENAR", waivable: false });
  });
  it("FRENAR si el concepto esta fuera del alcance", () => {
    const ctx = makeContext({ invoice: makeInvoice({ concept: "Licencias" }) });
    expect(rule(ctx, "R10")).toMatchObject({ status: "FAIL", on_fail: "FRENAR" });
  });
  it("FRENAR si el acuerdo esta fuera de vigencia", () => {
    const company = makeCompany({
      agreements: [
        {
          id: "agr_001",
          beneficiary_id: "ben_proveedor_001",
          concept: "Servicios de desarrollo",
          amount: 6000,
          currency: "USD",
          valid_from: "2024-01-01",
          valid_to: "2025-12-31",
          scope_concepts: ["Servicios de desarrollo"],
          category: "servicios"
        }
      ]
    });
    const ctx = makeContext({ company });
    expect(rule(ctx, "R10")).toMatchObject({ status: "FAIL", on_fail: "FRENAR" });
  });
  it("PASS si esta dentro del acuerdo", () => {
    expect(rule(makeContext(), "R10").status).toBe("PASS");
  });
});

describe("R11 integridad y prompt injection", () => {
  it("FRENAR por aritmetica inconsistente", () => {
    const ctx = makeContext({ invoice: makeInvoice({ amount: { subtotal: 4000, tax: 750, total: 5000 } }) });
    expect(rule(ctx, "R11")).toMatchObject({ status: "FAIL", on_fail: "FRENAR" });
  });
  it("ESCALAR por formato numerico ambiguo", () => {
    const ctx = makeContext({ invoice: makeInvoice({ amount: { raw: "1.250", total: 1250 } }) });
    expect(rule(ctx, "R11")).toMatchObject({ status: "FAIL", on_fail: "ESCALAR", waivable: true });
  });
  it("FRENAR por sospecha de prompt injection", () => {
    const ctx = makeContext({ invoice: makeInvoice({ document_flags: ["injection_suspected"] }) });
    expect(rule(ctx, "R11")).toMatchObject({ status: "FAIL", on_fail: "FRENAR", waivable: false });
  });
  it("PASS en documento consistente", () => {
    expect(rule(makeContext(), "R11").status).toBe("PASS");
  });
});

describe("R12 validez de fechas", () => {
  it("ESCALAR si esta vencida mas de la tolerancia", () => {
    const ctx = makeContext({ invoice: makeInvoice({ due_date: "2026-08-01" }) });
    expect(rule(ctx, "R12")).toMatchObject({ status: "FAIL", on_fail: "ESCALAR" });
  });
  it("ESCALAR si la emision es a futuro irrazonable", () => {
    const ctx = makeContext({ invoice: makeInvoice({ issue_date: "2026-12-01" }) , now: NOW });
    expect(rule(ctx, "R12")).toMatchObject({ status: "FAIL", on_fail: "ESCALAR" });
  });
  it("PASS con fechas vigentes", () => {
    expect(rule(makeContext(), "R12").status).toBe("PASS");
  });
});
