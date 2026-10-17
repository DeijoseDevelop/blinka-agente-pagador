import type { FC } from "react";
import type { DecisionView, OfficialDecision } from "../types";
import { formatAmount } from "../lib/format";
import { DecisionBadge, ReasonPill, StatusChip } from "./DecisionBadge";

interface Props {
  decisions: DecisionView[];
  activeTab: "all" | OfficialDecision;
  onTabChange: (tab: "all" | OfficialDecision) => void;
  tabs: { all: string; PAY: string; ESCALATE: string; BLOCK: string };
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
  onSelect: (id: string) => void;
  selectedId: string | null;
  decisionLabels: Record<OfficialDecision, { label: string }>;
}

export const Dashboard: FC<Props> = ({
  decisions,
  activeTab,
  onTabChange,
  tabs,
  columns,
  empty,
  onSelect,
  selectedId,
  decisionLabels
}) => {
  const filtered =
    activeTab === "all"
      ? decisions
      : decisions.filter((d) => d.decision === activeTab);

  const tabCounts = {
    all: decisions.length,
    PAY: decisions.filter((d) => d.decision === "PAY").length,
    ESCALATE: decisions.filter((d) => d.decision === "ESCALATE").length,
    BLOCK: decisions.filter((d) => d.decision === "BLOCK").length
  };

  const tabBtn = (key: "all" | OfficialDecision, label: string) => {
    const active = activeTab === key;
    return (
      <button
        type="button"
        key={key}
        onClick={() => onTabChange(key)}
        className={`relative inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${active ? "border-primary/50 bg-primary/20 text-ink" : "border-border bg-surface2 text-muted hover:border-faint hover:text-ink"}`}
      >
        <span>{label}</span>
        <span className={`num rounded-full px-1.5 py-0.5 text-xs ${active ? "bg-primary/40 text-ink" : "bg-base/60 text-faint"}`}>{tabCounts[key]}</span>
      </button>
    );
  };

  return (
    <section id="invoices" className="mx-auto max-w-screen-2xl scroll-mt-14">
      <div className="card flex flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border bg-surface2/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <nav className="flex flex-wrap items-center gap-2">
            {tabBtn("all", tabs.all)}
            {tabBtn("PAY", tabs.PAY)}
            {tabBtn("ESCALATE", tabs.ESCALATE)}
            {tabBtn("BLOCK", tabs.BLOCK)}
          </nav>
          <div className="text-xs text-faint">{decisions.length} facturas</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5">{columns.id}</th>
                <th className="px-4 py-2.5">{columns.supplier}</th>
                <th className="px-4 py-2.5">{columns.number}</th>
                <th className="px-4 py-2.5">{columns.category}</th>
                <th className="px-4 py-2.5 text-right">{columns.amount}</th>
                <th className="px-4 py-2.5">{columns.decision}</th>
                <th className="px-4 py-2.5">{columns.reason}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr
                  key={d.invoiceId}
                  onClick={() => onSelect(d.invoiceId)}
                  className={`group cursor-pointer border-b border-border/70 transition-colors ${
                    selectedId === d.invoiceId
                      ? "bg-primary/15 hover:bg-primary/20"
                      : `hover:bg-surface2/60 ${i % 2 === 0 ? "bg-surface/20" : ""}`
                  }`}
                >
                  <td className="px-4 py-3 align-top">
                    <span className="text-ink">{d.invoiceId}</span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col">
                      <span className="text-ink">{d.supplierName}</span>
                      <span className="text-xs text-faint">{d.supplierId}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-ink num">{d.invoiceNumber}</td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col">
                      <span className="text-ink">{d.category}</span>
                      <span className="text-xs text-faint">{d.budgetCategory}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-right text-ink num">{formatAmount(d.amounts.total, d.amounts.currency)}</td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <DecisionBadge decision={d.decision} label={decisionLabels[d.decision].label} size="sm" />
                      {d.status === "APPROVED_FOR_SIMULATION" && (
                        <StatusChip status="APROBADA_SIM" tone="success" />
                      )}
                      {d.status === "REJECTED" && <StatusChip status="RECHAZADA" tone="danger" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ReasonPill code={d.primaryReason} />
                      <span className="text-xs text-muted line-clamp-2 max-w-[280px]">{d.business.title}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                    {empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
