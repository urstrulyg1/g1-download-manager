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
echo -e "\n${BLUE}[2/5] Verifying dependencies...${RESET}"
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo -e "${YELLOW}node_modules missing. Running npm install...${RESET}"
    npm install
else
    echo -e "${GREEN}✓ Dependencies already installed.${RESET}"
fi

# 3. Generate & Validate Browser Extensions
echo -e "\n${BLUE}[3/5] Verifying and validating browser companion extensions...${RESET}"
if ! node scripts/build/generate-extension-icons.js; then
    echo -e "${RED}Fatal Error: Failed to generate companion extension icons.${RESET}"
    exit 1
fi

if ! node scripts/build/validate-extensions.js; then
    echo -e "${RED}Fatal Error: Browser extension integrity check failed! Fix the manifest/assets before starting.${RESET}"
    exit 1
fi

# 4. Build backend & frontend
echo -e "${BLUE}[4/5] Building G1DM backend & Next.js frontend...${RESET}"
if [ ! -d "dist/main" ] || [ ! -d "src/renderer/.next" ]; then
    npm run build
else
    # Build to ensure latest updates are compiled
    npm run build:backend
fi
echo -e "${GREEN}✓ Build verified.${RESET}"

URL="http://127.0.0.1:${PORT:-8055}"
CHROME_EXT_DIR="$SCRIPT_DIR/resources/extensions/chrome"
OPEN_BROWSER_CMD=""
BROWSER_NAMES=()
BROWSER_CMDS=()
AUTO_CONFIGURED_BROWSERS=()
MANUAL_BROWSERS=()

add_browser_option() {
    BROWSER_NAMES+=("$1")
    BROWSER_CMDS+=("$2")
}

add_auto_configured_browser() {
    AUTO_CONFIGURED_BROWSERS+=("$1")
}

add_manual_browser() {
    MANUAL_BROWSERS+=("$1")
}

# Verify and configure native host
if [ -x "resources/native-host/install-host.sh" ]; then
    if ./resources/native-host/install-host.sh >/tmp/g1dm-native-host.log 2>&1; then
        [ -d "/Applications/Google Chrome.app" ] && add_auto_configured_browser "Google Chrome"
        [ -d "/Applications/Brave Browser.app" ] && add_auto_configured_browser "Brave Browser"
        [ -d "/Applications/Firefox.app" ] && add_auto_configured_browser "Firefox"
        [ -d "/Applications/Microsoft Edge.app" ] && add_auto_configured_browser "Microsoft Edge"
    else
        echo -e "${YELLOW}Native host setup notice; details in /tmp/g1dm-native-host.log${RESET}"
    fi
fi

if command -v open >/dev/null 2>&1; then
    add_browser_option "Default browser" "open"
    [ -d "/Applications/Google Chrome.app" ] && add_browser_option "Google Chrome (with G1DM Extension)" "open -na 'Google Chrome' --args --load-extension='$CHROME_EXT_DIR'"
    [ -d "/Applications/Brave Browser.app" ] && add_browser_option "Brave Browser (with G1DM Extension)" "open -na 'Brave Browser' --args --load-extension='$CHROME_EXT_DIR'"
    [ -d "/Applications/Microsoft Edge.app" ] && add_browser_option "Microsoft Edge (with G1DM Extension)" "open -na 'Microsoft Edge' --args --load-extension='$CHROME_EXT_DIR'"
    [ -d "/Applications/Firefox.app" ] && add_browser_option "Firefox" "open -a 'Firefox'"
    [ -d "/Applications/Safari.app" ] && add_browser_option "Safari" "open -a 'Safari'"
    [ -d "/Applications/Safari.app" ] && add_manual_browser "Safari"
fi

if [ ${#AUTO_CONFIGURED_BROWSERS[@]} -gt 0 ]; then
    echo -e "${GREEN}Configured native-host integration for: ${AUTO_CONFIGURED_BROWSERS[*]}${RESET}"
fi
if [ ${#MANUAL_BROWSERS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Manual extension enablement still required for: ${MANUAL_BROWSERS[*]}${RESET}"
fi

if [ ${#BROWSER_NAMES[@]} -gt 0 ]; then
    echo -e "\n${BLUE}Detected browsers:${RESET}"
    for i in "${!BROWSER_NAMES[@]}"; do
        printf "  %d) %s\n" "$((i + 1))" "${BROWSER_NAMES[$i]}"
    done
    printf "  %d) Do not open a browser\n" "$(( ${#BROWSER_NAMES[@]} + 1 ))"
    printf "Choose a browser to open G1DM [%d]: " "$(( ${#BROWSER_NAMES[@]} + 1 ))"
    read -r BROWSER_CHOICE
    if [[ "$BROWSER_CHOICE" =~ ^[0-9]+$ ]] && [ "$BROWSER_CHOICE" -ge 1 ] && [ "$BROWSER_CHOICE" -le ${#BROWSER_NAMES[@]} ]; then
        OPEN_BROWSER_CMD="${BROWSER_CMDS[$((BROWSER_CHOICE - 1))]}"
    fi
fi

# 5. Start G1DM Unified Server
PORT=${PORT:-8055}
echo -e "\n${BLUE}[5/5] Starting G1DM Core Service on port ${PORT}...${RESET}"
echo -e "${YELLOW}The service binds to 127.0.0.1 for local-only access.${RESET}"
echo -e "${GREEN}${BOLD}"
echo "  🚀 G1DM is ready."
echo "  🌐 Local Access:    ${URL}"
echo "  ⚡ API Endpoint:    ${URL}/api/v1"
echo "  📋 OpenAPI Docs:    ${URL}/api/v1/openapi.json"
echo -e "${RESET}"
if [ -n "$OPEN_BROWSER_CMD" ]; then
    echo -e "${GREEN}Launching ${BROWSER_NAMES[$((BROWSER_CHOICE - 1))]} with G1DM...${RESET}"
    eval "$OPEN_BROWSER_CMD '$URL'" >/dev/null 2>&1 &
fi
echo -e "${YELLOW}Press Ctrl+C to stop the G1DM server.${RESET}\n"

exec env PORT="${PORT}" node dist/main/server.js
