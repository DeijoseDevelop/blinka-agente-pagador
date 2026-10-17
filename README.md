```markdown

\# Blinka — Agente Pagador con Guardián Determinista



> \*"La IA propone. El código dispone. La persona autoriza."\*



Sistema autónomo empresarial de cuentas por pagar y verificación de facturas. Implementa una arquitectura dual: extracción e ingesta inteligente de documentos asistida por IA, acoplada a un \*\*Guardián Determinista\*\* de 12 reglas financieras inmutables ($R01$ a $R12$) que garantiza una tasa de pagos inseguros nula ($M\_2 = 0$).



Repositorio oficial: \[github.com/nicolas0798t/blinka-agente-pagador](https://github.com/nicolas0798t/blinka-agente-pagador)



\---



\## 🎯 Caso de Uso (Reto Blinka)



El sistema procesa documentos y solicitudes de pago clasificándolas en tres ramas operativas:

1\. \*\*PAGAR (`PAY`)\*\*: Aprobación autónoma para facturas válidas dentro del umbral de autonomía y con contratos vigentes.

2\. \*\*ESCALAR (`ESCALATE`)\*\*: Enrutamiento al rol financiero adecuado (ej. \*Finance Lead\* o \*CFO\*) cuando el monto o variación excede los límites automáticos.

3\. \*\*BLOQUEAR (`BLOCK`)\*\*: Rechazo inmutable e indeleble ante duplicados confirmados, discrepancias de cuenta bancaria o sospecha de inyección de prompts.



\---



\## 🧱 Arquitectura del Monorepo



```text

├── apps/

│   ├── api/          # Backend Fastify en TypeScript con endpoints REST

│   └── web/          # Dashboard corporativo claro (React + Vite + Tailwind CSS)

├── packages/

│   └── pipeline/     # Motor determinista, Guardián HMAC-SHA256, reglas R01-R12 e ingesta

├── config/           # Políticas de empresa, límites y contratos maestros

└── data/             # Fixtures de demostración y oráculo de evaluación



```



\---



\## 🛡️ Reglas y Verificación ($R01$ a $R12$)



\* \*\*R01\*\*: Integridad y confianza de datos críticos de la factura.

\* \*\*R02 \& R03\*\*: Validación de proveedor registrado y verificación estricta de cuenta bancaria contra maestro.

\* \*\*R04\*\*: Moneda autorizada (`USD`).

\* \*\*R05 \& R06\*\*: Validación de tope absoluto de pago y evaluación de umbral de autonomía ($5.000,00 USD).

\* \*\*R07 \& R08\*\*: Verificación de presupuesto mensual y límite remanente por categoría (`cloud`, `tech\_consulting`).

\* \*\*R09\*\*: Detección de duplicados en ledger por hash SHA-256 y ventana semántica de 30 días.

\* \*\*R10\*\*: Alcance de contrato, concordancia de conceptos y margen de tolerancia de importe.

\* \*\*R11\*\*: Verificación de integridad documental y detección de ataques de inyección.

\* \*\*R12\*\*: Validación cronológica estricta (fechas de emisión vs. vencimiento).



\---



\## 📊 Métricas de Evaluación (Benchmark M1–M6)



| Métrica | Definición | Meta / Resultado |

| --- | --- | --- |

| \*\*M1\*\* | Autonomía (Facturas pagadas sin intervención humana) | 33.3% (N=3) |

| \*\*M2\*\* | \*\*Pagos Inseguros (Invariante de seguridad)\*\* | \*\*0.0% (N=3) ✓ OK\*\* |

| \*\*M3\*\* | Sobre-escalamiento indebido | 0.0% (N=3) |

| \*\*M4\*\* | Acierto en ESCALATE | 100.0% (N=1) |

| \*\*M5\*\* | Acierto en BLOCK | 100.0% (N=1) |

| \*\*M6\*\* | Exactitud global de decisión frente a oráculo | 100.0% (N=3) |



\---



\## 🚀 Puesta en Marcha Local



\### Prerrequisitos



\* Node.js >= 20.x (probado en v22.18.0)

\* npm >= 10.x



\### Instalación



```bash

npm install



```



\### Ejecutar Backend y Frontend en paralelo



```bash

npm run dev



```



\* \*\*Web Dashboard:\*\* `http://127.0.0.1:5173`

\* \*\*API Fastify:\*\* `http://127.0.0.1:8787`



\### Pruebas y Certificación



```bash

\# Ejecutar suite de pruebas unitarias y de integración (92/92 pass)

npm test



\# Ejecutar benchmark de evaluación contra el oráculo

npm run eval



\# Chequeo estricto de tipos de TypeScript

npm run typecheck



```



\---



\## 🔒 Aviso de Seguridad



\*Modo simulación. Este sistema no transfiere dinero real. Todas las facturas y proveedores son datos sintéticos. Las autorizaciones de pago son válidas únicamente dentro de esta demostración.\*



```



<FollowUp>

<Suggest>Ya guardé el README.md, ayúdame con los comandos para subirlo a GitHub</Suggest>

<Suggest>¿Cómo configuro el despliegue en Railway paso a paso?</Suggest>

</FollowUp>



```

