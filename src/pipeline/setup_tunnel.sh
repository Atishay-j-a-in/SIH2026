#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Cloudflare Tunnel Setup for 3rD Lens Backend
#
# Exposes the FastAPI server (localhost:8000) to the internet
# so the Vercel frontend can connect.
# ═══════════════════════════════════════════════════════════════════════════

set -e

BACKEND_PORT=${1:-8000}

echo "╔═══════════════════════════════════════════════════════╗"
echo "║   Cloudflare Tunnel Setup                            ║"
echo "╚═══════════════════════════════════════════════════════╝"

# ─── Install cloudflared if not present ──────────────────────────────────────
if ! command -v cloudflared &> /dev/null; then
    echo ""
    echo "▶ Installing cloudflared..."
    
    # Detect architecture
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)  BINARY="cloudflared-linux-amd64" ;;
        aarch64) BINARY="cloudflared-linux-arm64" ;;
        *)       echo "❌ Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    
    wget -q --show-progress \
        "https://github.com/cloudflare/cloudflared/releases/latest/download/$BINARY" \
        -O /tmp/cloudflared
    chmod +x /tmp/cloudflared
    sudo mv /tmp/cloudflared /usr/local/bin/cloudflared || mv /tmp/cloudflared ~/cloudflared
    
    echo "  ✓ cloudflared installed"
fi

echo ""
echo "▶ Starting tunnel to localhost:${BACKEND_PORT}..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Copy the https:// URL below and set it as"
echo "  NEXT_PUBLIC_API_URL in your Vercel dashboard."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start tunnel
# The URL will be printed to stderr by cloudflared
cloudflared tunnel --url http://localhost:${BACKEND_PORT}
