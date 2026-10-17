import { resolve } from "node:path";
import type {
  Agreement,
  Beneficiary,
  Budget,
  CompanyData,
  ExtractedInvoice,
  LedgerEntry,
  Policy
} from "@agente/schemas";
import { sha256File } from "./fsutil.js";

/* ------------------------------------------------------------------ *
 * Tipos de los archivos oficiales (Acme Labs Inc.)
 * ------------------------------------------------------------------ */

export interface OfficialPolicy {
  policy_version: string;
  policy_status: string;
  company_id: string;
  environment?: string;
  base_currency: string;
  supported_currencies: string[];
  decision_precedence: string[];
  decisions?: Record<string, { label_en: string; label_es: string; meaning: string }>;
  limits: {
    auto_approval_threshold: string;
    hard_cap_per_invoice: string;
    contract_variance_tolerance_pct: string;
    contract_tolerance_symmetric?: boolean;
    min_extraction_confidence: string;
  };
  budgets: {
    period: string;
    general_monthly_limit: string;
    category_monthly_limits: Record<string, string>;
    accounting_model?: Record<string, unknown>;
    supplier_category_to_budget?: Record<string, string>;
  };
  approval_matrix: Array<{ role: string; min_amount_exclusive: string; max_amount_inclusive: string }>;
  execution: { simulation_only: boolean; real_payments_enabled: boolean; money_movement_allowed: boolean };
}

export interface OfficialReference {
  dataset_version: string;
  company: { company_id: string; legal_name: string; fictional?: boolean; base_currency: string };
  suppliers: Array<{
    supplier_id: string;
    name: string;
    category: string;
    budget_category: string;
    contract_ids: string[];
    verification_status: string;
    registered_bank_account: string;
    expected_amount: string;
    currency: string;
  }>;
  contracts: Array<{
    contract_id: string;
    supplier_id: string;
    budget_category: string;
    amount: string;
    currency: string;
    tolerance_pct: string;
    min_allowed: string;
    max_allowed: string;
    valid_from: string;
    valid_to: string;
  }>;
  budgets: Array<{ budget_id: string; scope: string; limit: string; previously_committed: string }>;
}

export interface OfficialInvoice {
  id: string;
  supplier_id: string;
  supplier_name: string;
  invoice_number: string;
  contract_id: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  bank_account: string;
  budget_category: string;
  source_pdf: { path: string; sha256?: string };
}

export interface OfficialInvoices {
  dataset_version: string;
  invoices: OfficialInvoice[];
}

const num = (v: string): number => Number.parseFloat(v);

/* ------------------------------------------------------------------ *
 * Adaptadores oficial -> modelo interno del motor
 * ------------------------------------------------------------------ */

export function buildPolicy(p: OfficialPolicy): Policy {
  return {
    policy_id: p.policy_version,
    base_currency: p.base_currency,
    supported_currencies: p.supported_currencies,
    limits: {
      hard_cap_per_payment: num(p.limits.hard_cap_per_invoice),
      approval_threshold: num(p.limits.auto_approval_threshold),
      period: { type: "month", limit: num(p.budgets.general_monthly_limit) }
    },
    extraction: { min_field_confidence: num(p.limits.min_extraction_confidence) },
    agreement_tolerance_pct: num(p.limits.contract_variance_tolerance_pct),
    duplicate_window_days: 30,
    approvals_matrix: p.approval_matrix.map((t) => ({ up_to: num(t.max_amount_inclusive), role: t.role }))
  };
}

function beneficiariesFrom(ref: OfficialReference): Beneficiary[] {
  return ref.suppliers.map((s) => ({
    id: s.supplier_id,
    name: s.name,
    bank_ref: s.registered_bank_account,
    allowed: s.verification_status === "verified",
    categories: [s.budget_category]
  }));
}

function agreementsFrom(ref: OfficialReference): Agreement[] {
  return ref.contracts.map((c) => ({
    id: c.contract_id,
    beneficiary_id: c.supplier_id,
    concept: c.budget_category,
    amount: num(c.amount),
    currency: c.currency,
    valid_from: c.valid_from,
    valid_to: c.valid_to,
    scope_concepts: [c.budget_category],
    category: c.budget_category
  }));
}

function budgetsFrom(ref: OfficialReference, policy: OfficialPolicy): Budget[] {
  return ref.budgets.map((b) => ({
    category: b.scope,
    period: policy.budgets.period,
    limit: num(b.limit),
    spent: num(b.previously_committed)
  }));
}

/** Asiento de apertura: compromiso previo general del periodo (no es una factura). */
function openingLedgerEntry(policy: OfficialPolicy): LedgerEntry {
  return {
    invoice_id: "OPENING",
    beneficiary_id: "__opening__",
    beneficiary_name: "__opening__",
    invoice_number: null,
    concept: "__opening__",
    amount_base_usd: 40000,
    file_hash: "",
    date: `${policy.budgets.period}-01`,
    decision: "PAGAR"
  };
}

export function buildCompany(policy: OfficialPolicy, ref: OfficialReference): CompanyData {
  const conceptCategories: Record<string, string> = {};
  for (const b of ref.budgets) conceptCategories[b.scope] = b.scope;

  return {
    policy: buildPolicy(policy),
    beneficiaries: beneficiariesFrom(ref),
    agreements: agreementsFrom(ref),
    budgets: budgetsFrom(ref, policy),
    fx_rates: [],
    ledger: [openingLedgerEntry(policy)],
    concept_categories: conceptCategories
  };
}

export function invoiceToExtracted(inv: OfficialInvoice, fileHash: string): ExtractedInvoice {
  void fileHash;
  return {
    invoice_number: inv.invoice_number,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    payee: {
      name: inv.supplier_name,
      bank_ref: inv.bank_account
    },
    amount: {
      raw: `${inv.total} ${inv.currency}`,
      total: num(inv.total),
      subtotal: num(inv.subtotal),
      tax: num(inv.tax),
      currency: inv.currency
    },
    concept: inv.budget_category,
    agreement_ref: inv.contract_id,
    field_confidence: {
      "payee.name": 0.99,
      "amount.total": 0.99,
      "amount.currency": 0.99,
      "issue_date": 0.99
    },
    evidence: {
      "amount.total": { snippet: `Total: ${inv.total} ${inv.currency}`, page: 1 },
      payee: { snippet: `${inv.supplier_name} — cuenta ${inv.bank_account}`, page: 1 }
    },
    document_flags: []
  };
}

/** Hash real del PDF en disco (independiente de lo escrito en el JSON). */
export function pdfFileHash(inv: OfficialInvoice): string {
  return sha256File(resolve(process.cwd(), inv.source_pdf.path));
}
