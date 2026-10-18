import { decide } from "@agente/engine";
import type { DecisionOutcome, RuleContext } from "@agente/engine";
import { createGuardian, DEV_FALLBACK_SECRET } from "@agente/guardian";
import type { Guardian, GuardianAlert } from "@agente/guardian";
import { Decimal, canonicalize, sha256Hex } from "@agente/schemas";
import type { Approval, ExtractedInvoice, LedgerEntry, PaymentAuthorization } from "@agente/schemas";
import { buildCompany, invoiceToExtracted, pdfFileHash } from "./adapters.js";
import type { OfficialInvoice, OfficialInvoices, OfficialPolicy, OfficialReference } from "./adapters.js";
import { businessCopy, UI_COPY } from "./copy.js";
import type { BusinessCopy } from "./copy.js";
import { loadJson } from "./fsutil.js";
import { detectKind, extractInvoice, sha256Bytes, sha256Text } from "./ingest.js";
import type { ExtractContext, IngestKind, SupplierRef } from "./ingest.js";
import {
  allowedRolesFor,
  approverRoleFor,
  reasonCodesFor,
  simulationAllowed,
  statusFor,
  toOfficialDecision
} from "./mapping.js";
import type { OfficialDecision, OfficialStatus } from "./mapping.js";
import { computeMetrics } from "./metrics.js";
import type { Metrics, ProcessedResult } from "./metrics.js";

export const DEFAULT_NOW = "2026-10-15T12:00:00.000Z";
/** Caducidad de una aprobacion humana: 72 h (documento maestro §11). */
const APPROVAL_TTL_MS = 72 * 3_600_000;
/** Primera secuencia para facturas subidas (INV-004 en adelante). */
const FIRST_INGESTED_SEQ = 4;

interface ExpectedEntry {
  invoice_id: string;
  expected_decision: OfficialDecision;
  expected_status: string;
  expected_reason_codes: string[];
  required_approver_role?: string;
  duplicate_of?: string;
  simulation_allowed: boolean;
}
interface ExpectedFile {
  dataset_version?: string;
  processing_order: string[];
  results: ExpectedEntry[];
}

export interface RuleTrace {
  id: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  onFail: string;
  waivable: boolean;
  evidence: string;
}

export interface GuardianView {
  verified: boolean;
  mismatch: boolean;
  signature: string | null;
  alerts: GuardianAlert[];
}

export interface AmountView {
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  baseUsd: string;
  fxRate: number | null;
}

export interface ApprovalRecordView {
  approvalId: string;
  actor: string;
  comment: string;
  status: "APPROVED_FOR_SIMULATION" | "REJECTED";
  at: string;
  signature: string | null;
}

export interface DecisionView {
  invoiceId: string;
  decisionId: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  contractId: string;
  category: string;
  budgetCategory: string;
  issueDate: string;
  dueDate: string;
  bankAccount: string;
  sourcePdf: { path: string; sha256: string; jsonSha256: string | null; hashConsistent: boolean };
  origin: "demo" | "ingested";
  fileName: string | null;
  decision: OfficialDecision;
  status: OfficialStatus;
  reasonCodes: string[];
  primaryReason: string;
  approverRole: string | null;
  allowedRoles: string[];
  simulationAllowed: boolean;
  permanentlyBlocked: boolean;
  duplicateOf: string | null;
  amounts: AmountView;
  headline: string;
  reasons: { rule: string; text: string }[];
  business: BusinessCopy;
  rules: RuleTrace[];
  guardian: GuardianView;
  approval: ApprovalRecordView | null;
  expected: ExpectedEntry | null;
  matchesOracle: boolean;
}

export interface RunResult {
  generatedAt: string;
  now: string;
  policyVersion: string;
  policyStatus: string;
  companyId: string;
  legalName: string;
  baseCurrency: string;
  execution: { simulationOnly: boolean; realPaymentsEnabled: boolean; moneyMovementAllowed: boolean };
  processingOrder: string[];
  counts: { total: number; PAY: number; ESCALATE: number; BLOCK: number };
  decisions: DecisionView[];
  metrics: Metrics;
  unsafePayments: number;
  allMatchOracle: boolean;
}

export type ApprovalErrorCode =
  | "NOT_FOUND"
  | "NOT_ESCALATABLE"
  | "MISSING_FIELDS"
  | "COMMENT_TOO_SHORT"
  | "ROLE_NOT_AUTHORIZED"
  | "GUARDIAN_MISMATCH";

export type ApproveResult =
  | { ok: true; decision: DecisionView; message: string }
  | { ok: false; code: ApprovalErrorCode; message: string; alerts?: GuardianAlert[] };

/** Motivos de rechazo de una ingesta. */
export type IngestErrorCode = "DUPLICATE_CONFIRMED" | "MISSING_INPUT";

export type IngestResult =
  | { ok: true; id: string; decision: DecisionView; run: RunResult }
  | { ok: false; code: "DUPLICATE_CONFIRMED"; duplicateOf: string; message: string }
  | { ok: false; code: "MISSING_INPUT"; message: string };

export interface IngestInput {
  fileName?: string;
  mime?: string;
  bytes?: Buffer;
  text?: string;
  /** Categoria presupuestal elegida por la persona. */
  category?: string;
}

export interface Pipeline {
  getRun(): RunResult;
  getDecision(invoiceId: string): DecisionView | undefined;
  getLastRun(): RunResult;
  approve(invoiceId: string, role: string | undefined, comment: string | undefined): ApproveResult;
  reject(invoiceId: string, comment: string | undefined): ApproveResult;
  getMetrics(): Metrics;
  ingest(input: IngestInput): IngestResult;
  reset(): RunResult;
  /** Politica oficial y su traduccion al modelo del motor. */
  getPolicy(): { official: OfficialPolicy; engine: ReturnType<typeof buildCompany>["policy"] };
  /** Cola de aprobacion humana: decisiones escaladas pendientes. */
  getApprovals(): DecisionView[];
  /** Re-ejecuta la decision con los insumos guardados (prueba de determinismo). */
  replayDecision(invoiceId: string): ReplayResult | null;
  /** Cadena de auditoria encadenada por hash y su verificacion. */
  getAudit(): AuditReport;
}

export interface PipelineOptions {
  now?: string;
  guardianSecret?: string;
  /** Reconstruye el estado desde cero en cada getRun (por defecto cachea). */
  reloadOnEachRun?: boolean;
  policyPath?: string;
  referencePath?: string;
  invoicesPath?: string;
  expectedPath?: string;
}

const ERROR_MESSAGE: Record<ApprovalErrorCode, string> = {
  NOT_FOUND: UI_COPY.errors.notFound,
  NOT_ESCALATABLE: UI_COPY.errors.notEscalatable,
  MISSING_FIELDS: UI_COPY.errors.missingFields,
  COMMENT_TOO_SHORT: UI_COPY.errors.commentTooShort,
  ROLE_NOT_AUTHORIZED: UI_COPY.errors.roleNotAuthorized,
  GUARDIAN_MISMATCH: UI_COPY.errors.guardianMismatch
};

const fail = (code: ApprovalErrorCode, alerts?: GuardianAlert[]): ApproveResult => ({
  ok: false,
  code,
  message: ERROR_MESSAGE[code],
  ...(alerts ? { alerts } : {})
});

const sameCodes = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

/** Registro normalizado: unifica facturas oficiales (demo) y subidas por el usuario. */
interface SessionRecord {
  id: string;
  origin: "demo" | "ingested";
  extracted: ExtractedInvoice;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  contractId: string;
  category: string;
  issueDate: string;
  dueDate: string;
  bankAccount: string;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  fileHash: string;
  pdfPath: string;
  jsonSha256: string | null;
  fileName: string | null;
}

type StoredApproval =
  | { kind: "approved"; approval: Approval; authorization: PaymentAuthorization }
  | { kind: "rejected"; comment: string; at: string };

/** Evento de la cadena de auditoria encadenada por hash (documento §10). */
export interface AuditEvent {
  seq: number;
  kind: "decision" | "approval" | "rejection";
  invoiceId: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export interface AuditReport {
  valid: boolean;
  checked: number;
  brokenAt: number | null;
  events: AuditEvent[];
}

export interface ReplayResult {
  ok: true;
  invoiceId: string;
  /** true si la re-ejecucion produce exactamente la misma decision y traza. */
  deterministic: boolean;
  original: { decision: OfficialDecision; contextSnapshotHash: string };
  replayed: { decision: OfficialDecision; contextSnapshotHash: string };
}

const AUDIT_GENESIS = "GENESIS";

function auditHash(prevHash: string, payload: Record<string, unknown>): string {
  return sha256Hex(prevHash + canonicalize(payload));
}

/**
 * Crea el pipeline completo: carga datos oficiales, procesa las facturas en orden,
 * aplica el guardian y expone decisiones + metricas + flujo de aprobacion humana.
 * Mantiene una sesion mutable (ingesta/borrado/reset) que se recalcula de forma
 * determinista: mismo `now` y mismo conjunto de facturas => mismas decisiones.
 */
export function createPipeline(options: PipelineOptions = {}): Pipeline {
  const now = options.now ?? DEFAULT_NOW;
  const policyPath = options.policyPath ?? "config/company_policy.json";
  const referencePath = options.referencePath ?? "data/reference_data.json";
  const invoicesPath = options.invoicesPath ?? "data/invoices.json";
  const expectedPath = options.expectedPath ?? "tests/expected_results.json";

  const officialPolicy = loadJson<OfficialPolicy>(policyPath);
  const reference = loadJson<OfficialReference>(referencePath);
  const invoicesFile = loadJson<OfficialInvoices>(invoicesPath);

  let expectedFile: ExpectedFile | null = null;
  try {
    expectedFile = loadJson<ExpectedFile>(expectedPath);
  } catch {
    expectedFile = null;
  }

  const guardian: Guardian = createGuardian({
    secret: options.guardianSecret ?? process.env.GUARDIAN_HMAC_SECRET ?? DEV_FALLBACK_SECRET
  });

  const suppliers: readonly SupplierRef[] = reference.suppliers.map((s) => ({
    supplier_id: s.supplier_id,
    name: s.name,
    registered_bank_account: s.registered_bank_account,
    budget_category: s.budget_category
  }));

  const expectedById = new Map<string, ExpectedEntry>((expectedFile?.results ?? []).map((e) => [e.invoice_id, e]));
  const demoOrder = expectedFile?.processing_order ?? invoicesFile.invoices.map((i) => i.id);

  // ---- Estado de la sesion (mutable) ----
  const records = new Map<string, SessionRecord>();
  const order: string[] = [];
  const approvalsById = new Map<string, StoredApproval>();
  let nextSeq = FIRST_INGESTED_SEQ;

  const decisionViews = new Map<string, DecisionView>();
  const outcomes = new Map<string, DecisionOutcome>();
  const invoiceMap = new Map<string, SessionRecord>();
  let companyRef: ReturnType<typeof buildCompany>;
  let auditEvents: AuditEvent[] = [];
  let run: RunResult | undefined;
  let dirty = true;

  function recordFromOfficial(inv: OfficialInvoice): SessionRecord {
    const fileHash = pdfFileHash(inv);
    const extracted = invoiceToExtracted(inv, fileHash);
    return {
      id: inv.id,
      origin: "demo",
      extracted,
      supplierId: inv.supplier_id,
      supplierName: inv.supplier_name,
      invoiceNumber: inv.invoice_number,
      contractId: inv.contract_id,
      category: inv.budget_category,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
      bankAccount: inv.bank_account,
      currency: inv.currency,
      subtotal: inv.subtotal,
      tax: inv.tax,
      total: inv.total,
      fileHash,
      pdfPath: inv.source_pdf.path,
      jsonSha256: inv.source_pdf.sha256 ?? null,
      fileName: null
    };
  }

  function loadDemo(): void {
    records.clear();
    order.length = 0;
    approvalsById.clear();
    nextSeq = FIRST_INGESTED_SEQ;
    const officialById = new Map(invoicesFile.invoices.map((i) => [i.id, i]));
    for (const id of demoOrder) {
      const inv = officialById.get(id);
      if (!inv) throw new Error(`Factura oficial no encontrada: ${id}`);
      records.set(id, recordFromOfficial(inv));
      order.push(id);
    }
    dirty = true;
  }

  loadDemo();

  function resolveSupplierId(name: string): string {
    const match = suppliers.find((s) => s.name.toLowerCase() === name.toLowerCase());
    return match ? match.supplier_id : "";
  }

  function findDuplicate(rec: { fileHash: string; invoiceNumber: string; supplierName: string; total: string }): SessionRecord | undefined {
    for (const id of order) {
      const existing = records.get(id)!;
      // Un registro ya FRENADO o RECHAZADO no bloquea un reenvio corregido:
      // el documento §11 exige corregir en origen y reenviar como version nueva.
      const prior = decisionViews.get(id);
      if (prior && (prior.decision === "BLOCK" || prior.status === "REJECTED")) continue;
      if (existing.fileHash === rec.fileHash) return existing;
      if (
        rec.invoiceNumber &&
        existing.invoiceNumber &&
        existing.invoiceNumber.toLowerCase() === rec.invoiceNumber.toLowerCase() &&
        (!rec.supplierName ||
          !existing.supplierName ||
          existing.supplierName.toLowerCase() === rec.supplierName.toLowerCase())
      ) {
        return existing;
      }
      if (
        !rec.invoiceNumber &&
        rec.supplierName &&
        rec.total &&
        existing.supplierName.toLowerCase() === rec.supplierName.toLowerCase() &&
        existing.total === rec.total
      ) {
        return existing;
      }
    }
    return undefined;
  }

  function build(): RunResult {
    decisionViews.clear();
    outcomes.clear();
    invoiceMap.clear();
    auditEvents = [];

    const company = buildCompany(officialPolicy, reference);
    const decisions: DecisionView[] = [];
    const processed: ProcessedResult[] = [];
    let prevHash = AUDIT_GENESIS;
    const pushAudit = (kind: AuditEvent["kind"], invoiceId: string, payload: Record<string, unknown>): void => {
      const hash = auditHash(prevHash, payload);
      auditEvents.push({ seq: auditEvents.length + 1, kind, invoiceId, payload, prevHash, hash });
      prevHash = hash;
    };

    for (const id of order) {
      const rec = records.get(id);
      if (!rec) continue;

      const fileHash = rec.fileHash;
      const jsonSha256 = rec.jsonSha256;
      const hashConsistent = jsonSha256 === null || jsonSha256 === fileHash;

      const ctx: RuleContext = {
        invoice: rec.extracted,
        policy: company.policy,
        company,
        now,
        fileHash,
        findings: [],
        approval: null
      };

      const outcome = decide(ctx);

      // Guardian: para PAY (o aprobaciones almacenadas) emite autorizacion firmada.
      // La decision EFECTIVA es la que devuelve el guardian, no la del motor:
      // si el guardian degrada (GUARDIAN_MISMATCH), la vista jamas muestra PAY.
      const stored = approvalsById.get(id);
      const guardApproval = stored && stored.kind === "approved" ? stored.approval : null;
      const guardOutcome: DecisionOutcome =
        guardApproval ? { ...outcome, decision: "PAGAR" } : outcome;
      const guarded = guardian.guard({
        decision_id: `dec_${id}`,
        outcome: guardOutcome,
        policy: company.policy,
        extractionValidated: true,
        approval: guardApproval,
        beneficiary_id: rec.supplierId,
        origin: guardApproval ? "approval" : "engine",
        now
      });

      const decision = toOfficialDecision(guardApproval ? outcome.decision : guarded.decision);
      const reasonCodes = reasonCodesFor(outcome.rules);
      const approver = decision === "ESCALATE" ? approverRoleFor(Number(outcome.amounts.base_usd), company.policy) : null;
      const sim = simulationAllowed(decision);
      const allowedRoles =
        decision === "ESCALATE"
          ? allowedRolesFor(Number(outcome.amounts.base_usd), officialPolicy.approval_matrix)
          : [];

      const priorDuplicate = rec.invoiceNumber
        ? company.ledger.find((e) => e.invoice_number === rec.invoiceNumber && e.beneficiary_id === rec.supplierId)
        : undefined;
      const duplicateOf = decision === "BLOCK" && priorDuplicate ? priorDuplicate.invoice_id : null;

      const permanentlyBlocked = decision === "BLOCK" && outcome.rules.some((r) => !r.waivable && r.status !== "PASS");
      const primaryReason = reasonCodes[0] ?? "ALL_CHECKS_PASSED";

      const expected = expectedById.get(id) ?? null;
      const matchesOracle =
        !!expected &&
        decision === expected.expected_decision &&
        statusFor(decision) === expected.expected_status &&
        sameCodes(reasonCodes, expected.expected_reason_codes) &&
        sim === expected.simulation_allowed &&
        (!expected.required_approver_role || approver === expected.required_approver_role);

      const view: DecisionView = {
        invoiceId: id,
        decisionId: `dec_${id}`,
        supplierId: rec.supplierId,
        supplierName: rec.supplierName,
        invoiceNumber: rec.invoiceNumber,
        contractId: rec.contractId,
        category: rec.category,
        budgetCategory: rec.category,
        issueDate: rec.issueDate,
        dueDate: rec.dueDate,
        bankAccount: rec.bankAccount,
        sourcePdf: { path: rec.pdfPath, sha256: fileHash, jsonSha256, hashConsistent },
        origin: rec.origin,
        fileName: rec.fileName,
        decision,
        status: statusFor(decision),
        reasonCodes,
        primaryReason,
        approverRole: approver,
        allowedRoles,
        simulationAllowed: sim,
        permanentlyBlocked,
        duplicateOf,
        amounts: {
          currency: rec.currency,
          subtotal: rec.subtotal,
          tax: rec.tax,
          total: rec.total,
          baseUsd: outcome.amounts.base_usd,
          fxRate: outcome.amounts.fx_rate
        },
        headline: outcome.headline,
        reasons: outcome.reasons.map((r) => ({ rule: r.rule, text: r.text })),
        business: businessCopy(primaryReason, duplicateOf),
        rules: outcome.rules.map((r) => ({
          id: r.id,
          status: r.status,
          onFail: r.on_fail,
          waivable: r.waivable,
          evidence: r.evidence
        })),
        guardian: {
          verified: guarded.verified,
          mismatch: guarded.mismatch,
          signature: guarded.authorization?.signature ?? null,
          alerts: guarded.alerts
        },
        approval: null,
        expected,
        matchesOracle
      };

      // Replay de aprobaciones humanas almacenadas (se conservan entre recalculos).
      // La firma mostrada es la de la autorizacion ORIGINAL emitida al aprobar:
      // re-verificar no re-emite una autorizacion distinta en cada recalculo.
      if (stored) {
        if (stored.kind === "approved" && guarded.verified) {
          const authorization = stored.authorization;
          view.status = "APPROVED_FOR_SIMULATION";
          view.simulationAllowed = true;
          view.guardian = {
            verified: true,
            mismatch: false,
            signature: authorization.signature,
            alerts: []
          };
          view.approval = {
            approvalId: stored.approval.approval_id,
            actor: stored.approval.actor,
            comment: stored.approval.comment,
            status: "APPROVED_FOR_SIMULATION",
            at: stored.approval.approved_at,
            signature: authorization.signature
          };
          company.ledger.push({
            invoice_id: id,
            beneficiary_id: rec.supplierId,
            beneficiary_name: rec.supplierName,
            invoice_number: rec.invoiceNumber || null,
            concept: rec.category,
            amount_base_usd: Number(outcome.amounts.base_usd),
            file_hash: fileHash,
            date: rec.issueDate,
            decision: "PAGAR"
          });
        } else if (stored.kind === "rejected") {
          view.status = "REJECTED";
          view.simulationAllowed = false;
          view.approval = {
            approvalId: `rej_${id}`,
            actor: "human",
            comment: stored.comment,
            status: "REJECTED",
            at: stored.at,
            signature: null
          };
        }
      }

      if (decision === "PAY" && guarded.verified && !stored) {
        const entry: LedgerEntry = {
          invoice_id: id,
          beneficiary_id: rec.supplierId,
          beneficiary_name: rec.supplierName,
          invoice_number: rec.invoiceNumber || null,
          concept: rec.category,
          amount_base_usd: Number(outcome.amounts.base_usd),
          file_hash: fileHash,
          date: rec.issueDate,
          decision: outcome.decision
        };
        company.ledger.push(entry);
      }

      decisionViews.set(id, view);
      outcomes.set(id, outcome);
      invoiceMap.set(id, rec);
      decisions.push(view);
      processed.push({ invoice_id: id, decision, expected: expected?.expected_decision ?? null });

      // Cadena de auditoria (solo anexar): cada decision queda encadenada.
      pushAudit("decision", id, {
        decision_id: view.decisionId,
        invoice_id: id,
        decision: view.decision,
        status: view.status,
        reason_codes: view.reasonCodes,
        policy_version: officialPolicy.policy_version,
        context_snapshot_hash: outcome.context_snapshot_hash,
        guardian_signature: view.guardian.signature
      });
      if (stored?.kind === "approved" && view.approval) {
        pushAudit("approval", id, {
          approval_id: view.approval.approvalId,
          invoice_id: id,
          actor: view.approval.actor,
          status: view.approval.status,
          at: view.approval.at,
          signature: view.approval.signature
        });
      } else if (stored?.kind === "rejected" && view.approval) {
        pushAudit("rejection", id, {
          approval_id: view.approval.approvalId,
          invoice_id: id,
          comment: stored.comment,
          at: stored.at
        });
      }
    }

    companyRef = company;

    const metrics = computeMetrics(processed);
    const result: RunResult = {
      generatedAt: new Date().toISOString(),
      now,
      policyVersion: officialPolicy.policy_version,
      policyStatus: officialPolicy.policy_status,
      companyId: officialPolicy.company_id,
      legalName: reference.company.legal_name,
      baseCurrency: officialPolicy.base_currency,
      execution: {
        simulationOnly: officialPolicy.execution.simulation_only,
        realPaymentsEnabled: officialPolicy.execution.real_payments_enabled,
        moneyMovementAllowed: officialPolicy.execution.money_movement_allowed
      },
      processingOrder: [...order],
      counts: {
        total: decisions.length,
        PAY: decisions.filter((d) => d.decision === "PAY").length,
        ESCALATE: decisions.filter((d) => d.decision === "ESCALATE").length,
        BLOCK: decisions.filter((d) => d.decision === "BLOCK").length
      },
      decisions,
      metrics,
      unsafePayments: metrics.M2.value,
      allMatchOracle: decisions.every((d) => d.matchesOracle)
    };

    return result;
  }

  const ensure = (): RunResult => {
    if (options.reloadOnEachRun || dirty || !run) {
      run = build();
      dirty = false;
    }
    return run;
  };

  function approve(invoiceId: string, role: string | undefined, comment: string | undefined): ApproveResult {
    ensure();
    const view = decisionViews.get(invoiceId);
    const inv = invoiceMap.get(invoiceId);
    const outcome = outcomes.get(invoiceId);
    if (!view || !inv || !outcome) return fail("NOT_FOUND");
    // Una factura ya resuelta (aprobada o rechazada) no admite una segunda
    // resolucion: evita doble firma, doble asiento y doble gasto.
    if (approvalsById.has(invoiceId)) return fail("NOT_ESCALATABLE");
    if (view.decision !== "ESCALATE" || view.status === "APPROVED_FOR_SIMULATION" || view.status === "REJECTED") {
      return fail("NOT_ESCALATABLE");
    }

    const trimmed = (comment ?? "").trim();
    if (!role || trimmed.length === 0) return fail("MISSING_FIELDS");
    if (trimmed.length < 5) return fail("COMMENT_TOO_SHORT");
    if (!view.allowedRoles.includes(role)) return fail("ROLE_NOT_AUTHORIZED");

    // Re-evaluacion al aprobar (documento §11): el motor y el guardian vuelven a
    // verificar contra el CONTEXTO ACTUAL (libro, presupuesto, duplicados), no
    // contra el resultado cacheado de cuando la factura se escalo.
    const freshOutcome = decide({
      invoice: inv.extracted,
      policy: companyRef.policy,
      company: companyRef,
      now,
      fileHash: inv.fileHash,
      findings: [],
      approval: null
    });

    const approvedAt = new Date(Date.parse(now)).toISOString();
    const expiresAt = new Date(Date.parse(now) + APPROVAL_TTL_MS).toISOString();
    const approval: Approval = {
      approval_id: `apr_${invoiceId}_${role.replace(/\s+/g, "_").toLowerCase()}`,
      invoice_id: freshOutcome.invoice_id,
      beneficiary_id: inv.supplierId,
      amount_base_usd: Number(freshOutcome.amounts.base_usd),
      actor: role,
      comment: trimmed,
      approved_at: approvedAt,
      expires_at: expiresAt
    };

    const postApproval: DecisionOutcome = { ...freshOutcome, decision: "PAGAR" };
    const guarded = guardian.guard({
      decision_id: `dec_${invoiceId}_approved`,
      outcome: postApproval,
      policy: companyRef.policy,
      extractionValidated: true,
      approval,
      beneficiary_id: inv.supplierId,
      origin: "approval",
      now
    });

    if (!guarded.verified || !guarded.authorization) {
      return fail("GUARDIAN_MISMATCH", guarded.alerts);
    }

    approvalsById.set(invoiceId, { kind: "approved", approval, authorization: guarded.authorization });

    // Recalculo determinista: la decision ya aprobada vuelve a pasar por motor y
    // guardian con el libro actualizado (que ahora incluye este compromiso).
    dirty = true;
    const refreshedRun = ensure();
    const refreshed = decisionViews.get(invoiceId) ?? refreshedRun.decisions.find((d) => d.invoiceId === invoiceId) ?? view;

    return {
      ok: true,
      decision: refreshed,
      message: UI_COPY.approval.approvedToast.replace("{role}", role)
    };
  }

  function reject(invoiceId: string, comment: string | undefined): ApproveResult {
    ensure();
    const view = decisionViews.get(invoiceId);
    if (!view) return fail("NOT_FOUND");
    if (approvalsById.has(invoiceId)) return fail("NOT_ESCALATABLE");
    if (view.decision !== "ESCALATE" || view.status === "APPROVED_FOR_SIMULATION" || view.status === "REJECTED") {
      return fail("NOT_ESCALATABLE");
    }

    const trimmed = (comment ?? "").trim();
    if (trimmed.length === 0) return fail("MISSING_FIELDS");
    if (trimmed.length < 5) return fail("COMMENT_TOO_SHORT");

    const at = new Date(Date.parse(now)).toISOString();
    approvalsById.set(invoiceId, { kind: "rejected", comment: trimmed, at });

    dirty = true;
    ensure();
    const refreshed = decisionViews.get(invoiceId) ?? view;

    return { ok: true, decision: refreshed, message: UI_COPY.approval.rejectedToast };
  }

  function ingest(input: IngestInput): IngestResult {
    const hasBytes = !!input.bytes && input.bytes.length > 0;
    const text = (input.text ?? "").trim();
    if (!hasBytes && text.length === 0) {
      return { ok: false, code: "MISSING_INPUT", message: UI_COPY.ingest.missingInput };
    }

    const kind: IngestKind = hasBytes
      ? detectKind(input.fileName, input.mime, input.bytes!)
      : "text";
    const category = (input.category ?? "").trim();

    const extractContext: ExtractContext = { category, suppliers };
    const extraction = extractInvoice(
      kind === "text" ? { kind, text } : { kind, bytes: input.bytes!, fileName: input.fileName },
      extractContext
    );

    const fileHash = kind === "text" ? sha256Text(text) : sha256Bytes(input.bytes!);
    const invoice = extraction.invoice;
    const supplierName = invoice.payee.name ?? "";
    const total = invoice.amount.total == null ? "" : String(invoice.amount.total);

    const duplicate = findDuplicate({
      fileHash,
      invoiceNumber: invoice.invoice_number ?? "",
      supplierName,
      total
    });
    if (duplicate) {
      return {
        ok: false,
        code: "DUPLICATE_CONFIRMED",
        duplicateOf: duplicate.id,
        message: UI_COPY.ingest.duplicate.replace("{id}", duplicate.id)
      };
    }

    const id = `INV-${String(nextSeq).padStart(3, "0")}`;
    nextSeq += 1;

    const record: SessionRecord = {
      id,
      origin: "ingested",
      extracted: invoice,
      supplierId: resolveSupplierId(supplierName),
      supplierName,
      invoiceNumber: invoice.invoice_number ?? "",
      contractId: invoice.agreement_ref ?? "",
      category: invoice.concept || category,
      issueDate: invoice.issue_date ?? "",
      dueDate: invoice.due_date ?? "",
      bankAccount: invoice.payee.bank_ref ?? "",
      currency: invoice.amount.currency ?? "",
      subtotal: invoice.amount.subtotal == null ? "" : String(invoice.amount.subtotal),
      tax: invoice.amount.tax == null ? "" : String(invoice.amount.tax),
      total,
      fileHash,
      pdfPath: `uploads/${input.fileName ?? `${id}.${kind}`}`,
      jsonSha256: null,
      fileName: input.fileName ?? null
    };

    records.set(id, record);
    order.push(id);
    dirty = true;

    const nextRun = ensure();
    const decision = decisionViews.get(id)!;
    return { ok: true, id, decision, run: nextRun };
  }

  function reset(): RunResult {
    loadDemo();
    return ensure();
  }

  /** Contexto del motor para un registro sobre un estado de empresa dado. */
  function ctxFor(rec: SessionRecord, company: ReturnType<typeof buildCompany>): RuleContext {
    return {
      invoice: rec.extracted,
      policy: company.policy,
      company,
      now,
      fileHash: rec.fileHash,
      findings: [],
      approval: null
    };
  }

  /** Asiento de compromiso identico al que produce build() para un pago. */
  function commitLedgerEntry(company: ReturnType<typeof buildCompany>, rec: SessionRecord, outcome: DecisionOutcome): void {
    company.ledger.push({
      invoice_id: rec.id,
      beneficiary_id: rec.supplierId,
      beneficiary_name: rec.supplierName,
      invoice_number: rec.invoiceNumber || null,
      concept: rec.category,
      amount_base_usd: Number(outcome.amounts.base_usd),
      file_hash: rec.fileHash,
      date: rec.issueDate,
      decision: "PAGAR"
    });
  }

  /**
   * Replay determinista: reconstruye el contexto en el que se decidio la factura
   * (aplicando los compromisos de todas las anteriores en el orden de proceso) y
   * vuelve a ejecutar el motor. Debe producir exactamente la misma decision.
   */
  function replayDecision(invoiceId: string): ReplayResult | null {
    ensure();
    const target = invoiceMap.get(invoiceId);
    const original = outcomes.get(invoiceId);
    const originalView = decisionViews.get(invoiceId);
    if (!target || !original || !originalView) return null;

    const company = buildCompany(officialPolicy, reference);
    for (const id of order) {
      if (id === invoiceId) break;
      const rec = records.get(id);
      if (!rec) continue;
      const outcome = decide(ctxFor(rec, company));
      const stored = approvalsById.get(id);
      if (stored?.kind === "approved") {
        const verified = guardian.guard({
          decision_id: `dec_${id}`,
          outcome: { ...outcome, decision: "PAGAR" },
          policy: company.policy,
          extractionValidated: true,
          approval: stored.approval,
          beneficiary_id: rec.supplierId,
          origin: "approval",
          now
        }).verified;
        if (verified) commitLedgerEntry(company, rec, outcome);
      } else if (outcome.decision === "PAGAR") {
        commitLedgerEntry(company, rec, outcome);
      }
    }

    const replayed = decide(ctxFor(target, company));
    const deterministic =
      replayed.decision === original.decision &&
      replayed.context_snapshot_hash === original.context_snapshot_hash &&
      JSON.stringify(replayed.rules) === JSON.stringify(original.rules);

    return {
      ok: true,
      invoiceId,
      deterministic,
      original: {
        decision: toOfficialDecision(original.decision),
        contextSnapshotHash: original.context_snapshot_hash
      },
      replayed: {
        decision: toOfficialDecision(replayed.decision),
        contextSnapshotHash: replayed.context_snapshot_hash
      }
    };
  }

  function getAudit(): AuditReport {
    ensure();
    let prevHash = AUDIT_GENESIS;
    let brokenAt: number | null = null;
    for (const event of auditEvents) {
      const expected = auditHash(prevHash, event.payload);
      if (event.prevHash !== prevHash || event.hash !== expected) {
        brokenAt = event.seq;
        break;
      }
      prevHash = event.hash;
    }
    return { valid: brokenAt === null, checked: auditEvents.length, brokenAt, events: auditEvents };
  }

  return {
    getRun: () => ensure(),
    getLastRun: () => ensure(),
    getDecision: (invoiceId: string) => {
      ensure();
      return decisionViews.get(invoiceId);
    },
    approve,
    reject,
    getMetrics: () => ensure().metrics,
    ingest,
    reset,
    getPolicy: () => ({ official: officialPolicy, engine: buildCompany(officialPolicy, reference).policy }),
    getApprovals: () => {
      ensure();
      return [...decisionViews.values()].filter(
        (d) => d.decision === "ESCALATE" && d.status === "PENDING_HUMAN_APPROVAL"
      );
    },
    replayDecision,
    getAudit
  };
}

/** Ejecuta el pipeline una sola vez y devuelve el resultado (para CLI/benchmark). */
export function runPipeline(options: PipelineOptions = {}): RunResult {
  const pipeline = createPipeline({ ...options, reloadOnEachRun: true });
  return pipeline.getRun();
}

/** Prueba de sanidad: el invariante M2 nunca puede ser distinto de cero. */
export function assertNoUnsafePayments(result: RunResult): void {
  if (!new Decimal(result.unsafePayments).eq(0)) {
    throw new Error(`INVARIANTE VIOLADO: pagos inseguros (M2) = ${result.unsafePayments}`);
  }
}
