// Dockerfile Generator - Creates production-grade, secure Dockerfiles
import type { AppClassification } from './app-classifier.ts'

export interface BuildCommands {
  build?: string
  start: string
  nodeVersion?: string
  pythonVersion?: string
  goVersion?: string
}

export function generateDockerfile(
  classification: AppClassification,
  commands: BuildCommands
): string {
  
  switch (classification.language) {
    
    case 'Node.js': {
      const nodeVersion = commands.nodeVersion || '20'
      const isStaticSite = classification.appType === 'static-site'

      if (isStaticSite) {
        // React/Vite SPA — build static files, serve with nginx
        const outputDir = detectOutputDir(classification)
        return `
# Stage 1: Build
FROM node:${nodeVersion}-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --silent
COPY . .
RUN ${commands.build || 'npm run build'}

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/${outputDir} /usr/share/nginx/html
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } location /health { return 200 "OK"; add_header Content-Type text/plain; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
`.trim()
      }

      // Server-side Node.js app
      return `
# Stage 1: Dependencies
FROM node:${nodeVersion}-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --silent && npm cache clean --force

${commands.build ? `
# Stage 2: Builder
FROM node:${nodeVersion}-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ${commands.build}
` : ''}

# Stage 3: Runtime
FROM node:${nodeVersion}-alpine AS runtime
RUN apk add --no-cache tini curl
WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
${commands.build ? `COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist` : ''}
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

USER nodejs
EXPOSE ${classification.port}
ENV NODE_ENV=production
ENV PORT=${classification.port}

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \\
  CMD curl -f http://localhost:${classification.port}${classification.healthCheckPath || '/health'} || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ${JSON.stringify((commands.start || 'node index.js').split(' '))}
`.trim()
    }

    case 'Python': {
      const pythonVersion = commands.pythonVersion || '3.12'
      const hasGunicorn = commands.start?.includes('gunicorn')
      const hasUvicorn = commands.start?.includes('uvicorn')

      return `
# Stage 1: Dependencies
FROM python:${pythonVersion}-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc curl && rm -rf /var/lib/apt/lists/*
COPY requirements*.txt ./
RUN pip install --no-cache-dir -r requirements.txt ${hasGunicorn ? 'gunicorn' : ''} ${hasUvicorn ? 'uvicorn[standard]' : ''}

# Stage 2: Runtime
FROM python:${pythonVersion}-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Security: non-root user
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app
COPY --from=deps /usr/local/lib/python${pythonVersion}/site-packages /usr/local/lib/python${pythonVersion}/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY --chown=app:app . .

USER app
EXPOSE ${classification.port}
ENV PORT=${classification.port}
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \\
  CMD curl -f http://localhost:${classification.port}${classification.healthCheckPath || '/health'} || exit 1

CMD ${JSON.stringify((commands.start || 'python main.py').split(' '))}
`.trim()
    }

    case 'Go': {
      const goVersion = commands.goVersion || '1.22'
      return `
# Stage 1: Build
FROM golang:${goVersion}-alpine AS builder
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server ./...

# Stage 2: Runtime (distroless for maximum security)
FROM gcr.io/distroless/static-debian12 AS runtime
COPY --from=builder /app/server /server
EXPOSE ${classification.port}
ENV PORT=${classification.port}
ENTRYPOINT ["/server"]
`.trim()
    }

    case 'Java': {
      return `
# Stage 1: Build
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app
COPY . .
RUN ${commands.build || 'mvn package -DskipTests -q'}

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine AS runtime
RUN addgroup -S java && adduser -S java -G java
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=builder --chown=java:java /app/target/*.jar app.jar
USER java
EXPOSE ${classification.port}
ENV SERVER_PORT=${classification.port}
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \\
  CMD curl -f http://localhost:${classification.port}${classification.healthCheckPath || '/health'} || exit 1
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
`.trim()
    }

    default: {
      // Fallback: universal Dockerfile
      return `
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y curl wget && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
EXPOSE ${classification.port}
ENV PORT=${classification.port}
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:${classification.port}${classification.healthCheckPath || '/health'} || exit 1
CMD ["${commands.start || 'echo No start command detected'}"]
`.trim()
    }
  }
}

function detectOutputDir(classification: AppClassification): string {
  if (classification.framework === 'Next.js') return '.next'
  if (classification.framework === 'React CRA') return 'build'
  if (classification.framework === 'Vite React') return 'dist'
  if (classification.framework === 'Angular') return 'dist/app'
  if (classification.framework === 'Nuxt.js') return '.output/public'
  return 'dist'
}
