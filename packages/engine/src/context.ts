import { Decimal, Money, convertToBase } from "@agente/schemas";
import type {
  Agreement,
  Approval,
  Beneficiary,
  Budget,
  CompanyData,
  ExtractedInvoice,
  Finding,
  FxRate,
  LedgerEntry,
  Policy
} from "@agente/schemas";

/**
 * Contexto determinista de evaluacion.
 * Todo dato que influya en la decision DEBE estar aqui para poder re-ejecutar (replay).
 */
export interface RuleContext {
  invoice: ExtractedInvoice;
  policy: Policy;
  company: CompanyData;
  /** Instante de evaluacion (inyectado, nunca Date.now() dentro de las reglas). */
  now: string;
  /** SHA-256 del documento original (duplicado exacto). */
  fileHash: string;
  /** Findings de IA: solo pueden ENDURECER la decision. */
  findings: Finding[];
  /** Aprobacion humana opcional (re-evaluacion al aprobar). */
  approval?: Approval | null;
}

/** Clave de periodo YYYY-MM a partir de una fecha ISO. */
export function periodKey(iso: string): string {
  return iso.slice(0, 7);
}

export function findBeneficiary(company: CompanyData, payee: ExtractedInvoice["payee"]): Beneficiary | undefined {
  return company.beneficiaries.find(
    (b) =>
      b.name.toLowerCase() === payee.name.toLowerCase() ||
      (payee.tax_id != null && b.tax_id != null && b.tax_id === payee.tax_id)
  );
}

export function findFxRate(company: CompanyData, currency: string): FxRate | undefined {
  return company.fx_rates.find((r) => r.currency === currency);
}

export interface AgreementLookup {
  agreement?: Agreement;
  /** true si el acuerdo referenciado explicitamente no existe. */
  referenceMissing: boolean;
}

export function findAgreement(ctx: RuleContext): AgreementLookup {
  const { company, invoice } = ctx;
  if (invoice.agreement_ref) {
    const agreement = company.agreements.find((a) => a.id === invoice.agreement_ref);
    return { agreement, referenceMissing: !agreement };
  }
  const beneficiary = findBeneficiary(company, invoice.payee);
  if (!beneficiary) return { referenceMissing: false };
  const agreement = company.agreements.find(
    (a) => a.beneficiary_id === beneficiary.id && a.scope_concepts.includes(invoice.concept)
  );
  return { agreement, referenceMissing: false };
}

export function categoryForInvoice(ctx: RuleContext): string | undefined {
  const byConcept = ctx.company.concept_categories[ctx.invoice.concept];
  if (byConcept) return byConcept;
  const { agreement } = findAgreement(ctx);
  return agreement?.category;
}

export function findBudget(company: CompanyData, category: string | undefined, period: string): Budget | undefined {
  if (!category) return undefined;
  return company.budgets.find((b) => b.category === category && b.period === period);
}

export function ledgerForPeriod(company: CompanyData, period: string): LedgerEntry[] {
  return company.ledger.filter((e) => periodKey(e.date) === period);
}

export interface BaseAmount {
  money: Money;
  rate: number | null;
}

/**
 * Convierte el total de la factura a la divisa base con ROUND_CEIL.
 * Si no hay tasa disponible, devuelve rate=null y el importe sin convertir
 * (R04 se encargara de FRENAR de forma no-levantable).
 */
export function baseAmountOf(ctx: RuleContext): BaseAmount {
  const base = ctx.policy.base_currency;
  const { total, currency } = ctx.invoice.amount;
  // Importe ausente (extraccion incompleta): R01 lo reporta como campo critico
  // faltante y FRENA. Se usa 0 para no romper la aritmetica; sin tasa aplicable.
  if (total == null || !Number.isFinite(total)) {
    return { money: Money.of(0, base).roundCeilCent(), rate: null };
  }
  if (currency === base) {
    return { money: Money.of(total, base).roundCeilCent(), rate: 1 };
  }
  const fx = findFxRate(ctx.company, currency);
  if (!fx) {
    return { money: Money.of(total, base).roundCeilCent(), rate: null };
  }
  return { money: convertToBase(Money.of(total, currency), base, fx.rate), rate: fx.rate };
}

/** Convierte un importe arbitrario (p.ej. el de un acuerdo) a base con ROUND_CEIL. */
export function toBase(company: CompanyData, base: string, amount: number, currency: string): Decimal | null {
  if (currency === base) return new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_CEIL);
  const fx = findFxRate(company, currency);
  if (!fx) return null;
  return new Decimal(amount).mul(fx.rate).toDecimalPlaces(2, Decimal.ROUND_CEIL);
}

/** Diferencia en dias absolutos entre dos fechas ISO. */
export function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(a) - Date.parse(b));
  return Math.floor(ms / 86_400_000);
}
