#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# 3rD Lens Pipeline — Lightning AI Studio Setup Script
# Uses existing conda environment, fixes CUDA 13.0/12.1 mismatch
# ═══════════════════════════════════════════════════════════════════════════

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════╗"
echo "║   3rD Lens — Lightning AI Studio Setup               ║"
echo "╚═══════════════════════════════════════════════════════╝"

# ─── 1. Verify GPU and CUDA ─────────────────────────────────────────────────
echo ""
echo "▶ Step 1: Checking GPU and CUDA..."
if command -v nvidia-smi &> /dev/null; then
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
    CUDA_VERSION=$(nvidia-smi | grep "CUDA Version" | sed -n 's/.*CUDA Version: \([0-9]\+\.[0-9]\+\).*/\1/p')
    echo "  Detected CUDA Version: $CUDA_VERSION"
else
    echo "⚠ nvidia-smi not found"
    CUDA_VERSION="12.1"
fi

# ─── 2. Activate Existing Conda Environment ─────────────────────────────────
echo ""
echo "▶ Step 2: Activating existing conda environment..."

# Source conda
if ! command -v conda &> /dev/null; then
    for conda_loc in "$HOME/miniconda3" "$HOME/anaconda3" "/opt/conda" "$HOME/miniconda"; do
        if [ -f "$conda_loc/etc/profile.d/conda.sh" ]; then
            . "$conda_loc/etc/profile.d/conda.sh"
            break
        fi
    done
fi

eval "$(conda shell.bash hook)"

# Use base environment (Lightning AI Studio default)
CURRENT_ENV=$(conda info --envs | grep '*' | awk '{print $1}')
echo "  Using environment: $CURRENT_ENV"
conda activate "$CURRENT_ENV"

# ─── 3. Set CUDA Environment Variables ──────────────────────────────────────
echo ""
echo "▶ Step 3: Setting CUDA environment variables..."

# Find CUDA installation
if [ -d "/usr/local/cuda" ]; then
    export CUDA_HOME=/usr/local/cuda
elif [ -d "/usr/local/cuda-12.1" ]; then
    export CUDA_HOME=/usr/local/cuda-12.1
elif [ -d "/usr/local/cuda-12.4" ]; then
    export CUDA_HOME=/usr/local/cuda-12.4
else
    CUDA_DIR=$(ls -d /usr/local/cuda* 2>/dev/null | head -1)
    if [ -n "$CUDA_DIR" ]; then
        export CUDA_HOME="$CUDA_DIR"
    fi
fi

export PATH="$CUDA_HOME/bin:$PATH"
export LD_LIBRARY_PATH="$CUDA_HOME/lib64:$LD_LIBRARY_PATH"

# Set CUDA architecture flags for common GPUs
# 8.0 = A100, 8.6 = RTX 3090, 8.9 = RTX 4090/L4, 9.0 = H100
export TORCH_CUDA_ARCH_LIST="8.0;8.6;8.9;9.0"

echo "  CUDA_HOME: $CUDA_HOME"
echo "  TORCH_CUDA_ARCH_LIST: $TORCH_CUDA_ARCH_LIST"

# ─── 4. Install PyTorch with CUDA 12.1 ──────────────────────────────────────
echo ""
echo "▶ Step 4: Installing PyTorch 2.5.0 with CUDA 12.1..."
echo "  (CUDA 12.1 is compatible with system CUDA 12.x/13.0)"

pip install torch==2.5.0 torchvision==0.20.0 torchaudio==2.5.0 \
    --index-url https://download.pytorch.org/whl/cu121

# ─── 5. Install Ninja for Faster CUDA Builds ────────────────────────────────
echo ""
echo "▶ Step 5: Installing ninja..."
pip install ninja

# ─── 6. Install 3rD Lens Dependencies ────────────────────────────────────────
echo ""
echo "▶ Step 6: Installing 3rD Lens dependencies..."
cd DroneSplat

# Init submodules
git submodule update --init --recursive 2>/dev/null || true

# Python requirements
pip install -r requirements.txt

# ─── 7. Build CUDA Extensions ───────────────────────────────────────────────
echo ""
echo "▶ Step 7: Building CUDA extensions..."

# Build simple-knn with proper flags
echo "  Building simple-knn..."
cd submodules/simple-knn
TORCH_CUDA_ARCH_LIST="$TORCH_CUDA_ARCH_LIST" \
CUDA_HOME="$CUDA_HOME" \
pip install --no-build-isolation --verbose .
cd ../..

# Build diff-gaussian-rasterization
echo "  Building diff-gaussian-rasterization..."
cd submodules/diff-gaussian-rasterization
TORCH_CUDA_ARCH_LIST="$TORCH_CUDA_ARCH_LIST" \
CUDA_HOME="$CUDA_HOME" \
pip install --no-build-isolation --verbose .
cd ../..

# Install SAM2
echo "  Installing SAM2..."
cd submodules/sam2
TORCH_CUDA_ARCH_LIST="$TORCH_CUDA_ARCH_LIST" \
CUDA_HOME="$CUDA_HOME" \
pip install --no-build-isolation -e .
cd ../..

# Optional: Build DUSt3R CUDA kernels
echo "  Building DUSt3R CUDA kernels (optional)..."
cd submodules/dust3r/croco/models/curope/
TORCH_CUDA_ARCH_LIST="$TORCH_CUDA_ARCH_LIST" \
CUDA_HOME="$CUDA_HOME" \
python setup.py build_ext --inplace 2>/dev/null || echo "  ⚠ DUSt3R CUDA build failed (non-critical)"
cd ../../../../..

cd ..

# ─── 8. Install Backend Dependencies ────────────────────────────────────────
echo ""
echo "▶ Step 8: Installing backend dependencies..."
pip install -r requirements_backend.txt

# Install ffmpeg if not present
if ! command -v ffmpeg &> /dev/null; then
    echo "  Installing ffmpeg..."
    conda install -c conda-forge ffmpeg -y 2>/dev/null || \
    apt-get install -y ffmpeg 2>/dev/null || \
    echo "  ⚠ Could not install ffmpeg automatically"
fi

# ─── 9. Download Checkpoints ────────────────────────────────────────────────
echo ""
echo "▶ Step 9: Downloading model checkpoints..."
mkdir -p DroneSplat/checkpoints

# DUSt3R checkpoint
DUST3R_CKPT="DroneSplat/checkpoints/DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth"
if [ ! -f "$DUST3R_CKPT" ]; then
    echo "  Downloading DUSt3R checkpoint (3.5 GB)..."
    wget -q --show-progress \
        https://download.europe.naverlabs.com/ComputerVision/DUSt3R/DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth \
        -P DroneSplat/checkpoints/
else
    echo "  ✓ DUSt3R checkpoint exists"
fi

# SAM2 checkpoint
SAM2_CKPT="DroneSplat/checkpoints/sam2_hiera_large.pt"
if [ ! -f "$SAM2_CKPT" ]; then
    echo "  Downloading SAM2 checkpoint (900 MB)..."
    wget -q --show-progress \
        https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_large.pt \
        -P DroneSplat/checkpoints/
else
    echo "  ✓ SAM2 checkpoint exists"
fi

# ─── 10. Create Directories ─────────────────────────────────────────────────
echo ""
echo "▶ Step 10: Creating directories..."
mkdir -p uploads exports DroneSplat/data DroneSplat/output

# ─── 11. Generate .env ──────────────────────────────────────────────────────
echo ""
echo "▶ Step 11: Environment configuration..."
if [ ! -f .env ]; then
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "change-me-$(date +%s)")
    cat > .env << EOF
# 3rD Lens Pipeline Environment
JWT_SECRET=$JWT_SECRET
API_USERNAME=admin
API_PASSWORD=$(openssl rand -hex 16 2>/dev/null || echo "admin123")
CORS_ORIGINS=http://localhost:3000,https://your-app.vercel.app
EOF
    echo "  ✓ Created .env file"
else
    echo "  ✓ .env file exists"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║   Setup Complete! ✓                                  ║"
echo "╠═══════════════════════════════════════════════════════╣"
echo "║                                                       ║"
echo "║   Environment: $CURRENT_ENV (already activated)     ║"
echo "║   PyTorch: 2.5.0 with CUDA 12.1                     ║"
echo "║   System CUDA: $CUDA_VERSION (compatible)            ║"
echo "║                                                       ║"
echo "║   To start the server:                               ║"
echo "║     cd backend && python server.py                   ║"
echo "║                                                       ║"
echo "║   To test:                                           ║"
echo "║     curl http://localhost:8000/api/health             ║"
echo "║                                                       ║"
echo "╚═══════════════════════════════════════════════════════╝"
