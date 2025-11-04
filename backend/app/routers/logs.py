from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User, Project, Deployment
from app.schemas import LogEntry, LogResponse
from app.dependencies import get_current_user

router = APIRouter()


@router.get("/{project_id}", response_model=LogResponse)
async def get_logs(
    project_id: int,
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

    # Get latest deployment
    deployment = db.query(Deployment).filter(
        Deployment.project_id == project_id
    ).order_by(Deployment.timestamp.desc()).first()

    if not deployment or not deployment.log_output:
        # Return empty logs or mock initial logs
        return LogResponse(logs=[])

    # Parse log output into log entries
    log_lines = deployment.log_output.strip().split("\n")
    log_entries = []
    for line in log_lines:
        if line.strip():
            # Parse timestamp and message
            parts = line.split("] ", 1)
            if len(parts) == 2:
                timestamp = parts[0].replace("[", "")
                message = parts[1]
            else:
                timestamp = deployment.timestamp.strftime("%Y-%m-%d %H:%M:%S")
                message = line
            log_entries.append(LogEntry(timestamp=timestamp, message=message))

    return LogResponse(logs=log_entries)

