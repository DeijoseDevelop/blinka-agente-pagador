import { describe, expect, it } from "vitest";
import type { Finding, RuleId, RuleResult } from "@agente/schemas";
import { aggregate, mostRestrictive, RULES } from "../src/index.js";

function res(id: RuleId, status: RuleResult["status"], on_fail: RuleResult["on_fail"] = "ESCALAR"): RuleResult {
  return { id, status, on_fail, waivable: true, evidence: `${id} ${status}` };
}

describe("agregador fail-closed", () => {
  it("todas PASS => PAGAR", () => {
    const rules = RULES.map((r) => res(r.id, "PASS"));
    expect(aggregate(rules).decision).toBe("PAGAR");
  });

  it("un FAIL ESCALAR => ESCALAR", () => {
    const rules = [res("R01", "PASS"), res("R02", "FAIL", "ESCALAR"), res("R03", "PASS")];
    expect(aggregate(rules).decision).toBe("ESCALAR");
  });

  it("un FAIL FRENAR domina sobre ESCALAR", () => {
    const rules = [res("R02", "FAIL", "ESCALAR"), res("R05", "FAIL", "FRENAR")];
    expect(aggregate(rules).decision).toBe("FRENAR");
  });

  it("UNKNOWN cuenta como FAIL usando su on_fail", () => {
    expect(aggregate([res("R08", "UNKNOWN", "FRENAR")]).decision).toBe("FRENAR");
    expect(aggregate([res("R08", "UNKNOWN", "ESCALAR")]).decision).toBe("ESCALAR");
  });

  it("hallazgo de IA ESCALAR no puede producir PAGAR", () => {
    const allPass = RULES.map((r) => res(r.id, "PASS"));
    const findings: Finding[] = [
      { kind: "ambiguity", suggested_on_fail: "ESCALAR", confidence: 0.9, rationale: "x", evidence_refs: [] }
    ];
    expect(aggregate(allPass, findings).decision).toBe("ESCALAR");
  });

  it("hallazgo de IA solo endurece la decision (monotonia)", () => {
    const allPass = RULES.map((r) => res(r.id, "PASS"));
    const findings: Finding[] = [
      { kind: "fraud", suggested_on_fail: "FRENAR", confidence: 0.8, rationale: "y", evidence_refs: [] }
    ];
    expect(aggregate(allPass, findings).decision).toBe("FRENAR");
    expect(aggregate(allPass).decision).toBe("PAGAR");
  });

  it("mostRestrictive respeta PAGAR < ESCALAR < FRENAR", () => {
    expect(mostRestrictive("PAGAR", "ESCALAR")).toBe("ESCALAR");
    expect(mostRestrictive("ESCALAR", "FRENAR")).toBe("FRENAR");
    expect(mostRestrictive("FRENAR", "PAGAR")).toBe("FRENAR");
  });

  it("ninguna regla del catalogo puede fallar hacia PAGAR", () => {
    for (const r of RULES) expect(r.defaultOnFail).not.toBe("PAGAR");
  });
});
