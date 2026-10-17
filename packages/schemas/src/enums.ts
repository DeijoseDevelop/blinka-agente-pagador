/**
 * Enumeraciones y uniones literales canonicas del sistema.
 * Fuente unica de verdad para decisiones, estados de regla e identificadores.
 */

export const DECISIONS = ["PAGAR", "ESCALAR", "FRENAR"] as const;
export type Decision = (typeof DECISIONS)[number];

/**
 * Jerarquia de restrictividad: PAGAR < ESCALAR < FRENAR.
 * Un valor mayor implica una decision mas restrictiva.
 */
export const DECISION_RANK: Record<Decision, number> = {
  PAGAR: 0,
  ESCALAR: 1,
  FRENAR: 2
};

export const RULE_STATUSES = ["PASS", "FAIL", "UNKNOWN"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const RULE_IDS = [
  "R01",
  "R02",
  "R03",
  "R04",
  "R05",
  "R06",
  "R07",
  "R08",
  "R09",
  "R10",
  "R11",
  "R12"
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const DOCUMENT_FLAGS = [
  "math_inconsistent",
  "locale_ambiguous",
  "injection_suspected",
  "low_quality"
] as const;
export type DocumentFlag = (typeof DOCUMENT_FLAGS)[number];

/** Limites de comparacion: son inclusivos (== limite pasa, limite + 1 centavo falla). */
export const INCLUSIVE_LIMITS = true as const;
