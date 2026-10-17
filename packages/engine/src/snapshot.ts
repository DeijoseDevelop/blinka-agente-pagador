import { hashObject } from "@agente/schemas";
import type { RuleContext } from "./context.js";

/**
 * Snapshot inmutable del contexto que produjo una decision.
 * Debe incluir TODO lo que influye en el resultado para permitir replay determinista.
 */
export function snapshotHash(ctx: RuleContext): string {
  return hashObject({
    invoice: ctx.invoice,
    policy: ctx.policy,
    company: ctx.company,
    now: ctx.now,
    fileHash: ctx.fileHash,
    findings: ctx.findings,
    approval: ctx.approval ?? null
  });
}
