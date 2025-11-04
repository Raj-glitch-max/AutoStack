# AutoStack - DevOps Automation Platform (Phase 2 MVP)

A complete full-stack MVP web application for DevOps automation, featuring a modern dark-themed UI and mock backend integration.

## 🏗️ Architecture

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Authentication**: JWT-based auth
- **Migrations**: Alembic

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS + ShadCN UI components
- **Animations**: Framer Motion
- **State Management**: Zustand

## 📁 Project Structure

```
AutoStack/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── database.py           # Database connection
│   │   ├── models.py             # SQLAlchemy models
│   │   ├── schemas.py            # Pydantic schemas
│   │   ├── auth.py               # JWT authentication utilities
│   │   ├── dependencies.py       # FastAPI dependencies
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── auth.py           # Authentication routes
│   │       ├── projects.py       # Project management routes
│   │       ├── deploy.py         # Deployment routes
│   │       └── logs.py           # Log retrieval routes
│   ├── alembic/                  # Database migrations
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Root page (redirects)
│   │   ├── globals.css
│   │   ├── login/
│   │   ├── signup/
│   │   ├── dashboard/
│   │   ├── projects/
│   │   ├── deploy/
│   │   ├── logs/
│   │   └── settings/
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   └── ui/                   # Reusable UI components
│   ├── lib/
│   │   ├── api.ts                # API client
│   │   └── utils.ts              # Utility functions
│   ├── store/
│   │   └── authStore.ts          # Zustand auth store
│   ├── package.json
│   ├── tailwind.config.ts
│   └── Dockerfile
│
├── docker-compose.yml
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Option 1: Docker Compose (Recommended)

1. **Clone and navigate to the project directory**

2. **Start all services**:
   ```bash
   docker-compose up -d
   ```

3. **Run database migrations** (first time only):
   ```bash
   docker-compose exec backend alembic upgrade head
   ```

4. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Option 2: Local Development

#### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Create virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set environment variables**:
   ```bash
   export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/autostack"
   export SECRET_KEY="your-secret-key-change-in-production"
   ```

5. **Run migrations**:
   ```bash
   alembic upgrade head
   ```

6. **Start the server**:
   ```bash
   uvicorn app.main:app --reload
   ```

#### Frontend Setup

1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create `.env.local` file**:
   ```
   NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```

5. **Open browser**: http://localhost:3000

## 🔑 Features

### Authentication
- User signup and login
- JWT token-based authentication
- Protected routes

### Dashboard
- Summary cards showing active projects, last deployment, pending jobs
- Recent projects list

### Projects
- Create new projects (name, repo URL, branch)
- View all projects in table format
- Deploy projects with one click

### Deploy
- Trigger deployments for projects
- Real-time deployment status updates
- Mock CI/CD pipeline simulation

### Logs
- View deployment logs in real-time
- Auto-refreshing log viewer
- Project-specific log filtering

### Settings
- Configure Jenkins URL
- Set GitHub token
- Configure AWS region
- (UI only - backend integration pending)

## 🎨 Design

- **Theme**: Dark mode (black/charcoal background, white/grey text)
- **Accent Color**: Teal (#00bfa6)
- **Responsive**: Fully responsive for desktop, tablet, and mobile
- **Animations**: Smooth transitions and hover effects using Framer Motion

## 📡 API Endpoints

### Authentication
- `POST /auth/signup` - Register new user
- `POST /auth/login` - Login and get JWT token

### Projects
- `GET /projects` - List all projects for current user
- `POST /projects` - Create a new project
- `GET /projects/{project_id}` - Get project details

### Deploy
- `POST /deploy/{project_id}` - Trigger deployment

### Logs
- `GET /logs/{project_id}` - Get deployment logs

## 🔧 Extending the API

The backend is structured to easily integrate with real DevOps tools:

1. **Jenkins Integration**: Modify `app/routers/deploy.py` to call Jenkins API
2. **Terraform Integration**: Add Terraform execution in deployment process
3. **GitHub Integration**: Use GitHub API for repository management
4. **AWS Integration**: Add AWS SDK for cloud resource management

Example structure for real integration:

```python
# app/services/jenkins.py
async def trigger_jenkins_build(project: Project):
    # Call Jenkins API
    pass

# app/services/terraform.py
async def apply_terraform(project: Project):
    # Execute Terraform
    pass
```

## 🐳 Docker

### Build images separately:
```bash
docker-compose build
```

### View logs:
```bash
docker-compose logs -f
```

### Stop services:
```bash
docker-compose down
```

### Clean up volumes:
```bash
docker-compose down -v
```

## 📝 Database Migrations

Create a new migration:
```bash
docker-compose exec backend alembic revision --autogenerate -m "Description"
```

Apply migrations:
```bash
docker-compose exec backend alembic upgrade head
```

## 🧪 Testing

Currently, the application uses mock data and simulated deployments. For production:

1. Replace mock deployment logic with real CI/CD integration
2. Add proper error handling and validation
3. Implement real-time WebSocket connections for logs
4. Add unit and integration tests

## 📄 License

This project is for academic/demonstration purposes.

## 🤝 Contributing

This is an MVP for academic presentation. For production use, consider:
- Adding proper error boundaries
- Implementing real DevOps tool integrations
- Adding comprehensive testing
- Setting up CI/CD for the platform itself
- Adding monitoring and logging
- Implementing proper security measures

---

**Note**: This is a Phase 2 MVP. For production deployment, ensure you:
- Change the SECRET_KEY in production
- Use environment variables for all sensitive data
- Set up proper database backups
- Configure CORS properly for production domains
- Add rate limiting and security headers
- Implement proper logging and monitoring

