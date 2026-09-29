# ============================================================
# Stage 1: Build Frontend Assets with Node.js
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Build argument to configure API Base URL (defaults to /api for reverse proxy)
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ============================================================
# Stage 2: Serve Production Assets with Nginx Alpine
# ============================================================
FROM nginx:1.27-alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built static files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
