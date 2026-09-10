"""
FastAPI Backend Server for the 3rD Lens Pipeline.

Endpoints:
  POST /api/upload           — Upload drone video, start pipeline job
  GET  /api/status/{job_id}  — Get job status and progress
  WS   /api/ws/{job_id}      — Real-time WebSocket progress updates
  GET  /api/download/{job_id}/{format} — Download exported file
  GET  /api/health           — GPU health check
  POST /api/auth/token       — Generate JWT token

Designed to run on AIC Cloud GPU (RTX 4090 24GB) with Cloudflare Tunnel
exposing it to a Vercel-deployed Next.js frontend.
"""

import os
import sys
import uuid
import json
import time
import logging
import asyncio
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import (
    FastAPI,
    File,
    UploadFile,
    HTTPException,
    Depends,
    WebSocket,
    WebSocketDisconnect,
    BackgroundTasks,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# Add project root and all submodule directories to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in [
    PROJECT_ROOT,
    os.path.join(PROJECT_ROOT, "DroneSplat"),
    os.path.join(PROJECT_ROOT, "DroneSplat", "submodules", "dust3r"),
    os.path.join(PROJECT_ROOT, "DroneSplat", "submodules", "dust3r", "croco"),
    os.path.join(PROJECT_ROOT, "DroneSplat", "submodules", "croco"),
]:
    if os.path.exists(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

from pipeline.config import (
    SERVER_HOST,
    SERVER_PORT,
    JWT_SECRET,
    JWT_ALGORITHM,
    JWT_EXPIRE_MINUTES,
    CORS_ORIGINS,
    MAX_UPLOAD_SIZE_MB,
    SUPPORTED_VIDEO_EXTENSIONS,
    EXPORT_FORMATS,
    UPLOAD_DIR,
    EXPORT_DIR,
)

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("thirdlens-api")

# ─── App Setup ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="3rD Lens Pipeline API",
    description="Single-pass drone video → georeferenced 3D model",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── In-Memory Job Store (SQLite can be added later for persistence) ─────────
jobs: Dict[str, Dict[str, Any]] = {}
# WebSocket connections per job
ws_connections: Dict[str, list] = {}

# ─── JWT Auth ────────────────────────────────────────────────────────────────
try:
    from jose import jwt, JWTError
    JWT_AVAILABLE = True
except ImportError:
    JWT_AVAILABLE = False
    logger.warning("python-jose not installed — JWT auth disabled")


class TokenRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def create_jwt_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_jwt_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user(authorization: Optional[str] = None):
    """Optional JWT verification — skipped if python-jose not installed."""
    if not JWT_AVAILABLE:
        return {"sub": "anonymous"}
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid auth scheme")
    return verify_jwt_token(token)


# ─── Progress Callback for WebSocket ────────────────────────────────────────
def _create_progress_callback(job_id: str):
    """Create a callback that updates job state and broadcasts via WebSocket."""

    def callback(stage: str, progress_pct: int, message: str):
        # Update job state
        if job_id in jobs:
            jobs[job_id]["stage"] = stage
            jobs[job_id]["progress_pct"] = progress_pct
            jobs[job_id]["message"] = message
            jobs[job_id]["updated_at"] = datetime.utcnow().isoformat()

        # Broadcast to WebSocket clients
        event = {
            "type": "progress",
            "job_id": job_id,
            "stage": stage,
            "progress_pct": progress_pct,
            "message": message,
            "timestamp": datetime.utcnow().isoformat(),
        }

        if job_id in ws_connections:
            dead = []
            for ws in ws_connections[job_id]:
                try:
                    asyncio.run(ws.send_json(event))
                except Exception:
                    dead.append(ws)
            for ws in dead:
                ws_connections[job_id].remove(ws)

    return callback


def _run_pipeline_in_thread(job_id: str, video_path: str, scene_name: str):
    """Run the pipeline in a background thread."""
    from pipeline.run_pipeline import run_pipeline

    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["started_at"] = datetime.utcnow().isoformat()

        callback = _create_progress_callback(job_id)

        result = run_pipeline(
            video_path=video_path,
            scene_name=scene_name,
            progress_callback=callback,
        )

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["result"] = {
            "exports": result["exports"],
            "timings": result["timings"],
            "total_time": result["total_time"],
        }
        jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()
        logger.info(f"Job {job_id} completed in {result['total_time']:.1f}s")

    except Exception as e:
        logger.exception(f"Job {job_id} failed")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()


# ─── API Endpoints ───────────────────────────────────────────────────────────

@app.post("/api/auth/token", response_model=TokenResponse)
async def get_token(request: TokenRequest):
    """Generate a JWT token for API access."""
    if not JWT_AVAILABLE:
        return TokenResponse(access_token="no-auth-required")

    # Simple auth — replace with real user validation in production
    auth_user = os.environ.get("API_USERNAME", "admin")
    auth_pass = os.environ.get("API_PASSWORD", "admin")

    if request.username != auth_user or request.password != auth_pass:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_jwt_token({"sub": request.username})
    return TokenResponse(access_token=token)


@app.get("/api/health")
async def health_check():
    """GPU health check — returns VRAM usage and active jobs."""
    gpu_info = {"available": False}

    try:
        import torch
        if torch.cuda.is_available():
            gpu_info = {
                "available": True,
                "name": torch.cuda.get_device_name(0),
                "vram_total_gb": round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2),
                "vram_allocated_gb": round(torch.cuda.memory_allocated(0) / (1024**3), 2),
                "vram_reserved_gb": round(torch.cuda.memory_reserved(0) / (1024**3), 2),
            }
    except Exception as e:
        logger.warning(f"Failed to query GPU info: {e}")

    active_jobs = sum(1 for j in jobs.values() if j["status"] == "processing")

    return {
        "status": "healthy",
        "gpu": gpu_info,
        "active_jobs": active_jobs,
        "total_jobs": len(jobs),
    }


@app.post("/api/upload")
async def upload_video(video: UploadFile = File(...)):
    """
    Upload a drone video and start the reconstruction pipeline.

    Returns the job_id for tracking progress.
    """
    # Validate file extension
    ext = Path(video.filename).suffix.lower()
    if ext not in SUPPORTED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format: {ext}. Supported: {SUPPORTED_VIDEO_EXTENSIONS}",
        )

    # Check if another job is already running
    active = [j for j in jobs.values() if j["status"] == "processing"]
    if active:
        raise HTTPException(
            status_code=429,
            detail="A job is already running. Please wait for it to complete.",
        )

    # Generate job ID and save video
    job_id = str(uuid.uuid4())[:8]
    scene_name = f"job_{job_id}"

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    video_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")

    # Stream upload to disk
    with open(video_path, "wb") as f:
        while chunk := await video.read(1024 * 1024):  # 1MB chunks
            f.write(chunk)

    file_size_mb = os.path.getsize(video_path) / (1024 * 1024)

    if file_size_mb > MAX_UPLOAD_SIZE_MB:
        os.remove(video_path)
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {file_size_mb:.0f}MB (max: {MAX_UPLOAD_SIZE_MB}MB)",
        )

    # Create job record
    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "stage": "upload",
        "progress_pct": 0,
        "message": "Video uploaded, starting pipeline...",
        "filename": video.filename,
        "file_size_mb": round(file_size_mb, 1),
        "scene_name": scene_name,
        "created_at": datetime.utcnow().isoformat(),
        "started_at": None,
        "completed_at": None,
        "result": None,
        "error": None,
    }

    # Start pipeline in background thread
    thread = threading.Thread(
        target=_run_pipeline_in_thread,
        args=(job_id, video_path, scene_name),
        daemon=True,
    )
    thread.start()

    logger.info(f"Job {job_id} created: {video.filename} ({file_size_mb:.1f} MB)")

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Pipeline started",
    }


@app.get("/api/status/{job_id}")
async def get_job_status(job_id: str):
    """Get the current status and progress of a pipeline job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    job = jobs[job_id]
    response = {
        "job_id": job["job_id"],
        "status": job["status"],
        "stage": job["stage"],
        "progress_pct": job["progress_pct"],
        "message": job["message"],
        "filename": job["filename"],
        "created_at": job["created_at"],
        "started_at": job["started_at"],
        "completed_at": job["completed_at"],
    }

    if job["status"] == "completed" and job["result"]:
        response["result"] = {
            "total_time": job["result"]["total_time"],
            "timings": job["result"]["timings"],
            "available_formats": list(job["result"]["exports"].keys()),
        }

    if job["status"] == "failed":
        response["error"] = job["error"]

    return response


@app.websocket("/api/ws/{job_id}")
async def websocket_progress(websocket: WebSocket, job_id: str):
    """WebSocket endpoint for real-time pipeline progress updates."""
    await websocket.accept()

    if job_id not in ws_connections:
        ws_connections[job_id] = []
    ws_connections[job_id].append(websocket)

    try:
        # Send current state immediately
        if job_id in jobs:
            await websocket.send_json({
                "type": "status",
                "job_id": job_id,
                **{k: v for k, v in jobs[job_id].items() if k != "result"},
            })

        # Keep connection alive
        while True:
            try:
                # Wait for client messages (ping/pong, close)
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({"type": "heartbeat"})
            except WebSocketDisconnect:
                break

    finally:
        if job_id in ws_connections and websocket in ws_connections[job_id]:
            ws_connections[job_id].remove(websocket)


@app.get("/api/download/{job_id}/{format}")
async def download_file(job_id: str, format: str):
    """Download an exported file in the specified format."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job is not complete (status: {job['status']})",
        )

    if not job["result"] or "exports" not in job["result"]:
        raise HTTPException(status_code=500, detail="No export data available")

    exports = job["result"]["exports"]

    if format not in exports:
        raise HTTPException(
            status_code=400,
            detail=f"Format '{format}' not available. Available: {list(exports.keys())}",
        )

    file_path = exports[format]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Export file not found on disk")

    filename = os.path.basename(file_path)

    # Set proper MIME types
    mime_types = {
        "ply": "application/octet-stream",
        "obj": "text/plain",
        "glb": "model/gltf-binary",
        "las": "application/octet-stream",
        "geotiff": "image/tiff",
    }

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=mime_types.get(format, "application/octet-stream"),
    )


@app.get("/api/jobs")
async def list_jobs():
    """List all jobs."""
    return [
        {
            "job_id": j["job_id"],
            "status": j["status"],
            "filename": j["filename"],
            "created_at": j["created_at"],
        }
        for j in jobs.values()
    ]


# ─── Main ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(EXPORT_DIR, exist_ok=True)

    logger.info(f"Starting 3rD Lens API on {SERVER_HOST}:{SERVER_PORT}")
    logger.info(f"CORS origins: {CORS_ORIGINS}")

    uvicorn.run(
        "server:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=False,
        workers=1,  # Single worker — GPU is not thread-safe
        ws_max_size=16 * 1024 * 1024,  # 16MB WebSocket frame limit
    )
