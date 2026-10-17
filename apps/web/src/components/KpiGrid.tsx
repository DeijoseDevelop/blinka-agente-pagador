import type { FC } from "react";
import type { MetricValue, Metrics } from "../types";
import { formatPercent, metricSample } from "../lib/format";
import { CheckIcon } from "./Icons";

interface KpiCardProps {
  metric: MetricValue;
  noSample: string;
  description: string;
  topBorder: string;
  valueTone: string;
}

const topBorderFor = (metric: MetricValue): string => {
  switch (metric.id) {
    case "M2":
      return metric.value === 0 ? "border-t-pay" : "border-t-block";
    case "M3":
      return "border-t-escalate";
    case "M4":
      return "border-t-info";
    case "M5":
      return "border-t-accent";
    case "M6":
      return metric.n > 0 && metric.value === metric.n ? "border-t-pay" : "border-t-primary";
    default:
      return "border-t-primary";
  }
};

const valueToneFor = (metric: MetricValue): string => {
  if (metric.id === "M2") return metric.value === 0 ? "text-pay" : "text-block";
  if (metric.id === "M3") return metric.value > 0 ? "text-escalate" : "text-ink";
  return "text-ink";
};

const KpiCard: FC<KpiCardProps> = ({ metric, noSample, description, topBorder, valueTone }) => {
  const ratio = formatPercent(metric.value, metric.n, noSample);
  const sample = metricSample(metric, noSample);
  const sampleText = metric.n > 0 ? `(${sample})` : sample;

  return (
    <article className={`card flex h-full flex-col gap-1.5 border-t-2 p-4 ${topBorder}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="section-title">{metric.id}</span>
      </div>
      <div className={`num text-2xl font-semibold ${valueTone}`}>{ratio}</div>
      <div className="num text-xs text-faint">{sampleText}</div>
      <h3 className="text-sm font-semibold text-ink">{metric.label}</h3>
      <p className="text-xs leading-relaxed text-muted">{description}</p>
    </article>
  );
};

interface Props {
  metrics: Metrics;
  title: string;
  descriptions: Record<string, string>;
  invariantBadge: string;
  invariantSupport: string;
  noSample: string;
  sampleHint: string;
}

export const KpiGrid: FC<Props> = ({
  metrics,
  title,
  descriptions,
  invariantBadge,
  invariantSupport,
  noSample,
  sampleHint
}) => {
  const items = [metrics.M1, metrics.M2, metrics.M3, metrics.M4, metrics.M5, metrics.M6];
  const invariantOk = metrics.M2.value === 0;

  return (
    <section id="kpis" className="scroll-mt-14">
      <div className="mb-3 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {invariantOk && (
              <span className="chip border-pay-line bg-pay-soft text-pay">
                <CheckIcon width={12} height={12} className="text-pay" />
                {invariantBadge}
              </span>
            )}
          </div>
          <span className="text-xs text-faint">{sampleHint}</span>
        </div>
        {invariantOk && <p className="text-xs text-pay">{invariantSupport}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((metric) => (
          <KpiCard
            key={metric.id}
            metric={metric}
            noSample={noSample}
            description={descriptions[metric.id] ?? ""}
            topBorder={topBorderFor(metric)}
            valueTone={valueToneFor(metric)}
          />
        ))}
      </div>
    </section>
  );
};
