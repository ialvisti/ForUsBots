# ForUsBots – File Upload Bot (202 Accepted)

Webhook HTTP que recibe un archivo **binario** + metadatos, inicia sesión (Playwright + TOTP), navega al portal por **planId**, completa el formulario, sube el PDF y valida heurísticas + defaults.  
El **POST responde `202 Accepted`** con un `jobId`, **posición en cola**, y una **estimación** de inicio/fin; el resultado se consulta por `GET /jobs/:id`.

---

## Endpoints

**Namespace base:** `/forusbot`

- **POST `/forusbot/vault-file-upload`** → Acepta el trabajo y responde **202**:
  ```json
  {
    "ok": true,
    "jobId": "uuid",
    "acceptedAt": "2025-08-19T00:05:24.805Z",
    "queuePosition": 2,
    "estimate": {
      "method": "lanes+movingAvg",
      "avgDurationSeconds": 120,
      "startSeconds": 0,
      "finishSeconds": 120,
      "startAt": "2025-08-19T00:05:24.805Z",
      "finishAt": "2025-08-19T00:07:24.805Z"
    },
    "capacitySnapshot": { "maxConcurrency": 3, "running": 3, "queued": 2, "slotsAvailable": 0 }
  }
