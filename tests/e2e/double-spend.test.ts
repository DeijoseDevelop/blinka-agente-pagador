import { describe, expect, it } from "vitest";
import { createPipeline } from "@agente/pipeline";

/**
 * E2E de doble gasto y re-evaluacion al aprobar (documento §11):
 * una aprobacion humana nunca firma sobre contexto obsoleto. El motor y el
 * Guardian vuelven a verificar contra el libro actual antes de emitir la
 * autorizacion. Ademas: ninguna factura puede resolverse dos veces.
 */

const dbInvoice = (number: string, total: number): string =>
  [
    `Factura numero: ${number}`,
    "Proveedor: DataBridge Consulting",
    "Fecha de emision: 2026-10-14",
    "Vencimiento: 2026-10-31",
    "Contrato: DB-001",
    "Cuenta bancaria: SYNTHETIC-ACCOUNT-DATA-002",
    "Moneda: USD",
    `Subtotal: ${total.toFixed(2)}`,
    "Impuesto: 0.00",
    `Total a pagar: USD ${total.toFixed(2)}`
  ].join("\n");

const ingestOk = (pipeline: ReturnType<typeof createPipeline>, text: string): string => {
  const res = pipeline.ingest({ text, category: "tech_consulting" });
  if (!res.ok) throw new Error(`ingesta rechazada: ${res.code}`);
  return res.id;
};

describe("e2e doble gasto: re-evaluacion al aprobar", () => {
  it("el presupuesto de categoria se consume con cada aprobacion y el guardian corta al agotarse", () => {
    const pipeline = createPipeline();
    // Presupuesto tech_consulting: 25.000, compromiso previo 5.000 => 20.000 libres.
    // Tres facturas de ~8.100 (sobre el umbral, dentro del acuerdo max 8.160).
    const id1 = ingestOk(pipeline, dbInvoice("DB-2026-981", 8101));
    const id2 = ingestOk(pipeline, dbInvoice("DB-2026-982", 8102));
    const id3 = ingestOk(pipeline, dbInvoice("DB-2026-983", 8103));

    for (const id of [id1, id2, id3]) {
      const view = pipeline.getDecision(id);
      expect(view?.decision).toBe("ESCALATE");
      expect(view?.allowedRoles).toContain("Finance Lead");
    }

    // Primera aprobacion: contexto fresco, compromete 8.101 (quedan ~11.899).
    const a1 = pipeline.approve(id1, "Finance Lead", "Aprobado contra acuerdo DB-001");
    expect(a1.ok).toBe(true);
    if (a1.ok) {
      expect(a1.decision.status).toBe("APPROVED_FOR_SIMULATION");
      expect(a1.decision.guardian.signature).toMatch(/^[0-9a-f]{64}$/);
    }

    // Segunda aprobacion: re-evalua con 8.101 ya comprometidos => aun cabe.
    const a2 = pipeline.approve(id2, "Finance Lead", "Aprobado contra acuerdo DB-001");
    expect(a2.ok).toBe(true);

    // Tras comprometer 16.203, la tercera factura ya no cabe en el presupuesto
    // (~3.797 libres): la re-evaluacion fresca la convierte en BLOCK y cualquier
    // intento de aprobacion es rechazado. Sin re-evaluacion esto habria firmado
    // sobre un contexto obsoleto = sobregiro del presupuesto de categoria.
    const a3 = pipeline.approve(id3, "Finance Lead", "Aprobado contra acuerdo DB-001");
    expect(a3.ok).toBe(false);
    if (!a3.ok) {
      expect(["NOT_ESCALATABLE", "GUARDIAN_MISMATCH"]).toContain(a3.code);
    }

    // La decision publicada de la tercera factura se degrado a BLOCK por el
    // presupuesto agotado (R08) tras las dos aprobaciones previas.
    const view3 = pipeline.getDecision(id3);
    expect(view3?.decision).toBe("BLOCK");
    expect(view3?.reasonCodes).toContain("BUDGET_EXCEEDED");
  });

  it("una segunda aprobacion sobre la misma factura nunca emite otra firma", () => {
    const pipeline = createPipeline();
    const first = pipeline.approve("INV-002", "Finance Lead", "Aprobacion inicial");
    expect(first.ok).toBe(true);
    const second = pipeline.approve("INV-002", "CFO", "Segunda firma indebida");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("NOT_ESCALATABLE");

    // Rechazo posterior tampoco puede revertir una aprobacion emitida.
    const reject = pipeline.reject("INV-002", "rechazo tardio");
    expect(reject.ok).toBe(false);
  });

  it("el estado aprobado sobrevive al recalculo determinista (getRun)", () => {
    const pipeline = createPipeline();
    const first = pipeline.approve("INV-002", "Finance Lead", "Aprobacion inicial");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const signature = first.decision.guardian.signature;

    // Cualquier recalculo posterior debe conservar estado y firma originales.
    const run = pipeline.getRun();
    const view = run.decisions.find((d) => d.invoiceId === "INV-002");
    expect(view?.status).toBe("APPROVED_FOR_SIMULATION");
    expect(view?.guardian.signature).toBe(signature);
  });

  it("una factura FRENADA puede reenviarse corregida (version nueva)", () => {
    const pipeline = createPipeline();
    // Imagen sin texto => BLOCK por datos incompletos.
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("contenido binario sin OCR")
    ]);
    const first = pipeline.ingest({ bytes: png, fileName: "factura.png", category: "cloud" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.decision.decision).toBe("BLOCK");

    // El mismo archivo reenviado produce una entrada nueva (no un 409 eterno):
    // la frenada no bloquea el reenvio corregido exigido por el documento §11.
    const resend = pipeline.ingest({ bytes: png, fileName: "factura.png", category: "cloud" });
    expect(resend.ok).toBe(true);
    if (resend.ok) expect(resend.id).not.toBe(first.id);
  });
});
