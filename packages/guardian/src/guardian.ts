import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Decimal, canonicalize } from "@agente/schemas";
import type { Approval, Decision, PaymentAuthorization, Policy } from "@agente/schemas";
import type { DecisionOutcome } from "@agente/engine";

export type DecisionOrigin = "engine" | "llm" | "analyst" | "extractor" | "manual" | "approval";

const LLM_ORIGINS: readonly DecisionOrigin[] = ["llm", "analyst", "extractor"];

export interface GuardianAlert {
  code: string;
  invariant: "I1" | "I2" | "I3" | "I4" | "I5";
  detail: string;
}

export interface GuardianInput {
  decision_id: string;
  outcome: DecisionOutcome;
  policy: Policy;
  /** true si la extraccion paso validacion de esquema. */
  extractionValidated: boolean;
  approval?: Approval | null;
  beneficiary_id: string | null;
  origin: DecisionOrigin;
  now: string;
}

export interface GuardianResult {
  verified: boolean;
  mismatch: boolean;
  /** Decision efectiva tras el guardian (degradada si hubo discrepancia). */
  decision: Decision;
  alerts: GuardianAlert[];
  authorization?: PaymentAuthorization;
}

export interface Guardian {
  guard(input: GuardianInput): GuardianResult;
  verifyAuthorization(auth: PaymentAuthorization): boolean;
}

export interface GuardianOptions {
  secret?: string;
}

/** Degrada una decision para que nunca pueda quedarse en PAGAR tras una discrepancia. */
function degrade(decision: Decision): Decision {
  return decision === "PAGAR" ? "ESCALAR" : decision;
}

function signPayload(payload: unknown, secret: string): string {
  return createHmac("sha256", secret).update(canonicalize(payload), "utf8").digest("hex");
}

/** Comprueba I1..I4 para una intencion de PAGAR. Devuelve alertas (vacio = OK). */
function checkInvariants(input: GuardianInput): GuardianAlert[] {
  const alerts: GuardianAlert[] = [];
  const { outcome, policy, approval, extractionValidated, now } = input;

  if (LLM_ORIGINS.includes(input.origin)) {
    alerts.push({
      code: "GUARDIAN_MISMATCH",
      invariant: "I4",
      detail: `Origen '${input.origin}' con LLM no puede escribir ni producir decisiones`
    });
  }

  if (outcome.decision !== "PAGAR") return alerts;

  // I2: extraccion validada, politica fija y snapshot de contexto registrado.
  if (!extractionValidated || !policy.policy_id || outcome.context_snapshot_hash.length === 0) {
    alerts.push({
      code: "GUARDIAN_MISMATCH",
      invariant: "I2",
      detail: "PAGAR sin extraccion validada, version de politica o hash de snapshot"
    });
  }

  if (approval) {
    // Via de aprobacion humana: I3 exige aprobacion vigente, que cubra exactamente y
    // NINGUNA regla no-levantable en FAIL. Las reglas levantables pueden estar en FAIL.
    const vigente = approval.approved_at <= now && now <= approval.expires_at;
    const covers =
      approval.invoice_id === outcome.invoice_id &&
      approval.beneficiary_id === input.beneficiary_id &&
      new Decimal(approval.amount_base_usd).eq(new Decimal(outcome.amounts.base_usd));
    const nonWaivableFail = outcome.rules.filter((r) => !r.waivable && r.status !== "PASS");
    if (!vigente || !covers || nonWaivableFail.length > 0) {
      alerts.push({
        code: "GUARDIAN_MISMATCH",
        invariant: "I3",
        detail: `Aprobacion invalida (vigente=${vigente}, cubre=${covers}, noLevantablesEnFallback=${nonWaivableFail.length})`
      });
    }
  } else {
    // Via autonoma: I1 exige TODAS las reglas en PASS y ninguna en UNKNOWN.
    const notPass = outcome.rules.filter((r) => r.status !== "PASS");
    if (notPass.length > 0) {
      alerts.push({
        code: "GUARDIAN_MISMATCH",
        invariant: "I1",
        detail: `PAGAR con reglas no-PASS: ${notPass.map((r) => `${r.id}:${r.status}`).join(", ")}`
      });
    }
  }

  return alerts;
}

export function createGuardian(options: GuardianOptions = {}): Guardian {
  const secret = options.secret ?? process.env.GUARDIAN_HMAC_SECRET ?? "dev-guardian-secret";

  function issueAuthorization(input: GuardianInput): PaymentAuthorization {
    const payload = {
      authorization_id: randomUUID(),
      decision_id: input.decision_id,
      invoice_id: input.outcome.invoice_id,
      beneficiary_id: input.beneficiary_id ?? "unknown",
      amount_base_usd: input.outcome.amounts.base_usd,
      currency: input.policy.base_currency,
      policy_version: input.policy.policy_id,
      context_snapshot_hash: input.outcome.context_snapshot_hash,
      approved_by: input.approval?.actor ?? null,
      issued_at: input.now
    };
    return { ...payload, signature: signPayload(payload, secret) };
  }

  function guard(input: GuardianInput): GuardianResult {
    // I5: cualquier excepcion => NUNCA PAGAR (fail-closed a FRENAR).
    try {
      const alerts = checkInvariants(input);
      if (alerts.length > 0) {
        return { verified: false, mismatch: true, decision: degrade(input.outcome.decision), alerts };
      }
      const authorization = input.outcome.decision === "PAGAR" ? issueAuthorization(input) : undefined;
      return {
        verified: true,
        mismatch: false,
        decision: input.outcome.decision,
        alerts: [],
        ...(authorization ? { authorization } : {})
      };
    } catch (err) {
      return {
        verified: false,
        mismatch: true,
        decision: "FRENAR",
        alerts: [
          { code: "GUARDIAN_EXCEPTION", invariant: "I5", detail: `Fallo imprevisto: ${(err as Error).message}` }
        ]
      };
    }
  }

  function verifyAuthorization(auth: PaymentAuthorization): boolean {
    const { signature, ...payload } = auth;
    const expected = signPayload(payload, secret);
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }

  return { guard, verifyAuthorization };
}
