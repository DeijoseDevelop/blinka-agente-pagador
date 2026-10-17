import type { OfficialDecision, OfficialStatus } from "./mapping.js";

/**
 * Espejo tipado de `ux-copy.md`. Fuente unica de verdad del texto de interfaz.
 * Se sirve por `GET /api/copy`; la UI nunca hardcodea copia de negocio.
 */

export type Tone = "success" | "warning" | "danger" | "neutral";

export interface ReasonCopy {
  code: string;
  title: string;
  tone: Tone;
  text: string;
}

export interface BusinessCopy {
  title: string;
  tone: Tone;
  text: string;
}

export const REASON_COPY: Record<string, ReasonCopy> = {
  ALL_CHECKS_PASSED: {
    code: "ALL_CHECKS_PASSED",
    title: "Pago verificado",
    tone: "success",
    text: "Esta factura supera las doce validaciones y está dentro del umbral de autonomía. El guardián autoriza el pago en modo simulación sin intervención humana."
  },
  ABOVE_AUTO_THRESHOLD: {
    code: "ABOVE_AUTO_THRESHOLD",
    title: "Aprobación humana requerida",
    tone: "warning",
    text: "El importe supera el umbral de auto-aprobación de 5,000.00 USD. El Agente no paga por sí mismo: la factura queda pendiente de aprobación por el rol autorizado según la matriz de Acme Labs Inc."
  },
  DUPLICATE_CONFIRMED: {
    code: "DUPLICATE_CONFIRMED",
    title: "Bloqueo permanente",
    tone: "danger",
    text: "Esta factura coincide con otra ya registrada ({duplicate_of}). El bloqueo por duplicado es una regla no levantable: no puede anularse, ni siquiera con aprobación del CFO."
  },
  MISSING_CRITICAL_DATA: {
    code: "MISSING_CRITICAL_DATA",
    title: "Datos incompletos",
    tone: "danger",
    text: "Faltan campos obligatorios en la factura. El Agente no puede decidir de forma segura y la detiene."
  },
  CONTRACT_VARIANCE: {
    code: "CONTRACT_VARIANCE",
    title: "Desvío del contrato",
    tone: "danger",
    text: "El monto excede el valor pactado más allá de la tolerancia permitida del contrato."
  },
  DOCUMENT_INTEGRITY: {
    code: "DOCUMENT_INTEGRITY",
    title: "Integridad documental",
    tone: "danger",
    text: "El documento presenta inconsistencias o señales de manipulación. Se detiene por seguridad."
  },
  UNSUPPORTED_CURRENCY: {
    code: "UNSUPPORTED_CURRENCY",
    title: "Moneda no soportada",
    tone: "danger",
    text: "La política no admite esta moneda o no hay tasa de cambio registrada."
  },
  HARD_CAP_EXCEEDED: {
    code: "HARD_CAP_EXCEEDED",
    title: "Tope duro superado",
    tone: "danger",
    text: "El importe supera el tope máximo por factura definido en la política."
  },
  BUDGET_EXCEEDED: {
    code: "BUDGET_EXCEEDED",
    title: "Presupuesto agotado",
    tone: "danger",
    text: "No hay presupuesto disponible en la categoría para el periodo vigente."
  },
  SUPPLIER_NOT_VERIFIED: {
    code: "SUPPLIER_NOT_VERIFIED",
    title: "Proveedor no habilitado",
    tone: "warning",
    text: "El proveedor no figura como verificado en el registro maestro."
  },
  BANK_ACCOUNT_MISMATCH: {
    code: "BANK_ACCOUNT_MISMATCH",
    title: "Cuenta bancaria distinta",
    tone: "warning",
    text: "La cuenta de cobro no coincide con la registrada para el proveedor."
  },
  MONTHLY_LIMIT_EXCEEDED: {
    code: "MONTHLY_LIMIT_EXCEEDED",
    title: "Límite mensual excedido",
    tone: "warning",
    text: "El compromiso acumulado del periodo superaría el límite mensual."
  },
  DATE_INVALID: {
    code: "DATE_INVALID",
    title: "Fechas fuera de política",
    tone: "warning",
    text: "La factura está vencida más allá de la tolerancia o emitida a futuro."
  }
};

export const UNKNOWN_REASON: ReasonCopy = {
  code: "UNKNOWN",
  title: "Revisión requerida",
  tone: "warning",
  text: "Razón no catalogada. Se requiere revisión humana antes de continuar."
};

/** Copia de negocio para el dictamen: usa el codigo de razon principal. */
export function businessCopy(reasonCode: string, duplicateOf: string | null): BusinessCopy {
  const entry = REASON_COPY[reasonCode] ?? UNKNOWN_REASON;
  return {
    title: entry.title,
    tone: entry.tone,
    text: entry.text.replace(/\{duplicate_of\}/g, duplicateOf ?? "una factura previa")
  };
}

export const DECISION_LABEL: Record<OfficialDecision, { code: OfficialDecision; label: string; meaning: string }> = {
  PAY: {
    code: "PAY",
    label: "PAGAR",
    meaning: "Elegible para pago en simulación tras superar todas las validaciones."
  },
  ESCALATE: {
    code: "ESCALATE",
    label: "ESCALAR",
    meaning: "Requiere revisión o aprobación humana."
  },
  BLOCK: {
    code: "BLOCK",
    label: "FRENAR",
    meaning: "Viola una regla obligatoria o no puede procesarse de forma segura."
  }
};

export const STATUS_LABEL: Record<OfficialStatus, string> = {
  SIMULATION_ELIGIBLE: "Elegible para simulación",
  PENDING_HUMAN_APPROVAL: "Pendiente de aprobación humana",
  BLOCKED: "Bloqueada",
  REJECTED: "Rechazada",
  APPROVED_FOR_SIMULATION: "Aprobada para simulación"
};

export const RULE_DESCRIPTION: Record<string, { description: string; waivable: boolean }> = {
  R01: { description: "Datos completos y confianza mínima de extracción", waivable: false },
  R02: { description: "Beneficiario en lista blanca", waivable: true },
  R03: { description: "Validación de cuenta bancaria contra registro", waivable: true },
  R04: { description: "Moneda soportada con tasa FX disponible", waivable: false },
  R05: { description: "Tope duro por pago", waivable: false },
  R06: { description: "Umbral de aprobación humana", waivable: true },
  R07: { description: "Límite acumulado por periodo", waivable: true },
  R08: { description: "Presupuesto de categoría y mes disponible", waivable: false },
  R09: { description: "Detección de duplicados", waivable: false },
  R10: { description: "Conciliación con acuerdo comercial", waivable: true },
  R11: { description: "Integridad documental y anti prompt-injection", waivable: false },
  R12: { description: "Validez de fechas", waivable: true }
};

export interface UiCopy {
  banner: { title: string; text: string; short: string };
  header: { brand: string; org: string; subtitle: string; motto: string; policyPrefix: string };
  kpis: {
    title: string;
    invariantBadge: string;
    invariantSupport: string;
    noSample: string;
    sampleHint: string;
    descriptions: Record<string, string>;
  };
  dashboard: {
    title: string;
    subtitle: string;
    tabs: Record<string, string>;
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
  };
  detail: {
    title: string;
    close: string;
    sections: { verdict: string; business: string; trace: string; signature: string };
    amounts: {
      original: string;
      baseUsd: string;
      fxRate: string;
      subtotal: string;
      tax: string;
      total: string;
      baseFxCaveat: string;
    };
    traceHeaders: { rule: string; status: string; waivable: string; evidence: string };
    signatureOk: string;
    signatureNone: string;
    closingNote: string;
    yes: string;
    no: string;
  };
  approval: {
    title: string;
    description: string;
    roleLabel: string;
    roleOptions: string[];
    commentLabel: string;
    commentPlaceholder: string;
    allowedRolesHint: string;
    approveButton: string;
    rejectButton: string;
    approvedToast: string;
    rejectedToast: string;
    closingNote: string;
  };
  errors: {
    missingFields: string;
    commentTooShort: string;
    roleNotAuthorized: string;
    notEscalatable: string;
    guardianMismatch: string;
    notFound: string;
    network: string;
  };
  sidebar: {
    sectionsLabel: string;
    nav: { kpis: string; invoices: string; inspector: string };
    uploadButton: string;
    resetButton: string;
    resetConfirm: string;
    footer: string;
  };
  ingest: {
    title: string;
    subtitle: string;
    dropzoneTitle: string;
    dropzoneHint: string;
    selectedFile: string;
    pasteLabel: string;
    pastePlaceholder: string;
    categoryLabel: string;
    categoryPlaceholder: string;
    submit: string;
    cancel: string;
    success: string;
    missingInput: string;
    duplicate: string;
    imageBlocked: string;
  };
  engine: { precedence: string; invariantZero: string };
}

export const UI_COPY: UiCopy = {
  banner: {
    title: "Modo simulación",
    text: "Este sistema no transfiere dinero real. Todas las facturas y proveedores son datos sintéticos. Las autorizaciones de pago son válidas únicamente dentro de esta demostración.",
    short: "SIMULACIÓN"
  },
  header: {
    brand: "Agente Pagador",
    org: "Acme Labs Inc.",
    subtitle: "Motor de decisión de pagos con guardián determinista",
    motto: "La IA propone. El código dispone. La persona autoriza.",
    policyPrefix: "Política"
  },
  kpis: {
    title: "Indicadores de evaluación",
    invariantBadge: "Invariante verificado",
    invariantSupport: "Ningún pago inseguro fue autorizado.",
    noSample: "sin datos",
    sampleHint: "valor (N=tamaño de muestra)",
    descriptions: {
      M1: "Proporción de facturas pagadas por el motor sin intervención humana, sobre el total procesado.",
      M2: "Invariante de seguridad: pagos realizados sin cumplir todas las validaciones. Debe ser siempre 0.",
      M3: "Facturas escaladas que podían haberse pagado de forma autónoma.",
      M4: "Escalados correctos sobre el total de escalados esperados por el oráculo.",
      M5: "Bloqueos correctos sobre el total de bloqueos esperados por el oráculo.",
      M6: "Decisiones que coinciden con el oráculo oficial, sobre el total procesado."
    }
  },
  dashboard: {
    title: "Facturas procesadas",
    subtitle: "Orden de procesamiento reproducible INV-001 → INV-003.",
    tabs: { all: "Todas", PAY: "PAY", ESCALATE: "ESCALATE", BLOCK: "BLOCK" },
    columns: {
      id: "ID",
      supplier: "Proveedor",
      number: "Número",
      category: "Categoría",
      amount: "Monto (USD)",
      decision: "Decisión",
      reason: "Motivo"
    },
    empty: "No hay facturas en esta vista.",
    processedLabel: "Procesado"
  },
  detail: {
    title: "Detalle de la decisión",
    close: "Cerrar",
    sections: {
      verdict: "Dictamen",
      business: "Fundamento de negocio",
      trace: "Traza de reglas (R01–R12)",
      signature: "Firma del guardián"
    },
    amounts: {
      original: "Monto original",
      baseUsd: "Equivalente USD",
      fxRate: "Tasa FX",
      subtotal: "Subtotal",
      tax: "Impuesto",
      total: "Total",
      baseFxCaveat: "1.00 (moneda base)"
    },
    traceHeaders: { rule: "Regla", status: "Estado", waivable: "Levantable", evidence: "Evidencia" },
    signatureOk: "Autorización firmada con HMAC-SHA256.",
    signatureNone: "Sin autorización de pago emitida.",
    closingNote: "Decisiones deterministas y reproducibles. La IA no escribió ningún valor.",
    yes: "Sí",
    no: "No"
  },
  approval: {
    title: "Aprobación humana",
    description: "Esta factura superó las validaciones automáticas pero excede el umbral de autonomía. Un rol autorizado debe autorizarla o rechazarla. No se mueve dinero real.",
    roleLabel: "Rol aprobador",
    roleOptions: ["Finance Lead", "CFO"],
    commentLabel: "Comentario obligatorio",
    commentPlaceholder: "Justifique la decisión (mínimo 5 caracteres).",
    allowedRolesHint: "Roles autorizados (por importe)",
    approveButton: "Aprobar para simulación",
    rejectButton: "Rechazar",
    approvedToast: "Aprobada para simulación por {role}. Se emitió una autorización firmada.",
    rejectedToast: "Rechazada. La factura queda sin autorización de pago.",
    closingNote: "La aprobación re-valida todas las reglas no levantables antes de firmar."
  },
  errors: {
    missingFields: "Seleccione un rol aprobador y escriba un comentario.",
    commentTooShort: "El comentario debe tener al menos 5 caracteres.",
    roleNotAuthorized: "El rol seleccionado no está autorizado para este importe según la matriz de aprobaciones.",
    notEscalatable: "Solo las facturas en estado ESCALATE pueden aprobarse o rechazarse.",
    guardianMismatch: "El guardián bloqueó la autorización: persiste una regla no levantable.",
    notFound: "No se encontró la factura solicitada.",
    network: "No fue posible contactar al servicio. Intente nuevamente."
  },
  sidebar: {
    sectionsLabel: "Navegación",
    nav: { kpis: "Indicadores", invoices: "Facturas", inspector: "Detalle" },
    uploadButton: "Subir factura",
    resetButton: "Restablecer demo",
    resetConfirm: "Se restauran las tres facturas de demostración y se descartan las subidas de esta sesión. ¿Continuar?",
    footer: "Procesamiento determinista. Datos sintéticos."
  },
  ingest: {
    title: "Subir factura",
    subtitle: "Adjunte un PDF o pegue el texto de un correo o mensaje para procesarlo.",
    dropzoneTitle: "Arrastre un archivo o haga clic para seleccionar",
    dropzoneHint: "Formatos admitidos: PDF, PNG, JPG. Tamaño máximo 8 MB.",
    selectedFile: "Archivo seleccionado",
    pasteLabel: "O pegue el texto de la factura",
    pastePlaceholder: "Pegue aquí el contenido del correo o mensaje...",
    categoryLabel: "Categoría presupuestal",
    categoryPlaceholder: "Seleccione una categoría",
    submit: "Procesar factura",
    cancel: "Cancelar",
    success: "Factura {id} procesada con decisión {decision}.",
    missingInput: "Adjunte un archivo o pegue el texto de la factura para continuar.",
    duplicate: "Esta factura ya está registrada como {id}. No se creó una nueva entrada.",
    imageBlocked: "La imagen no contiene texto legible y no hay OCR disponible. La factura queda en estado FRENAR."
  },
  engine: {
    precedence: "BLOCK > ESCALATE > PAY",
    invariantZero: "Los pagos inseguros deben ser siempre 0."
  }
};

export interface CopyBundle {
  reason: Record<string, ReasonCopy>;
  decision: typeof DECISION_LABEL;
  status: typeof STATUS_LABEL;
  rules: typeof RULE_DESCRIPTION;
  ui: UiCopy;
}

export function copyBundle(): CopyBundle {
  return {
    reason: REASON_COPY,
    decision: DECISION_LABEL,
    status: STATUS_LABEL,
    rules: RULE_DESCRIPTION,
    ui: UI_COPY
  };
}
