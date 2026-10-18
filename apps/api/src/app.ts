import Fastify from "fastify";
import type { FastifyInstance, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyBundle, createPipeline, runPipeline } from "@agente/pipeline";
import type { ApprovalErrorCode, IngestResult, Pipeline } from "@agente/pipeline";

/**
 * API del Agente Pagador. Expone el resultado del pipeline (determinista) y el
 * flujo de aprobacion humana. No mueve dinero: la respuesta mas fuerte es una
 * autorizacion firmada para SIMULACION.
 *
 * buildApp() queda separada del listen() para que las pruebas e2e puedan usar
 * app.inject() sin abrir un puerto.
 */

const MAX_BODY_BYTES = 8 * 1024 * 1024;

export interface AppOptions {
  /** Pipeline inyectado (tests); por defecto crea uno con los datos oficiales. */
  pipeline?: Pipeline;
  /** Token requerido en `x-approvals-token` para aprobar/rechazar (opcional). */
  approvalsToken?: string;
}

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

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const pipeline = options.pipeline ?? createPipeline();
  const approvalsToken = options.approvalsToken ?? process.env.APPROVALS_TOKEN;

  const app = Fastify({ logger: false, bodyLimit: MAX_BODY_BYTES });

  // CORS_ORIGIN: lista separada por comas de origenes permitidos (produccion).
  // Sin definir solo se permiten los origenes locales del dev server de Vite:
  // nunca se refleja un origen arbitrario (defensa por defecto).
  const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
  await app.register(cors, {
    origin:
      corsOrigin && corsOrigin.length > 0
        ? corsOrigin
        : ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });

  // En despliegue de un solo servicio la API sirve el frontend compilado.
  // Se resuelve respecto a este archivo (apps/api/src) => apps/web/dist,
  // independientemente del cwd desde el que se lance el proceso.
  const webDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  const webDistExists = existsSync(webDist);
  if (webDistExists) {
    await app.register(fastifyStatic, { root: webDist });
  }

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

  // Gate opcional: si APPROVALS_TOKEN esta definido, las resoluciones de la cola
  // humana exigen el header x-approvals-token (separacion de funciones minima).
  if (approvalsToken) {
    app.addHook("preHandler", async (request, reply) => {
      if (request.method === "POST" && /^\/api\/approvals\/[^/]+\/(approve|reject)$/.test(request.raw.url ?? "")) {
        const token = request.headers["x-approvals-token"];
        if (token !== approvalsToken) {
          return reply.code(401).send({ code: "UNAUTHORIZED", message: "Credencial de aprobador no valida." });
        }
      }
    });
  }

  app.get("/api/health", async () => ({
    status: "ok",
    simulationOnly: true,
    moneyMovementAllowed: false
  }));

  app.get("/api", async () => ({
    status: "ok",
    service: "Blinka Agente Pagador API",
    endpoints: [
      "/api/run",
      "/api/invoices",
      "/api/health",
      "/api/decisions",
      "/api/policy",
      "/api/approvals",
      "/api/audit/verify",
      "/api/eval/run"
    ]
  }));

  // Resultado completo (decisiones + metricas + metadatos). Cacheado.
  app.get("/api/run", async (_request, reply) => {
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

  // Replay determinista: re-ejecuta la decision con sus insumos guardados.
  app.post<{ Params: { id: string } }>("/api/decisions/:id/replay", async (request, reply) => {
    const replayed = pipeline.replayDecision(request.params.id);
    if (!replayed) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "No se encontró la factura solicitada." });
    }
    return replayed;
  });

  // Politica vigente (oficial + traduccion del motor). Solo lectura en esta demo.
  app.get("/api/policy", async () => pipeline.getPolicy());

  // Cola de aprobacion humana pendiente.
  app.get("/api/approvals", async () => ({ queue: pipeline.getApprovals() }));

  // Verificacion de la cadena de auditoria encadenada por hash.
  app.get("/api/audit/verify", async () => pipeline.getAudit());

  // Benchmark frente al oraculo bajo demanda (misma logica que `npm run eval`).
  app.post("/api/eval/run", async () => runPipeline());

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

  // Fallback SPA: los GET fuera de /api devuelven index.html (ruteo del cliente).
  app.setNotFoundHandler((request, reply) => {
    const path = request.raw.url?.split("?")[0] ?? "";
    if (webDistExists && request.method === "GET" && !path.startsWith("/api")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ code: "NOT_FOUND", message: "Recurso no encontrado." });
  });

  app.setErrorHandler((error: unknown, _request, reply) => {
    const declared = (error as { statusCode?: number })?.statusCode;
    // Los errores del cliente (4xx) conservan su mensaje; los 5xx nunca exponen
    // detalles internos (rutas, trazas, implementacion) al exterior. Un body
    // JSON malformado es un SyntaxError sin statusCode: es 400 del cliente.
    const status =
      typeof declared === "number" && declared >= 400 && declared < 600
        ? declared
        : error instanceof SyntaxError
          ? 400
          : 500;
    const message =
      status < 500 && error instanceof Error ? error.message : "Error interno del servicio.";
    if (status >= 500) {
      console.error("API error:", error instanceof Error ? error.message : error);
    }
    reply.code(status).send({ code: status === 400 ? "BAD_REQUEST" : "INTERNAL", message });
  });

  return app;
}
