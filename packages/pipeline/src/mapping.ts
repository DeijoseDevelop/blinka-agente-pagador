import type { Decision, Policy, RuleId, RuleResult } from "@agente/schemas";

/** Decisiones oficiales de Acme Labs Inc. */
export type OfficialDecision = "PAY" | "ESCALATE" | "BLOCK";

export type OfficialStatus =
  | "SIMULATION_ELIGIBLE"
  | "PENDING_HUMAN_APPROVAL"
  | "BLOCKED"
  | "REJECTED"
  | "APPROVED_FOR_SIMULATION";

/** Codigos de razon oficiales por regla (el mas especifico primero). */
export const RULE_TO_REASON: Record<RuleId, string> = {
  R01: "MISSING_CRITICAL_DATA",
  R02: "SUPPLIER_NOT_VERIFIED",
  R03: "BANK_ACCOUNT_MISMATCH",
  R04: "UNSUPPORTED_CURRENCY",
  R05: "HARD_CAP_EXCEEDED",
  R06: "ABOVE_AUTO_THRESHOLD",
  R07: "MONTHLY_LIMIT_EXCEEDED",
  R08: "BUDGET_EXCEEDED",
  R09: "DUPLICATE_CONFIRMED",
  R10: "CONTRACT_VARIANCE",
  R11: "DOCUMENT_INTEGRITY",
  R12: "DATE_INVALID"
};

export function toOfficialDecision(decision: Decision): OfficialDecision {
  switch (decision) {
    case "PAGAR":
      return "PAY";
    case "ESCALAR":
      return "ESCALATE";
    case "FRENAR":
      return "BLOCK";
  }
}

export function statusFor(decision: OfficialDecision): OfficialStatus {
  switch (decision) {
    case "PAY":
      return "SIMULATION_ELIGIBLE";
    case "ESCALATE":
      return "PENDING_HUMAN_APPROVAL";
    case "BLOCK":
      return "BLOCKED";
  }
}

export function simulationAllowed(decision: OfficialDecision): boolean {
  return decision === "PAY";
}

/**
 * Codigos de razon a partir de las reglas que no estan en PASS.
 * Si todo pasa => ALL_CHECKS_PASSED.
 */
export function reasonCodesFor(rules: readonly RuleResult[]): string[] {
  const failed = rules.filter((r) => r.status !== "PASS");
  if (failed.length === 0) return ["ALL_CHECKS_PASSED"];
  return failed.map((r) => RULE_TO_REASON[r.id]);
}

/** Rol aprobador segun la matriz oficial: el tramo mas bajo cuyo tope cubre el monto. */
export function approverRoleFor(amountBaseUsd: number, policy: Policy): string | null {
  const tiers = [...policy.approvals_matrix].sort((a, b) => a.up_to - b.up_to);
  for (const tier of tiers) {
    if (amountBaseUsd <= tier.up_to) return tier.role;
  }
  return null;
}

/** Tramos oficiales (con minimo exclusivo) para un importe dado. */
export interface OfficialTier {
  role: string;
  min_amount_exclusive: string;
  max_amount_inclusive: string;
}

/**
 * Roles autorizados para aprobar un importe segun la matriz oficial.
 * Tramo valido: min_amount_exclusive < importe <= max_amount_inclusive.
 */
export function allowedRolesFor(amountBaseUsd: number, matrix: readonly OfficialTier[]): string[] {
  return matrix
    .filter((t) => amountBaseUsd > Number.parseFloat(t.min_amount_exclusive) && amountBaseUsd <= Number.parseFloat(t.max_amount_inclusive))
    .sort((a, b) => Number.parseFloat(a.max_amount_inclusive) - Number.parseFloat(b.max_amount_inclusive))
    .map((t) => t.role);
}
