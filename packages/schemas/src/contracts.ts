import { z } from "zod";
import { DECISIONS, DOCUMENT_FLAGS, RULE_IDS, RULE_STATUSES } from "./enums.js";

/* ------------------------------------------------------------------ *
 * A. ExtractedInvoice (esquema de extraccion)
 * ------------------------------------------------------------------ */

export const PayeeSchema = z.object({
  name: z.string().min(1),
  tax_id: z.string().optional(),
  country: z.string().length(2).optional(),
  bank_ref: z.string().optional()
});
export type Payee = z.infer<typeof PayeeSchema>;

export const InvoiceAmountSchema = z.object({
  /** Texto original tal cual aparece en el documento. */
  raw: z.string(),
  /** Total exacto (se convierte a Decimal en el motor). */
  total: z.number().finite(),
  subtotal: z.number().finite().optional(),
  tax: z.number().finite().optional(),
  /** Codigo ISO 4217. */
  currency: z.string().length(3)
});
export type InvoiceAmount = z.infer<typeof InvoiceAmountSchema>;

export const EvidenceSchema = z.object({
  page: z.number().int().positive().optional(),
  snippet: z.string()
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ExtractedInvoiceSchema = z.object({
  invoice_number: z.string().nullable(),
  /** ISO 8601 YYYY-MM-DD */
  issue_date: z.string().nullable(),
  due_date: z.string().nullable(),
  payee: PayeeSchema,
  amount: InvoiceAmountSchema,
  concept: z.string(),
  agreement_ref: z.string().optional(),
  /** Valores entre 0.0 y 1.0 por campo. */
  field_confidence: z.record(z.string(), z.number().min(0).max(1)),
  evidence: z.record(z.string(), EvidenceSchema),
  document_flags: z.array(z.enum(DOCUMENT_FLAGS))
});
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;

/* ------------------------------------------------------------------ *
 * B. Policy
 * ------------------------------------------------------------------ */

export const PeriodSchema = z.object({
  type: z.enum(["week", "month", "year"]),
  limit: z.number().finite()
});
export type Period = z.infer<typeof PeriodSchema>;

export const ApprovalTierSchema = z.object({
  up_to: z.number().finite(),
  role: z.string()
});
export type ApprovalTier = z.infer<typeof ApprovalTierSchema>;

export const RuleOverrideSchema = z.object({
  on_fail: z.enum(DECISIONS)
});
export type RuleOverride = z.infer<typeof RuleOverrideSchema>;

export const PolicySchema = z.object({
  policy_id: z.string(),
  base_currency: z.string().length(3),
  supported_currencies: z.array(z.string().length(3)),
  limits: z.object({
    hard_cap_per_payment: z.number().finite(),
    approval_threshold: z.number().finite(),
    period: PeriodSchema
  }),
  extraction: z.object({
    min_field_confidence: z.number().min(0).max(1)
  }),
  agreement_tolerance_pct: z.number().min(0),
  duplicate_window_days: z.number().int().nonnegative(),
  approvals_matrix: z.array(ApprovalTierSchema),
  rule_overrides: z.record(z.enum(RULE_IDS), RuleOverrideSchema).optional()
});
export type Policy = z.infer<typeof PolicySchema>;

/* ------------------------------------------------------------------ *
 * Datos de empresa (contexto determinista)
 * ------------------------------------------------------------------ */

export const BeneficiarySchema = z.object({
  id: z.string(),
  name: z.string(),
  tax_id: z.string().optional(),
  country: z.string().length(2).optional(),
  bank_ref: z.string(),
  allowed: z.boolean(),
  categories: z.array(z.string()).optional()
});
export type Beneficiary = z.infer<typeof BeneficiarySchema>;

export const AgreementSchema = z.object({
  id: z.string(),
  beneficiary_id: z.string(),
  concept: z.string(),
  amount: z.number().finite(),
  currency: z.string().length(3),
  valid_from: z.string(),
  valid_to: z.string(),
  /** Conceptos cubiertos por el acuerdo; fuera de esta lista => fuera de alcance. */
  scope_concepts: z.array(z.string()),
  /** Presupuesto/categoria a la que imputa el acuerdo. */
  category: z.string()
});
export type Agreement = z.infer<typeof AgreementSchema>;

export const BudgetSchema = z.object({
  category: z.string(),
  /** Periodo YYYY-MM. */
  period: z.string(),
  limit: z.number().finite(),
  spent: z.number().finite()
});
export type Budget = z.infer<typeof BudgetSchema>;

export const FxRateSchema = z.object({
  currency: z.string().length(3),
  /** Tasa hacia la divisa base (1 unidad de currency => rate unidades base). */
  rate: z.number().positive(),
  as_of: z.string()
});
export type FxRate = z.infer<typeof FxRateSchema>;

export const LedgerEntrySchema = z.object({
  invoice_id: z.string(),
  beneficiary_id: z.string(),
  beneficiary_name: z.string(),
  invoice_number: z.string().nullable(),
  concept: z.string(),
  amount_base_usd: z.number().finite(),
  file_hash: z.string(),
  date: z.string(),
  decision: z.enum(DECISIONS)
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const CompanyDataSchema = z.object({
  policy: PolicySchema,
  beneficiaries: z.array(BeneficiarySchema),
  agreements: z.array(AgreementSchema),
  budgets: z.array(BudgetSchema),
  fx_rates: z.array(FxRateSchema),
  ledger: z.array(LedgerEntrySchema),
  /** Categorias por concepto (mapa concepto -> categoria presupuestal). */
  concept_categories: z.record(z.string(), z.string())
});
export type CompanyData = z.infer<typeof CompanyDataSchema>;

/* ------------------------------------------------------------------ *
 * C. DecisionRecord
 * ------------------------------------------------------------------ */

export const RuleResultSchema = z.object({
  id: z.enum(RULE_IDS),
  status: z.enum(RULE_STATUSES),
  on_fail: z.enum(DECISIONS),
  waivable: z.boolean(),
  evidence: z.string()
});
export type RuleResult = z.infer<typeof RuleResultSchema>;

export const ReasonSchema = z.object({
  rule: z.string(),
  text: z.string()
});
export type Reason = z.infer<typeof ReasonSchema>;

export const FindingSchema = z.object({
  kind: z.string(),
  /** Un finding de IA solo puede ENDURECER: nunca PAGAR. */
  suggested_on_fail: z.enum(["ESCALAR", "FRENAR"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  evidence_refs: z.array(z.string())
});
export type Finding = z.infer<typeof FindingSchema>;

export const ApprovalSchema = z.object({
  approval_id: z.string(),
  invoice_id: z.string(),
  beneficiary_id: z.string(),
  amount_base_usd: z.number().finite(),
  actor: z.string(),
  comment: z.string().min(1),
  approved_at: z.string(),
  expires_at: z.string()
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const DecisionRecordSchema = z.object({
  decision_id: z.string(),
  invoice_id: z.string(),
  decision: z.enum(DECISIONS),
  headline: z.string(),
  reasons: z.array(ReasonSchema),
  rules: z.array(RuleResultSchema),
  amounts: z.object({
    original: z.string(),
    base_usd: z.string(),
    fx_rate: z.number().nullable()
  }),
  policy_version: z.string(),
  context_snapshot_hash: z.string(),
  findings: z.array(FindingSchema),
  guardian: z.object({
    verified: z.boolean(),
    mismatch: z.boolean(),
    signature: z.string().optional()
  }),
  prev_hash: z.string(),
  hash: z.string(),
  created_at: z.string()
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

export const PaymentAuthorizationSchema = z.object({
  authorization_id: z.string(),
  decision_id: z.string(),
  invoice_id: z.string(),
  beneficiary_id: z.string(),
  amount_base_usd: z.string(),
  currency: z.string().length(3),
  policy_version: z.string(),
  context_snapshot_hash: z.string(),
  approved_by: z.string().nullable(),
  issued_at: z.string(),
  signature: z.string()
});
export type PaymentAuthorization = z.infer<typeof PaymentAuthorizationSchema>;
