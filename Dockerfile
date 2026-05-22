# Stage 1: Build — install all dependencies and compile
FROM node:22-alpine AS builder

# Build tools needed for native addons (steam-user)
RUN apk add --no-cache python3 make gcc g++ musl-dev

# Install pnpm
RUN npm install -g pnpm

WORKDIR /build

# Copy workspace config + lockfile first (cached layer — only invalidated on lockfile change)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY web/package.json ./web/

# Install all dependencies (root + web via workspace, single command)
RUN pnpm install --frozen-lockfile

# Copy source (changes most frequently — kept after the install layers)
COPY tsconfig.json ./
COPY src/ ./src/
COPY web/ ./web/

# Build TypeScript backend + Vite frontend
RUN pnpm run build:all

# Drop devDependencies before copying to runtime stage
RUN pnpm install --prod


# Stage 2: Runtime — minimal Alpine image
FROM node:22-alpine

RUN apk add --no-cache ca-certificates tzdata wget

# node:22-alpine already ships with a "node" user at uid 1000 — reuse it
WORKDIR /app
RUN chown node:node /app

# Copy only what the server needs at runtime
COPY --from=builder --chown=node:node /build/dist ./dist
COPY --from=builder --chown=node:node /build/web/dist ./web/dist
COPY --from=builder --chown=node:node /build/node_modules ./node_modules

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- "http://localhost:${API_PORT:-3100}/health" || exit 1

EXPOSE 3100

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
