# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies only when the lockfile changes
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
RUN npm run build

# Minimal runtime image with the standalone server
FROM base AS runner
# Docker networks usually lack IPv6, and Node's default 250ms per address is too short for distant clusters
ENV NODE_OPTIONS="--dns-result-order=ipv4first --network-family-autoselection-attempt-timeout=1000"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_DIR=/app/storage \
    DATA_DIR=/app/data

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p storage data && chown node:node storage data

# Uploaded images and admin settings live here
VOLUME ["/app/storage", "/app/data"]

USER node
EXPOSE 3000
CMD ["node", "server.js"]
