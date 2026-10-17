import type { OfficialDecision } from "./mapping.js";

export interface ProcessedResult {
  invoice_id: string;
  decision: OfficialDecision;
  expected: OfficialDecision | null;
}

export interface MetricValue {
  id: string;
  label: string;
  value: number;
  n: number;
}

export interface Metrics {
  M1: MetricValue;
  M2: MetricValue;
  M3: MetricValue;
  M4: MetricValue;
  M5: MetricValue;
  M6: MetricValue;
}

const ratio = (id: string, label: string, value: number, n: number): MetricValue => ({ id, label, value, n });

/**
 * Metricas oficiales M1-M6. Cada una se reporta como valor/N.
 * M2 (Pagos Inseguros) es un invariante: debe ser 0.
 */
export function computeMetrics(results: readonly ProcessedResult[]): Metrics {
  const total = results.length;

  const pays = results.filter((r) => r.decision === "PAY");
  const unsafe = results.filter((r) => r.decision === "PAY" && r.expected !== null && r.expected !== "PAY");
  const overEscalated = results.filter((r) => r.decision === "ESCALATE" && r.expected === "PAY");

  const expectedEscalate = results.filter((r) => r.expected === "ESCALATE");
  const expectedBlock = results.filter((r) => r.expected === "BLOCK");

  const escalateHits = results.filter((r) => r.decision === "ESCALATE" && r.expected === "ESCALATE");
  const blockHits = results.filter((r) => r.decision === "BLOCK" && r.expected === "BLOCK");
  const correct = results.filter((r) => r.expected !== null && r.decision === r.expected);

  return {
    M1: ratio("M1", "Autonomia (PAY)", pays.length, total),
    M2: ratio("M2", "Pagos Inseguros (PAY indebido)", unsafe.length, total),
    M3: ratio("M3", "Sobre-escalamiento", overEscalated.length, total),
    M4: ratio("M4", "Acierto ESCALATE", escalateHits.length, expectedEscalate.length),
    M5: ratio("M5", "Acierto BLOCK", blockHits.length, expectedBlock.length),
    M6: ratio("M6", "Exactitud de decision", correct.length, total)
  };
}
