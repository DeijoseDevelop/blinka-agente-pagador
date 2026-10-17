import { Money } from "@agente/schemas";
import type { Decision, Finding, Reason, RuleResult } from "@agente/schemas";
import { baseAmountOf } from "./context.js";
import type { RuleContext } from "./context.js";
import { evaluateAllRules } from "./rules.js";
import { aggregate } from "./aggregate.js";
import { snapshotHash } from "./snapshot.js";
import { buildNarrative, narrate } from "./narrator.js";
import type { Narrative, NarrativeTrace } from "./narrator.js";

export interface DecisionOutcome {
  invoice_id: string;
  decision: Decision;
  headline: string;
  reasons: Reason[];
  rules: RuleResult[];
  amounts: { original: string; base_usd: string; fx_rate: number | null };
  findings: Finding[];
  context_snapshot_hash: string;
}

export function invoiceIdOf(ctx: RuleContext): string {
  return ctx.invoice.invoice_number ? `inv_${ctx.invoice.invoice_number}` : `inv_${ctx.fileHash.slice(0, 12)}`;
}

/**
 * Importe original tolerante a extraccion incompleta: si falta el total se usa 0
 * (R01 ya lo reporta como campo critico faltante). Nunca lanza excepcion.
 */
function originalMoneyOf(ctx: RuleContext): Money {
  const { total, currency } = ctx.invoice.amount;
  const unit = currency || ctx.policy.base_currency;
  return Number.isFinite(total) ? Money.of(total, unit) : Money.of(0, unit);
}

/** Traza tecnica serializable que respalda la narrativa. */
export function buildTrace(ctx: RuleContext): NarrativeTrace {
  const { money, rate } = baseAmountOf(ctx);
  const original = originalMoneyOf(ctx);
  return {
    decision: "PAGAR",
    invoice_id: invoiceIdOf(ctx),
    invoice_number: ctx.invoice.invoice_number,
    amounts: { original: original.toFixed(), base_usd: money.toFixed(), fx_rate: rate },
    rules: [],
    dates: [ctx.invoice.issue_date, ctx.invoice.due_date, ctx.now].filter((d): d is string => d != null)
  };
}

/**
 * Orquestador determinista y puro.
 * Evalua R01-R12, agrega fail-closed y narra en 3 capas. NO firma ni persiste.
 */
export function decide(ctx: RuleContext, polish?: (base: Narrative) => Narrative): DecisionOutcome {
  const rules = evaluateAllRules(ctx);
  const { decision } = aggregate(rules, ctx.findings);
  const { money, rate } = baseAmountOf(ctx);
  const original = originalMoneyOf(ctx);

  const trace: NarrativeTrace = {
    decision,
    invoice_id: invoiceIdOf(ctx),
    invoice_number: ctx.invoice.invoice_number,
    amounts: { original: original.toFixed(), base_usd: money.toFixed(), fx_rate: rate },
    rules,
    dates: [ctx.invoice.issue_date, ctx.invoice.due_date, ctx.now].filter((d): d is string => d != null)
  };

  const narrative = narrate(trace, polish);

  return {
    invoice_id: invoiceIdOf(ctx),
    decision,
    headline: narrative.headline,
    reasons: narrative.reasons,
    rules,
    amounts: trace.amounts,
    findings: ctx.findings,
    context_snapshot_hash: snapshotHash(ctx)
  };
}
