# Usa la imagen oficial de Playwright con navegadores preinstalados (incluye Node 20)
FROM mcr.microsoft.com/playwright:v1.54.2-jammy

# Crea el directorio de la app y ajusta permisos para el user por defecto (pwuser)
USER root
RUN mkdir -p /app && chown -R pwuser:pwuser /app
WORKDIR /app
USER pwuser

# Variables por defecto (se pueden sobreescribir en Render)
ENV NODE_ENV=production
ENV PORT=10000
ENV EVIDENCE_DIR=/tmp/evidence

# Instala dependencias usando package.json + package-lock.json si existe
COPY --chown=pwuser:pwuser package*.json ./
RUN npm ci --omit=dev

# Copia el resto del proyecto
COPY --chown=pwuser:pwuser . .

# Asegura que el healthcheck sea ejecutable
RUN chmod +x scripts/healthcheck.sh

# Exponer el puerto que escucha la app
EXPOSE 10000

# Healthcheck a nivel de Docker (Render lo respeta)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD bash scripts/healthcheck.sh || exit 1

# Comando de inicio
CMD ["npm", "start"]
