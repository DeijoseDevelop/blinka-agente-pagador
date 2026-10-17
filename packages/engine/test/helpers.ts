import type { Approval, CompanyData, ExtractedInvoice, Finding, Policy } from "@agente/schemas";
import type { RuleContext } from "../src/index.js";

export const NOW = "2026-10-15T12:00:00.000Z";

export const POLICY: Policy = {
  policy_id: "pol_acme_v7",
  base_currency: "USD",
  supported_currencies: ["USD", "COP", "MXN", "EUR", "BRL"],
  limits: {
    hard_cap_per_payment: 50000,
    approval_threshold: 5000,
    period: { type: "month", limit: 120000 }
  },
  extraction: { min_field_confidence: 0.85 },
  agreement_tolerance_pct: 2,
  duplicate_window_days: 30,
  approvals_matrix: [
    { up_to: 15000, role: "lider_finanzas" },
    { up_to: 50000, role: "cfo" }
  ],
  rule_overrides: {
    R02: { on_fail: "ESCALAR" },
    R09: { on_fail: "FRENAR" }
  }
};

export function makeCompany(overrides: Partial<CompanyData> = {}): CompanyData {
  const base: CompanyData = {
    policy: POLICY,
    beneficiaries: [
      {
        id: "ben_proveedor_001",
        name: "Proveedor Recurrente S.A.S",
        tax_id: "900123456",
        country: "CO",
        bank_ref: "BANK-001",
        allowed: true,
        categories: ["servicios"]
      },
      {
        id: "ben_contratista_002",
        name: "Contratista Independiente",
        tax_id: "CC-7788",
        country: "CO",
        bank_ref: "BANK-002",
        allowed: true,
        categories: ["consultoria"]
      },
      {
        id: "ben_bloqueado_003",
        name: "Proveedor Bloqueado",
        bank_ref: "BANK-003",
        allowed: false
      }
    ],
    agreements: [
      {
        id: "agr_001",
        beneficiary_id: "ben_proveedor_001",
        concept: "Servicios de desarrollo",
        amount: 6000,
        currency: "USD",
        valid_from: "2024-01-01",
        valid_to: "2026-12-31",
        scope_concepts: ["Servicios de desarrollo", "Soporte"],
        category: "servicios"
      },
      {
        id: "agr_002",
        beneficiary_id: "ben_contratista_002",
        concept: "Consultoria mensual",
        amount: 800000,
        currency: "COP",
        valid_from: "2024-01-01",
        valid_to: "2026-12-31",
        scope_concepts: ["Consultoria mensual"],
        category: "consultoria"
      }
    ],
    budgets: [
      { category: "servicios", period: "2026-10", limit: 100000, spent: 0 },
      { category: "consultoria", period: "2026-10", limit: 50000, spent: 0 },
      { category: "suministros", period: "2026-10", limit: 20000, spent: 20000 },
      { category: "otros", period: "2026-10", limit: 100000, spent: 0 }
    ],
    fx_rates: [
      { currency: "COP", rate: 0.00025, as_of: "2026-10-01" },
      { currency: "MXN", rate: 0.058, as_of: "2026-10-01" },
      { currency: "EUR", rate: 1.08, as_of: "2026-10-01" },
      { currency: "BRL", rate: 0.2, as_of: "2026-10-01" }
    ],
    ledger: [],
    concept_categories: {
      "Servicios de desarrollo": "servicios",
      Soporte: "servicios",
      "Consultoria mensual": "consultoria",
      Suministros: "suministros",
      Licencias: "otros",
      "Cobro pendiente": "otros",
      "Servicios varios": "servicios"
    }
  };
  return { ...base, ...overrides };
}

type InvoiceOverrides = {
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  payee?: Partial<ExtractedInvoice["payee"]>;
  amount?: Partial<ExtractedInvoice["amount"]>;
  concept?: string;
  agreement_ref?: string;
  field_confidence?: Record<string, number>;
  evidence?: ExtractedInvoice["evidence"];
  document_flags?: ExtractedInvoice["document_flags"];
};

export function makeInvoice(overrides: InvoiceOverrides = {}): ExtractedInvoice {
  const base: ExtractedInvoice = {
    invoice_number: "INV-1001",
    issue_date: "2026-10-01",
    due_date: "2026-10-31",
    payee: {
      name: "Proveedor Recurrente S.A.S",
      tax_id: "900123456",
      country: "CO",
      bank_ref: "BANK-001"
    },
    amount: {
      raw: "$4,750.00",
      total: 4750,
      subtotal: 4000,
      tax: 750,
      currency: "USD"
    },
    concept: "Servicios de desarrollo",
    agreement_ref: "agr_001",
    field_confidence: {
      "payee.name": 0.98,
      "amount.total": 0.97,
      "amount.currency": 0.99,
      "issue_date": 0.96
    },
    evidence: {
      "amount.total": { snippet: "Total a pagar: $4,750.00", page: 1 },
      payee: { snippet: "Proveedor Recurrente S.A.S — NIT 900123456", page: 1 }
    },
    document_flags: []
  };
  const mergedAmount: ExtractedInvoice["amount"] = { ...base.amount, ...overrides.amount };
  if (
    overrides.amount?.total !== undefined &&
    overrides.amount.subtotal === undefined &&
    overrides.amount.tax === undefined
  ) {
    mergedAmount.subtotal = undefined;
    mergedAmount.tax = undefined;
  }
  return {
    ...base,
    ...overrides,
    payee: { ...base.payee, ...overrides.payee },
    amount: mergedAmount,
    field_confidence: overrides.field_confidence ?? base.field_confidence,
    evidence: overrides.evidence ?? base.evidence,
    document_flags: overrides.document_flags ?? base.document_flags
  };
}

export interface MakeContextOptions {
  invoice?: ExtractedInvoice;
  company?: CompanyData;
  now?: string;
  fileHash?: string;
  findings?: Finding[];
  approval?: Approval | null;
}

export function makeContext(opts: MakeContextOptions = {}): RuleContext {
  const company = opts.company ?? makeCompany();
  return {
    invoice: opts.invoice ?? makeInvoice(),
    policy: company.policy,
    company,
    now: opts.now ?? NOW,
    fileHash: opts.fileHash ?? "hash_clean_000",
    findings: opts.findings ?? [],
    approval: opts.approval ?? null
  };
}

export function makeApproval(overrides: Partial<Approval> = {}): Approval {
  return {
    approval_id: "apr_1",
    invoice_id: "inv_INV-1001",
    beneficiary_id: "ben_proveedor_001",
    amount_base_usd: 4750,
    actor: "cfo@acme.com",
    comment: "Verificado contra acuerdo",
    approved_at: "2026-10-15T11:00:00.000Z",
    expires_at: "2026-10-16T11:00:00.000Z",
    ...overrides
  };
}
