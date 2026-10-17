import type { MetricValue, Tone } from "../types";

export function formatAmount(value: string | number, currency = "USD"): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return `${value} ${currency}`;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatPercent(value: number, n: number, noSample = "sin datos"): string {
  if (!n) return noSample;
  return `${((value / n) * 100).toFixed(1)}%`;
}

export function metricSample(metric: MetricValue, noSample = "sin datos"): string {
  return metric.n ? `N=${metric.n}` : noSample;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

export interface ToneStyle {
  text: string;
  bg: string;
  border: string;
  dot: string;
  solid: string;
}

export function toneStyle(tone: Tone): ToneStyle {
  switch (tone) {
    case "success":
      return {
        text: "text-pay",
        bg: "bg-pay-soft",
        border: "border-pay-line",
        dot: "bg-pay",
        solid: "bg-pay text-base"
      };
    case "warning":
      return {
        text: "text-escalate",
        bg: "bg-escalate-soft",
        border: "border-escalate-line",
        dot: "bg-escalate",
        solid: "bg-escalate text-base"
      };
    case "danger":
      return {
        text: "text-block",
        bg: "bg-block-soft",
        border: "border-block-line",
        dot: "bg-block",
        solid: "bg-block text-white"
      };
    default:
      return {
        text: "text-muted",
        bg: "bg-surface2",
        border: "border-border",
        dot: "bg-faint",
        solid: "bg-surface2 text-ink"
      };
  }
}

export function decisionTone(decision: "PAY" | "ESCALATE" | "BLOCK"): Tone {
  if (decision === "PAY") return "success";
  if (decision === "ESCALATE") return "warning";
  return "danger";
}
