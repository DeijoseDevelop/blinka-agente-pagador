import type {
  ApiErrorBody,
  CopyBundle,
  DecisionView,
  GuardianAlert,
  IngestRequest,
  IngestSuccessResponse,
  ResetResponse,
  RunResult
} from "./types";

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly alerts?: GuardianAlert[];
  readonly duplicateOf?: string;

  constructor(body: ApiErrorBody & { duplicateOf?: string }, status: number) {
    super(body.message);
    this.name = "ApiRequestError";
    this.code = body.code;
    this.status = status;
    this.alerts = body.alerts;
    this.duplicateOf = body.duplicateOf;
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const headers: HeadersInit = init?.body != null ? { "Content-Type": "application/json" } : {};
    res = await fetch(`${API_BASE}/api${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) }
    });
  } catch {
    throw new ApiRequestError(
      { code: "NETWORK", message: "No fue posible contactar al servicio. Intente nuevamente." },
      0
    );
  }

  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const body = (data as ApiErrorBody | null) ?? { code: "INTERNAL", message: res.statusText || "Error" };
    throw new ApiRequestError(body, res.status);
  }
  return data as T;
}

export const fetchRun = (): Promise<RunResult> => request<RunResult>("/run");

export const fetchCopy = (): Promise<CopyBundle> => request<CopyBundle>("/copy");

export interface ApprovalResponse {
  ok: true;
  message: string;
  decision: DecisionView;
}

export const approveInvoice = (invoiceId: string, role: string, comment: string): Promise<ApprovalResponse> =>
  request<ApprovalResponse>(`/approvals/${encodeURIComponent(invoiceId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ role, comment })
  });

export const rejectInvoice = (invoiceId: string, comment: string): Promise<ApprovalResponse> =>
  request<ApprovalResponse>(`/approvals/${encodeURIComponent(invoiceId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ comment })
  });

export const uploadInvoice = (payload: IngestRequest): Promise<IngestSuccessResponse> =>
  request<IngestSuccessResponse>("/invoices", {
    method: "POST",
    body: JSON.stringify(payload)
  });

export const resetDemo = (): Promise<ResetResponse> =>
  request<ResetResponse>("/reset", {
    method: "POST",
    body: JSON.stringify({})
  });
