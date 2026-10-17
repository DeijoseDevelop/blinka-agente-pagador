import type { FC } from "react";
import type { OfficialDecision } from "../types";
import { decisionTone, toneStyle } from "../lib/format";

interface Props {
  decision: OfficialDecision;
  label: string;
  size?: "sm" | "md";
}

export const DecisionBadge: FC<Props> = ({ decision, label, size = "md" }) => {
  const t = toneStyle(decisionTone(decision));
  const sizeCls = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${t.border} ${t.bg} ${sizeCls} font-semibold uppercase tracking-widest ${t.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {label}
    </span>
  );
};

interface StatusChipProps {
  status: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}

export const StatusChip: FC<StatusChipProps> = ({ status, tone = "neutral" }) => {
  const t = toneStyle(tone);
  return (
    <span className={`chip ${t.border} ${t.bg} ${t.text} num tracking-normal uppercase`}>{status}</span>
  );
};

interface ReasonPillProps {
  code: string;
  size?: "sm" | "md";
}

export const ReasonPill: FC<ReasonPillProps> = ({ code, size = "sm" }) => {
  const s = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center rounded-md border border-border bg-surface2 ${s} font-mono tracking-widest text-faint`}>{code}</span>
  );
};
