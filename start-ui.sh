#!/usr/bin/env bash
set -e

# ==============================================================================
# G1DM — Next-Generation Production-Grade Internet Download Manager
# Universal UI & Core Engine Launcher (Linux / macOS)
# ==============================================================================

# Text formatting
BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${CYAN}${BOLD}"
echo "  ╔═══════════════════════════════════════════════════════════════════╗"
echo "  ║                                                                   ║"
echo "  ║     ⚡ G1DM — Next-Generation Internet Download Manager          ║"
echo "  ║        Universal Core Engine & High-Performance Web UI           ║"
echo "  ║                                                                   ║"
echo "  ╚═══════════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# Navigate to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Check Node.js and npm
echo -e "${BLUE}[1/4] Checking system prerequisites...${RESET}"
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}Error: Node.js is not installed or not in PATH.${RESET}"
    echo "Please install Node.js (v18 or newer) from https://nodejs.org"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}Error: npm is not installed or not in PATH.${RESET}"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js detected: ${NODE_VERSION}${RESET}"

# 2. Install dependencies if node_modules is missing
echo -e "\n${BLUE}[2/4] Verifying and installing dependencies...${RESET}"
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo -e "${YELLOW}node_modules missing. Running npm install...${RESET}"
    npm install
else
    echo -e "${GREEN}✓ Dependencies already installed.${RESET}"
fi

# 3. Build backend & frontend
echo -e "\n${BLUE}[3/4] Building G1DM backend & Next.js frontend...${RESET}"
if [ ! -d "dist/main" ] || [ ! -d "src/renderer/.next" ]; then
    npm run build
else
    # Build to ensure latest updates are compiled
    npm run build:backend
fi
echo -e "${GREEN}✓ Build verified.${RESET}"

# 4. Start G1DM Unified Server
PORT=${PORT:-8055}
echo -e "\n${BLUE}[4/4] Starting G1DM Core Service on port ${PORT}...${RESET}"
echo -e "${YELLOW}The service binds to 127.0.0.1 for local-only access.${RESET}"
echo -e "${GREEN}${BOLD}"
echo "  🚀 G1DM is ready to start."
echo "  🌐 Local Access:    http://127.0.0.1:${PORT}"
echo "  ⚡ API Endpoint:    http://127.0.0.1:${PORT}/api/v1"
echo "  📋 OpenAPI Docs:    http://127.0.0.1:${PORT}/api/v1/openapi.json"
echo -e "${RESET}"
echo -e "${YELLOW}Press Ctrl+C to stop the G1DM server.${RESET}\n"

exec env PORT="${PORT}" node dist/main/server.js
