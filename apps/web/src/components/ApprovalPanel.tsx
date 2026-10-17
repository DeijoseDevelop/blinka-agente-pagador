import { type FC, useState } from "react";
import type { ApiRequestError } from "../api";
import { approveInvoice, rejectInvoice } from "../api";
import type { DecisionView } from "../types";

interface Props {
  decision: DecisionView;
  roleOptions: string[];
  commentPlaceholder: string;
  approveButton: string;
  rejectButton: string;
  allowedRolesHint: string;
  roleLabel: string;
  commentLabel: string;
  closingNote: string;
  onChanged: (next: DecisionView) => void;
  onError: (err: ApiRequestError) => void;
  onSuccess: (msg: string) => void;
}

export const ApprovalPanel: FC<Props> = ({
  decision,
  roleOptions,
  commentPlaceholder,
  approveButton,
  rejectButton,
  allowedRolesHint,
  roleLabel,
  commentLabel,
  onChanged,
  onError,
  onSuccess
}) => {
  const [role, setRole] = useState<string>(decision.allowedRoles[0] ?? roleOptions[0] ?? "Finance Lead");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const allowed = decision.allowedRoles;
  const showSelect = allowed.length > 0;
  const options = allowed.length > 0 ? allowed : roleOptions;

  const handleApprove = async () => {
    setBusy(true);
    try {
      const res = await approveInvoice(decision.invoiceId, role, comment);
      onChanged(res.decision);
      onSuccess(res.message);
    } catch (e) {
      onError(e as ApiRequestError);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      const res = await rejectInvoice(decision.invoiceId, comment);
      onChanged(res.decision);
      onSuccess(res.message);
    } catch (e) {
      onError(e as ApiRequestError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-lg border border-border bg-surface2/30 p-4">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-semibold text-ink">{allowedRolesHint}</div>
        <div className="text-xs text-muted">{allowed.length > 0 ? allowed.join(", ") : roleOptions.join(", ")}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label">{roleLabel}</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="input"
            disabled={busy || !showSelect}
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">{commentLabel}</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={commentPlaceholder}
            rows={3}
            className="input resize-none"
            disabled={busy}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={busy || comment.trim().length < 5} onClick={handleApprove}>
          {approveButton}
        </button>
        <button type="button" className="btn-ghost" disabled={busy || comment.trim().length < 5} onClick={handleReject}>
          {rejectButton}
        </button>
      </div>
    </div>
  );
};
