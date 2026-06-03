FROM node:20-alpine AS builder

WORKDIR /app

# Build mcp-server (agent-runner spawns it as a child process)
COPY mcp-server/package.json mcp-server/package-lock.json ./mcp-server/
RUN cd mcp-server && npm ci

COPY mcp-server/tsconfig.json ./mcp-server/
COPY mcp-server/src ./mcp-server/src
RUN cd mcp-server && npx tsc

# Build agent-runner
COPY agent-runner/package.json agent-runner/package-lock.json ./agent-runner/
RUN cd agent-runner && npm ci

COPY agent-runner/tsconfig.json ./agent-runner/
COPY agent-runner/src ./agent-runner/src
RUN cd agent-runner && npx tsc

# ── Production stage ──
FROM node:20-alpine

WORKDIR /app

# mcp-server: prod deps + compiled JS
COPY mcp-server/package.json mcp-server/package-lock.json ./mcp-server/
RUN cd mcp-server && npm ci --omit=dev
COPY --from=builder /app/mcp-server/dist ./mcp-server/dist

# agent-runner: prod deps + compiled JS + accounts
COPY agent-runner/package.json agent-runner/package-lock.json ./agent-runner/
RUN cd agent-runner && npm ci --omit=dev
COPY --from=builder /app/agent-runner/dist ./agent-runner/dist
COPY agent-runner/accounts.json ./agent-runner/

WORKDIR /app/agent-runner

ENTRYPOINT ["node", "dist/index.js"]
CMD ["--config", "config/config.toml"]
