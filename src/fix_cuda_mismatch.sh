#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Quick Fix: CUDA 13.0/12.1 Mismatch on Lightning AI Studio
# Run this if you got the "CUDA version mismatch" error
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "╔═══════════════════════════════════════════════════════╗"
echo "║   Fixing CUDA Mismatch Error                         ║"
echo "╚═══════════════════════════════════════════════════════╝"

# Activate existing environment
if ! command -v conda &> /dev/null; then
    for conda_loc in "$HOME/miniconda3" "$HOME/anaconda3" "/opt/conda" "$HOME/miniconda"; do
        if [ -f "$conda_loc/etc/profile.d/conda.sh" ]; then
            . "$conda_loc/etc/profile.d/conda.sh"
            break
        fi
    done
fi

eval "$(conda shell.bash hook)"
CURRENT_ENV=$(conda info --envs | grep '*' | awk '{print $1}')
echo "▶ Using environment: $CURRENT_ENV"
conda activate "$CURRENT_ENV"

# Set CUDA environment variables
export CUDA_HOME=${CUDA_HOME:-/usr/local/cuda}
export PATH="$CUDA_HOME/bin:$PATH"
export LD_LIBRARY_PATH="$CUDA_HOME/lib64:$LD_LIBRARY_PATH"
export TORCH_CUDA_ARCH_LIST="8.0;8.6;8.9;9.0"

echo ""
echo "▶ Step 1: Reinstalling PyTorch with CUDA 12.1..."
pip install --upgrade --force-reinstall torch==2.5.0 torchvision==0.20.0 torchaudio==2.5.0 \
    --index-url https://download.pytorch.org/whl/cu121

echo ""
echo "▶ Step 2: Installing ninja..."
pip install ninja

echo ""
echo "▶ Step 3: Building simple-knn with proper CUDA flags..."
cd DroneSplat/submodules/simple-knn
TORCH_CUDA_ARCH_LIST="$TORCH_CUDA_ARCH_LIST" \
CUDA_HOME="$CUDA_HOME" \
pip install --no-build-isolation --verbose .

echo ""
echo "▶ Step 4: Building diff-gaussian-rasterization..."
cd ../diff-gaussian-rasterization
TORCH_CUDA_ARCH_LIST="$TORCH_CUDA_ARCH_LIST" \
CUDA_HOME="$CUDA_HOME" \
pip install --no-build-isolation --verbose .

echo ""
echo "▶ Step 5: Installing SAM2..."
cd ../sam2
TORCH_CUDA_ARCH_LIST="$TORCH_CUDA_ARCH_LIST" \
CUDA_HOME="$CUDA_HOME" \
pip install --no-build-isolation -e .

cd ../../..

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║   Fix Complete! ✓                                    ║"
echo "╠═══════════════════════════════════════════════════════╣"
echo "║   Now you can start the server:                      ║"
echo "║     cd backend && python server.py                   ║"
echo "╚═══════════════════════════════════════════════════════╝"
