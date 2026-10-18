import { describe, expect, it } from "vitest";
import { decide } from "@agente/engine";
import type { DecisionOutcome, RuleContext } from "@agente/engine";
import { createGuardian } from "@agente/guardian";
import type { PaymentAuthorization } from "@agente/schemas";
import { makeCompany, makeContext, makeInvoice, NOW, POLICY } from "../../packages/engine/test/helpers.js";

/**
 * Pruebas basadas en propiedades del Guardian (documento §9 y §14):
 * con miles de facturas y politicas aleatorias NUNCA existe un PAGAR con una
 * regla en FAIL/UNKNOWN, ningun origen con IA produce autorizacion, y toda
 * manipulacion de la autorizacion invalida la firma.
 */

/** PRNG determinista (mulberry32): mismas semillas => mismos casos, siempre. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const guardian = createGuardian({ secret: "prop-test-secret" });

const CURRENCIES = ["USD", "USD", "COP", "EUR", "MXN", "GBP", "JPY"];
const CONCEPTS = ["Servicios de desarrollo", "Consultoria mensual", "Suministros", "Licencias", "Otro"];
const NAMES = ["Proveedor Recurrente S.A.S", "Contratista Independiente", "Desconocido SRL", ""];

function randomInvoice(rand: () => number) {
  const currency = CURRENCIES[Math.floor(rand() * CURRENCIES.length)]!;
  const total = Math.round(rand() * 90_000 * 100) / 100;
  const name = NAMES[Math.floor(rand() * NAMES.length)]!;
  const badDates = rand() < 0.15;
  const flags: ("math_inconsistent" | "locale_ambiguous" | "injection_suspected" | "low_quality")[] = [];
  if (rand() < 0.1) flags.push("injection_suspected");
  if (rand() < 0.1) flags.push("math_inconsistent");
  if (rand() < 0.1) flags.push("low_quality");
  return makeInvoice({
    invoice_number: rand() < 0.9 ? `INV-${Math.floor(rand() * 99999)}` : null,
    issue_date: badDates ? "99/99/9999" : "2026-10-10",
    due_date: rand() < 0.7 ? "2026-10-31" : null,
    payee: {
      name,
      tax_id: rand() < 0.5 ? "900123456" : undefined,
      bank_ref: rand() < 0.8 ? "BANK-001" : `BANK-${Math.floor(rand() * 50)}`
    },
    amount: {
      raw: `${total}`,
      total,
      subtotal: rand() < 0.7 ? total : undefined,
      tax: rand() < 0.7 ? 0 : undefined,
      currency
    },
    concept: CONCEPTS[Math.floor(rand() * CONCEPTS.length)]!,
    agreement_ref: rand() < 0.6 ? "agr_001" : undefined,
    document_flags: flags
  });
}

function guardOf(outcome: DecisionOutcome, origin: "engine" | "llm" | "analyst" | "extractor" | "manual" | "approval" = "engine") {
  return guardian.guard({
    decision_id: "dec_prop",
    outcome,
    policy: POLICY,
    extractionValidated: true,
    approval: null,
    beneficiary_id: "ben_proveedor_001",
    origin,
    now: NOW
  });
}

describe("propiedades del Guardian (1000 iteraciones sembradas)", () => {
  it("NUNCA existe un PAGAR con una regla en FAIL o UNKNOWN", () => {
    const rand = mulberry32(0xc0ffee);
    for (let i = 0; i < 1000; i += 1) {
      const ctx: RuleContext = makeContext({
        invoice: randomInvoice(rand),
        company: makeCompany()
      });
      const outcome = decide(ctx);
      const result = guardOf(outcome);
      if (result.decision === "PAGAR") {
        const bad = outcome.rules.filter((r) => r.status !== "PASS");
        expect(bad, `iteracion ${i}: PAGAR con reglas no-PASS`).toHaveLength(0);
        expect(result.authorization, "PAGAR sin autorizacion firmada").toBeDefined();
      }
    }
  });

  it("ningun origen con IA puede producir ni verificar un PAGAR", () => {
    const rand = mulberry32(0xbeef);
    for (const origin of ["llm", "analyst", "extractor"] as const) {
      for (let i = 0; i < 100; i += 1) {
        const outcome = decide(makeContext({ invoice: randomInvoice(rand) }));
        const result = guardOf(outcome, origin);
        expect(result.decision).not.toBe("PAGAR");
        expect(result.authorization).toBeUndefined();
        expect(result.alerts.some((a) => a.invariant === "I4")).toBe(true);
      }
    }
  });

  it("toda mutacion de la autorizacion invalida la firma HMAC", () => {
    const outcome = decide(makeContext({ invoice: makeInvoice() }));
    const result = guardOf(outcome);
    expect(result.decision).toBe("PAGAR");
    const auth = result.authorization!;
    const mutations: Array<Partial<PaymentAuthorization>> = [
      { amount_base_usd: "0.01" },
      { amount_base_usd: "999999.99" },
      { beneficiary_id: "atacante" },
      { policy_version: "pol_falsa" },
      { context_snapshot_hash: "0".repeat(64) },
      { approved_by: "atacante@cognition" },
      { issued_at: "2030-01-01T00:00:00.000Z" },
      { authorization_id: "auth-falso" },
      { invoice_id: "inv_otra" }
    ];
    for (const patch of mutations) {
      expect(guardian.verifyAuthorization({ ...auth, ...patch }), JSON.stringify(patch)).toBe(false);
    }
    // Firma truncada, vacia o de otro guardian tambien falla.
    expect(guardian.verifyAuthorization({ ...auth, signature: auth.signature.slice(0, 62) })).toBe(false);
    expect(guardian.verifyAuthorization({ ...auth, signature: "" })).toBe(false);
    const otro = createGuardian({ secret: "otro-secreto" });
    expect(otro.verifyAuthorization(auth)).toBe(false);
  });

  it("PAGAR => autorizacion verificable; no-PAGAR => nunca hay autorizacion", () => {
    const rand = mulberry32(0x1234);
    for (let i = 0; i < 300; i += 1) {
      const outcome = decide(makeContext({ invoice: randomInvoice(rand) }));
      const result = guardOf(outcome);
      if (result.decision === "PAGAR") {
        expect(guardian.verifyAuthorization(result.authorization!)).toBe(true);
      } else {
        expect(result.authorization).toBeUndefined();
      }
    }
  });
});
