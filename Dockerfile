# Stage 1: Build — install all dependencies and compile
FROM node:22-alpine AS builder

# Build tools needed for any native npm addons
RUN apk add --no-cache python3 make gcc g++ musl-dev

WORKDIR /build

# Install backend dependencies (cached layer — only invalidated on lockfile change)
COPY package.json package-lock.json ./
RUN npm ci

# Install frontend dependencies (cached layer)
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web

# Copy source (changes most frequently — kept after the install layers)
COPY tsconfig.json ./
COPY src/ ./src/
COPY web/ ./web/

# Build TypeScript backend + Vite frontend
RUN npm run build:all

# Drop devDependencies before copying to runtime stage
RUN npm prune --omit=dev


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
