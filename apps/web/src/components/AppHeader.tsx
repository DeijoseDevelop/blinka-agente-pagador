import type { FC } from "react";
import type { RunResult } from "../types";
import { FingerprintIcon, ScaleIcon, ShieldIcon } from "./Icons";

interface Props {
  run: RunResult | null;
  org: string;
  brand: string;
  subtitle: string;
  motto: string;
  policyPrefix: string;
  invariantBadge: string;
  invariantSupport: string;
}

export const AppHeader: FC<Props> = ({ run, org, brand, subtitle, motto, policyPrefix, invariantBadge, invariantSupport }) => {
  const policy = run ? `${policyPrefix} ${run.policyVersion}` : `${policyPrefix} —`;
  const legal = run?.legalName ?? org;

  return (
    <header className="mx-auto max-w-screen-2xl">
      <div className="card card-pad flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/40 bg-primary/20 text-primary">
              <ShieldIcon width={20} height={20} />
            </span>
            <div>
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="text-ink">{brand}</span>
                <span className="hidden h-4 w-px bg-border sm:inline" />
                <span className="hidden sm:inline">{legal}</span>
              </div>
              <h1 className="mt-0.5 text-lg font-semibold tracking-tight sm:text-xl">{subtitle}</h1>
              <p className="text-sm text-muted">{motto}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted md:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip border-border bg-surface2 text-faint">{policy}</span>
            {run && run.allMatchOracle && (
              <span className="chip border-pay-line bg-pay-soft text-pay">
                <FingerprintIcon className="text-pay" />
                {invariantBadge}
              </span>
            )}
            {run && run.unsafePayments === 0 && (
              <span className="chip border-pay-line bg-pay-soft text-pay">
                <ScaleIcon className="text-pay" />
                {invariantSupport}
              </span>
            )}
          </div>
          <div className="text-xs text-faint">
            {run ? `Generado: ${new Date(run.generatedAt).toLocaleString("es-CO")}` : "Cargando..."}
          </div>
        </div>
      </div>
    </header>
  );
};
