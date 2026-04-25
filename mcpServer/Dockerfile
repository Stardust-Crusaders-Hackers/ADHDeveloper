# Build stage
FROM node:22 AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Runtime stage
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV MCP_SSE_PORT=3001

COPY package.json ./
COPY --from=builder /app/dist ./dist

RUN npm install --omit=dev --ignore-scripts

EXPOSE 3001

CMD ["node", "dist/index.js", "--sse"]