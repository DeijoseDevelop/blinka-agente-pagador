import Fastify from "fastify";
import type { FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { copyBundle, createPipeline } from "@agente/pipeline";
import type { ApprovalErrorCode, IngestResult } from "@agente/pipeline";

/**
 * API del Agente Pagador. Expone el resultado del pipeline (determinista) y el
 * flujo de aprobacion humana. No mueve dinero: la respuesta mas fuerte es una
 * autorizacion firmada para SIMULACION.
 */

const PORT = Number(process.env.PORT) || 8787;
const HOST = "0.0.0.0";
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const pipeline = createPipeline();
const app = Fastify({ logger: false, bodyLimit: MAX_BODY_BYTES });

await app.register(cors, { origin: true, methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] });

// Salvaguarda: acepta cuerpos JSON vacios (p. ej. DELETE sin body enviado con
// Content-Type: application/json) tratandolos como objeto vacio, en lugar de
// responder FST_ERR_CTP_EMPTY_JSON_BODY.
app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, payload, done) => {
  const text = typeof payload === "string" ? payload.trim() : "";
  if (text.length === 0) {
    done(null, {});
    return;
  }
  try {
    done(null, JSON.parse(text));
  } catch (error) {
    done(error as Error, undefined);
  }
});

const HTTP_STATUS: Record<ApprovalErrorCode, number> = {
  NOT_FOUND: 404,
  NOT_ESCALATABLE: 409,
  MISSING_FIELDS: 422,
  COMMENT_TOO_SHORT: 422,
  ROLE_NOT_AUTHORIZED: 422,
  GUARDIAN_MISMATCH: 403
};

interface IngestBody {
  fileName?: string;
  mime?: string;
  contentBase64?: string;
  text?: string;
  category?: string;
}

/** Traduce el resultado de la ingesta al codigo HTTP acordado. */
function sendIngest(reply: FastifyReply, result: IngestResult): unknown {
  if (result.ok) {
    return reply.code(201).send({ ok: true, id: result.id, decision: result.decision, run: result.run });
  }
  if (result.code === "DUPLICATE_CONFIRMED") {
    return reply.code(409).send({ ok: false, code: result.code, message: result.message, duplicateOf: result.duplicateOf });
  }
  return reply.code(422).send({ ok: false, code: result.code, message: result.message });
}


app.get("/api/health", async () => ({
  status: "ok",
  simulationOnly: true,
  moneyMovementAllowed: false
}));

app.get("/", async () => ({
  status: "ok",
  service: "Blinka Agente Pagador API",
  endpoints: ["/api/run", "/api/invoices", "/api/health", "/api/decisions"]
}));

// Resultado completo (decisiones + metricas + metadatos). Cacheado.
app.get("/api/run", async (request, reply) => {
  try {
    return pipeline.getRun();
  } catch (err) {
    console.error("Error in /api/run:", err instanceof Error ? err.message : err);
    return reply.code(200).send({
      generatedAt: new Date().toISOString(),
      now: new Date().toISOString(),
      policyVersion: "0.1.0",
      policyStatus: "unknown",
      companyId: "unknown",
      legalName: "unknown",
      baseCurrency: "USD",
      execution: { simulationOnly: true, realPaymentsEnabled: false, moneyMovementAllowed: false },
      processingOrder: [],
      counts: { total: 0, PAY: 0, ESCALATE: 0, BLOCK: 0 },
      decisions: [],
      metrics: {
        M1: { id: "M1", label: "Autonomia", value: 0, n: 0 },
        M2: { id: "M2", label: "Pagos Inseguros", value: 0, n: 0 },
        M3: { id: "M3", label: "Sobre-escalamiento", value: 0, n: 0 },
        M4: { id: "M4", label: "Acierto ESCALATE", value: 0, n: 0 },
        M5: { id: "M5", label: "Acierto BLOCK", value: 0, n: 0 },
        M6: { id: "M6", label: "Exactitud", value: 0, n: 0 }
      },
      unsafePayments: 0,
      allMatchOracle: false
    });
  }
});

app.get("/api/metrics", async () => {
  const run = pipeline.getRun();
  return { generatedAt: run.generatedAt, counts: run.counts, metrics: run.metrics };
});

app.get("/api/decisions", async () => {
  const run = pipeline.getRun();
  return {
    generatedAt: run.generatedAt,
    processingOrder: run.processingOrder,
    counts: run.counts,
    decisions: run.decisions
  };
});

app.get<{ Params: { id: string } }>("/api/decisions/:id", async (request, reply) => {
  const decision = pipeline.getDecision(request.params.id);
  if (!decision) {
    return reply.code(404).send({ code: "NOT_FOUND", message: "No se encontró la factura solicitada." });
  }
  return decision;
});

// Diccionario de copia oficial (espejo de ux-copy.md).
app.get("/api/copy", async () => copyBundle());

app.post<{ Params: { id: string }; Body: { role?: string; comment?: string } }>(
  "/api/approvals/:id/approve",
  async (request, reply) => {
    const body = request.body ?? {};
    const result = pipeline.approve(request.params.id, body.role, body.comment);
    if (!result.ok) {
      return reply.code(HTTP_STATUS[result.code]).send({ code: result.code, message: result.message, alerts: result.alerts });
    }
    return reply.send({ ok: true, message: result.message, decision: result.decision });
  }
);

app.post<{ Params: { id: string }; Body: { comment?: string } }>(
  "/api/approvals/:id/reject",
  async (request, reply) => {
    const body = request.body ?? {};
    const result = pipeline.reject(request.params.id, body.comment);
    if (!result.ok) {
      return reply.code(HTTP_STATUS[result.code]).send({ code: result.code, message: result.message, alerts: result.alerts });
    }
    return reply.send({ ok: true, message: result.message, decision: result.decision });
  }
);

app.post<{ Body: IngestBody }>("/api/invoices", async (request, reply) => {
  const body = request.body ?? {};
  const bytes =
    body.contentBase64 && body.contentBase64.length > 0
      ? Buffer.from(body.contentBase64, "base64")
      : undefined;

  const result = pipeline.ingest({
    fileName: body.fileName,
    mime: body.mime,
    bytes,
    text: body.text,
    category: body.category
  });
  return sendIngest(reply, result);
});

// Restaura la sesion al estado de demostracion (INV-001..INV-003).
app.post("/api/reset", async () => {
  const run = pipeline.reset();
  return { ok: true, run };
});

app.setErrorHandler((error: unknown, _request, reply) => {
  const status = (error as any)?.statusCode && (error as any).statusCode >= 400 ? (error as any).statusCode : 500;
  const message = error instanceof Error ? error.message : "Error interno";
  reply.code(status).send({ code: "INTERNAL", message });
});

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
