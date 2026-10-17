import { describe, expect, it } from "vitest";
import type { Decision } from "@agente/schemas";
import { decide } from "../src/index.js";
import type { MakeContextOptions } from "./helpers.js";
import { makeCompany, makeContext, makeInvoice } from "./helpers.js";

const led = (overrides: Record<string, unknown>) => ({
  invoice_id: "inv_old",
  beneficiary_id: "ben_proveedor_001",
  beneficiary_name: "Proveedor Recurrente S.A.S",
  invoice_number: "INV-OLD",
  concept: "Servicios de desarrollo",
  amount_base_usd: 100,
  file_hash: "other_hash",
  date: "2026-10-05",
  decision: "PAGAR" as const,
  ...overrides
});

interface Scenario {
  name: string;
  expected: Decision;
  opts: MakeContextOptions;
}

const scenarios: Scenario[] = [
  { name: "N1 recurrente USD dentro de limites", expected: "PAGAR", opts: {} },
  {
    name: "N2 contratista en COP convertido",
    expected: "PAGAR",
    opts: {
      invoice: makeInvoice({
        invoice_number: "INV-2002",
        payee: { name: "Contratista Independiente", tax_id: "CC-7788", bank_ref: "BANK-002" },
        amount: { raw: "COP 800,000.00", total: 800000, subtotal: undefined, tax: undefined, currency: "COP" },
        concept: "Consultoria mensual",
        agreement_ref: "agr_002"
      })
    }
  },
  {
    name: "N3 cuenta de cobro por correo",
    expected: "PAGAR",
    opts: { invoice: makeInvoice({ invoice_number: "INV-3003", amount: { total: 3000, subtotal: undefined, tax: undefined } }) }
  },
  {
    name: "N4 imagen legible dentro de politica",
    expected: "PAGAR",
    opts: { invoice: makeInvoice({ invoice_number: "INV-4004", amount: { total: 1500, subtotal: undefined, tax: undefined } }) }
  },
  {
    name: "N5 solicitud por chat",
    expected: "PAGAR",
    opts: { invoice: makeInvoice({ invoice_number: "INV-5005", amount: { total: 2000, subtotal: undefined, tax: undefined } }) }
  },
  {
    name: "T1 archivo duplicado exacto",
    expected: "FRENAR",
    opts: {
      fileHash: "dup_hash",
      company: makeCompany({ ledger: [led({ file_hash: "dup_hash" })] })
    }
  },
  {
    name: "T2 duplicado semantico",
    expected: "FRENAR",
    opts: {
      company: makeCompany({ ledger: [led({ invoice_number: "INV-OTHER", amount_base_usd: 4750, date: "2026-10-10" })] })
    }
  },
  {
    name: "T3 beneficiario nuevo no registrado",
    expected: "ESCALAR",
    opts: { invoice: makeInvoice({ payee: { name: "Proveedor Nuevo", tax_id: undefined, bank_ref: "BANK-X" }, agreement_ref: undefined }) }
  },
  {
    name: "T4 supera umbral de aprobacion",
    expected: "ESCALAR",
    opts: {
      invoice: makeInvoice({
        concept: "Servicios varios",
        agreement_ref: undefined,
        amount: { total: 9200, subtotal: undefined, tax: undefined }
      })
    }
  },
  {
    name: "T5 supera tope duro",
    expected: "FRENAR",
    opts: { invoice: makeInvoice({ amount: { total: 60000, subtotal: undefined, tax: undefined } }) }
  },
  {
    name: "T6 cobra mas de lo acordado",
    expected: "FRENAR",
    opts: { invoice: makeInvoice({ amount: { total: 7000, subtotal: undefined, tax: undefined } }) }
  },
  {
    name: "T7 presupuesto de categoria agotado",
    expected: "FRENAR",
    opts: { invoice: makeInvoice({ concept: "Suministros", agreement_ref: undefined }) }
  },
  {
    name: "T8a primera factura antes del limite mensual",
    expected: "PAGAR",
    opts: { invoice: makeInvoice({ invoice_number: "INV-8008A" }) }
  },
  {
    name: "T8b segunda factura supera el limite mensual",
    expected: "ESCALAR",
    opts: {
      company: makeCompany({ ledger: [led({ amount_base_usd: 116000, invoice_number: "INV-FILL", date: "2026-10-02" })] }),
      invoice: makeInvoice({ invoice_number: "INV-8008B" })
    }
  },
  {
    name: "T9 cuenta bancaria distinta",
    expected: "ESCALAR",
    opts: { invoice: makeInvoice({ payee: { bank_ref: "BANK-999" } }) }
  },
  {
    name: "T10 aritmetica inconsistente",
    expected: "FRENAR",
    opts: { invoice: makeInvoice({ amount: { subtotal: 4000, tax: 750, total: 5000 } }) }
  },
  {
    name: "T11 monto ambiguo 1.250",
    expected: "ESCALAR",
    opts: { invoice: makeInvoice({ amount: { raw: "1.250", total: 1250 } }) }
  },
  {
    name: "T12 prompt injection",
    expected: "FRENAR",
    opts: { invoice: makeInvoice({ document_flags: ["injection_suspected"] }) }
  },
  {
    name: "T13 sin moneda especificada",
    expected: "FRENAR",
    opts: { invoice: makeInvoice({ amount: { currency: "" } }) }
  },
  {
    name: "T14 moneda no soportada",
    expected: "FRENAR",
    opts: { invoice: makeInvoice({ amount: { currency: "GBP" } }) }
  }
];

describe("decide() integracion de escenarios", () => {
  for (const s of scenarios) {
    it(`${s.name} => ${s.expected}`, () => {
      const outcome = decide(makeContext(s.opts));
      expect(outcome.decision).toBe(s.expected);
    });
  }
});

describe("REGLA DE ORO: cero pagos inseguros", () => {
  it("ningun PAGAR coexiste con reglas FAIL/UNKNOWN", () => {
    for (const s of scenarios) {
      const outcome = decide(makeContext(s.opts));
      const dangerous = outcome.rules.some((r) => r.status !== "PASS");
      if (outcome.decision === "PAGAR") {
        expect(dangerous, `escenario inseguro: ${s.name}`).toBe(false);
      }
    }
  });
});
