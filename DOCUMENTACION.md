# Guía del proyecto ForUsBots

Esta guía está pensada para quien llega por primera vez al repositorio y para quien necesita cambiarlo con seguridad. Describe el código que hay en este checkout; la configuración y el estado de un despliegue real se deben comprobar en su entorno.

## En dos minutos

ForUsBots es un servicio HTTP en Node.js que automatiza el portal de empleadores de ForUsAll con Playwright. Recibe solicitudes bajo `/forusbot`, valida el token y los datos, crea un trabajo y devuelve un `jobId`. El trabajo usa un navegador para leer o modificar el portal; el cliente consulta después `/forusbot/jobs/:id` para obtener el resultado. Hay nueve bots para documentos, participantes, planes, correos y usuarios.

| Término | Significado aquí |
| --- | --- |
| Bot | Rutina que navega por el portal y realiza una tarea concreta. |
| Trabajo o `job` | Ejecución asíncrona de un bot, identificada por `jobId`. |
| Token y scope | Credencial de API y permisos concretos que limitan sus operaciones. |
| TOTP | Código temporal usado cuando el portal solicita un segundo factor. |
| Idempotencia | Garantía, solo en algunos endpoints, de que repetir una solicitud con la misma clave no repite la acción. |

| Si necesitas… | Empieza en… |
| --- | --- |
| Conocer rutas, parámetros y respuestas | [README.md](README.md), [docs/openapi.yaml](docs/openapi.yaml) y las rutas montadas en `src/server.js` y `src/routes/index.js` |
| Encontrar un archivo | [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) y el mapa de abajo |
| Ejecutar o modificar un bot | [src/bots/](src/bots/) y «Cómo hacer un cambio» |
| Cambiar permisos | [src/auth/](src/auth/) y [src/middleware/](src/middleware/) |
| Entender trabajos y persistencia | [src/engine/queue.js](src/engine/queue.js), [src/engine/idempotency.js](src/engine/idempotency.js) y [src/engine/audit.js](src/engine/audit.js) |
| Revisar trabajo pendiente | [PENDIENTES.md](PENDIENTES.md), verificando su fecha y estado antes de actuar |

## Qué hace cada bot

La ruta base de la API es `/forusbot`. Los nombres de la primera columna son las carpetas de `src/bots/`.

| Bot | Ruta principal | Función |
| --- | --- | --- |
| `forusall-upload` | `POST /vault-file-upload` | Sube archivos al vault del plan. |
| `forusall-scrape-participant` | `POST /scrape-participant` | Extrae datos de un participante por módulos. |
| `forusall-scrape-plan` | `POST /scrape-plan` | Extrae configuración y datos de un plan. |
| `forusall-search-participants` | `POST /search-participants` | Busca participantes en el portal. |
| `forusall-mfa-reset` | `POST /mfa-reset` | Restablece el MFA de un participante. |
| `forusall-update-participant` | `POST /update-participant` | Cambia campos del censo de un participante. |
| `forusall-update-plan` | `POST /update-plan` | Cambia campos de un plan; tiene restricción adicional por correo. |
| `forusall-emailtrigger` | `POST /email-trigger` | Verifica o activa comunicaciones mediante los flujos implementados. |
| `forusall-usersmanagement` | `POST /users-management/create` y `/edit` | Crea o edita usuarios del portal; tiene restricción adicional por correo. |

[OpenAPI](docs/openapi.yaml) es el contrato de las operaciones documentadas, pero no enumera todas las rutas activas: hay rutas auxiliares de autenticación, usuarios y artículos en `src/server.js` y `src/routes/index.js`. Consulta esos archivos para un inventario completo. La interfaz en `docs/sandbox/` puede enviar solicitudes reales: estar dentro del sandbox visual no convierte todos los botones en simulaciones.

## Cómo está organizado

```text
Solicitud HTTP
  → src/index.js              carga .env/Secret Manager e inicia el proceso
  → src/server.js             configura Express y monta /forusbot
  → src/routes/index.js       conecta rutas generales y bots
  → src/middleware/ + src/auth/  autentica token, rol y alcance
  → src/bots/<bot>/routes.js y controller.js  valida y encola el trabajo
  → src/engine/queue.js        ejecuta con límite de concurrencia
  → src/bots/<bot>/runFlow.js   usa Playwright y el portal
  → src/bots/<bot>/formatPublic.js + src/middleware/public-response.js
                              prepara la respuesta pública
```

- `src/providers/forusall/` contiene URLs, selectores y mapas del portal. Los extractores reutilizables están en `src/extractors/forusall-participant/` y `src/extractors/forusall-plan/`.
- `forusall-mfa-reset` valida y encola directamente en `routes.js`; su `controller.js` no está conectado a la ruta activa. Comprueba siempre qué módulo importa el router antes de editar un bot.
- `src/engine/auth/loginOtp.js`, `src/engine/sharedContext.js` y `src/engine/sessions.js` coordinan acceso, navegador y sesiones. Los bots no deberían implementar un segundo mecanismo de login u OTP.
- `src/engine/logger.js` y [src/engine/log-schema.md](src/engine/log-schema.md) definen la telemetría. `src/db/` contiene clientes de Firestore y BigQuery; `bq/views/` contiene vistas analíticas.
- `docs/` aloja OpenAPI, documentación web en inglés y español, consola, sandbox y base de conocimiento. `tests/` agrupa pruebas por bots, autenticación, motor, contratos e infraestructura.
- `Dockerfile`, `cloudbuild.verify.yaml` y `cloudbuild.yaml` definen imagen, validación y despliegue. `render.yaml` y `GCP Implementation/` conservan contexto histórico; verifica sus instrucciones contra el código actual antes de usarlas.

### Vida de una solicitud

1. Para llamar a un bot, el cliente envía un token mediante `x-auth-token` o `Authorization: Bearer`. El servidor comprueba rol, alcance y, para algunas rutas, una lista adicional de correos permitidos. `/health` es público.
2. El router o controlador valida la entrada. Si la acepta, responde normalmente `202` con `jobId`. Algunos bots añaden una cabecera `Location` hacia el trabajo.
3. La cola ejecuta el flujo y registra etapas. Consulta `GET /forusbot/jobs/:id` hasta `succeeded`, `failed` o `canceled`; `DELETE` solo cancela un trabajo que aún está en cola.
4. La cola y los ajustes de `PATCH /forusbot/settings` viven en la memoria de cada proceso. Con `AUDIT_DB=1`, los eventos y trabajos se escriben en Firestore. **Solo `scrape-participant`, `scrape-plan` y `email-trigger` implementan `Idempotency-Key`**: para esos endpoints, la reserva y el ciclo de vida durables dependen de Firestore, y sin él la solicitud con clave falla. En los demás bots, enviar esa cabecera no evita una ejecución duplicada. `GET /forusbot/jobs/:id` intenta recuperar el trabajo desde Firestore cuando no está en memoria. Un reinicio no reanuda automáticamente trabajos en ejecución.

## Primer arranque local

**Requisitos:** Node.js y npm, acceso a este repositorio y, solo para ejecutar automatizaciones reales, una cuenta autorizada del portal. Las imágenes de CI usan Node 20; `.tool-versions` lista Node 25.6.1 para el entorno local. Comprueba los cambios al menos con la versión usada en CI antes de desplegar. El contenedor de producción incluye Chromium mediante la imagen de Playwright.

```bash
npm ci
npm test
npm run lint
```

Las pruebas usan `node --test`. La prueba contra Firestore real está desactivada de forma predeterminada y requiere un entorno controlado; `npm test` no sustituye una prueba integral del portal. Si vas a ejecutar Playwright directamente en tu equipo, instala Chromium para la versión del paquete con `npx playwright install chromium`.

Para iniciar el servicio local, crea un `.env` y un `tokens.json` **privados** en la raíz. Ambos están excluidos de Git. Un `.env` mínimo para trabajo sin Firestore es:

```dotenv
PORT=10000
HEADLESS=1
AUDIT_DB=0
TOKENS_FILE=./tokens.json
```

No definas `GCP_PROJECT` para este modo local: [src/secrets.js](src/secrets.js) interpreta su presencia como arranque en GCP e intenta resolver secretos. La estructura del registro de tokens puede ser, con valores de ejemplo que debes reemplazar:

```json
[
  {
    "token": "TOKEN_LOCAL_PRIVADO",
    "role": "user",
    "name": "Desarrollo local",
    "account": {
      "alias": "cuenta-local",
      "siteUser": "USUARIO_DEL_PORTAL",
      "sitePass": "CONTRASENA_DEL_PORTAL",
      "totpSecret": "SECRETO_TOTP_BASE32"
    }
  }
]
```

Si solo vas a probar `/health` y la estructura HTTP, no necesitas credenciales reales del portal. Para ejecutar un bot, la cuenta debe ser válida y tener permisos sobre el portal. Los tokens y las credenciales nunca deben entrar en commits, capturas, logs o ejemplos compartidos. El registro se carga al arrancar: después de cambiar `tokens.json`, reinicia el proceso. [src/auth/account.js](src/auth/account.js) todavía permite un respaldo heredado con `SITE_USER`, `SITE_PASS` y `TOTP_SECRET` cuando el token no trae cuenta; no dependas de él para integraciones nuevas.

```bash
npm start
curl -sS http://localhost:10000/health
curl -sS http://localhost:10000/forusbot/whoami -H 'x-auth-token: TOKEN_LOCAL_PRIVADO'
```

La primera respuesta debería incluir `ok: true`; la segunda permite ver rol y alcance efectivos del token, sin publicar credenciales del portal. Con el servicio iniciado puedes abrir `/docs/api`, `/docs/api/es` y `/docs/sandbox` en el navegador.

Para Firestore local existen `npm run emulator` y `npm run dev:emulator`. El primero requiere tener Firebase CLI disponible por separado; no está en `package.json`. Inicia el emulador con `npm run emulator -- --project demo-forusbots` para coincidir con `dev:emulator`, ya que `.firebaserc` usa otro proyecto por defecto. El segundo establece `GCP_PROJECT=demo-forusbots`, por lo que hay que preparar `TOKENS_FILE` y las variables `SITE_USER`, `SITE_PASS`, `TOTP_SECRET` y `SHARED_TOKEN` que [src/secrets.js](src/secrets.js) aún exige antes de usarlo. No apuntes pruebas locales a datos de producción.

## Cómo hacer un cambio

1. **Ubica el contrato.** Lee la operación en [docs/openapi.yaml](docs/openapi.yaml), la ruta real en `src/routes/` o `src/bots/<bot>/routes.js` y las pruebas relacionadas. Comprueba `git status` antes de editar para conservar trabajo existente.
2. **Cambia la capa correcta.** En la mayoría de los bots, validaciones y respuesta `202` van en `controller.js`; en MFA reset están en `routes.js`. La idempotencia solo existe en los tres endpoints indicados arriba. La interacción con el portal va en `runFlow.js` y el formato público en `formatPublic.js`. Para selectores o URLs compartidos usa `src/providers/forusall/`. Para campos extraídos modifica el módulo y registro de `src/extractors/` correspondiente.
3. **Revisa permisos y datos.** Una ruta nueva puede necesitar un feature en `src/auth/featureMap.js`, defaults en `src/auth/roles.js` y `requireScope` en la ruta. Evita que tokens, contraseñas, OTP, SSN o HTML del portal salgan en respuestas, logs y evidencia.
4. **Actualiza el contrato y la ayuda.** Mantén `docs/openapi.yaml` como contrato de las operaciones publicadas y añade allí las rutas activas que falten cuando las modifiques. Si cambia la experiencia de uso, actualiza el resumen del [README](README.md), las páginas en `docs/api/` y sus variantes españolas, y la interfaz `docs/sandbox/` cuando corresponda. Para un flujo de correo, revisa también [src/bots/forusall-emailtrigger/flows/README.md](src/bots/forusall-emailtrigger/flows/README.md).
5. **Prueba antes de integrar.** Ejecuta pruebas específicas de la carpeta afectada con `node --test tests/ruta-del-test.test.js`, luego `npm test` y `npm run lint`. Verifica formatos públicos, errores, permisos e idempotencia cuando el cambio los afecte. Prueba acciones reales del portal solo con cuenta y entorno autorizados; los tests unitarios no comprueban que los selectores sigan vigentes.
6. **Revisa el resultado.** Inspecciona el diff para evitar cambios ajenos, verifica los enlaces y actualiza esta guía si cambian arquitectura, configuración o proceso de despliegue.

### Dónde intervenir según el cambio

| Cambio | Archivos principales | Comprobación adicional |
| --- | --- | --- |
| Endpoint o payload | `src/bots/<bot>/routes.js`, `controller.js`, `docs/openapi.yaml` | `README.md`, páginas API, sandbox y pruebas de contrato |
| Comportamiento de un bot | `runFlow.js`, `formatPublic.js`, `src/providers/forusall/` | Pruebas del bot y ejecución controlada en portal |
| Campo de scraping | `src/extractors/.../modules/`, `registry.js`, mapas del proveedor | Pruebas de extracción y formato público |
| Roles o tokens | `src/auth/`, `src/middleware/`, registro privado de tokens | Pruebas de autorización y `GET /whoami`; reinicio del servicio |
| Cola, etapas o persistencia | `src/engine/`, `src/db/` | Pruebas de ciclo de vida, idempotencia y Firestore |
| Imagen o despliegue | `Dockerfile`, `cloudbuild*.yaml` | Build de verificación y comprobación posterior de `/health` |

## Validación, despliegue y operación

`cloudbuild.verify.yaml` ejecuta `npm ci`, pruebas, lint y construcción de imagen sin desplegar. Con acceso apropiado a GCP, se puede lanzar con:

```bash
gcloud builds submit --config cloudbuild.verify.yaml .
```

`cloudbuild.yaml` además publica una imagen con digest fijo, actualiza el grupo de instancias administrado (`forusbots-mig`), espera estabilidad y consulta `/health`; intenta recuperar la plantilla anterior si falla el despliegue. Requiere que el gate de documentos SAR esté habilitado y que URL y audiencia del verificador sean HTTPS. Sus sustituciones predeterminadas dejan ese gate deshabilitado, así que un despliegue sin configuración explícita se detiene al inicio. Antes de ejecutar ese pipeline, verifica configuración, permisos, secretos, cambios del diff y plan de reversión con el responsable del entorno. La presencia del archivo no confirma por sí sola qué versión está hoy en producción.

Para comprobar un servicio ya iniciado, usa `/health` para disponibilidad y capacidades, `/forusbot/status` para cola y candados según la política de acceso, y `/forusbot/jobs/:id` para el trabajo concreto. El esquema de logs está en [src/engine/log-schema.md](src/engine/log-schema.md); con `AUDIT_DB=1`, hay datos operativos en Firestore y vistas analíticas en `bq/views/`. Los ajustes hechos por `PATCH /settings` se pierden al reiniciar. El archivo [PENDIENTES.md](PENDIENTES.md) es una fotografía de trabajo anterior, no una prueba del estado actual de servicios externos.

### Problemas habituales

| Síntoma | Qué revisar |
| --- | --- |
| `401 unauthorized` | Token correcto, cabecera y `TOKENS_FILE`; reinicia tras editar el registro. |
| `403 forbidden` | Rol, scope efectivo en `/whoami` y restricciones adicionales por correo. |
| `202` sin resultado inmediato | Es normal: consulta el `jobId` hasta un estado terminal. |
| `503 idempotency_unavailable` | En los tres endpoints idempotentes, `Idempotency-Key` requiere `AUDIT_DB=1` y Firestore disponible. |
| Falla el navegador o un selector | Chromium local, sesión, login/OTP, selectores en proveedor y cambios del portal. |
| Arranque intenta Secret Manager | Revisa `GCP_PROJECT`, `TOKENS_FILE` y el modo local descrito arriba. |
| Cambios en `/settings` desaparecen | El estado es memoria del proceso; actualiza la configuración de arranque si debe persistir. |

## Referencias y vigencia

- [README.md](README.md): resumen de API y ejemplos de solicitudes.
- [docs/openapi.yaml](docs/openapi.yaml): contrato de las operaciones documentadas; `src/server.js` y `src/routes/index.js` muestran también rutas aún no incluidas.
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md): mapa detallado; algunas versiones y referencias de infraestructura pueden estar desactualizadas, así que contrástalas con `package.json`, `Dockerfile` y `src/`.
- [PENDIENTES.md](PENDIENTES.md): decisiones y pendientes fechados; confirma el estado vigente antes de retomar trabajo.
- [GCP Implementation/](GCP%20Implementation/00-OVERVIEW.md): historia y planes de migración, útiles como contexto y no como instrucciones automáticas para producción.

Cuando cambie la arquitectura, los comandos, la autenticación o el flujo de publicación, actualiza esta guía en el mismo cambio y comprueba sus enlaces. Esa es la manera más sencilla de que la próxima persona pueda continuar el proyecto sin reconstruirlo desde cero.
