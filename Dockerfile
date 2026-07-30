# syntax=docker/dockerfile:1.7
# Multi-stage production images for amd64 and ARM64 hosts.
# BuildKit cache mounts keep pnpm / apt / Next / sharp layers warm across deploys.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10.33.0 \
  && pnpm config set store-dir /pnpm/store

# ---------- deps (full, for Next build) ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=trip-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- web: Next standalone ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
# Full app tree (context is already slim via .dockerignore)
COPY . .
ARG NEXT_PUBLIC_MAPBOX_TOKEN=
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ARG NEXT_PUBLIC_MAP_PROVIDER=
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_PUBLIC_MAP_PROVIDER=$NEXT_PUBLIC_MAP_PROVIDER
RUN --mount=type=cache,id=trip-next,target=/app/.next/cache \
    mkdir -p public/uploads \
    && ./node_modules/.bin/next build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

# Next standalone tracing can omit pnpm-linked native Sharp packages. Install the
# exact runtime version for the target architecture without hard-coding ARM64.
ARG TARGETARCH
USER root
RUN --mount=type=cache,id=trip-npm,target=/root/.npm \
    case "$TARGETARCH" in \
      amd64) npm_arch=x64 ;; \
      arm64) npm_arch=arm64 ;; \
      *) echo "Unsupported target architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
  && mkdir -p /tmp/sharp-install \
  && cd /tmp/sharp-install \
  && npm init -y >/dev/null \
  && npm install --os=linux --cpu="$npm_arch" sharp@0.35.3 \
  && mkdir -p /app/node_modules \
  && rm -rf /app/node_modules/sharp /app/node_modules/@img /app/node_modules/detect-libc \
  && cp -a /tmp/sharp-install/node_modules/. /app/node_modules/ \
  && chown -R nextjs:nodejs /app/node_modules \
  && rm -rf /tmp/sharp-install

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# ---------- worker: migrate + media-worker (FFmpeg) ----------
# FFmpeg layer is isolated so src/script changes never re-download packages.
FROM base AS ffmpeg
# Keep apt caches in BuildKit so reinstalls are minutes → seconds when needed.
RUN --mount=type=cache,id=trip-apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=trip-apt-lists,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

FROM ffmpeg AS worker
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs package.json pnpm-lock.yaml tsconfig.json ./
COPY --chown=nextjs:nodejs db ./db
COPY --chown=nextjs:nodejs scripts ./scripts
COPY --chown=nextjs:nodejs src ./src
USER nextjs
CMD ["pnpm", "worker:media"]
