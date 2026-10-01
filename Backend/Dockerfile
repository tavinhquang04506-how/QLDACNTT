# ============================================================
# Production Dockerfile for NEXUS HRMS Backend API
# ============================================================
FROM node:20-alpine AS base

# Install dumb-init for proper process signal forwarding (PID 1)
RUN apk add --no-cache dumb-init

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8000

# Install production dependencies first (caching layer)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code
COPY . .

# Create non-root user and set permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8000

# Healthcheck endpoint
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8000/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
