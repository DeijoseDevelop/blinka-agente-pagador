import { describe, expect, it } from "vitest";
import type { Approval } from "@agente/schemas";
import { createGuardian } from "../src/index.js";
import type { DecisionOrigin, GuardianInput } from "../src/index.js";
import { decide } from "@agente/engine";
import type { DecisionOutcome } from "@agente/engine";
import { NOW, POLICY, makeApproval, makeContext, makeInvoice } from "../../engine/test/helpers.js";

const guardian = createGuardian({ secret: "test-secret" });

function input(outcome: DecisionOutcome, overrides: Partial<GuardianInput> = {}): GuardianInput {
  return {
    decision_id: "dec_1",
    outcome,
    policy: POLICY,
    extractionValidated: true,
    approval: null,
    beneficiary_id: "ben_proveedor_001",
    origin: "engine",
    now: NOW,
    ...overrides
  };
}

function cleanOutcome(): DecisionOutcome {
  return decide(makeContext());
}

describe("guardian: firma HMAC-SHA256", () => {
  it("emite y verifica una PaymentAuthorization para un PAGAR limpio", () => {
    const result = guardian.guard(input(cleanOutcome()));
    expect(result.verified).toBe(true);
    expect(result.mismatch).toBe(false);
    expect(result.decision).toBe("PAGAR");
    expect(result.authorization).toBeDefined();
    expect(guardian.verifyAuthorization(result.authorization!)).toBe(true);
  });

  it("rechaza una autorizacion manipulada", () => {
    const result = guardian.guard(input(cleanOutcome()));
    const tampered = { ...result.authorization!, amount_base_usd: "1.00" };
    expect(guardian.verifyAuthorization(tampered)).toBe(false);
  });

  it("rechaza una firma con otro secreto", () => {
    const other = createGuardian({ secret: "otro-secreto" });
    const result = guardian.guard(input(cleanOutcome()));
    expect(other.verifyAuthorization(result.authorization!)).toBe(false);
  });
});

describe("guardian: invariantes", () => {
  it("I1: degrada a ESCALAR un PAGAR con reglas FAIL", () => {
    const outcome = cleanOutcome();
    outcome.rules = outcome.rules.map((r) => (r.id === "R02" ? { ...r, status: "FAIL" } : r));
    const result = guardian.guard(input(outcome));
    expect(result.verified).toBe(false);
    expect(result.mismatch).toBe(true);
    expect(result.decision).toBe("ESCALAR");
    expect(result.alerts.some((a) => a.invariant === "I1")).toBe(true);
  });

  it("I2: degrada si falta extraccion validada o snapshot", () => {
    const result = guardian.guard(input(cleanOutcome(), { extractionValidated: false }));
    expect(result.decision).toBe("ESCALAR");
    expect(result.alerts.some((a) => a.invariant === "I2")).toBe(true);
  });

  it("I3: acepta una aprobacion humana valida", () => {
    const result = guardian.guard(input(cleanOutcome(), { approval: makeApproval(), origin: "approval" }));
    expect(result.verified).toBe(true);
    expect(result.decision).toBe("PAGAR");
  });

  it("I3: degrada si la aprobacion esta expirada", () => {
    const expired: Approval = makeApproval({ expires_at: "2026-10-14T00:00:00.000Z" });
    const result = guardian.guard(input(cleanOutcome(), { approval: expired }));
    expect(result.decision).toBe("ESCALAR");
    expect(result.alerts.some((a) => a.invariant === "I3")).toBe(true);
  });

  it("I3: degrada si la aprobacion no cubre el monto exacto", () => {
    const wrong: Approval = makeApproval({ amount_base_usd: 9999 });
    const result = guardian.guard(input(cleanOutcome(), { approval: wrong }));
    expect(result.decision).toBe("ESCALAR");
    expect(result.alerts.some((a) => a.invariant === "I3")).toBe(true);
  });

  it("I4: rechaza decisiones originadas en un componente con LLM", () => {
    const result = guardian.guard(input(cleanOutcome(), { origin: "llm" as DecisionOrigin }));
    expect(result.mismatch).toBe(true);
    expect(result.decision).not.toBe("PAGAR");
    expect(result.alerts.some((a) => a.invariant === "I4")).toBe(true);
  });

  it("I5: cualquier excepcion implica que NUNCA se paga", () => {
    const outcome = cleanOutcome();
    outcome.amounts.base_usd = "no-es-un-numero";
    const result = guardian.guard(input(outcome, { approval: makeApproval() }));
    expect(result.verified).toBe(false);
    expect(result.decision).toBe("FRENAR");
    expect(result.alerts.some((a) => a.invariant === "I5")).toBe(true);
  });
});

describe("guardian: cero pagos inseguros", () => {
  it("solo verifica PAGAR cuando todas las reglas estan en PASS", () => {
    const outcome = decide(makeContext({ invoice: makeInvoice({ amount: { total: 60000 } }) }));
    const result = guardian.guard(input(outcome));
    expect(result.decision).not.toBe("PAGAR");
    expect(result.authorization).toBeUndefined();
  });
});
