# Build stage
FROM node:20-alpine AS builder

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build Next.js and server
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

# Install runtime dependencies
RUN apk add --no-cache \
    python3 \
    tmux \
    bash \
    git \
    su-exec

WORKDIR /app

ENV NODE_ENV=production

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user with home directory and bash shell
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs --shell /bin/bash nextjs

# Copy built assets from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/node_modules ./node_modules

# Create directories and set permissions
RUN mkdir -p /home/nextjs/.claude && \
    chown -R nextjs:nodejs /home/nextjs && \
    chown -R nextjs:nodejs /app

# Copy entrypoint script
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/

ENV HOME=/home/nextjs
ENV PATH="/home/nextjs/.npm-global/bin:${PATH}"

EXPOSE 3000 3001

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD []
