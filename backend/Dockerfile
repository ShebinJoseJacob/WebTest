# Multi-stage Dockerfile for Node.js backend
# Stage 1: Base
FROM node:18-alpine AS base
WORKDIR /usr/src/app
RUN apk add --no-cache curl

# Stage 2: Dependencies
FROM base AS dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Stage 3: Development
FROM base AS development
COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]

# Stage 4: Build
FROM dependencies AS build
COPY . .
RUN npm run lint

# Stage 5: Production
FROM base AS production
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY . .
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1
CMD ["npm", "start"]