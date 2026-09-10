"""
Centralized configuration for the 3rD Lens pipeline.
All paths, hyperparameters, and deployment settings are defined here.
"""

import os

# ─── Base Paths ──────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRONESPLAT_ROOT = os.path.join(PROJECT_ROOT, "DroneSplat")

# ─── GPU & Processing ───────────────────────────────────────────────────────
MAX_VRAM_GB = 24
TARGET_RESOLUTION = (1920, 1080)      # Downscale 4K to this
FRAME_EXTRACT_FPS = 1                 # Frames per second to extract from video
MAX_FRAMES = 77                       # Maximum frames for the 77-second recording
DUST3R_IMAGE_SIZE = 512               # DUSt3R internal resolution
DUST3R_SCENE_GRAPH = os.environ.get("DUST3R_SCENE_GRAPH", "swin-5-noncyclic")
GS_TRAIN_ITERATIONS = 5000            # Full recording run
GS_TEST_ITERATIONS = [500, 2500, 5000]
GS_SAVE_ITERATIONS = [5000]
TRAIN_TEST_SPLIT = 0.8                # 80% train, 20% test

# ─── Checkpoints ─────────────────────────────────────────────────────────────
DUST3R_CHECKPOINT = os.path.join(
    DRONESPLAT_ROOT,
    "checkpoints",
    "DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth"
)
SAM2_CHECKPOINT = os.path.join(
    DRONESPLAT_ROOT,
    "checkpoints",
    "sam2_hiera_large.pt"
)
SAM2_CONFIG = "configs/sam2/sam2_hiera_l.yaml"

# ─── Data Directories ───────────────────────────────────────────────────────
DATA_DIR = os.path.join(DRONESPLAT_ROOT, "data")
OUTPUT_DIR = os.path.join(DRONESPLAT_ROOT, "output")
UPLOAD_DIR = os.path.join(PROJECT_ROOT, "uploads")
EXPORT_DIR = os.path.join(PROJECT_ROOT, "exports")

# ─── Server Settings ────────────────────────────────────────────────────────
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 8000
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24  # 24 hours
CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,https://your-app.vercel.app",
    ).split(",")
    if origin.strip()
]
MAX_UPLOAD_SIZE_MB = 2048  # 2GB

# ─── Supported Formats ──────────────────────────────────────────────────────
SUPPORTED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
EXPORT_FORMATS = ["ply", "obj", "glb", "las", "geotiff"]

# ─── Poisson Mesh Reconstruction ────────────────────────────────────────────
POISSON_DEPTH = 9         # Octree depth for Poisson reconstruction
POISSON_MIN_DENSITY = 0.01  # Density threshold for cleaning
