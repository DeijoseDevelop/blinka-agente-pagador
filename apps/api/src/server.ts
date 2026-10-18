import { buildApp } from "./app.js";
import { createPipeline } from "@agente/pipeline";

/** Punto de entrada: construye la app y abre el puerto. */

const PORT = Number(process.env.PORT) || 8787;
const HOST = "0.0.0.0";

const pipeline = createPipeline();
const app = await buildApp({ pipeline });

try {
  await app.listen({ port: PORT, host: HOST });
  const run = pipeline.getRun();
  console.log(`Agente Pagador API en http://${HOST}:${PORT}`);
  console.log(`  ${run.counts.total} facturas | PAY=${run.counts.PAY} ESCALATE=${run.counts.ESCALATE} BLOCK=${run.counts.BLOCK}`);
  console.log(`  Pagos inseguros (M2) = ${run.unsafePayments} | Coincide con oraculo: ${run.allMatchOracle}`);
} catch (err) {
  console.error("No se pudo iniciar la API:", err instanceof Error ? err.message : err);
  process.exit(1);
}
