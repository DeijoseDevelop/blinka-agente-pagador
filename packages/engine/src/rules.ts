import { DECISION_RANK, Decimal, Money } from "@agente/schemas";
import type { Decision, ExtractedInvoice, RuleId, RuleResult, RuleStatus } from "@agente/schemas";
import {
  baseAmountOf,
  categoryForInvoice,
  daysBetween,
  findAgreement,
  findBeneficiary,
  findBudget,
  findFxRate,
  ledgerForPeriod,
  periodKey,
  toBase
} from "./context.js";
import type { RuleContext } from "./context.js";

export const OVERDUE_TOLERANCE_DAYS = 30;
export const FUTURE_TOLERANCE_DAYS = 1;

const DAY_MS = 86_400_000;

export type NonPayDecision = Exclude<Decision, "PAGAR">;

export interface RuleEvaluation {
  status: RuleStatus;
  evidence: string;
  /** on_fail dinamico (usado por R10 y R01). Nunca PAGAR. */
  on_fail?: NonPayDecision;
  waivable?: boolean;
}

export interface RuleDefinition {
  id: RuleId;
  description: string;
  defaultOnFail: NonPayDecision;
  waivable: boolean;
  evaluate(ctx: RuleContext): RuleEvaluation;
}

const REQUIRED_FIELDS = ["payee.name", "amount.total", "amount.currency", "issue_date"] as const;

function missingCriticalFields(inv: ExtractedInvoice): string[] {
  const missing: string[] = [];
  if (!inv.payee.name || inv.payee.name.trim() === "") missing.push("payee.name");
  if (inv.amount.total == null) missing.push("amount.total");
  if (!inv.amount.currency || inv.amount.currency.trim() === "") missing.push("amount.currency");
  if (!inv.issue_date) missing.push("issue_date");
  return missing;
}

function lowConfidenceFields(inv: ExtractedInvoice, min: number): string[] {
  const out: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const c = inv.field_confidence[field];
    if (c != null && c < min) out.push(`${field}(${c})`);
  }
  return out;
}

function arithmeticMismatch(inv: ExtractedInvoice): boolean {
  const { subtotal, tax, total } = inv.amount;
  if (subtotal == null || tax == null) return false;
  const expected = new Decimal(subtotal).add(tax).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const actual = new Decimal(total).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return !expected.eq(actual);
}

function looksLocaleAmbiguous(raw: string): boolean {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  return /^\d{1,3}[.,]\d{3}$/.test(cleaned);
}

/* --------------------------- R01 --------------------------- */
const R01: RuleDefinition = {
  id: "R01",
  description: "Datos completos y confianza minima de extraccion",
  defaultOnFail: "FRENAR",
  waivable: false,
  evaluate(ctx) {
    const missing = missingCriticalFields(ctx.invoice);
    if (missing.length > 0) {
      return {
        status: "FAIL",
        on_fail: "FRENAR",
        waivable: false,
        evidence: `Faltan campos criticos: ${missing.join(", ")}`
      };
    }
    const low = lowConfidenceFields(ctx.invoice, ctx.policy.extraction.min_field_confidence);
    if (low.length > 0) {
      return {
        status: "FAIL",
        on_fail: "ESCALAR",
        waivable: true,
        evidence: `Confianza bajo ${ctx.policy.extraction.min_field_confidence}: ${low.join(", ")}`
      };
    }
    return { status: "PASS", evidence: "Campos criticos presentes y confianza suficiente" };
  }
};

/* --------------------------- R02 --------------------------- */
const R02: RuleDefinition = {
  id: "R02",
  description: "Beneficiario en lista blanca",
  defaultOnFail: "ESCALAR",
  waivable: true,
  evaluate(ctx) {
    const b = findBeneficiary(ctx.company, ctx.invoice.payee);
    if (!b) {
      return { status: "FAIL", evidence: `Beneficiario no registrado: ${ctx.invoice.payee.name}` };
    }
    if (!b.allowed) {
      return { status: "FAIL", evidence: `Beneficiario ${b.id} marcado como no permitido` };
    }
    return { status: "PASS", evidence: `Beneficiario ${b.id} habilitado` };
  }
};

/* --------------------------- R03 --------------------------- */
const R03: RuleDefinition = {
  id: "R03",
  description: "Validacion de cuenta bancaria contra registro",
  defaultOnFail: "ESCALAR",
  waivable: true,
  evaluate(ctx) {
    const b = findBeneficiary(ctx.company, ctx.invoice.payee);
    if (!b) return { status: "UNKNOWN", evidence: "Beneficiario no identificado: no se puede validar cuenta" };
    const invoiceBank = ctx.invoice.payee.bank_ref;
    if (!invoiceBank) return { status: "UNKNOWN", evidence: "La factura no declara cuenta bancaria de cobro" };
    if (!b.bank_ref) return { status: "UNKNOWN", evidence: `Beneficiario ${b.id} sin cuenta registrada` };
    if (invoiceBank !== b.bank_ref) {
      return {
        status: "FAIL",
        evidence: `Cuenta de cobro ${invoiceBank} difiere de la registrada ${b.bank_ref}`
      };
    }
    return { status: "PASS", evidence: `Cuenta ${invoiceBank} coincide con el registro` };
  }
};

/* --------------------------- R04 --------------------------- */
const R04: RuleDefinition = {
  id: "R04",
  description: "Moneda soportada con tasa FX disponible",
  defaultOnFail: "FRENAR",
  waivable: false,
  evaluate(ctx) {
    const base = ctx.policy.base_currency;
    const cur = ctx.invoice.amount.currency;
    if (!cur) return { status: "UNKNOWN", evidence: "Moneda ausente (ver R01)" };
    if (cur === base) return { status: "PASS", evidence: `Moneda base ${base}` };
    if (!ctx.policy.supported_currencies.includes(cur)) {
      return { status: "FAIL", evidence: `Moneda ${cur} no soportada por la politica` };
    }
    if (!findFxRate(ctx.company, cur)) {
      return { status: "FAIL", evidence: `Sin tasa FX registrada para ${cur}` };
    }
    return { status: "PASS", evidence: `Moneda ${cur} soportada con tasa FX` };
  }
};

/* --------------------------- R05 --------------------------- */
const R05: RuleDefinition = {
  id: "R05",
  description: "Tope duro por pago (limite inclusivo)",
  defaultOnFail: "FRENAR",
  waivable: false,
  evaluate(ctx) {
    const { money } = baseAmountOf(ctx);
    const cap = Money.of(ctx.policy.limits.hard_cap_per_payment, ctx.policy.base_currency);
    if (money.gt(cap)) {
      return { status: "FAIL", evidence: `${money.toFixed()} ${money.currency} supera el tope duro ${cap.toFixed()}` };
    }
    return { status: "PASS", evidence: `${money.toFixed()} <= tope duro ${cap.toFixed()}` };
  }
};

/* --------------------------- R06 --------------------------- */
const R06: RuleDefinition = {
  id: "R06",
  description: "Umbral de aprobacion humana (limite inclusivo)",
  defaultOnFail: "ESCALAR",
  waivable: true,
  evaluate(ctx) {
    const { money } = baseAmountOf(ctx);
    const threshold = Money.of(ctx.policy.limits.approval_threshold, ctx.policy.base_currency);
    if (money.gt(threshold)) {
      return {
        status: "FAIL",
        evidence: `${money.toFixed()} ${money.currency} supera el umbral de aprobacion ${threshold.toFixed()}`
      };
    }
    return { status: "PASS", evidence: `${money.toFixed()} <= umbral ${threshold.toFixed()}` };
  }
};

/* --------------------------- R07 --------------------------- */
const R07: RuleDefinition = {
  id: "R07",
  description: "Limite acumulado por periodo (limite inclusivo)",
  defaultOnFail: "ESCALAR",
  waivable: true,
  evaluate(ctx) {
    const period = periodKey(ctx.invoice.issue_date ?? ctx.now);
    const committed = ledgerForPeriod(ctx.company, period).reduce(
      (acc, e) => acc.add(e.amount_base_usd),
      new Decimal(0)
    );
    const projected = committed.add(baseAmountOf(ctx).money.amount);
    const limit = new Decimal(ctx.policy.limits.period.limit);
    if (projected.gt(limit)) {
      return {
        status: "FAIL",
        evidence: `Proyectado ${projected.toFixed(2)} supera el limite ${limit.toFixed(2)} del periodo ${period}`
      };
    }
    return {
      status: "PASS",
      evidence: `Proyectado ${projected.toFixed(2)} <= limite ${limit.toFixed(2)} del periodo ${period}`
    };
  }
};

/* --------------------------- R08 --------------------------- */
const R08: RuleDefinition = {
  id: "R08",
  description: "Presupuesto de categoria y mes disponible",
  defaultOnFail: "FRENAR",
  waivable: false,
  evaluate(ctx) {
    const period = periodKey(ctx.invoice.issue_date ?? ctx.now);
    const category = categoryForInvoice(ctx);
    const budget = findBudget(ctx.company, category, period);
    if (!budget) {
      return {
        status: "UNKNOWN",
        evidence: `Sin presupuesto definido para categoria '${category ?? "desconocida"}' en ${period}`
      };
    }
    const remaining = new Decimal(budget.limit).sub(budget.spent);
    const need = baseAmountOf(ctx).money.amount;
    if (need.gt(remaining)) {
      return {
        status: "FAIL",
        evidence: `Requiere ${need.toFixed(2)}, disponible ${remaining.toFixed(2)} en ${category}/${period}`
      };
    }
    return {
      status: "PASS",
      evidence: `Requiere ${need.toFixed(2)} <= disponible ${remaining.toFixed(2)} en ${category}/${period}`
    };
  }
};

/* --------------------------- R09 --------------------------- */
const R09: RuleDefinition = {
  id: "R09",
  description: "Deteccion de duplicados (hash, numero, semantico)",
  defaultOnFail: "FRENAR",
  waivable: false,
  evaluate(ctx) {
    const { invoice, company, policy, now, fileHash } = ctx;
    const b = findBeneficiary(company, invoice.payee);
    const target = baseAmountOf(ctx).money;

    if (fileHash && company.ledger.some((e) => e.file_hash === fileHash)) {
      return { status: "FAIL", evidence: `Hash de archivo duplicado ${fileHash.slice(0, 12)}...` };
    }

    if (invoice.invoice_number) {
      const dup = company.ledger.find(
        (e) =>
          e.invoice_number === invoice.invoice_number &&
          (b ? e.beneficiary_id === b.id : e.beneficiary_name.toLowerCase() === invoice.payee.name.toLowerCase())
      );
      if (dup) {
        return {
          status: "FAIL",
          evidence: `Factura ${invoice.invoice_number} ya registrada para el mismo beneficiario`
        };
      }
    }

    const window = policy.duplicate_window_days;
    for (const e of company.ledger) {
      const sameBeneficiary = b
        ? e.beneficiary_id === b.id
        : e.beneficiary_name.toLowerCase() === invoice.payee.name.toLowerCase();
      if (!sameBeneficiary) continue;
      const sameAmount = new Decimal(e.amount_base_usd).eq(target.amount);
      const sameConcept = e.concept.toLowerCase() === invoice.concept.toLowerCase();
      const within = daysBetween(e.date, now) <= window;
      if (sameAmount && sameConcept && within) {
        return {
          status: "FAIL",
          evidence: `Cobro equivalente (${target.toFixed()} ${target.currency}) en ventana de ${window} dias (${e.date})`
        };
      }
    }

    return { status: "PASS", evidence: "Sin duplicados en el ledger" };
  }
};

/* --------------------------- R10 --------------------------- */
const R10: RuleDefinition = {
  id: "R10",
  description: "Conciliacion con acuerdo comercial (bifurcacion)",
  defaultOnFail: "ESCALAR",
  waivable: true,
  evaluate(ctx) {
    const { agreement } = findAgreement(ctx);
    const target = baseAmountOf(ctx).money;

    if (!agreement) {
      return {
        status: "FAIL",
        on_fail: "ESCALAR",
        waivable: true,
        evidence: "Cobro legitimo sin acuerdo comercial registrado (requiere aprobacion humana)"
      };
    }

    const now = ctx.now;
    if (now < agreement.valid_from || now > agreement.valid_to) {
      return {
        status: "FAIL",
        on_fail: "FRENAR",
        waivable: false,
        evidence: `Acuerdo ${agreement.id} fuera de vigencia (${agreement.valid_from}..${agreement.valid_to})`
      };
    }

    const agreedBase = toBase(ctx.company, ctx.policy.base_currency, agreement.amount, agreement.currency);
    if (agreedBase == null) {
      return {
        status: "FAIL",
        on_fail: "FRENAR",
        waivable: false,
        evidence: `Sin tasa FX para el acuerdo ${agreement.id} (${agreement.currency})`
      };
    }
    const tolerance = agreedBase.mul(new Decimal(1).add(new Decimal(ctx.policy.agreement_tolerance_pct).div(100)));
    const ceiling = tolerance.toDecimalPlaces(2, Decimal.ROUND_CEIL);
    if (target.amount.gt(ceiling)) {
      return {
        status: "FAIL",
        on_fail: "FRENAR",
        waivable: false,
        evidence: `Monto ${target.toFixed()} excede lo pactado ${agreedBase.toFixed(2)} (+${ctx.policy.agreement_tolerance_pct}%) en acuerdo ${agreement.id}`
      };
    }

    if (!agreement.scope_concepts.includes(ctx.invoice.concept)) {
      return {
        status: "FAIL",
        on_fail: "FRENAR",
        waivable: false,
        evidence: `Concepto '${ctx.invoice.concept}' fuera del alcance del acuerdo ${agreement.id}`
      };
    }

    return {
      status: "PASS",
      evidence: `Dentro del acuerdo ${agreement.id} (pactado ${agreedBase.toFixed(2)}, tolerancia ${ctx.policy.agreement_tolerance_pct}%)`
    };
  }
};

/* --------------------------- R11 --------------------------- */
const R11: RuleDefinition = {
  id: "R11",
  description: "Integridad documental y anti prompt-injection",
  defaultOnFail: "FRENAR",
  waivable: false,
  evaluate(ctx) {
    const inv = ctx.invoice;
    const flags = inv.document_flags;
    if (flags.includes("math_inconsistent") || arithmeticMismatch(inv)) {
      return { status: "FAIL", on_fail: "FRENAR", waivable: false, evidence: "Aritmetica inconsistente (subtotal + impuesto != total)" };
    }
    if (flags.includes("injection_suspected")) {
      return { status: "FAIL", on_fail: "FRENAR", waivable: false, evidence: "Sospecha de prompt injection en el documento" };
    }
    if (flags.includes("locale_ambiguous") || looksLocaleAmbiguous(inv.amount.raw)) {
      return { status: "FAIL", on_fail: "ESCALAR", waivable: true, evidence: `Formato numerico ambiguo: '${inv.amount.raw}'` };
    }
    if (flags.includes("low_quality")) {
      return { status: "FAIL", on_fail: "ESCALAR", waivable: true, evidence: "Documento de baja calidad" };
    }
    return { status: "PASS", evidence: "Documento consistente y sin senales de inyeccion" };
  }
};

/* --------------------------- R12 --------------------------- */
const R12: RuleDefinition = {
  id: "R12",
  description: "Validez de fechas (vencimiento y fecha futura)",
  defaultOnFail: "ESCALAR",
  waivable: true,
  evaluate(ctx) {
    const inv = ctx.invoice;
    if (!inv.issue_date) return { status: "UNKNOWN", evidence: "Sin fecha de emision (ver R01)" };

    if (Date.parse(inv.issue_date) > Date.parse(ctx.now) + FUTURE_TOLERANCE_DAYS * DAY_MS) {
      return { status: "FAIL", on_fail: "ESCALAR", waivable: true, evidence: `Emitida a futuro: ${inv.issue_date}` };
    }
    if (inv.due_date) {
      const overdueDays = (Date.parse(ctx.now) - Date.parse(inv.due_date)) / DAY_MS;
      if (overdueDays > OVERDUE_TOLERANCE_DAYS) {
        return {
          status: "FAIL",
          on_fail: "ESCALAR",
          waivable: true,
          evidence: `Vencida hace ${Math.floor(overdueDays)} dias (tolerancia ${OVERDUE_TOLERANCE_DAYS})`
        };
      }
    }
    return { status: "PASS", evidence: "Fechas vigentes" };
  }
};

/** Catalogo completo R01-R12. El orden es estable para trazas reproducibles. */
export const RULES: readonly RuleDefinition[] = [R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12];

export const RULES_BY_ID: Record<RuleId, RuleDefinition> = Object.fromEntries(
  RULES.map((r) => [r.id, r])
) as Record<RuleId, RuleDefinition>;

/**
 * Evalua TODAS las reglas sin cortocircuito y aplica overrides de politica.
 * Cualquier excepcion se convierte en UNKNOWN (fail-closed).
 */
export function evaluateAllRules(ctx: RuleContext): RuleResult[] {
  return RULES.map((rule) => {
    let evaluation: RuleEvaluation;
    try {
      evaluation = rule.evaluate(ctx);
    } catch (err) {
      evaluation = {
        status: "UNKNOWN",
        evidence: `Excepcion en ${rule.id}: ${(err as Error).message}`,
        on_fail: rule.defaultOnFail,
        waivable: rule.waivable
      };
    }
    const override = ctx.policy.rule_overrides?.[rule.id]?.on_fail;
    // La regla manda; un override de politica solo puede ENDURECER su on_fail, nunca suavizarlo.
    const base = evaluation.on_fail ?? rule.defaultOnFail;
    const on_fail: NonPayDecision =
      override && override !== "PAGAR" && DECISION_RANK[override] > DECISION_RANK[base] ? override : base;
    return {
      id: rule.id,
      status: evaluation.status,
      on_fail,
      waivable: evaluation.waivable ?? rule.waivable,
      evidence: evaluation.evidence
    };
  });
}
