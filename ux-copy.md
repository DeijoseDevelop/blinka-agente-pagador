# ux-copy.md — Texto oficial de interfaz

> Fuente única de verdad para **todo** el texto que ve la persona usuaria del
> *Agente Pagador* (Acme Labs Inc.). El archivo se sirve por API
> (`GET /api/copy`) y la UI consume el diccionario resultante.
> El espejo tipado vive en `packages/pipeline/src/copy.ts`.
>
> **Tono:** institucional, sobrio y preciso. Transmite solidez técnica y control.
> Nunca promete dinero real. Sin emojis. Sin signos de exclamación.
> Decisiones y códigos en MAYÚSCULAS tal como los emite el motor.
>
> **Idioma:** español (es-CO). Importes en formato `12,345.67 USD` (dos decimales).

---

## 1. Banner global de seguridad (persistente)

- **Título:** `Modo simulación`
- **Texto:** `Este sistema no transfiere dinero real. Todas las facturas y proveedores son datos sintéticos. Las autorizaciones de pago son válidas únicamente dentro de esta demostración.`
- **Etiqueta corta (para cabecera):** `SIMULACIÓN`

---

## 2. Cabecera de aplicación

- **Marca:** `Agente Pagador`
- **Organización:** `Acme Labs Inc.`
- **Subtítulo:** `Motor de decisión de pagos con guardián determinista`
- **Lema de principio:** `La IA propone. El código dispone. La persona autoriza.`
- **Versión de política:** prefijo `Política`

---

## 3. Barra de indicadores (KPIs)

| Clave | Etiqueta | Descripción (tooltip) |
| --- | --- | --- |
| `M1` | `Autonomía (PAY)` | `Proporción de facturas pagadas por el motor sin intervención humana, sobre el total procesado.` |
| `M2` | `Pagos inseguros` | `Invariante de seguridad: pagos realizados sin cumplir todas las validaciones. Debe ser siempre 0.` |
| `M3` | `Sobre-escalamiento` | `Facturas escaladas que podían haberse pagado de forma autónoma.` |
| `M4` | `Acierto ESCALATE` | `Escalados correctos sobre el total de escalados esperados por el oráculo.` |
| `M5` | `Acierto BLOCK` | `Bloqueos correctos sobre el total de bloqueos esperados por el oráculo.` |
| `M6` | `Exactitud de decisión` | `Decisiones que coinciden con el oráculo oficial, sobre el total procesado.` |

- **Insignia del invariante:** `Invariante verificado`
- **Texto de apoyo del invariante:** `Ningún pago inseguro fue autorizado.`
- **Formato de dato:** `valor (N=tamaño de muestra)` — p. ej. `33.3% (N=3)`
- **Estado sin muestra:** `sin datos`

---

## 4. Panel de facturas (dashboard)

- **Título:** `Facturas procesadas`
- **Subtítulo:** `Orden de procesamiento reproducible INV-001 → INV-003.`
- **Pestañas:** `Todas`, `PAY`, `ESCALATE`, `BLOCK`
- **Encabezados de columna:** `ID`, `Proveedor`, `Número`, `Categoría`, `Monto (USD)`, `Decisión`, `Motivo`
- **Estado vacío:** `No hay facturas en esta vista.`
- **Etiqueta de última actualización:** `Procesado`

---

## 5. Etiquetas de decisión

| Código | Etiqueta visible | Significado |
| --- | --- | --- |
| `PAY` | `PAGAR` | `Elegible para pago en simulación tras superar todas las validaciones.` |
| `ESCALATE` | `ESCALAR` | `Requiere revisión o aprobación humana.` |
| `BLOCK` | `FRENAR` | `Viola una regla obligatoria o no puede procesarse de forma segura.` |

- **Estados:** `SIMULATION_ELIGIBLE`, `PENDING_HUMAN_APPROVAL`, `BLOCKED`, `REJECTED`, `APPROVED_FOR_SIMULATION`

---

## 6. Detalle de decisión

- **Título del panel:** `Detalle de la decisión`
- **Botón de cierre del panel:** `Cerrar`
- **Secciones:** `Dictamen`, `Fundamento de negocio`, `Traza de reglas (R01–R12)`, `Firma del guardián`
- **Etiquetas de importe:** `Monto original`, `Equivalente USD`, `Tasa FX`, `Subtotal`, `Impuesto`, `Total`
- **Sin tasa FX aplicable:** `1.00 (moneda base)`
- **Encabezados de traza:** `Regla`, `Estado`, `Levantable`, `Evidencia`
- **Vigencia de firma:** `Autorización firmada con HMAC-SHA256.`
- **Sin firma:** `Sin autorización de pago emitida.`
- **Nota de cierre:** `Decisiones deterministas y reproducibles. La IA no escribió ningún valor.`

---

## 7. Dictamen de negocio por código de razón

> El texto se selecciona por el **código de razón principal** de cada factura.

| Código | Título | Tono | Texto |
| --- | --- | --- | --- |
| `ALL_CHECKS_PASSED` | `Pago verificado` | success | `Esta factura supera las doce validaciones y está dentro del umbral de autonomía. El guardián autoriza el pago en modo simulación sin intervención humana.` |
| `ABOVE_AUTO_THRESHOLD` | `Aprobación humana requerida` | warning | `El importe supera el umbral de auto-aprobación de 5,000.00 USD. El Agente no paga por sí mismo: la factura queda pendiente de aprobación por el rol autorizado según la matriz de Acme Labs Inc.` |
| `DUPLICATE_CONFIRMED` | `Bloqueo permanente` | danger | `Esta factura coincide con otra ya registrada ({duplicate_of}). El bloqueo por duplicado es una regla no levantable: no puede anularse, ni siquiera con aprobación del CFO.` |
| `MISSING_CRITICAL_DATA` | `Datos incompletos` | danger | `Faltan campos obligatorios en la factura. El Agente no puede decidir de forma segura y la detiene.` |
| `CONTRACT_VARIANCE` | `Desvío del contrato` | danger | `El monto excede el valor pactado más allá de la tolerancia permitida del contrato.` |
| `DOCUMENT_INTEGRITY` | `Integridad documental` | danger | `El documento presenta inconsistencias o señales de manipulación. Se detiene por seguridad.` |
| `UNSUPPORTED_CURRENCY` | `Moneda no soportada` | danger | `La política no admite esta moneda o no hay tasa de cambio registrada.` |
| `HARD_CAP_EXCEEDED` | `Tope duro superado` | danger | `El importe supera el tope máximo por factura definido en la política.` |
| `BUDGET_EXCEEDED` | `Presupuesto agotado` | danger | `No hay presupuesto disponible en la categoría para el periodo vigente.` |
| `SUPPLIER_NOT_VERIFIED` | `Proveedor no habilitado` | warning | `El proveedor no figura como verificado en el registro maestro.` |
| `BANK_ACCOUNT_MISMATCH` | `Cuenta bancaria distinta` | warning | `La cuenta de cobro no coincide con la registrada para el proveedor.` |
| `MONTHLY_LIMIT_EXCEEDED` | `Límite mensual excedido` | warning | `El compromiso acumulado del periodo superaría el límite mensual.` |
| `DATE_INVALID` | `Fechas fuera de política` | warning | `La factura está vencida más allá de la tolerancia o emitida a futuro.` |

- **Interpolaciones:** `{duplicate_of}` → ID de la factura ya registrada.
- **Código desconocido:** título `Revisión requerida`, tono `warning`,
  texto `Razón no catalogada. Se requiere revisión humana antes de continuar.`

---

## 8. Módulo de aprobación humana (ESCALATE)

- **Título:** `Aprobación humana`
- **Descripción:** `Esta factura superó las validaciones automáticas pero excede el umbral de autonomía. Un rol autorizado debe autorizarla o rechazarla. No se mueve dinero real.`
- **Campo de rol:** etiqueta `Rol aprobador`; opciones `Finance Lead`, `CFO`
- **Campo de comentario:** etiqueta `Comentario obligatorio`; marcador `Justifique la decisión (mínimo 5 caracteres).`
- **Roles autorizados (por importe):** se muestran según la matriz de aprobaciones.
- **Botón primario:** `Aprobar para simulación`
- **Botón secundario:** `Rechazar`
- **Confirmación de aprobación:** `Aprobada para simulación por {role}. Se emitió una autorización firmada.`
- **Confirmación de rechazo:** `Rechazada. La factura queda sin autorización de pago.`
- **Nota de cierre:** `La aprobación re-valida todas las reglas no levantables antes de firmar.`

---

## 9. Mensajes de error del módulo de aprobación

| Situación | Mensaje |
| --- | --- |
| Falta rol o comentario | `Seleccione un rol aprobador y escriba un comentario.` |
| Comentario demasiado corto | `El comentario debe tener al menos 5 caracteres.` |
| Rol no autorizado para el importe | `El rol seleccionado no está autorizado para este importe según la matriz de aprobaciones.` |
| La factura no es escalable | `Solo las facturas en estado ESCALATE pueden aprobarse o rechazarse.` |
| El guardián detectó una violación | `El guardián bloqueó la autorización: persiste una regla no levantable.` |
| Factura no encontrada | `No se encontró la factura solicitada.` |
| Error de red | `No fue posible contactar al servicio. Intente nuevamente.` |

---

## 10. Reglas R01–R12 (referencia para la traza)

| Regla | Descripción | Levantable |
| --- | --- | --- |
| `R01` | Datos completos y confianza mínima de extracción | no (parcial) |
| `R02` | Beneficiario en lista blanca | sí |
| `R03` | Validación de cuenta bancaria contra registro | sí |
| `R04` | Moneda soportada con tasa FX disponible | no |
| `R05` | Tope duro por pago | no |
| `R06` | Umbral de aprobación humana | sí |
| `R07` | Límite acumulado por periodo | sí |
| `R08` | Presupuesto de categoría y mes disponible | no |
| `R09` | Detección de duplicados | no |
| `R10` | Conciliación con acuerdo comercial | sí |
| `R11` | Integridad documental y anti prompt-injection | no |
| `R12` | Validez de fechas | sí |

---

## 11. Navegación lateral (sidebar)

- **Etiqueta de sección:** `Navegación`
- **Elementos:** `Indicadores`, `Facturas`, `Detalle`
- **Acción primaria:** `Subir factura`
- **Acción de sesión:** `Restablecer demo`
- **Confirmación de restablecimiento:** `Se restauran las tres facturas de demostración y se descartan las subidas de esta sesión. ¿Continuar?`
- **Pie de barra:** `Procesamiento determinista. Datos sintéticos.`

---

## 12. Módulo de ingesta de facturas

- **Título:** `Subir factura`
- **Subtítulo:** `Adjunte un PDF o pegue el texto de un correo o mensaje para procesarlo.`
- **Zona de arrastre:** `Arrastre un archivo o haga clic para seleccionar`
- **Ayuda de formatos:** `Formatos admitidos: PDF, PNG, JPG. Tamaño máximo 8 MB.`
- **Archivo seleccionado (etiqueta):** `Archivo seleccionado`
- **Campo de texto:** etiqueta `O pegue el texto de la factura`; marcador `Pegue aquí el contenido del correo o mensaje...`
- **Selector de categoría:** etiqueta `Categoría presupuestal`; marcador `Seleccione una categoría`
- **Botón primario:** `Procesar factura`
- **Botón secundario:** `Cancelar`
- **Confirmación:** `Factura {id} procesada con decisión {decision}.`
- **Sin entrada:** `Adjunte un archivo o pegue el texto de la factura para continuar.`
- **Duplicado confirmado:** `Esta factura ya está registrada como {id}. No se creó una nueva entrada.`
- **Imagen sin OCR:** `La imagen no contiene texto legible y no hay OCR disponible. La factura queda en estado FRENAR.`
- **Interpolaciones:** `{id}` → ID de la factura; `{decision}` → `PAY`, `ESCALATE` o `BLOCK`.
