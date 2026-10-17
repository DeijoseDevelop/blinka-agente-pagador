import { describe, expect, it } from "vitest";
import type { Narrative, NarrativeTrace } from "../src/index.js";
import { buildNarrative, decide, narrate, verifyNarrative } from "../src/index.js";
import { makeContext, makeInvoice } from "./helpers.js";

function traceOf(ctx: Parameters<typeof decide>[0]): NarrativeTrace {
  const outcome = decide(ctx);
  const dates = [ctx.invoice.issue_date, ctx.invoice.due_date, ctx.now].filter((d): d is string => d != null);
  return {
    decision: outcome.decision,
    invoice_id: outcome.invoice_id,
    invoice_number: ctx.invoice.invoice_number,
    amounts: outcome.amounts,
    rules: outcome.rules,
    dates
  };
}

describe("narrador en 3 capas", () => {
  it("produce titular + hasta 3 razones y una traza completa", () => {
    const ctx = makeContext({ invoice: makeInvoice({ amount: { total: 60000 } }) });
    const outcome = decide(ctx);
    expect(outcome.rules).toHaveLength(12);
    expect(outcome.headline).toContain("FRENAR");
    expect(outcome.reasons.length).toBeGreaterThan(0);
    expect(outcome.reasons.length).toBeLessThanOrEqual(3);
  });

  it("la plantilla determinista pasa el verificador", () => {
    const ctx = makeContext();
    const outcome = decide(ctx);
    const trace = traceOf(ctx);
    const text = [outcome.headline, ...outcome.reasons.map((r) => r.text)].join("\n");
    expect(verifyNarrative(text, trace)).toEqual({ valid: true, offending: [] });
  });
});

describe("verificador determinista (anti-alucinacion)", () => {
  it("rechaza una cifra inventada", () => {
    const trace = traceOf(makeContext());
    const result = verifyNarrative("Se autoriza el pago de 999999 USD sin problemas", trace);
    expect(result.valid).toBe(false);
    expect(result.offending).toContain("999999");
  });

  it("rechaza una fecha inventada", () => {
    const trace = traceOf(makeContext());
    const result = verifyNarrative("La factura vence el 2030-01-01", trace);
    expect(result.valid).toBe(false);
    expect(result.offending).toContain("2030-01-01");
  });

  it("rechaza un ID de regla inexistente", () => {
    const trace = traceOf(makeContext());
    const result = verifyNarrative("Fallo en R99", trace);
    expect(result.valid).toBe(false);
    expect(result.offending).toContain("R99");
  });
});

describe("narrate con pulido opcional", () => {
  it("descarta el texto pulido si alucina y usa la plantilla determinista", () => {
    const ctx = makeContext();
    const trace = traceOf(ctx);
    const badPolish = (base: Narrative): Narrative => ({
      headline: "PAGAR 888888 USD",
      reasons: base.reasons
    });
    const result = narrate(trace, badPolish);
    expect(result.headline).not.toContain("888888");
    expect(result.headline).toBe(buildNarrative(trace).headline);
  });

  it("acepta el texto pulido si todas las cifras existen en la traza", () => {
    const ctx = makeContext();
    const trace = traceOf(ctx);
    const goodPolish = (base: Narrative): Narrative => ({
      headline: `Resumen: ${base.headline}`,
      reasons: base.reasons
    });
    expect(narrate(trace, goodPolish).headline).toContain("Resumen:");
  });
});
