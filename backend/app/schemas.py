from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class ProjectCreate(BaseModel):
    name: str
    repo_url: str
    branch: str = "main"


class ProjectResponse(BaseModel):
    id: int
    user_id: int
    name: str
    repo_url: str
    branch: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class DeploymentResponse(BaseModel):
    id: int
    project_id: int
    status: str
    log_output: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True


class LogEntry(BaseModel):
    timestamp: str
    message: str


class LogResponse(BaseModel):
    logs: List[LogEntry]

