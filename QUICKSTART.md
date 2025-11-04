# Quick Start Guide

## 🚀 Quick Start with Docker Compose

1. **Start all services**:
   ```bash
   docker-compose up -d
   ```

2. **Run database migrations** (first time only):
   ```bash
   docker-compose exec backend alembic upgrade head
   ```

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

4. **Create an account**:
   - Go to http://localhost:3000
   - Click "Sign up" and create an account
   - Log in with your credentials

## 🛠️ Local Development

### Backend (FastAPI)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/autostack"
export SECRET_KEY="your-secret-key"

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

### Frontend (Next.js)

```bash
cd frontend
npm install

# Create .env.local
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:8000" > .env.local

# Start dev server
npm run dev
```

## 📝 Notes

- Make sure PostgreSQL is running if using local development
- The backend runs on port 8000
- The frontend runs on port 3000
- Default database credentials: postgres/postgres

