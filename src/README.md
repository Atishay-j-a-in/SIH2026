# SIH26158 - Single-Pass Drone Video to Accurate 3D Model Generation System

## 3rD Lens Pipeline

[![CVPR 2025 Highlight](https://img.shields.io/badge/CVPR%202025-Highlight-red.svg)](https://arxiv.org/abs/2503.16964)
[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/downloads/release/python-3110/)
[![PyTorch 2.4](https://img.shields.io/badge/PyTorch-2.4.0%2BCU121-EE4C2C.svg)](https://pytorch.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![CUDA 12.1](https://img.shields.io/badge/CUDA-12.1-76B900.svg)](https://developer.nvidia.com/cuda-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Single-Pass In-the-Wild Drone Video to Georeferenced 3D Reconstruction & Multi-Format Geospatial Assets**

An end-to-end, production-grade 3D reconstruction and geospatial processing pipeline for **3rD Lens**, built on **[DroneSplat](https://arxiv.org/abs/2503.16964) (CVPR 2025 Highlight)**, **[DUSt3R](https://github.com/naver/dust3r)**, and **[Segment Anything 2 (SAM 2)](https://github.com/facebookresearch/segment-anything-2)**.

This system takes raw drone video footage (MP4, MOV, AVI, MKV) with telemetry (DJI `.SRT` or image EXIF metadata) and converts it into high-fidelity 3D Gaussian Splats, surface meshes, LiDAR point clouds, and GIS-compatible orthomosaics — all within a **24GB VRAM budget** (NVIDIA RTX 4090 / NVIDIA L4).

---

## 📑 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Key Features](#-key-features)
- [Pipeline Stages](#-pipeline-stages)
- [Multi-Format Output Assets](#-multi-format-output-assets)
- [Directory Layout](#-directory-layout)
- [Hardware & System Requirements](#-hardware--system-requirements)
- [Quick Start: Cloud One-Shot Setup](#-quick-start-cloud-one-shot-setup)
- [Manual Installation Guide](#-manual-installation-guide)
- [Running the Pipeline (CLI)](#-running-the-pipeline-cli)
- [Backend Server & API](#-backend-server--api)
  - [Starting the Server](#starting-the-server)


## 🌟 Overview & Architecture

Traditional photogrammetry pipelines (e.g., COLMAP + MVS) struggle on drone footage due to wide baselines, repetitive terrain textures, moving objects (vehicles, pedestrians), and high compute latencies.

**3rD Lens** combines state-of-the-art vision foundations into a continuous automated workflow:

```mermaid
flowchart TD
    subgraph Ingestion["1. Ingestion & Preprocessing"]
        A["Drone Video (.mp4, .mov)"] --> B["Stage 1: Frame Extraction (2 FPS)"]
        A --> C["Stage 1: Telemetry Parser (DJI SRT / EXIF)"]
        B --> D["4K → 1080p Downscale & Train/Test Split"]
    end

    subgraph PoseAndMask["2. Visual Geometry & Dynamic Masking"]
        D --> E["Stage 2: DUSt3R Pose Estimation"]
        E --> F["COLMAP-format Cameras & Sparse 3D Points"]
        D --> G["Stage 3: SAM 2 Instance Segmentation"]
        G --> H["Dynamic Object Masks (Vehicles/People)"]
    end

    subgraph SplatTraining["3. Robust 3D Gaussian Splatting"]
        F --> I["Stage 4: 3rD Lens Gaussian Splatting Training"]
        H --> I
        I --> J["Trained Gaussian Model (.ply)"]
    end

    subgraph Export["4. Geospatial & Surface Export"]
        J --> K["Stage 5: Poisson Surface Reconstruction"]
        J --> L["Stage 5: LiDAR LAS with UTM Projection"]
        J --> M["Stage 5: Top-Down GeoTIFF Orthomosaic"]
 conda create -n 3rdlens python=3.11 -y
 conda activate 3rdlens
        K --> P["GLB Web 3D Asset"]
        L --> Q["LAS Point Cloud (EPSG/UTM)"]
        M --> R["GeoTIFF Raster (.tif)"]
    end

    subgraph Delivery["5. Cloud API & Frontend Delivery"]
        N & O & P & Q & R --> S["FastAPI Backend (Port 8000)"]
        S --> T["Cloudflare Tunnel"]
        T --> U["Next.js / Vercel Web App"]
    end
```

---

## ✨ Key Features

- **End-to-End Automation**: Video input $\rightarrow$ 5 industry-standard 3D and GIS formats without manual intervention.
- **Robust Pose Estimation with DUSt3R**: Unconstrained global camera pose estimation that avoids COLMAP feature-matching bottlenecks and failure cases on non-sequential drone flights.
- **Dynamic Object Suppression with SAM 2**: Automatic instance segmentation masks transient dynamic objects (cars, people, animals), preventing ghosting and artifacts in the final splats.
- **24GB VRAM Optimization**: Sequential stage execution with explicit GPU cache clearing (`torch.cuda.empty_cache()`) and model memory release guarantees stable operation on standard 24GB GPUs (RTX 4090, RTX 3090, NVIDIA L4).
- **Geospatial Registration**: Automatically extracts GPS coordinates from DJI `.SRT` subtitle tracks or frame EXIF data, converting local point coordinates to UTM metric coordinates with EPSG CRS headers.
- **Production REST & WebSocket API**: FastAPI server with asynchronous job queues, JWT security, GPU health monitoring, and live WebSocket progress broadcast (0–100%).
- **Instant Cloud Exposure**: Built-in Cloudflare Tunnel script connects your GPU instance directly to frontends deployed on Vercel or AWS.

---

## 🔄 Pipeline Stages

| Stage | Name | Description | Key Outputs |
|---|---|---|---|
| **Stage 1** | **Frame Extraction & Telemetry** | Extracts frames at 2 FPS using `ffmpeg`, downscales 4K to 1080p, extracts DJI SRT / EXIF GPS coordinates, and builds 80/20 train-test splits. | `images/*.jpg`, `train_list.txt`, `test_list.txt`, `gps_metadata.json` |
| **Stage 2** | **DUSt3R Pose Estimation** | Executes ViT-Large CroCo stereo pairs to estimate camera intrinsics, poses, and initial dense point cloud without COLMAP. | `sparse/0/cameras.txt`, `images.txt`, `points3D.ply`, `confidence_map_train.npy` |
| **Stage 3** | **SAM 2 Instance Masking** | Runs Segment Anything 2 (Hiera-Large) automatic mask generator over all frames to mask out dynamic foreground objects. | `masks/*.png`, `masks/masks.json` |
| **Stage 4** | **3rD Lens Gaussian Splatting Training** | Trains 3D Gaussian Splats (7,000 iterations) with instance mask filtering, adaptive gradient scheduling, and densification. | `point_cloud/iteration_7000/point_cloud.ply` |
| **Stage 5** | **Multi-Format 3D Export** | Converts Gaussian Splats into point clouds, surface meshes via Poisson reconstruction, and binary glTF. | `model.ply`, `model.obj`, `model.glb` |
| **Stage 6** | **Geo-Registration & GIS Export** | Applies UTM coordinate projection to generate standard LiDAR LAS files and top-down nadir orthomosaics. | `model.las`, `orthomosaic.tif` |

---

## 📦 Multi-Format Output Assets

All exported assets are saved to `exports/{scene_name}/`:

| Format | File | Use Case | Tools / Software |
|---|---|---|---|
| **PLY** | `model.ply` | Clean colored point cloud with RGB vertex data | CloudCompare, MeshLab, Blender, Open3D |
| **OBJ** | `model.obj` | Poisson reconstructed 3D surface mesh | Autodesk Maya, Blender, Unreal Engine, Unity |
| **GLB** | `model.glb` | Web-ready binary glTF 2.0 asset | Three.js, Babylon.js, `<model-viewer>`, WebXR |
| **LAS** | `model.las` | ASPRS LiDAR point cloud with 16-bit color & UTM coordinates | ArcGIS Pro, QGIS, Global Mapper, CloudCompare |
| **GeoTIFF** | `orthomosaic.tif` | Georeferenced nadir top-down orthomosaic raster | QGIS, ArcGIS, Google Earth Pro, GDAL |

---

## 📂 Directory Layout

```
SIH2026V2/
├── backend/
├── pipeline/
│   ├── __init__.py
│   ├── config.py                  # Centralized system configurations and hyperparameters
│   ├── run_pipeline.py            # Main sequential pipeline runner (Stages 1–6)
│   ├── stage1_extract.py          # Video downscale, frame extract, GPS telemetry parse
│   │   ├── diff-gaussian-rasterization  # CUDA differentiable rasterizer
│   │   ├── sam2                   # Meta Segment Anything 2
│   │   └── dust3r                 # Naver Labs DUSt3R & CroCo
│   ├── preprocess.py              # DUSt3R camera pose estimation
│   ├── seg_all_instances.py       # SAM 2 instance segmentation
│   ├── train.py                   # 3D Gaussian Splatting trainer
│   ├── render.py                  # Evaluation image renderer
│   └── render_video.py            # Orbit / trajectory video renderer
├── input/                         # Raw input videos
├── uploads/                       # API uploaded videos
├── exports/                       # Processed 3D & GIS deliverables
├── requirements_backend.txt       # Backend API dependencies
├── setup_aic.sh                   # One-shot cloud setup script (CUDA 12.1 + Conda)
└── .env                           # Environment secrets & CORS configuration
```

---

## 💻 Hardware & System Requirements

- **GPU**: NVIDIA GPU with $\ge$ **24 GB VRAM** (RTX 4090, RTX 3090, RTX A5000, A10G, NVIDIA L4).
- **RAM**: 32 GB system RAM minimum (64 GB recommended for long videos).
- **Storage**: $\ge$ 50 GB free NVMe SSD storage for frame extraction and model checkpoints.
- **OS**: Linux (Ubuntu 20.04 / 22.04 LTS recommended) or Windows with WSL2.
- **CUDA**: CUDA Toolkit 12.1.
- **System Binaries**: `ffmpeg`, `ffprobe`, `exiftool` (optional, recommended).

---

## ⚡ Quick Start: Cloud One-Shot Setup

If deploying on a cloud GPU instance (e.g. AIC Cloud, RunPod, Lambda Labs, Vast.ai):

```bash
# Clone the repository
git clone --recursive https://github.com/Rimi0608/SIH2026V2.git
cd SIH2026V2

# Make the setup script executable and run it
chmod +x setup_aic.sh
./setup_aic.sh
```

The script automatically:
1. Creates the `3rdlens` Conda environment with Python 3.11.
2. Installs PyTorch 2.4.0 with CUDA 12.1.
3. Compiles CUDA extensions (`simple-knn`, `diff-gaussian-rasterization`, `sam2`, `dust3r curope`).
4. Downloads pre-trained DUSt3R (3.5 GB) and SAM 2 (900 MB) model weights into `DroneSplat/checkpoints/`.
5. Installs backend dependencies (`fastapi`, `uvicorn`, `laspy`, `rasterio`, `pyproj`).
6. Generates a secure `.env` file with random JWT secrets.

> [!TIP]
> **Lightning AI Studio Users**: If running in Lightning AI Studio (with a locked/pre-existing Conda environment or CUDA 13.0/12.1 mismatch), run `bash setup_lightning.sh` or see [`STARTUP_INSTRUCTIONS.md`](file:///d:/Repo/STARTUP_INSTRUCTIONS.md). If you encounter CUDA extension build errors, execute `./fix_cuda_mismatch.sh`.


## 🛠️ Manual Installation Guide

If you prefer to install dependencies manually:

### 1. Create Conda Environment
```bash
conda create -n 3rdlens python=3.11 -y
conda activate 3rdlens
```

### 2. Install PyTorch with CUDA 12.1
```bash
pip install torch==2.4.0 torchvision==0.19.0 torchaudio==2.4.0 --index-url https://download.pytorch.org/whl/cu121
```

### 3. Install 3rD Lens & CUDA Extensions
```bash
cd DroneSplat
git submodule update --init --recursive

# Install Python requirements
pip install -r requirements.txt

# Compile CUDA rasterization & KNN kernels
pip install --no-build-isolation submodules/simple-knn
pip install --no-build-isolation submodules/diff-gaussian-rasterization

# Install SAM 2
cd submodules/sam2
pip install --no-build-isolation -e .
cd ../..

# (Optional) Build DUSt3R fast RoPE CUDA kernels
cd submodules/dust3r/croco/models/curope/
python setup.py build_ext --inplace
cd ../../../../..
```

### 4. Install Backend & Geospatial Dependencies
```bash
cd ..
pip install -r requirements_backend.txt
```

### 5. Download Model Checkpoints
```bash
mkdir -p DroneSplat/checkpoints

# DUSt3R ViT-Large Decoder (3.5 GB)
wget https://download.europe.naverlabs.com/ComputerVision/DUSt3R/DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth \
    -P DroneSplat/checkpoints/

# SAM 2 Hiera Large (900 MB)
wget https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_large.pt \
    -P DroneSplat/checkpoints/
```

### 6. Configure Environment Variables
Create a `.env` file in the project root:
```env
JWT_SECRET=generate_a_random_32_byte_hex_key
API_USERNAME=admin
API_PASSWORD=choose_a_secure_password
CORS_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app
```

---

## 🚀 Running the Pipeline (CLI)

Run the full end-to-end pipeline directly from the command line:

```bash
conda activate 3rdlens

# Run complete pipeline on a drone video
python pipeline/run_pipeline.py \
    --video input/LineVision-VideoGeoTagging.mp4 \
    --scene inspection_site_01 \
    --fps 1.0 \
    --max-frames 77 \
    --iter 5000
```

### CLI Arguments

| Argument | Type | Default | Description |
|---|---|---|---|
| `--video` | `str` | Required* | Path to input drone video (`.mp4`, `.mov`, `.avi`, `.mkv`) |
| `--scene` | `str` | Required | Unique name identifier for the scene/job |
| `--fps` | `float` | `1.0` | Frame extraction frequency (frames per second) |
| `--max-frames` | `int` | `77` | Maximum frames sent to DUSt3R and downstream stages |
| `--iter` | `int` | `5000` | 3D Gaussian Splatting training iterations |
| `--skip-extract` | `flag` | `False` | Skip Stage 1 and use pre-extracted frames in `DroneSplat/data/{scene}/` |

For a quick pipeline check, use 30–40 frames and 400 training iterations:

```bash
python pipeline/run_pipeline.py \
  --video input/sample_test3.mp4 \
  --scene sample_test3_quick \
  --fps 1.0 \
  --max-frames 40 \
  --iter 400
```

### Running Individual Stages

You can also run stages individually for testing or data inspection:

```bash
# Stage 1: Frame extraction, downscaling & telemetry parsing only
python -m pipeline.stage1_extract \
    --video input/flight_01.mp4 \
    --scene flight_01 \
    --fps 1.0 \
    --max-frames 77

# Stage 5: Multi-format export from existing point cloud
python pipeline/stage5_export.py \
    --input DroneSplat/output/flight_01/point_cloud/iteration_7000/point_cloud.ply \
    --output exports/flight_01 \
    --gps DroneSplat/data/flight_01/gps_metadata.json
```

---

## 🌐 Backend Server & API

### Starting the Server

```bash
conda activate 3rdlens
cd backend
python server.py
```
The server binds to `http://0.0.0.0:8000`. Interactive OpenAPI documentation is available at `http://localhost:8000/docs`.

### Cloudflare Tunnel Integration

To expose the backend running on a remote cloud GPU to the public internet (for Next.js / Vercel frontends):

```bash
chmod +x pipeline/setup_tunnel.sh
bash pipeline/setup_tunnel.sh 8000
```

Cloudflare will output a public HTTPS URL (e.g., `https://xyz-random-subdomain.trycloudflare.com`).  
Set this URL as `NEXT_PUBLIC_API_URL` in your frontend environment.

### API Endpoints

#### Authentication
- **`POST /api/auth/token`**: Exchange username/password for a Bearer JWT token.
  ```json
  { "username": "admin", "password": "your_password" }
  ```

#### Health & Telemetry
- **`GET /api/health`**: GPU hardware telemetry and active job counters.
  ```json
  {
    "status": "healthy",
    "gpu": {
      "available": true,
      "name": "NVIDIA GeForce RTX 4090",
      "vram_total_gb": 24.0,
      "vram_allocated_gb": 4.12,
      "vram_reserved_gb": 5.80
    },
    "active_jobs": 0,
    "total_jobs": 3
  }
  ```

#### Reconstruction Jobs
- **`POST /api/upload`**: Upload a video file (multipart form data, up to 2GB) and trigger the pipeline.
  ```bash
  curl -X POST "http://localhost:8000/api/upload" \
       -H "Authorization: Bearer <TOKEN>" \
       -F "video=@survey_flight.mp4"
  ```
  *Response:*
  ```json
  {
    "job_id": "a1b2c3d4",
    "status": "queued",
    "message": "Pipeline started"
  }
  ```

- **`GET /api/status/{job_id}`**: Polling endpoint for job stage, percentage, and timing summary.
- **`GET /api/jobs`**: List all historical and active jobs.
- **`GET /api/download/{job_id}/{format}`**: Download exported assets.
  - Allowed `format` values: `ply`, `obj`, `glb`, `las`, `geotiff`.

### WebSocket Progress Updates

Connect to `ws://localhost:8000/api/ws/{job_id}` for real-time progress broadcast without polling:

```javascript
const ws = new WebSocket(`ws://localhost:8000/api/ws/${jobId}`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "progress") {
    console.log(`[${data.stage}] ${data.progress_pct}%: ${data.message}`);
  }
};
```

Sample WebSocket frame:
```json
{
  "type": "progress",
  "job_id": "a1b2c3d4",
  "stage": "train",
  "progress_pct": 65,
  "message": "Training iteration 4550/7000...",
  "timestamp": "2026-09-08T01:30:00Z"
}
```

---

## ⚙️ Configuration Reference

Edit `pipeline/config.py` or provide environment variables to customize processing parameters:

```python
# Video & Image Processing
TARGET_RESOLUTION = (1920, 1080)   # 4K is automatically downscaled to 1080p
FRAME_EXTRACT_FPS = 1              # Extracted frame rate
MAX_FRAMES = 77                    # Maximum frames for the 77-second recording
TRAIN_TEST_SPLIT = 0.8             # 80% train, 20% validation

# DUSt3R Pose Estimator
DUST3R_IMAGE_SIZE = 512            # Internal inference image size

# 3D Gaussian Splatting
GS_TRAIN_ITERATIONS = 5000         # Total optimization iterations
GS_TEST_ITERATIONS = [500, 2500, 5000]
GS_SAVE_ITERATIONS = [5000]

# Mesh Reconstruction
POISSON_DEPTH = 9                  # Octree depth for Poisson meshing
POISSON_MIN_DENSITY = 0.01         # Quantile threshold for edge boundary cleanup

# Server Settings
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 8000
MAX_UPLOAD_SIZE_MB = 2048          # Maximum upload file size (2GB)
```

---

## 🩺 Troubleshooting & Memory Management

### 1. Out of Memory (CUDA OOM)
- The pipeline executes stages sequentially and triggers `torch.cuda.empty_cache()` at stage transitions.
- If you encounter OOM during **DUSt3R**: In `pipeline/run_pipeline.py`, lower `batch_size` in `inference(pairs, model, device, batch_size=4)` from `4` to `2` or `1`.
- If you encounter OOM during **Training**: Lower `TARGET_RESOLUTION` in `pipeline/config.py` or reduce the video extraction FPS (e.g. `1.0` FPS).

### 2. Missing Submodules / Extension Compilation Error
Ensure you cloned submodules recursively:
```bash
git submodule update --init --recursive
```
If `diff-gaussian-rasterization` fails to compile, verify your `nvcc` matches your PyTorch CUDA runtime:
```bash
nvcc --version
python -c "import torch; print(torch.version.cuda)"
```

### 3. Missing GPS Telemetry
- If your drone is DJI, ensure video recording generates an `.SRT` file alongside the video, or enable "Video Subtitles" in DJI Fly / DJI Pilot.
- If frames have EXIF metadata, install `exiftool` (`sudo apt-get install exiftool`) for comprehensive camera tag extraction.
- If no GPS data is detected, the pipeline automatically proceeds with local metric coordinates and falls back to unprojected LAS / orthomosaic exports.

---

## 📚 Acknowledgements & References

This pipeline integrates and builds upon exceptional open-source research and tools:

- **DroneSplat**: *3D Gaussian Splatting for Robust 3D Reconstruction from In-the-Wild Drone Imagery* (CVPR 2025 Highlight) — [Paper](https://arxiv.org/abs/2503.16964) | [Code](https://github.com/BITyia/DroneSplat)
- **DUSt3R**: *Geometric 3D Vision Made Easy* (CVPR 2024 Highlight, Naver Labs) — [Code](https://github.com/naver/dust3r)
- **SAM 2**: *Segment Anything in Images and Videos* (Meta AI Research) — [Code](https://github.com/facebookresearch/segment-anything-2)
- **3D Gaussian Splatting**: *3D Gaussian Splatting for Real-Time Radiance Field Rendering* (SIGGRAPH 2023, Inria) — [Code](https://github.com/graphdeco-inria/gaussian-splatting)
- **InstantSplat**: *Unbounded Scene Reconstruction in Minutes* (NVlabs) — [Code](https://github.com/NVlabs/InstantSplat)
- **Open3D & Trimesh**: For point cloud analysis and Poisson surface reconstruction.
