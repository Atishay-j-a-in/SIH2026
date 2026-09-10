#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# 3rD Lens Pipeline — One-Shot AIC Cloud Setup Script
# Target: RTX 4090 24GB or NVIDIA L4 24GB
# Modified for Lightning AI Studio (uses existing conda env, handles CUDA mismatch)
# ═══════════════════════════════════════════════════════════════════════════

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════╗"
echo "║   3rD Lens Pipeline — Lightning AI Studio Setup      ║"
echo "╚═══════════════════════════════════════════════════════╝"

# ─── 1. Verify GPU ──────────────────────────────────────────────────────────
echo ""
echo "▶ Step 1: Checking GPU..."
if command -v nvidia-smi &> /dev/null; then
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
    # Detect CUDA version
    CUDA_VERSION=$(nvidia-smi | grep "CUDA Version" | sed -n 's/.*CUDA Version: \([0-9]\+\.[0-9]\+\).*/\1/p')
    echo "  Detected CUDA Version: $CUDA_VERSION"
else
    echo "⚠ nvidia-smi not found. Ensure NVIDIA drivers are installed."
fi

# ─── 2. Use Existing Conda Environment (Lightning AI Studio) ────────────────
echo ""
echo "▶ Step 2: Using existing conda environment..."

# Source conda if not in PATH
if ! command -v conda &> /dev/null; then
    for conda_loc in "$HOME/miniconda3" "$HOME/anaconda3" "/opt/conda" "$HOME/miniconda"; do
        if [ -f "$conda_loc/etc/profile.d/conda.sh" ]; then
            . "$conda_loc/etc/profile.d/conda.sh"
            break
        fi
    done
fi

eval "$(conda shell.bash hook)"

# Use base environment or current environment - don't create new one
CURRENT_ENV=$(conda info --envs | grep '*' | awk '{print $1}')
echo "  Using existing environment: $CURRENT_ENV"
conda activate "$CURRENT_ENV"

# ─── 3. Install PyTorch (Match System CUDA Version) ─────────────────────────
echo ""
echo "▶ Step 3: Installing PyTorch..."

# Detect system CUDA version and install matching PyTorch
if [[ "$CUDA_VERSION" == "13.0" ]] || [[ "$CUDA_VERSION" == "12."* ]]; then
    # For CUDA 12.x or 13.0, use PyTorch 2.5+ with CUDA 12.1 (closest match)
    # Use --no-build-isolation for extensions to use system CUDA
    echo "  Installing PyTorch 2.5+ with CUDA 12.1 (compatible with CUDA 12.x/13.0)..."
    pip install torch==2.5.0 torchvision==0.20.0 torchaudio==2.5.0 \
        --index-url https://download.pytorch.org/whl/cu121
else
    # Fallback: install CPU version and let extensions build with system CUDA
    echo "  Installing PyTorch CPU version (extensions will use system CUDA)..."
    pip install torch==2.5.0 torchvision==0.20.0 torchaudio==2.5.0 \
        --index-url https://download.pytorch.org/whl/cpu
fi

# Set environment variables for CUDA extension building
export TORCH_CUDA_ARCH_LIST="8.0;8.6;8.9;9.0"  # Ampere (A100), Ada (RTX 4090), Hopper (H100)
export CUDA_HOME=${CUDA_HOME:-/usr/local/cuda}
export PATH="$CUDA_HOME/bin:$PATH"
export LD_LIBRARY_PATH="$CUDA_HOME/lib64:$LD_LIBRARY_PATH"

echo "  CUDA_HOME: $CUDA_HOME"
echo "  TORCH_CUDA_ARCH_LIST: $TORCH_CUDA_ARCH_LIST"

# ─── 4. Install 3rD Lens Dependencies ────────────────────────────────────────
echo ""
echo "▶ Step 4: Installing 3rD Lens dependencies..."
cd DroneSplat

# Init submodules (if tracked as submodules)
git submodule update --init --recursive 2>/dev/null || true

# Python requirements
pip install -r requirements.txt

# Install ninja for faster CUDA builds
pip install ninja

# Build CUDA extensions with proper flags for system CUDA
echo "  Building simple-knn CUDA extension..."
pip install --no-build-isolation --verbose submodules/simple-knn

echo "  Building diff-gaussian-rasterization CUDA extension..."
pip install --no-build-isolation --verbose submodules/diff-gaussian-rasterization

echo "  Installing SAM2..."
cd submodules/sam2
pip install --no-build-isolation -e .
cd ../..

# Optional: Build DUSt3R CUDA kernels for faster runtime
echo "  Building DUSt3R CUDA kernels (optional)..."
cd submodules/dust3r/croco/models/curope/
python setup.py build_ext --inplace 2>/dev/null || echo "  ⚠ CUDA kernel build failed (non-critical)"
cd ../../../../..

cd ..

# ─── 5. Install Backend Dependencies ────────────────────────────────────────
echo ""
echo "▶ Step 5: Installing backend API dependencies..."
pip install -r requirements_backend.txt

# Install ffmpeg if not present
if ! command -v ffmpeg &> /dev/null; then
    echo "  Installing ffmpeg..."
    conda install -c conda-forge ffmpeg -y 2>/dev/null || \
    sudo apt-get install -y ffmpeg 2>/dev/null || \
    echo "  ⚠ Could not install ffmpeg automatically. Please install manually."
fi

# ─── 6. Download Checkpoints ────────────────────────────────────────────────
echo ""
echo "▶ Step 6: Downloading model checkpoints..."
mkdir -p DroneSplat/checkpoints

# DUSt3R checkpoint (~3.5 GB)
DUST3R_CKPT="DroneSplat/checkpoints/DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth"
if [ ! -f "$DUST3R_CKPT" ]; then
    echo "  Downloading DUSt3R checkpoint (3.5 GB)..."
    wget -q --show-progress \
        https://download.europe.naverlabs.com/ComputerVision/DUSt3R/DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth \
        -P DroneSplat/checkpoints/
else
    echo "  ✓ DUSt3R checkpoint already exists"
fi

# SAM2 checkpoint (~900 MB)
SAM2_CKPT="DroneSplat/checkpoints/sam2_hiera_large.pt"
if [ ! -f "$SAM2_CKPT" ]; then
    echo "  Downloading SAM2 checkpoint (900 MB)..."
    wget -q --show-progress \
        https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_large.pt \
        -P DroneSplat/checkpoints/
else
    echo "  ✓ SAM2 checkpoint already exists"
fi

# ─── 7. Create Required Directories ─────────────────────────────────────────
echo ""
echo "▶ Step 7: Creating required directories..."
mkdir -p uploads exports DroneSplat/data DroneSplat/output

# ─── 8. Generate Secrets ────────────────────────────────────────────────────
echo ""
echo "▶ Step 8: Environment configuration..."
if [ ! -f .env ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    cat > .env << EOF
# 3rD Lens Pipeline Environment
JWT_SECRET=$JWT_SECRET
API_USERNAME=admin
API_PASSWORD=$(openssl rand -hex 16)
CORS_ORIGINS=http://localhost:3000,https://your-app.vercel.app
EOF
    echo "  ✓ Created .env file (update CORS_ORIGINS with your Vercel URL)"
    echo "  ⚠ API credentials saved to .env — keep this file secure!"
else
    echo "  ✓ .env file already exists"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║   Setup Complete! ✓                                  ║"
echo "╠═══════════════════════════════════════════════════════╣"
echo "║                                                       ║"
echo "║   To start the server (Lightning AI Studio):         ║"
echo "║     # Environment is already activated               ║"
echo "║     cd backend && python server.py                   ║"
echo "║                                                       ║"
echo "║   To expose via Cloudflare Tunnel:                   ║"
echo "║     bash pipeline/setup_tunnel.sh                    ║"
echo "║                                                       ║"
echo "║   To test:                                           ║"
echo "║     curl http://localhost:8000/api/health             ║"
echo "║                                                       ║"
echo "║   Note: Using existing conda environment             ║"
echo "║   PyTorch installed with CUDA 12.1 (compatible)      ║"
echo "║   CUDA extensions built with --no-build-isolation    ║"
echo "║                                                       ║"
echo "╚═══════════════════════════════════════════════════════╝"
