# Multi-stage Dockerfile for React frontend
# Stage 1: Base
FROM node:18-alpine AS base
WORKDIR /usr/src/app

# Stage 2: Dependencies
FROM base AS dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Stage 3: Development dependencies
FROM base AS dev-dependencies
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Stage 4: Development
FROM dev-dependencies AS development
COPY . .
EXPOSE 3000
CMD ["npm", "start"]

# Stage 5: Build
FROM dev-dependencies AS build
COPY . .
RUN npm run build

# Stage 6: Production
FROM nginx:alpine AS production
COPY --from=build /usr/src/app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]