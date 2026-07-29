# syntax=docker/dockerfile:1
# Multi-stage production image for Oracle / any Linux host.
# Works on amd64 and arm64 (Oracle Free Ampere is arm64 — build on the server or use buildx).

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# pnpm 9: simpler install scripts (pnpm 11 blocks sharp builds by default)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@9.15.9

# ── deps ──────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# Install all deps for build; rebuild sharp for this arch (arm64 on Oracle)
RUN pnpm install --frozen-lockfile \
  && pnpm rebuild sharp

# ── build ─────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* must be present at build time (inlined into client JS)
ARG NEXT_PUBLIC_MAPBOX_TOKEN=
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ARG NEXT_PUBLIC_MAP_PROVIDER=
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_PUBLIC_MAP_PROVIDER=$NEXT_PUBLIC_MAP_PROVIDER
# Ensure public/uploads exists for Next copy step
# Call next directly so pnpm does not re-run install / supply-chain checks
RUN mkdir -p public/uploads data/comments \
  && ./node_modules/.bin/next build

# ── run ───────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone server + static assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# sharp is external; Next standalone + pnpm does not fully pack native libs.
# Install sharp into a clean tree and merge into the app node_modules.
USER root
RUN mkdir -p /tmp/sharp-install \
  && cd /tmp/sharp-install \
  && npm init -y >/dev/null \
  && npm install --os=linux --cpu=arm64 sharp@0.35.3 \
  && mkdir -p /app/node_modules \
  && rm -rf /app/node_modules/sharp /app/node_modules/@img /app/node_modules/detect-libc \
  && cp -a /tmp/sharp-install/node_modules/. /app/node_modules/ \
  && chown -R nextjs:nodejs /app/node_modules \
  && rm -rf /tmp/sharp-install

# Seed data for first boot (copied into volume by entrypoint if empty)
COPY --from=builder --chown=nextjs:nodejs /app/data ./seed/data

COPY --chown=nextjs:nodejs docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && mkdir -p /app/data /app/public/uploads \
  && chown -R nextjs:nodejs /app/data /app/public/uploads /app/seed

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
