import { DECISION_RANK } from "@agente/schemas";
import type { Decision, Finding, RuleResult } from "@agente/schemas";

export interface DecisionSource {
  source: string;
  decision: Decision;
  detail: string;
}

export interface AggregationResult {
  decision: Decision;
  sources: DecisionSource[];
}

/** Devuelve la decision mas restrictiva de las dos (PAGAR < ESCALAR < FRENAR). */
export function mostRestrictive(a: Decision, b: Decision): Decision {
  return DECISION_RANK[a] >= DECISION_RANK[b] ? a : b;
}

/**
 * Agregador puro y monotono.
 * - Jerarquia: PAGAR < ESCALAR < FRENAR.
 * - UNKNOWN cuenta como FAIL (usa su on_fail, que nunca es PAGAR).
 * - Los findings de IA solo pueden ENDURECER (suggested_on_fail in {ESCALAR, FRENAR}).
 * NO existe ninguna ruta en la que una sugerencia de IA produzca PAGAR.
 */
export function aggregate(
  rules: readonly RuleResult[],
  findings: readonly Finding[] = []
): AggregationResult {
  let decision: Decision = "PAGAR";
  const sources: DecisionSource[] = [];

  for (const rule of rules) {
    const contributes: Decision = rule.status === "PASS" ? "PAGAR" : rule.on_fail;
    sources.push({ source: rule.id, decision: contributes, detail: rule.evidence });
    decision = mostRestrictive(decision, contributes);
  }

  for (const finding of findings) {
    // Un hallazgo sin evidencia citable se descarta (documento §8): la IA debe
    // poder señalar donde esta el problema, no solo afirmar que existe.
    if (finding.evidence_refs.length === 0) continue;
    sources.push({
      source: `finding:${finding.kind}`,
      decision: finding.suggested_on_fail,
      detail: finding.rationale
    });
    decision = mostRestrictive(decision, finding.suggested_on_fail);
  }

  return { decision, sources };
}
