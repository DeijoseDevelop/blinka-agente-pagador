import type { FC } from "react";
import type { DecisionView } from "../types";
import { CheckIcon, XIcon } from "./Icons";

interface Props {
  decision: DecisionView;
  columns: { rule: string; status: string; waivable: string; evidence: string };
  yes: string;
  no: string;
}

export const RuleTrace: FC<Props> = ({ decision, columns, yes, no }) => {
  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full min-w-[600px] text-sm">
        <thead className="bg-surface2/40">
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
            <th className="px-3 py-2.5">{columns.rule}</th>
            <th className="px-3 py-2.5">{columns.status}</th>
            <th className="px-3 py-2.5">{columns.waivable}</th>
            <th className="px-3 py-2.5">{columns.evidence}</th>
          </tr>
        </thead>
        <tbody>
          {decision.rules.map((r, i) => {
            const status = r.status;
            const statusCls =
              status === "PASS"
                ? "border-pay-line bg-pay-soft text-pay"
                : status === "FAIL"
                  ? "border-block-line bg-block-soft text-block"
                  : "border-border bg-surface2 text-faint";
            return (
              <tr key={r.id} className={`border-b border-border/70 ${i % 2 === 0 ? "bg-surface/20" : ""}`}>
                <td className="px-3 py-2.5 font-mono text-xs text-ink">{r.id}</td>
                <td className="px-3 py-2.5">
                  <span className={`chip ${statusCls} num uppercase`}>{status}</span>
                </td>
                <td className="px-3 py-2.5 text-xs text-ink">
                  <span className="inline-flex items-center gap-1">
                    {r.waivable ? (
                      <CheckIcon width={12} height={12} className="text-pay" />
                    ) : (
                      <XIcon width={12} height={12} className="text-block" />
                    )}
                    <span className="text-faint">{r.waivable ? yes : no}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted">{r.evidence}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
