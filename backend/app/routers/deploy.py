from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
import time
import random
from datetime import datetime
from app.database import get_db
from app.models import User, Project, Deployment
from app.schemas import DeploymentResponse
from app.dependencies import get_current_user

router = APIRouter()


def simulate_deployment_logs(project_id: int):
    """Background task to simulate deployment with logs"""
    from app.database import SessionLocal
    
    db = SessionLocal()
    try:
        time.sleep(1)  # Simulate initial delay

        log_messages = [
            "🚀 Starting deployment...",
            "📦 Cloning repository...",
            "🔍 Checking branch...",
            "🏗️  Building Docker image...",
            "✅ Image built successfully",
            "📤 Pushing to registry...",
            "🚢 Deploying to Kubernetes...",
            "⏳ Waiting for pods to be ready...",
            "✅ Deployment successful!",
        ]

        log_output = ""
        for i, message in enumerate(log_messages):
            time.sleep(random.uniform(0.5, 1.5))  # Random delay between steps
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            log_output += f"[{timestamp}] {message}\n"

            # Update deployment log
            deployment = db.query(Deployment).filter(
                Deployment.project_id == project_id
            ).order_by(Deployment.timestamp.desc()).first()

            if deployment:
                deployment.log_output = log_output
                db.commit()

        # Final status update
        deployment = db.query(Deployment).filter(
            Deployment.project_id == project_id
        ).order_by(Deployment.timestamp.desc()).first()

        if deployment:
            deployment.status = "success"
            deployment.log_output = log_output
            db.commit()

        # Update project status
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.status = "deployed"
            db.commit()
    finally:
        db.close()


@router.post("/{project_id}", response_model=DeploymentResponse)
async def trigger_deployment(
    project_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify project belongs to user
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Create deployment record
    deployment = Deployment(
        project_id=project_id,
        status="running",
        log_output=""
    )
    db.add(deployment)
    db.commit()
    db.refresh(deployment)

    # Update project status
    project.status = "building"
    db.commit()

    # Start background deployment simulation
    background_tasks.add_task(simulate_deployment_logs, project_id)

    return deployment

