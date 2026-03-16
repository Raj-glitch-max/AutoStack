# AutoStack - Docker Compose Guide

## Quick Start

### Start AutoStack
```bash
./start-autostack.sh
```

Or manually:
```bash
docker-compose up -d --build
```

### Stop AutoStack
```bash
./stop-autostack.sh
```

Or manually:
```bash
docker-compose down
```

## What's Running

### Frontend Service
- **Container**: `autostack-frontend`
- **Port**: http://localhost:3000
- **Technology**: React + Vite + Nginx
- **Build**: Multi-stage Docker build (Node.js → Nginx)

### Backend Services
- **Supabase**: Hosted at https://prrmrukwmrjkdxcyzovd.supabase.co
- **Database**: PostgreSQL (Supabase)
- **Edge Functions**: Deployed to Supabase
- **Storage**: Supabase Storage

## Configuration

### Environment Variables
File: `.env.docker`

```env
VITE_SUPABASE_URL=https://prrmrukwmrjkdxcyzovd.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_URL=http://localhost:3000
```

### Docker Compose
File: `docker-compose.yml`

- Frontend service with Nginx
- Network: `autostack-network`
- Restart policy: `unless-stopped`

## Useful Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Frontend only
docker-compose logs -f autostack-frontend

# Last 100 lines
docker-compose logs --tail=100
```

### Restart Services
```bash
# Restart all
docker-compose restart

# Restart frontend only
docker-compose restart autostack-frontend
```

### Rebuild
```bash
# Rebuild and restart
docker-compose up -d --build

# Force rebuild (no cache)
docker-compose build --no-cache
docker-compose up -d
```

### Check Status
```bash
# List running containers
docker-compose ps

# Check health
docker ps | grep autostack
```

### Access Container
```bash
# Shell into frontend container
docker-compose exec autostack-frontend sh

# View nginx config
docker-compose exec autostack-frontend cat /etc/nginx/conf.d/default.conf
```

## Troubleshooting

### Port Already in Use
If port 3000 is already in use:

1. Stop the conflicting service
2. Or change the port in `docker-compose.yml`:
   ```yaml
   ports:
     - "8080:80"  # Use port 8080 instead
   ```

### Build Failures
```bash
# Clean everything and rebuild
docker-compose down -v
docker system prune -f
docker-compose up -d --build
```

### Frontend Not Loading
1. Check if container is running:
   ```bash
   docker ps | grep autostack-frontend
   ```

2. Check logs:
   ```bash
   docker-compose logs autostack-frontend
   ```

3. Test nginx:
   ```bash
   docker-compose exec autostack-frontend wget -O- http://localhost
   ```

### Environment Variables Not Working
1. Verify `.env.docker` exists
2. Rebuild after changing env vars:
   ```bash
   docker-compose up -d --build
   ```

## Development Workflow

### Local Development (without Docker)
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on http://localhost:5173

### Production Build (with Docker)
```bash
docker-compose up -d --build
```
Frontend runs on http://localhost:3000

### Hot Reload Development
For development with hot reload, use the dev server instead of Docker:
```bash
cd frontend
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────┐
│         Docker Compose                  │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │   autostack-frontend              │ │
│  │   ┌─────────────┐                 │ │
│  │   │   Nginx     │  Port 3000      │ │
│  │   │   (Alpine)  │                 │ │
│  │   └─────────────┘                 │ │
│  │         │                          │ │
│  │   ┌─────────────┐                 │ │
│  │   │  React App  │                 │ │
│  │   │  (Built)    │                 │ │
│  │   └─────────────┘                 │ │
│  └───────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────┐
        │    Supabase     │
        │   (Cloud)       │
        ├─────────────────┤
        │  - PostgreSQL   │
        │  - Edge Funcs   │
        │  - Storage      │
        │  - Auth         │
        └─────────────────┘
```

## Production Deployment

For production, you can:

1. **Use Docker Compose** (current setup)
2. **Deploy to AWS ECS/Fargate**
3. **Deploy to Kubernetes**
4. **Use the built-in deployment pipeline**

### Deploy Frontend to AWS
```bash
# Build production image
docker build -t autostack-frontend:latest ./frontend

# Tag for ECR
docker tag autostack-frontend:latest YOUR_ECR_REPO/autostack-frontend:latest

# Push to ECR
docker push YOUR_ECR_REPO/autostack-frontend:latest
```

## Performance

### Build Time
- First build: ~2-3 minutes
- Cached builds: ~30 seconds

### Bundle Size
- Frontend: ~1.5 MB (gzipped)
- Docker image: ~50 MB (Alpine-based)

### Memory Usage
- Frontend container: ~50 MB RAM
- Nginx: ~10 MB RAM

## Security

### Production Checklist
- [ ] Change default Supabase keys
- [ ] Enable HTTPS (use reverse proxy)
- [ ] Set proper CORS headers
- [ ] Enable rate limiting
- [ ] Use secrets management
- [ ] Regular security updates

### Nginx Security Headers
Already configured in `frontend/nginx.conf`:
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection

## Next Steps

1. Access the UI: http://localhost:3000
2. Deploy an application
3. Monitor in real-time
4. Check AWS Console for resources

Happy deploying! 🚀
