import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { DocumentFlag, ExtractedInvoice } from "@agente/schemas";

/**
 * Extraccion determinista para la ingesta de facturas.
 *
 * - PDF: recupera el texto de los content streams (ASCII85 + Flate) y lo parsea.
 * - Imagen (PNG/JPEG/etc.): sin OCR disponible => extraccion vacia (fail-closed).
 * - Texto libre (correo/chat): parseo por etiquetas es/en.
 *
 * Regla de oro: la IA no interviene. Todo valor sale de patrones explicitos o se
 * deja ausente; un campo critico ausente hace que R01 FRENE (nunca adivina).
 */

export type IngestKind = "pdf" | "image" | "text";

/** Proveedor del registro maestro, para resolver nombre/cuenta declarados. */
export interface SupplierRef {
  supplier_id: string;
  name: string;
  registered_bank_account: string;
  budget_category: string;
}

export interface ExtractContext {
  /** Concepto/categoria presupuestal elegida por la persona en la ingesta. */
  category: string;
  suppliers: readonly SupplierRef[];
}

export interface ExtractInput {
  kind: IngestKind;
  bytes?: Buffer;
  text?: string;
  fileName?: string;
}

export interface ExtractResult {
  source: IngestKind;
  /** Texto crudo recuperado del documento (vacio si no fue posible). */
  rawText: string;
  invoice: ExtractedInvoice;
  /** Campos que no pudieron extraerse (alimentan el mensaje de error). */
  missingFields: string[];
}

export function sha256Bytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** SHA-256 de un texto normalizado (correo/chat) â€” duplicado por contenido. */
export function sha256Text(text: string): string {
  return createHash("sha256").update(text.trim().replace(/\s+/g, " "), "utf8").digest("hex");
}

/* ------------------------------------------------------------------ *
 * Deteccion de tipo de archivo
 * ------------------------------------------------------------------ */

export function detectKind(fileName: string | undefined, mime: string | undefined, bytes: Buffer): IngestKind {
  const name = (fileName ?? "").toLowerCase();
  const type = (mime ?? "").toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (
    type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|tiff?|heic)$/.test(name) ||
    isPng(bytes) ||
    isJpeg(bytes)
  ) {
    return "image";
  }
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return "text";
}

function isPng(bytes: Buffer): boolean {
  return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/* ------------------------------------------------------------------ *
 * PDF: decodificacion de streams y extraccion de texto
 * ------------------------------------------------------------------ */

/** Decodifica ASCII85 (RFC 1924, como lo emite ReportLab con `<~ ~>`). */
export function ascii85Decode(input: Buffer): Buffer {
  const str = input
    .toString("latin1")
    .replace(/^\s*<~/, "")
    .split("~>")[0]!
    .replace(/\s+/g, "");
  const out: Buffer[] = [];
  let i = 0;
  while (i < str.length) {
    const chunk = str.slice(i, i + 5);
    i += 5;
    const width = chunk.length;
    if (width === 0) break;
    // Un grupo final incompleto de w caracteres codifica w-1 bytes; se rellena
    // con 'u' (84) para completar los 5 y luego se descartan los sobrantes.
    const padded = width < 5 ? chunk + "u".repeat(5 - width) : chunk;
    let value = 0;
    for (const ch of padded) {
      const code = ch.charCodeAt(0) - 33;
      value = value * 85 + (code < 0 || code > 84 ? 84 : code);
    }
    const bytes: number[] = [];
    for (let k = 3; k >= 0; k -= 1) {
      bytes.unshift(value & 0xff);
      value = Math.floor(value / 256);
    }
    out.push(Buffer.from(bytes.slice(0, width - 1)));
  }
  return Buffer.concat(out);
}

/** Extrae el texto de un content stream PDF (operadores `Tj`/`TJ`). */
export function pdfContentToText(content: string): string {
  const lines: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const matches = line.match(/\((?:[^\\()]|\\.)*\)/g);
    if (!matches) continue;
    const parts = matches.map((m) => decodePdfString(m.slice(1, -1)));
    const joined = parts.join(" ").replace(/\s+/g, " ").trim();
    if (joined.length > 0) lines.push(joined);
  }
  return lines.join("\n");
}

function decodePdfString(value: string): string {
  return value
    .replace(/\\([0-7]{1,3})/g, (_m, oct: string) => String.fromCharCode(Number.parseInt(oct, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\([\\()])/g, "$1");
}

/** Recupera el texto plano de un PDF sintetico (mejor esfuerzo, sin OCR). */
export function extractPdfText(bytes: Buffer): string {
  const source = bytes.toString("latin1");
  // El stream puede terminar con salto de linea o directamente en `~>endstream`.
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  const chunks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(source)) !== null) {
    const raw = Buffer.from(match[1]!, "latin1");
    const decoded = tryDecodeStream(raw);
    if (decoded && /(?:Tj|TJ)/.test(decoded)) {
      chunks.push(pdfContentToText(decoded));
    }
  }
  return chunks.join("\n").trim();
}

function tryDecodeStream(raw: Buffer): string | null {
  const attempt = (buffer: Buffer): string | null => {
    try {
      const inflated = inflateSync(buffer);
      return inflated.toString("latin1");
    } catch {
      return null;
    }
  };
  // ReportLab: /Filter [ /ASCII85Decode /FlateDecode ]
  return attempt(ascii85Decode(raw)) ?? attempt(raw) ?? null;
}

/* ------------------------------------------------------------------ *
 * Parseo de texto por etiquetas (es/en)
 * ------------------------------------------------------------------ */

const RE = {
  invoiceNumber:
    /(?:n[.ÂºoÂ°\s]*de\s*factura|n[uÃº]mero(?:\s+de)?\s*factura|factura(?:\s*(?:n[.ÂºoÂ°]|nro\.?|no\.?|n[uÃº]mero|num\.?|#|number))?|\binvoice\b(?:\s*(?:no\.?|#|number|num))?)\s*[:#-]?\s*(.*)$/i,
  issueDate: /(?:fecha\s+de\s+emisi[oÃ³]n|fecha\s+emisi[oÃ³]n|\bfecha\b|issue\s*date|emitida(?:\s+el)?)\s*[:#-]?\s*(.*)$/i,
  dueDate: /(?:fecha\s+de\s+vencimiento|\bvencimiento\b|due\s*date|\bvence\b(?:\s+el)?)\s*[:#-]?\s*(.*)$/i,
  total: /(?<![a-z])(?:total(?:\s+a\s+pagar)?|monto(?:\s+total)?|importe(?:\s+total)?|amount(?:\s+due)?)\s*[:#-]?\s*(.*)$/i,
  subtotal: /(?:sub\s*total)\s*[:#-]?\s*(.*)$/i,
  tax: /(?:\bimpuesto\b|\biva\b|\bi\.v\.a\b|\btax\b)\s*[:#-]?\s*(.*)$/i,
  currency: /(?:\bmoneda\b|\bcurrency\b)\s*[:#-]?\s*([A-Za-z]{3})/i,
  bank: /(?:cuenta\s+bancaria[^:]*(?::|\bpara\s+el\s+pago\b)|cuenta(?:\s+de\s+cobro)?|bank\s+account|iban|clabe)\s*[:#-]?\s*(.*)$/i,
  agreement: /(?:\bcontrato\b|\bacuerdo\b|\bcontract\b|\bagreement\b)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9\-_/]{1,})/i,
  supplierId: /(?:id\s+de\s+proveedor|proveedor\s+id|supplier\s*id|\bnit\b|\brfc\b|\bcuit\b|tax\s*id)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9\-_]{2,})/i,
  supplierName: /(?:proveedor|beneficiario|vendor|payee|\bde\b|\bfrom\b)\s*[:#-]\s*(.*)$/i
};

/**
 * Primer token monetario de un texto ("total de USD 6,500.00 correspondiente" => "USD 6,500.00").
 * Se toma el primero (no el ultimo) porque el texto libre puede encadenar varias
 * etiquetas en una sola linea y el valor buscado sigue inmediatamente a la etiqueta.
 */
function firstMoneyToken(value: string): string {
  const matches = value.match(/(?:[A-Z]{3}\s*)?[-+]?\d[\d.,]*/g);
  if (!matches || matches.length === 0) return value.trim();
  return matches[0]!.trim().replace(/[.,]+$/, "");
}

/** Primer token alfanumerico (identificadores: numero de factura, cuenta). */
function firstToken(value: string): string {
  const token = value.trim().match(/[A-Za-z0-9][A-Za-z0-9._/-]*/)?.[0] ?? "";
  return token.replace(/[.]+$/, "");
}

const MONTH_NAMES: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
  jan: "01", apr: "04", aug: "08", dec: "12"
};

/** Normaliza importes con separador decimal europeo o anglosajon. */
export function normalizeNumber(token: string): number | null {
  const cleaned = token
    .replace(/[^\d.,]/g, "")
    .replace(/^[.,]+/, "")
    .replace(/[.,]+$/, "");
  if (!/\d/.test(cleaned)) return null;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let decimalSep: string | null = null;
  if (hasComma && hasDot) {
    decimalSep = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".") ? "," : ".";
  } else if (hasComma) {
    decimalSep = /,\d{1,2}$/.test(cleaned) ? "," : null;
  } else if (hasDot) {
    decimalSep = /\.\d{1,2}$/.test(cleaned) ? "." : null;
  }
  if (decimalSep) {
    const idx = cleaned.lastIndexOf(decimalSep);
    const intPart = cleaned.slice(0, idx).replace(/[.,]/g, "");
    const fracPart = cleaned.slice(idx + 1).replace(/[.,]/g, "");
    const value = Number.parseFloat(`${intPart || "0"}.${fracPart}`);
    return Number.isFinite(value) ? value : null;
  }
  const value = Number.parseFloat(cleaned.replace(/[.,]/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Normaliza fechas iso / dd-mm-yyyy / dd-mmm-yyyy. */
export function normalizeDate(token: string): string | null {
  const value = token.trim();
  const iso = value.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(iso[2]!)}-${pad2(iso[3]!)}`;
  const dmy = value.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    const year = dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]!;
    return `${year}-${pad2(dmy[2]!)}-${pad2(dmy[1]!)}`;
  }
  const textual = value.match(/(\d{1,2})[\s-]*([a-zA-ZÃ¡Ã©Ã­Ã³Ãº]{3})[a-zA-Z]*[\s,-]*(\d{2,4})/);
  if (textual) {
    const month = MONTH_NAMES[textual[2]!.toLowerCase()];
    if (month) {
      const year = textual[3]!.length === 2 ? `20${textual[3]}` : textual[3]!;
      return `${year}-${month}-${pad2(textual[1]!)}`;
    }
  }
  return null;
}

const pad2 = (n: string): string => n.padStart(2, "0");

const CURRENCY_WORDS: Record<string, string> = {
  usd: "USD", dolar: "USD", dolares: "USD", "dÃ³lar": "USD", "dÃ³lares": "USD",
  eur: "EUR", euro: "EUR", euros: "EUR",
  cop: "COP", peso: "COP", pesos: "COP",
  mxn: "MXN", brl: "BRL", real: "BRL", reais: "BRL"
};

function detectCurrency(token: string): { currency: string | null; confidence: number } {
  const iso = token.match(/\b([A-Za-z]{3})\b/);
  if (iso && CURRENCY_WORDS[iso[1]!.toLowerCase()]) {
    return { currency: CURRENCY_WORDS[iso[1]!.toLowerCase()]!, confidence: 0.95 };
  }
  const word = token.toLowerCase().match(/[a-zÃ¡Ã©Ã­Ã³Ãº]+/g) ?? [];
  for (const w of word) {
    if (CURRENCY_WORDS[w]) return { currency: CURRENCY_WORDS[w]!, confidence: 0.92 };
  }
  if (/\$|us\$/.test(token)) {
    // Simbolo ambiguo: se asume divisa base pero con confianza por debajo del minimo
    // => R01 escala a revision humana en lugar de pagar de forma autonoma.
    return { currency: "USD", confidence: 0.8 };
  }
  return { currency: null, confidence: 0 };
}

const INJECTION_PATTERNS = [
  /ignora\s+(?:todas?\s+)?(?:las\s+)?(?:instrucciones|indicaciones)/i,
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|prompts)/i,
  /disregard\s+(?:all\s+)?(?:previous|prior)/i,
  /(?:system|developer)\s+prompt/i,
  /paga(?:r)?\s+(?:directamente|sin\s+(?:revisi[oÃ³]n|validar))/i,
  /autoriza(?:r)?\s+(?:el\s+)?pago\s+(?:directamente|sin)/i,
  /override\s+(?:the\s+)?(?:rules|policy|guards?)/i
];

function hasInjectionSignal(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

interface ParsedFields {
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  supplierName: string;
  bankRef: string;
  agreementRef: string;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  currency: string;
  rawAmount: string;
  fieldConfidence: Record<string, number>;
}

/** Extrae los campos de un texto (PDF aplanado o correo/chat). */
export function parseInvoiceText(text: string, context: ExtractContext): ParsedFields {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

  const confidence: Record<string, number> = {};
  let invoiceNumber: string | null = null;
  let issueDate: string | null = null;
  let dueDate: string | null = null;
  let supplierName = "";
  let bankRef = "";
  let agreementRef = "";
  let total: number | null = null;
  let subtotal: number | null = null;
  let tax: number | null = null;
  let currency = "";
  let rawAmount = "";

  // 1) Nombre de proveedor por coincidencia con el registro maestro (mas fiable
  //    que un encabezado de columna suelto como "Proveedor").
  const lowered = text.toLowerCase();
  const known = context.suppliers
    .filter((s) => lowered.includes(s.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (known) {
    supplierName = known.name;
    confidence["payee.name"] = 0.94;
  }

  const setValue = (field: keyof ParsedFields, value: string, conf: number): void => {
    switch (field) {
      case "invoiceNumber": {
        const token = firstToken(value);
        if (!invoiceNumber && /\d/.test(token)) {
          invoiceNumber = token;
          confidence["invoice_number"] = conf;
        }
        break;
      }
      case "issueDate": {
        const date = normalizeDate(value);
        if (!issueDate && date) {
          issueDate = date;
          confidence.issue_date = conf;
        }
        break;
      }
      case "dueDate": {
        const date = normalizeDate(value);
        if (!dueDate && date) {
          dueDate = date;
          confidence.due_date = conf;
        }
        break;
      }
      case "supplierName": {
        const name = value
          .replace(/<[^>]*>/g, " ")
          .replace(/\S+@\S+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/[.,;:]+$/, "");
        if (supplierName === "" && name.length > 1) {
          supplierName = name;
          confidence["payee.name"] = conf;
        }
        break;
      }
      case "bankRef": {
        const token = firstToken(value);
        if (!bankRef && token.length > 3) {
          bankRef = token;
          confidence.bank_ref = conf;
        }
        break;
      }
      case "agreementRef":
        if (!agreementRef) agreementRef = value.trim();
        break;
      case "total":
        if (total == null) {
          const token = firstMoneyToken(value);
          const parsed = normalizeNumber(token);
          rawAmount = token;
          if (parsed != null) {
            total = parsed;
            confidence["amount.total"] = conf;
          }
        }
        break;
      case "subtotal":
        if (subtotal == null) {
          const parsed = normalizeNumber(firstMoneyToken(value));
          if (parsed != null) {
            subtotal = parsed;
            confidence["amount.subtotal"] = conf;
          }
        }
        break;
      case "tax":
        if (tax == null) {
          const parsed = normalizeNumber(firstMoneyToken(value));
          if (parsed != null) {
            tax = parsed;
            confidence["amount.tax"] = conf;
          }
        }
        break;
      default:
        break;
    }
  };

  const capture = (re: RegExp, line: string): string => {
    const match = line.match(re);
    return match ? (match[1] ?? "").trim() : "";
  };

  /** Detecta etiquetas sin valor en la linea (el valor viene en la siguiente). */
  const endsWithSeparator = (line: string): boolean => line.trim().endsWith(":");
  const labelWithoutValue = (line: string): boolean => {
    const candidates = [RE.bank, RE.invoiceNumber, RE.total, RE.subtotal, RE.tax, RE.supplierName, RE.agreement];
    return candidates.some((re) => re.test(line) && capture(re, line) === "");
  };

  let pending: keyof ParsedFields | null = null;

  for (const line of lines) {
    // El valor de una etiqueta suelta (layout en columnas del PDF) va en la linea
    // siguiente; se consume aqui antes de evaluar nuevas etiquetas.
    if (pending) {
      const field = pending;
      pending = null;
      if (!labelWithoutValue(line)) setValue(field, line, 0.85);
      continue;
    }

    if (RE.issueDate.test(line)) {
      const value = capture(RE.issueDate, line);
      if (value === "") {
        if (endsWithSeparator(line)) {
          pending = "issueDate";
          continue;
        }
      } else {
        setValue("issueDate", value, 0.95);
      }
    }
    if (RE.dueDate.test(line)) {
      const value = capture(RE.dueDate, line);
      if (value === "") {
        if (endsWithSeparator(line)) {
          pending = "dueDate";
          continue;
        }
      } else {
        setValue("dueDate", value, 0.95);
      }
    }
    const currencyValue = capture(RE.currency, line);
    if (currencyValue && !currency) currency = currencyValue.toUpperCase();
    if (RE.bank.test(line)) {
      const value = capture(RE.bank, line);
      if (value === "" && endsWithSeparator(line)) {
        pending = "bankRef";
        continue;
      }
      if (value !== "") setValue("bankRef", value, 0.92);
    }
    if (RE.invoiceNumber.test(line)) {
      const value = capture(RE.invoiceNumber, line);
      if (value === "" && endsWithSeparator(line)) {
        pending = "invoiceNumber";
        continue;
      }
      if (value !== "") setValue("invoiceNumber", value, 0.95);
    }
    if (RE.total.test(line)) {
      const value = capture(RE.total, line);
      if (value === "" && endsWithSeparator(line)) {
        pending = "total";
        continue;
      }
      if (value !== "") setValue("total", value, 0.95);
    }
    if (RE.subtotal.test(line)) {
      const value = capture(RE.subtotal, line);
      if (value) setValue("subtotal", value, 0.95);
    }
    if (RE.tax.test(line)) {
      const value = capture(RE.tax, line);
      if (value) setValue("tax", value, 0.95);
    }
    if (!known && RE.supplierId.test(line)) {
      const id = capture(RE.supplierId, line);
      const byId = context.suppliers.find((s) => s.supplier_id.toLowerCase() === id.toLowerCase());
      if (byId) {
        supplierName = byId.name;
        confidence["payee.name"] = 0.93;
      }
    }
    if (supplierName === "" && RE.supplierName.test(line)) {
      const value = capture(RE.supplierName, line);
      if (value === "" && endsWithSeparator(line)) {
        pending = "supplierName";
        continue;
      }
      if (value !== "" && value.length > 1) setValue("supplierName", value, 0.9);
    }
    const agreement = capture(RE.agreement, line);
    if (agreement) setValue("agreementRef", agreement, 0.9);
  }

  // 2) Divisa: etiqueta explicita, o el codigo del importe, o simbolo.
  if (!currency && rawAmount) {
    const detected = detectCurrency(rawAmount);
    if (detected.currency) {
      currency = detected.currency;
      confidence["amount.currency"] = detected.confidence;
    }
  }
  if (currency && confidence["amount.currency"] == null) confidence["amount.currency"] = 0.95;

  return {
    invoiceNumber,
    issueDate,
    dueDate,
    supplierName,
    bankRef,
    agreementRef,
    total,
    subtotal,
    tax,
    currency,
    rawAmount: rawAmount || "0",
    fieldConfidence: confidence
  };
}

/* ------------------------------------------------------------------ *
 * Construccion del ExtractedInvoice (configuracion fail-closed)
 * ------------------------------------------------------------------ */

function emptyInvoice(category: string): ExtractedInvoice {
  return {
    invoice_number: null,
    issue_date: null,
    due_date: null,
    payee: { name: "" },
    amount: {
      raw: "0",
      // `null` a proposito: R01 lo detecta como campo critico faltante y FRENA.
      total: null as unknown as number,
      currency: ""
    },
    concept: category,
    field_confidence: {},
    evidence: {},
    document_flags: []
  };
}

/** Extrae una factura desde archivo (PDF/imagen) o texto libre. */
export function extractInvoice(input: ExtractInput, context: ExtractContext): ExtractResult {
  const missingFields: string[] = [];

  if (input.kind === "image") {
    // Sin OCR en el proyecto => no se inventa nada: R01 frena por datos incompletos.
    const invoice = emptyInvoice(context.category);
    return { source: "image", rawText: "", invoice, missingFields: ["payee.name", "amount.total", "amount.currency", "issue_date"] };
  }

  const text = input.kind === "pdf" ? extractPdfText(input.bytes ?? Buffer.alloc(0)) : (input.text ?? "");

  if (text.trim().length === 0) {
    const invoice = emptyInvoice(context.category);
    return { source: input.kind, rawText: "", invoice, missingFields: ["payee.name", "amount.total", "amount.currency", "issue_date"] };
  }

  const parsed = parseInvoiceText(text, context);
  const flags: DocumentFlag[] = [];
  if (hasInjectionSignal(text)) flags.push("injection_suspected");

  const value = parsed.total;
  if (value == null) missingFields.push("amount.total");
  if (!parsed.supplierName) missingFields.push("payee.name");
  if (!parsed.currency) missingFields.push("amount.currency");
  if (!parsed.issueDate) missingFields.push("issue_date");

  const evidence: Record<string, { snippet: string }> = {};
  const snippet = (field: string, needle: string): void => {
    const line = text.split(/\r?\n/).find((l) => l.includes(needle));
    if (line) evidence[field] = { snippet: line.trim().slice(0, 160) };
  };
  if (parsed.supplierName) snippet("payee.name", parsed.supplierName);
  if (parsed.total != null) snippet("amount.total", parsed.rawAmount || String(parsed.total));
  if (parsed.issueDate) snippet("issue_date", parsed.issueDate);
  if (parsed.bankRef) evidence["payee.bank_ref"] = { snippet: parsed.bankRef };

  const invoice: ExtractedInvoice = {
    invoice_number: parsed.invoiceNumber,
    issue_date: parsed.issueDate,
    due_date: parsed.dueDate,
    payee: {
      name: parsed.supplierName,
      ...(parsed.bankRef ? { bank_ref: parsed.bankRef } : {})
    },
    amount: {
      raw: parsed.rawAmount,
      total: (parsed.total ?? null) as unknown as number,
      ...(parsed.subtotal != null ? { subtotal: parsed.subtotal } : {}),
      ...(parsed.tax != null ? { tax: parsed.tax } : {}),
      currency: parsed.currency
    },
    concept: context.category,
    ...(parsed.agreementRef ? { agreement_ref: parsed.agreementRef } : {}),
    field_confidence: parsed.fieldConfidence,
    evidence,
    document_flags: flags
  };

  return { source: input.kind, rawText: text, invoice, missingFields };
}
