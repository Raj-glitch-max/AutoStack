-- Phase 23: Marketplace Templates
-- RULE V1: Templates are versioned and immutable

CREATE TABLE IF NOT EXISTS templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        UNIQUE NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  version         TEXT        NOT NULL,
  category        TEXT,       -- fullstack | backend | frontend | data | ai | tooling
  tags            TEXT[],
  author_name     TEXT,
  author_org_id   UUID        REFERENCES organizations(id),
  verified        BOOLEAN     DEFAULT FALSE,  -- AutoStack-verified template
  featured        BOOLEAN     DEFAULT FALSE,
  spec            JSONB       NOT NULL,       -- the full template.yaml parsed as JSON
  readme_markdown TEXT,                       -- rendered in marketplace detail page
  icon_url        TEXT,
  screenshot_urls TEXT[],
  deploy_count    INTEGER     DEFAULT 0,
  star_count      INTEGER     DEFAULT 0,
  avg_deploy_time_minutes DECIMAL(5,1),
  cost_min        INTEGER,    -- USD/month
  cost_max        INTEGER,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(slug, version)  -- RULE V1: immutable versions
);

CREATE TABLE IF NOT EXISTS template_deployments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID        NOT NULL REFERENCES templates(id),
  org_id          UUID        NOT NULL REFERENCES organizations(id),
  project_id      UUID        REFERENCES projects(id),
  status          TEXT,       -- deploying | live | failed
  deployed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for marketplace queries
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_templates_featured ON templates(featured, deploy_count DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_templates_published ON templates(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_template_deployments_org ON template_deployments(org_id);

-- RLS policies
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_deployments ENABLE ROW LEVEL SECURITY;

-- Anyone can read published templates
CREATE POLICY "templates_public_read" ON templates
  FOR SELECT USING (published_at IS NOT NULL);

-- Only template authors can insert/update their templates
CREATE POLICY "templates_author_write" ON templates
  FOR ALL USING (
    author_org_id = auth.org_id()
  );

-- Users can read their own template deployments
CREATE POLICY "template_deployments_read" ON template_deployments
  FOR SELECT USING (org_id = auth.org_id());

-- Users can insert their own template deployments
CREATE POLICY "template_deployments_insert" ON template_deployments
  FOR INSERT WITH CHECK (org_id = auth.org_id());

-- Seed AutoStack-verified templates
INSERT INTO templates (slug, name, description, version, category, tags, author_name, verified, featured, spec, cost_min, cost_max, published_at) VALUES
(
  'nextjs-postgres-redis',
  'Next.js + Postgres + Redis',
  'Production-ready Next.js 14 application with Postgres database and Redis cache. Includes: App Router, Prisma ORM, NextAuth, rate limiting, image optimization.',
  '1.0.0',
  'fullstack',
  ARRAY['nextjs', 'postgres', 'redis', 'typescript'],
  'AutoStack',
  true,
  true,
  '{
    "components": [
      {"name": "Web App", "type": "application", "source": {"type": "github_template", "repo": "autostack/template-nextjs-prisma"}, "port": 3000, "size_recommendation": "small"},
      {"name": "Postgres Database", "type": "managed_database", "engine": "postgres", "version": "16", "size_map": {"development": "micro", "staging": "small", "production": "small"}},
      {"name": "Redis Cache", "type": "managed_database", "engine": "redis", "size_map": {"development": "micro", "production": "small"}}
    ],
    "variables": [
      {"key": "NEXTAUTH_SECRET", "description": "Random secret for NextAuth session encryption", "secret": true, "required": true},
      {"key": "NEXTAUTH_URL", "description": "Your app public URL", "secret": false, "auto_fill": "live_url"}
    ]
  }'::jsonb,
  45,
  220,
  NOW()
),
(
  'fastapi-postgres',
  'FastAPI + Postgres',
  'High-performance Python API with FastAPI, SQLAlchemy, and Postgres. Includes: async endpoints, Pydantic validation, Alembic migrations, OpenAPI docs.',
  '1.0.0',
  'backend',
  ARRAY['python', 'fastapi', 'postgres', 'api'],
  'AutoStack',
  true,
  true,
  '{
    "components": [
      {"name": "API Server", "type": "application", "source": {"type": "github_template", "repo": "autostack/template-fastapi"}, "port": 8000, "size_recommendation": "small"},
      {"name": "Postgres Database", "type": "managed_database", "engine": "postgres", "version": "16", "size_map": {"development": "micro", "production": "small"}}
    ],
    "variables": [
      {"key": "SECRET_KEY", "description": "JWT secret key", "secret": true, "required": true}
    ]
  }'::jsonb,
  35,
  150,
  NOW()
),
(
  'react-spa',
  'React SPA',
  'Modern React single-page application with Vite, React Router, TailwindCSS, and TypeScript. Optimized for fast builds and hot reload.',
  '1.0.0',
  'frontend',
  ARRAY['react', 'vite', 'typescript', 'tailwind'],
  'AutoStack',
  true,
  false,
  '{
    "components": [
      {"name": "Web App", "type": "application", "source": {"type": "github_template", "repo": "autostack/template-react-vite"}, "port": 3000, "size_recommendation": "micro"}
    ],
    "variables": [
      {"key": "VITE_API_URL", "description": "Backend API URL", "secret": false, "required": true}
    ]
  }'::jsonb,
  15,
  50,
  NOW()
),
(
  'django-postgres-celery',
  'Django + Postgres + Celery',
  'Full-featured Django application with Postgres database, Celery task queue, and Redis broker. Includes: Django REST Framework, admin panel, migrations.',
  '1.0.0',
  'fullstack',
  ARRAY['python', 'django', 'postgres', 'celery', 'redis'],
  'AutoStack',
  true,
  true,
  '{
    "components": [
      {"name": "Django App", "type": "application", "source": {"type": "github_template", "repo": "autostack/template-django"}, "port": 8000, "size_recommendation": "small"},
      {"name": "Celery Worker", "type": "application", "source": {"type": "github_template", "repo": "autostack/template-django"}, "command": "celery -A app worker", "size_recommendation": "micro"},
      {"name": "Postgres Database", "type": "managed_database", "engine": "postgres", "version": "16", "size_map": {"development": "micro", "production": "small"}},
      {"name": "Redis Broker", "type": "managed_database", "engine": "redis", "size_map": {"development": "micro", "production": "small"}}
    ],
    "variables": [
      {"key": "SECRET_KEY", "description": "Django secret key", "secret": true, "required": true},
      {"key": "ALLOWED_HOSTS", "description": "Comma-separated allowed hosts", "secret": false, "auto_fill": "live_url"}
    ]
  }'::jsonb,
  65,
  280,
  NOW()
),
(
  'go-api',
  'Go REST API',
  'Lightweight Go API with Gin framework, GORM, and Postgres. Includes: middleware, JWT auth, structured logging, graceful shutdown.',
  '1.0.0',
  'backend',
  ARRAY['go', 'gin', 'postgres', 'api'],
  'AutoStack',
  true,
  false,
  '{
    "components": [
      {"name": "API Server", "type": "application", "source": {"type": "github_template", "repo": "autostack/template-go-gin"}, "port": 8080, "size_recommendation": "micro"},
      {"name": "Postgres Database", "type": "managed_database", "engine": "postgres", "version": "16", "size_map": {"development": "micro", "production": "small"}}
    ],
    "variables": [
      {"key": "JWT_SECRET", "description": "JWT signing secret", "secret": true, "required": true}
    ]
  }'::jsonb,
  30,
  120,
  NOW()
);

-- Function to increment deploy count (called after successful template deployment)
CREATE OR REPLACE FUNCTION increment_template_deploy_count(template_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE templates
  SET deploy_count = deploy_count + 1
  WHERE id = template_uuid;
END;
$$;
