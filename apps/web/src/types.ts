export type OfficialDecision = "PAY" | "ESCALATE" | "BLOCK";

export type OfficialStatus =
  | "SIMULATION_ELIGIBLE"
  | "PENDING_HUMAN_APPROVAL"
  | "BLOCKED"
  | "REJECTED"
  | "APPROVED_FOR_SIMULATION";

export type Tone = "success" | "warning" | "danger" | "neutral";

export interface GuardianAlert {
  code: string;
  invariant: "I1" | "I2" | "I3" | "I4" | "I5";
  detail: string;
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

export interface BusinessCopy {
  title: string;
  tone: Tone;
  text: string;
}

export interface ExpectedEntry {
  invoice_id: string;
  expected_decision: OfficialDecision;
  expected_status: string;
  expected_reason_codes: string[];
  required_approver_role?: string;
  duplicate_of?: string;
  simulation_allowed: boolean;
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

export interface MetricValue {
  id: string;
  label: string;
  value: number;
  n: number;
}

export interface Metrics {
  M1: MetricValue;
  M2: MetricValue;
  M3: MetricValue;
  M4: MetricValue;
  M5: MetricValue;
  M6: MetricValue;
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

export interface ReasonCopy {
  code: string;
  title: string;
  tone: Tone;
  text: string;
}

export interface UiCopy {
  banner: { title: string; text: string; short: string };
  header: { brand: string; org: string; subtitle: string; motto: string; policyPrefix: string };
  kpis: {
    title: string;
    invariantBadge: string;
    invariantSupport: string;
    noSample: string;
    sampleHint: string;
    descriptions: Record<string, string>;
  };
  dashboard: {
    title: string;
    subtitle: string;
    tabs: Record<string, string>;
    columns: {
      id: string;
      supplier: string;
      number: string;
      category: string;
      amount: string;
      decision: string;
      reason: string;
    };
    empty: string;
    processedLabel: string;
  };
  detail: {
    title: string;
    close: string;
    sections: { verdict: string; business: string; trace: string; signature: string };
    amounts: {
      original: string;
      baseUsd: string;
      fxRate: string;
      subtotal: string;
      tax: string;
      total: string;
      baseFxCaveat: string;
    };
    traceHeaders: { rule: string; status: string; waivable: string; evidence: string };
    signatureOk: string;
    signatureNone: string;
    closingNote: string;
    yes: string;
    no: string;
  };
  approval: {
    title: string;
    description: string;
    roleLabel: string;
    roleOptions: string[];
    commentLabel: string;
    commentPlaceholder: string;
    allowedRolesHint: string;
    approveButton: string;
    rejectButton: string;
    approvedToast: string;
    rejectedToast: string;
    closingNote: string;
  };
  errors: {
    missingFields: string;
    commentTooShort: string;
    roleNotAuthorized: string;
    notEscalatable: string;
    guardianMismatch: string;
    notFound: string;
    network: string;
  };
  sidebar: {
    sectionsLabel: string;
    nav: { kpis: string; invoices: string; inspector: string };
    uploadButton: string;
    resetButton: string;
    resetConfirm: string;
    footer: string;
  };
  ingest: {
    title: string;
    subtitle: string;
    dropzoneTitle: string;
    dropzoneHint: string;
    selectedFile: string;
    pasteLabel: string;
    pastePlaceholder: string;
    categoryLabel: string;
    categoryPlaceholder: string;
    submit: string;
    cancel: string;
    success: string;
    missingInput: string;
    duplicate: string;
    imageBlocked: string;
  };
  engine: { precedence: string; invariantZero: string };
}

export interface CopyBundle {
  reason: Record<string, ReasonCopy>;
  decision: Record<OfficialDecision, { code: OfficialDecision; label: string; meaning: string }>;
  status: Record<OfficialStatus, string>;
  rules: Record<string, { description: string; waivable: boolean }>;
  ui: UiCopy;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  alerts?: GuardianAlert[];
}

export interface IngestRequest {
  fileName?: string;
  mime?: string;
  contentBase64?: string;
  text?: string;
  category?: string;
}

export interface IngestSuccessResponse {
  ok: true;
  id: string;
  decision: DecisionView;
  run: RunResult;
}

export interface IngestErrorResponse {
  ok: false;
  code: "DUPLICATE_CONFIRMED" | "MISSING_INPUT";
  message: string;
  duplicateOf?: string;
}

export interface ResetResponse {
  ok: true;
  run: RunResult;
}
