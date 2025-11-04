from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, projects, deploy, logs
from app.database import engine, Base

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AutoStack API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(deploy.router, prefix="/deploy", tags=["deploy"])
app.include_router(logs.router, prefix="/logs", tags=["logs"])


@app.get("/")
async def root():
    return {"message": "AutoStack API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}

