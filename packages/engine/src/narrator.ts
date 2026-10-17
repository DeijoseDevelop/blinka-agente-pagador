import { DECISION_RANK, Decimal } from "@agente/schemas";
import type { Decision, Reason, RuleResult } from "@agente/schemas";

/**
 * Traza tecnica minima que respalda una explicacion.
 * El verificador solo admite cifras/IDs/fechas que existan AQUI.
 */
export interface NarrativeTrace {
  decision: Decision;
  invoice_id: string;
  invoice_number: string | null;
  amounts: { original: string; base_usd: string; fx_rate: number | null };
  rules: RuleResult[];
  /** Fechas legitimas citables (emision, vencimiento, evaluacion, vigencia...). */
  dates: string[];
}

export interface Narrative {
  headline: string;
  reasons: Reason[];
}

/** Construye la explicacion determinista en 3 capas (titular + razones + traza regla a regla). */
export function buildNarrative(trace: NarrativeTrace): Narrative {
  const failed = trace.rules
    .filter((r) => r.status !== "PASS")
    .sort((a, b) => {
      const rank = DECISION_RANK[b.on_fail] - DECISION_RANK[a.on_fail];
      return rank !== 0 ? rank : a.id.localeCompare(b.id);
    });

  const primary = failed[0];
  const headline =
    trace.decision === "PAGAR"
      ? `PAGAR — todas las reglas R01-R12 en PASS (${trace.amounts.base_usd} USD)`
      : `${trace.decision} — ${primary ? `${primary.id}: ${primary.evidence}` : "sin causa registrada"}`;

  const reasons: Reason[] = failed.slice(0, 3).map((r) => ({ rule: r.id, text: r.evidence }));
  if (reasons.length === 0) {
    reasons.push({ rule: "R01-R12", text: `Importe ${trace.amounts.base_usd} USD dentro de politica` });
  }
  return { headline, reasons };
}

export interface VerifyResult {
  valid: boolean;
  offending: string[];
}

function addNumber(nums: Set<string>, raw: string): void {
  const cleaned = raw.replace(/,/g, "");
  try {
    nums.add(new Decimal(cleaned).toString());
  } catch {
    /* token no numerico: se ignora */
  }
}

function collect(obj: unknown, ids: Set<string>, nums: Set<string>): void {
  if (obj == null) return;
  if (typeof obj === "number") {
    addNumber(nums, String(obj));
    return;
  }
  if (typeof obj === "string") {
    ids.add(obj);
    for (const m of obj.match(/-?\d[\d.,]*/g) ?? []) addNumber(nums, m);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collect(item, ids, nums);
    return;
  }
  if (typeof obj === "object") {
    for (const value of Object.values(obj as Record<string, unknown>)) collect(value, ids, nums);
  }
}

const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const RULE_ID = /\bR\d{2}\b/g;
const NUMBER = /-?\d[\d.,]*/g;

/**
 * Verificador determinista: comprueba que cada cifra, ID de regla y fecha del texto
 * exista explicitamente en la traza tecnica. Cualquier discrepancia => invalido (alucinacion).
 */
export function verifyNarrative(text: string, trace: NarrativeTrace): VerifyResult {
  const ids = new Set<string>();
  const nums = new Set<string>();
  collect(trace, ids, nums);

  const ruleIds = new Set(trace.rules.map((r) => r.id));
  const offending: string[] = [];

  let scanText = text;

  for (const date of text.match(ISO_DATE) ?? []) {
    if (!ids.has(date)) offending.push(date);
  }
  scanText = scanText.replace(ISO_DATE, " ");

  for (const ruleId of text.match(RULE_ID) ?? []) {
    if (!ruleIds.has(ruleId as RuleResult["id"])) offending.push(ruleId);
  }
  scanText = scanText.replace(RULE_ID, " ");

  for (const token of scanText.match(NUMBER) ?? []) {
    const cleaned = token.replace(/,/g, "").replace(/\.$/, "");
    try {
      if (!nums.has(new Decimal(cleaned).toString())) offending.push(token);
    } catch {
      offending.push(token);
    }
  }

  return { valid: offending.length === 0, offending };
}

/**
 * Narra con verificacion: si el texto pulido (p.ej. por LLM) menciona cifras/IDs/fechas
 * que no existen en la traza, se DESCARTA y se usa la plantilla determinista.
 */
export function narrate(trace: NarrativeTrace, polish?: (base: Narrative) => Narrative): Narrative {
  const base = buildNarrative(trace);
  if (!polish) return base;
  let candidate: Narrative;
  try {
    candidate = polish(base);
  } catch {
    return base;
  }
  const joined = [candidate.headline, ...candidate.reasons.map((r) => r.text)].join("\n");
  return verifyNarrative(joined, trace).valid ? candidate : base;
}
