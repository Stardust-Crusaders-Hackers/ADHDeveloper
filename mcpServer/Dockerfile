# Multi-stage Dockerfile for mcp-server

# Build stage
FROM node:18 AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY --from=builder /app/dist ./dist
RUN npm install --production --no-audit --no-fund
EXPOSE 3000
CMD ["node", "dist/index.js"]
