# Stage 1 – Build frontend
FROM node:24-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2 – Production runner
FROM node:24-alpine AS runner

WORKDIR /app

# Backend dependencies (no native modules needed)
COPY backend/package*.json ./
RUN npm install --omit=dev

# Backend source
COPY backend/ ./

# Frontend dist (served as static files)
# server.js uses join(__dirname, '../frontend/dist') → resolves to /frontend/dist
COPY --from=frontend-builder /build/frontend/dist /frontend/dist

# su-exec: lightweight tool to drop privileges in entrypoint
RUN apk add --no-cache su-exec

# Data directory for SQLite (ownership fixed at runtime by entrypoint)
RUN mkdir -p /app/data

COPY --chmod=755 entrypoint.sh /entrypoint.sh

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/hammerhead.db

# Entrypoint runs as root, fixes /app/data ownership, then drops to node
# node:sqlite is stable in Node 24 (no --experimental flag needed)
ENTRYPOINT ["/entrypoint.sh"]
