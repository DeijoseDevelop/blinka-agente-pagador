
# Blinka — Agente Pagador con Guardián Determinista

> *"La IA propone. El código dispone. La persona autoriza."*

Sistema empresarial de cuentas por pagar y verificación de facturas. Implementa una arquitectura dual: extracción e ingesta inteligente de documentos asistida por IA, acoplada a un **Guardián Determinista** de 12 reglas financieras inmutables (R01 a R12), diseñado para mantener en cero los pagos inseguros (M2 = 0).

**Repositorio oficial:** [blinka-agente-pagador](https://github.com/nicolas0798t/blinka-agente-pagador)

---

## 🎯 Caso de uso (Reto Blinka)

El sistema procesa documentos y solicitudes de pago, clasificándolos en tres ramas operativas:

1. **PAGAR (`PAY`):** aprobación automática para facturas válidas dentro del umbral de autonomía y con contratos vigentes.
2. **ESCALAR (`ESCALATE`):** envío al rol financiero correspondiente, como *Finance Lead* o *CFO*, cuando el monto o la variación supera los límites automáticos.
3. **BLOQUEAR (`BLOCK`):** bloqueo ante duplicados confirmados, discrepancias en cuentas bancarias o sospechas de inyección de prompts.

---

## 🧱 Arquitectura del monorepo

```text
Blinka/
├── apps/
│   ├── api/          # Backend Fastify con TypeScript y endpoints REST
│   └── web/          # Dashboard corporativo con React, Vite y Tailwind CSS
├── packages/
│   └── pipeline/     # Motor determinista, guardián HMAC-SHA256,
│                     # reglas R01-R12 e ingesta documental
├── config/           # Políticas empresariales, límites y contratos maestros
└── data/             # Datos de demostración y oráculo de evaluación
```

---

## 🛡️ Reglas y verificación (R01 a R12)

- **R01:** integridad y confiabilidad de los datos críticos de la factura.
- **R02 y R03:** validación del proveedor registrado y verificación estricta de la cuenta bancaria contra el registro maestro.
- **R04:** validación de la moneda autorizada (`USD`).
- **R05 y R06:** validación del tope absoluto de pago y del umbral de autonomía de **5.000,00 USD**.
- **R07 y R08:** verificación del presupuesto mensual y del saldo disponible por categoría (`cloud`, `tech_consulting`).
- **R09:** detección de duplicados en el registro de pagos mediante hash SHA-256 y una ventana semántica de 30 días.
- **R10:** validación del alcance contractual, concordancia de conceptos y tolerancia del importe.
- **R11:** verificación de la integridad documental y detección de ataques de inyección de prompts.
- **R12:** validación cronológica de las fechas de emisión y vencimiento.

---

## 📊 Métricas de evaluación (Benchmark M1–M6)

| Métrica | Definición | Resultado reportado |
| --- | --- | --- |
| **M1** | Autonomía: facturas pagadas sin intervención humana | 33,3 % (N=3) |
| **M2** | Pagos inseguros | 0,0 % (N=3) |
| **M3** | Sobre-escalamiento indebido | 0,0 % (N=3) |
| **M4** | Acierto en `ESCALATE` | 100,0 % (N=1) |
| **M5** | Acierto en `BLOCK` | 100,0 % (N=1) |
| **M6** | Exactitud global frente al oráculo | 100,0 % (N=3) |

> **Nota:** estos resultados corresponden a las métricas reportadas para el conjunto de evaluación indicado. No representan una garantía de seguridad en producción.

---

## � API REST

La API es la única vía de autorización: el frontend solo la consume y nunca puede fabricar una firma.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Estado del servicio (`simulationOnly: true`). |
| `GET` | `/api/run` | Última corrida del pipeline (decisiones, métricas, oráculo). |
| `GET` | `/api/decisions` | Lista de decisiones del run vigente. |
| `GET` | `/api/decisions/:id` | Detalle de una decisión (reglas, hallazgos, narrativa, firmas). |
| `POST` | `/api/decisions/:id/replay` | Re-evalúa con el snapshot guardado y verifica determinismo. |
| `POST` | `/api/invoices` | Ingesta una factura (`text`, o `contentBase64` + `fileName`/`mime`). |
| `GET` | `/api/approvals` | Cola humana: facturas escaladas pendientes de resolución. |
| `POST` | `/api/approvals/:id/approve` | Aprueba una escalada (`role`, `comment`). Re-evalúa antes de firmar. |
| `POST` | `/api/approvals/:id/reject` | Rechaza una escalada (`comment`). |
| `GET` | `/api/policy` | Política oficial + límites efectivos del motor. |
| `GET` | `/api/audit/verify` | Verifica la cadena de auditoría encadenada por hash. |
| `POST` | `/api/eval/run` | Ejecuta el benchmark contra el oráculo (M1–M6). |
| `POST` | `/api/reset` | Restaura el estado de demostración. |
| `GET` | `/api/copy` | Microcopys de la interfaz. |

**Controles de seguridad:** límite de body de 8 MiB, validación de firmas de contenido (PDF/imagen) más allá del MIME declarado, detección de inyección de prompts en el texto, errores 5xx sin trazas internas, CORS restringido (ver `CORS_ORIGIN`), gate opcional `x-approvals-token` para la cola humana y cadena de auditoría append-only verificable.

---

## �🚀 Puesta en marcha local

### Prerrequisitos

- Node.js >= 20.x (probado en v22.18.0).
- npm >= 10.x.

### 1. Instalar dependencias

Desde la raíz del proyecto, ejecuta:

```bash
npm install
```

### 2. Ejecutar el backend y el frontend

```bash
npm run dev
```

### 3. Acceder a la aplicación

- **Dashboard web:** http://127.0.0.1:5173
- **API Fastify:** http://127.0.0.1:8787

### 4. Ejecutar las pruebas

**Suite de pruebas unitarias y de integración:**

```bash
npm test
```

**Benchmark de evaluación frente al oráculo:**

```bash
npm run eval
```

**Verificación estricta de tipos de TypeScript:**

```bash
npm run typecheck
```

---

## � Despliegue en producción (Railway)

El monorepo se despliega como **un solo servicio**: la API (Fastify) sirve tanto la API REST (`/api/*`) como el frontend compilado (`apps/web/dist`). El `railway.toml` de la raíz ya lo deja configurado — conecta el repo y listo.

### Pasos

1. En Railway: `New Project → Deploy from GitHub` y selecciona este repositorio. Si Railway crea dos servicios por el auto-import de monorepo, quédate solo con el de la **API** (o crea el servicio a mano con *Root Directory* `/` — usará `railway.toml` por defecto).
2. Genera el dominio público (*Settings → Networking → Generate Domain*). Listo: API + dashboard en el mismo dominio.
3. Recomendado: define `GUARDIAN_HMAC_SECRET` en las variables del servicio.

Config efectiva (de `railway.toml`, no hace falta tocarla):

| Etapa | Comando |
| --- | --- |
| Build | `npm run build:web` (compila el frontend a `apps/web/dist`) |
| Start | `npm run start:api` (sirve API + frontend en `$PORT`) |
| Healthcheck | `/api/health` |

### Variables de entorno

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto de escucha. **Lo inyecta Railway automáticamente**; no lo definas. |
| `GUARDIAN_HMAC_SECRET` | Secreto HMAC-SHA256 del Guardián. Sin definir usa `acme-eval-secret` (solo demo). |
| `GUARDIAN_REQUIRE_SECRET` | `1` exige `GUARDIAN_HMAC_SECRET` definido o el Guardián falla al iniciar. Recomendado en producción. |
| `CORS_ORIGIN` | Orígenes permitidos separados por coma. Sin definir solo permite los orígenes locales de Vite (`localhost:5173`); nunca refleja orígenes arbitrarios. |
| `APPROVALS_TOKEN` | Si está definido, aprobar/rechazar exige el header `x-approvals-token` (separación de funciones mínima). |

Consulta `.env.example` para la lista completa. La versión de Node queda fijada en 22.x vía `engines` y `.nvmrc`.

### Alternativa — dos servicios (web estática + API)

Si prefieres servir el frontend como sitio estático aparte, crea un segundo servicio con *Root Directory* `/`, config path `apps/web/railway.toml`, build `npm run build:web` y start `npm run start:web` (`serve -s dist`). En ese caso define `VITE_API_URL=https://<dominio-de-la-api>` en el servicio web **antes del build** (Vite la embebe) y `CORS_ORIGIN` en la API con el dominio de la web.

---

## �🔒 Aviso de seguridad

*Modo simulación.* Este sistema no transfiere dinero real. Todas las facturas y los proveedores son datos sintéticos. Las autorizaciones de pago son válidas únicamente dentro de esta demostración.

La IA ayuda a extraer y analizar la información documental. Las decisiones financieras se someten a reglas deterministas y a los controles de autorización definidos por el sistema.

**Importante:** las métricas, los resultados de las pruebas y las capacidades descritas deben verificarse ejecutando el proyecto. Este README documenta el comportamiento esperado y los resultados reportados, pero por sí solo no certifica que el sistema sea seguro.

---

## 📌 Tecnologías principales

- **Backend:** Node.js, TypeScript y Fastify.
- **Frontend:** React, Vite y Tailwind CSS.
- **Seguridad e integridad:** HMAC-SHA256, SHA-256 y reglas deterministas.
- **Evaluación:** pruebas automatizadas y benchmark frente a un oráculo.

---

**Repositorio:** [github.com/nicolas0798t/blinka-agente-pagador](https://github.com/nicolas0798t/blinka-agente-pagador)
