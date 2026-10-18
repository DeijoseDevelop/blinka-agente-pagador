import { assertNoUnsafePayments, runPipeline } from "@agente/pipeline";
import type { RunResult } from "@agente/pipeline";

/**
 * CLI del benchmark oficial. Delega toda la logica en @agente/pipeline para que
 * el resultado sea EXACTAMENTE el mismo que consume la API y la UI.
 */

const pad = (value: string, width: number): string => value.padEnd(width, " ").slice(0, width);
const pct = (value: number, n: number): string => (n === 0 ? "n/a" : `${((value / n) * 100).toFixed(1)}%`);

function printReport(run: RunResult): void {
  console.log("");
  console.log("=== AGENTE PAGADOR · ACME LABS INC. · BENCHMARK DE EVALUACION ===");
  console.log("");
  console.log(
    `${pad("INVOICE", 9)}${pad("DECISION", 10)}${pad("STATUS", 24)}${pad("REASON", 22)}${pad("APPROVER", 13)}${pad("SIM", 6)}${pad("EXPECTED", 10)}RESULT`
  );
  console.log("-".repeat(103));
  for (const d of run.decisions) {
    console.log(
      `${pad(d.invoiceId, 9)}${pad(d.decision, 10)}${pad(d.status, 24)}${pad(d.reasonCodes.join("|"), 22)}${pad(d.approverRole ?? "-", 13)}${pad(String(d.simulationAllowed), 6)}${pad(d.expected?.expected_decision ?? "-", 10)}${d.matchesOracle ? "OK" : "FAIL"}`
    );
  }

  console.log("");
  console.log("=== METRICAS OFICIALES (valor/N) ===");
  for (const key of ["M1", "M2", "M3", "M4", "M5", "M6"] as const) {
    const m = run.metrics[key];
    const flag = key === "M2" ? (m.value === 0 ? "  [OK: invariante = 0]" : "  [VIOLADO]") : "";
    console.log(`${pad(m.id, 4)}${pad(m.label, 34)}${pad(`${m.value}/${m.n}`, 10)}${pad(pct(m.value, m.n), 8)}${flag}`);
  }
  console.log("");
}

/** Compatibilidad: el benchmark es simplemente el resultado del pipeline. */
export function runBenchmark(): RunResult {
  return runPipeline();
}

const isMain = process.argv[1]?.endsWith("runner.ts") || process.argv[1]?.endsWith("runner.js");
if (isMain) {
  const run = runPipeline();
  printReport(run);
  // El benchmark falla (exit 1) si hay desviacion del oraculo o un pago inseguro.
  let failed = false;
  if (run.allMatchOracle) {
    console.log("RESULTADO: todas las decisiones coinciden con el oraculo.");
  } else {
    failed = true;
    console.log("RESULTADO: hay desviaciones respecto al oraculo.");
  }
  try {
    assertNoUnsafePayments(run);
    console.log("INVARIANTE: pagos inseguros (M2) = 0.");
  } catch (err) {
    failed = true;
    console.error((err as Error).message);
  }
  process.exit(failed ? 1 : 0);
}
