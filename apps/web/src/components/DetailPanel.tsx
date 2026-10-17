import type { FC } from "react";
import type { ApiRequestError } from "../api";
import type { DecisionView } from "../types";
import { formatAmount, toneStyle, decisionTone } from "../lib/format";
import { CloseIcon, BanIcon, FingerprintIcon, AlertIcon } from "./Icons";
import { DecisionBadge } from "./DecisionBadge";
import { RuleTrace } from "./RuleTrace";
import { ApprovalPanel } from "./ApprovalPanel";

interface Props {
  decision: DecisionView | null;
  copy: any;
  onClose: () => void;
  onChanged: (d: DecisionView) => void;
  onError: (e: ApiRequestError) => void;
  onSuccess: (msg: string) => void;
}

export const DetailPanel: FC<Props> = ({ decision, copy, onClose, onChanged, onError, onSuccess }) => {
  if (!decision) return null;
  const ui = copy.ui;
  const t = toneStyle(decisionTone(decision.decision));
  const showApproval =
    decision.decision === "ESCALATE" &&
    decision.status !== "APPROVED_FOR_SIMULATION" &&
    decision.status !== "REJECTED";

  return (
    <aside className="flex min-h-full flex-col bg-surface">
      <div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur-sm">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{ui.detail.title}</span>
            <span className="chip border-border bg-surface2 text-faint">{decision.invoiceId}</span>
            <DecisionBadge decision={decision.decision} label={copy.decision[decision.decision].label} size="sm" />
            <span className="chip border-border bg-surface2 text-faint">{copy.status[decision.status]}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="text-ink">{decision.supplierName}</span>
            <span className="text-faint">·</span>
            <span className="num">{decision.invoiceNumber}</span>
            <span className="text-faint">·</span>
            <span>{decision.category}</span>
            <span className="text-faint">·</span>
            <span className="num">{formatAmount(decision.amounts.total, decision.amounts.currency)}</span>
          </div>
        </div>
        <button
          type="button"
          aria-label={ui.detail.close}
          title={ui.detail.close}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface2 text-muted transition-colors hover:border-faint hover:text-ink"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-6 px-5 py-5">
        <section className="flex flex-col gap-3">
          <div className="section-title">{ui.detail.sections.verdict}</div>
          <div className={`card card-pad flex flex-col gap-2 border ${t.border} ${t.bg}`}>
            <div className="flex items-start gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.solid} shadow-card`}>
                {decision.decision === "BLOCK" ? <BanIcon width={16} height={16} /> : <AlertIcon width={16} height={16} />}
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-ink">{decision.business.title}</h2>
                <p className="text-sm leading-relaxed text-ink/90">{decision.business.text}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="num">{decision.reasonCodes.join(" · ")}</span>
              <span className="text-faint">·</span>
              <span className="num">{decision.headline}</span>
            </div>
            {decision.permanentlyBlocked && decision.duplicateOf && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-block-line bg-block-soft px-3 py-2 text-sm text-block">
                <BanIcon width={16} height={16} className="mt-0.5" />
                <div>
                  <div className="font-semibold">Bloqueo no levantable</div>
                  <div className="text-xs opacity-80">{decision.business.text}</div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="section-title">{ui.detail.sections.business}</div>
          <div className="card card-pad flex flex-col gap-2 text-sm text-muted">
            <div className="text-ink">{decision.business.text}</div>
            <div className="flex flex-wrap gap-3 text-xs text-faint">
              <span>Estado: {copy.status[decision.status]}</span>
              <span>Roles autorizados: {decision.allowedRoles.length ? decision.allowedRoles.join(", ") : "—"}</span>
              <span>Simulación: {decision.simulationAllowed ? ui.detail.yes : ui.detail.no}</span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="section-title">{ui.detail.sections.trace}</div>
          <RuleTrace decision={decision} columns={ui.detail.traceHeaders} yes={ui.detail.yes} no={ui.detail.no} />
        </section>

        <section className="flex flex-col gap-3">
          <div className="section-title">{ui.detail.sections.signature}</div>
          <div className="card card-pad flex flex-col gap-2 text-sm text-muted">
            <div className="flex items-center gap-2">
              <FingerprintIcon className="text-pay" />
              <span className="text-ink">
                {decision.guardian.signature ? ui.detail.signatureOk : ui.detail.signatureNone}
              </span>
            </div>
            {decision.guardian.signature && (
              <div className="break-all rounded-md border border-border bg-base/60 px-2 py-1 font-mono text-[10px] leading-relaxed text-faint">
                {decision.guardian.signature}
              </div>
            )}
            {decision.approval && (
              <div className="flex flex-col gap-1 text-xs text-faint">
                <span>Aprobación: {decision.approval.approvalId}</span>
                <span>Actor: {decision.approval.actor}</span>
                <span>Comentario: {decision.approval.comment}</span>
                <span>Estado: {decision.approval.status}</span>
              </div>
            )}
          </div>
        </section>

        {showApproval && (
          <ApprovalPanel
            decision={decision}
            roleOptions={ui.approval.roleOptions}
            commentPlaceholder={ui.approval.commentPlaceholder}
            approveButton={ui.approval.approveButton}
            rejectButton={ui.approval.rejectButton}
            allowedRolesHint={ui.approval.allowedRolesHint}
            roleLabel={ui.approval.roleLabel}
            commentLabel={ui.approval.commentLabel}
            closingNote={ui.approval.closingNote}
            onChanged={onChanged}
            onError={onError}
            onSuccess={onSuccess}
          />
        )}

        <div className="text-xs text-faint">{ui.detail.closingNote}</div>
      </div>
    </aside>
  );
};
