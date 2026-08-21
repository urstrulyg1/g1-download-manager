#!/usr/bin/env bash
set -e

# ==============================================================================
# G1DM — Next-Generation Production-Grade Internet Download Manager
# Universal UI & Core Engine Launcher (Linux / macOS)
# ==============================================================================

# ANSI Color & Formatting Palette
BOLD="\033[1m"
DIM="\033[2m"
ITALIC="\033[3m"
UNDERLINE="\033[4m"

# Standard & High-Intensity Foreground Colors
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
MAGENTA="\033[35m"
CYAN="\033[36m"
WHITE="\033[37m"
GRAY="\033[90m"

BRIGHT_RED="\033[91m"
BRIGHT_GREEN="\033[92m"
BRIGHT_YELLOW="\033[93m"
BRIGHT_BLUE="\033[94m"
BRIGHT_MAGENTA="\033[95m"
BRIGHT_CYAN="\033[96m"
BRIGHT_WHITE="\033[97m"

# Background Colors
BG_CYAN="\033[46m"
BG_BLUE="\033[44m"
BG_MAGENTA="\033[45m"
BG_DARK="\033[100m"

RESET="\033[0m"

# Clear terminal screen slightly or provide clean margin
echo ""

# Vibrant Banner
echo -e "${BRIGHT_CYAN}${BOLD}  ╔═════════════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BRIGHT_CYAN}${BOLD}  ║                                                                         ║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║   ${BRIGHT_MAGENTA}██████╗   ██╗ ██████╗  ███╗   ███╗                                    ${BRIGHT_CYAN}║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║  ${BRIGHT_MAGENTA}██╔════╝  ███║ ██╔══██╗ ████╗ ████║   ${BRIGHT_WHITE}${BOLD}Next-Gen Internet Download Mgr   ${BRIGHT_CYAN}║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║  ${BRIGHT_MAGENTA}██║  ███╗  ██║ ██║  ██║ ██╔████╔██║   ${DIM}Universal Core Engine & Web UI   ${RESET}${BRIGHT_CYAN}${BOLD}║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║  ${BRIGHT_MAGENTA}██║   ██║  ██║ ██║  ██║ ██║╚██╔╝██║   ${BRIGHT_YELLOW}v2.0-PRO${BRIGHT_CYAN} • ${BRIGHT_GREEN}Production Ready      ${BRIGHT_CYAN}║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║  ${BRIGHT_MAGENTA}╚██████╔╝  ██║ ██████╔╝ ██║ ╚═╝ ██║   ${GRAY}High-Performance Core Engine     ${BRIGHT_CYAN}║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║   ${BRIGHT_MAGENTA}╚═════╝   ╚═╝ ╚═════╝  ╚═╝     ╚═╝                                    ${BRIGHT_CYAN}║${RESET}"
echo -e "${BRIGHT_CYAN}${BOLD}  ║                                                                         ║${RESET}"
echo -e "${BRIGHT_CYAN}${BOLD}  ╚═════════════════════════════════════════════════════════════════════════╝${RESET}"

# Navigate to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Check Node.js and npm
echo -e "${BRIGHT_BLUE}${BOLD}┌── [1/5] Checking System Prerequisites${RESET}"
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}${BOLD}│  ✖ Error: Node.js is not installed or not in PATH.${RESET}"
    echo -e "${YELLOW}│  Please install Node.js (v18 or newer) from ${UNDERLINE}https://nodejs.org${RESET}"
    echo -e "${RED}└── Initialization aborted.${RESET}"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}${BOLD}│  ✖ Error: npm is not installed or not in PATH.${RESET}"
    echo -e "${RED}└── Initialization aborted.${RESET}"
    exit 1
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v 2>/dev/null || echo "detected")
echo -e "${GREEN}│  ✔ Node.js runtime: ${BRIGHT_WHITE}${NODE_VERSION}${GREEN} (npm: ${BRIGHT_WHITE}v${NPM_VERSION}${GREEN})${RESET}"
echo -e "${BRIGHT_BLUE}└── Done.${RESET}\n"

# 2. Install dependencies if node_modules is missing
echo -e "${BRIGHT_BLUE}${BOLD}┌── [2/5] Verifying Dependencies${RESET}"
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo -e "${YELLOW}│  ⚡ node_modules missing. Installing packages via npm...${RESET}"
    npm install
    echo -e "${GREEN}│  ✔ Dependencies installed successfully.${RESET}"
else
    echo -e "${GREEN}│  ✔ Dependencies already installed & verified.${RESET}"
fi
echo -e "${BRIGHT_BLUE}└── Done.${RESET}\n"

# 3. Generate & Validate Browser Extensions
echo -e "${BRIGHT_BLUE}${BOLD}┌── [3/5] Browser Companion Extension Integrity${RESET}"
echo -e "${CYAN}│  • Generating dynamic icons & assets...${RESET}"
if ! node scripts/build/generate-extension-icons.js; then
    echo -e "${RED}${BOLD}│  ✖ Fatal Error: Failed to generate companion extension icons.${RESET}"
    echo -e "${RED}└── Process failed.${RESET}"
    exit 1
fi

echo -e "${CYAN}│  • Validating extension manifest & sandboxing...${RESET}"
if ! node scripts/build/validate-extensions.js; then
    echo -e "${RED}${BOLD}│  ✖ Fatal Error: Browser extension integrity check failed!${RESET}"
    echo -e "${YELLOW}│  Please inspect manifest and companion assets before launching.${RESET}"
    echo -e "${RED}└── Process failed.${RESET}"
    exit 1
fi
echo -e "${GREEN}│  ✔ Browser companion extensions verified.${RESET}"
echo -e "${BRIGHT_BLUE}└── Done.${RESET}\n"

# 4. Build backend & frontend
echo -e "${BRIGHT_BLUE}${BOLD}┌── [4/5] Building G1DM Backend & Next.js Frontend${RESET}"
echo -e "${GRAY}│  Compiling TypeScript backend & bundling Next.js UI...${RESET}"
npm run build
echo -e "${GREEN}│  ✔ Build completed & verified.${RESET}"
echo -e "${BRIGHT_BLUE}└── Done.${RESET}\n"

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
        echo -e "${YELLOW}ℹ  Native host setup notice; details in /tmp/g1dm-native-host.log${RESET}"
    fi
fi

# Determine browser options
if [ -d "/Applications/Google Chrome.app" ]; then
    add_browser_option "Google Chrome (with G1DM Extension)" "open -a '/Applications/Google Chrome.app' --args --load-extension='$CHROME_EXT_DIR'"
elif [ -d "/Applications/Brave Browser.app" ]; then
    add_browser_option "Brave Browser (with G1DM Extension)" "open -a '/Applications/Brave Browser.app' --args --load-extension='$CHROME_EXT_DIR'"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    add_browser_option "Microsoft Edge (with G1DM Extension)" "open -a '/Applications/Microsoft Edge.app' --args --load-extension='$CHROME_EXT_DIR'"
fi

if [ -d "/Applications/Firefox.app" ]; then
    add_browser_option "Firefox" "open -a '/Applications/Firefox.app'"
fi

if [ -d "/Applications/Safari.app" ]; then
    add_browser_option "Safari" "open -a '/Applications/Safari.app'"
fi

add_browser_option "Default browser" "open"
add_browser_option "Do not open a browser (Headless / API mode)" ""

if [ ${#AUTO_CONFIGURED_BROWSERS[@]} -gt 0 ]; then
    echo -e "${BRIGHT_GREEN}⚡ Native Host Integrations:${RESET} ${CYAN}${AUTO_CONFIGURED_BROWSERS[*]}${RESET}"
fi
if [ ${#MANUAL_BROWSERS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Manual extension enablement needed for:${RESET} ${MANUAL_BROWSERS[*]}"
fi

echo -e "\n${BRIGHT_CYAN}${BOLD}🧭 Available Browsers & Launch Targets:${RESET}"
for i in "${!BROWSER_NAMES[@]}"; do
    echo -e "  ${BRIGHT_CYAN}$((i + 1))${RESET}) ${BRIGHT_WHITE}${BROWSER_NAMES[$i]}${RESET}"
done

DEFAULT_OPTION=1
for i in "${!BROWSER_NAMES[@]}"; do
    if [ "${BROWSER_NAMES[$i]}" = "Google Chrome (with G1DM Extension)" ] || [ "${BROWSER_NAMES[$i]}" = "Default browser" ]; then
        DEFAULT_OPTION=$((i + 1))
        break
    fi
done

echo ""
echo -en "${BRIGHT_YELLOW}${BOLD}➤ Choose a browser to open G1DM [${BRIGHT_WHITE}${DEFAULT_OPTION}${BRIGHT_YELLOW}]: ${RESET}"
read -r BROWSER_CHOICE
BROWSER_CHOICE="${BROWSER_CHOICE:-$DEFAULT_OPTION}"
if [[ "$BROWSER_CHOICE" =~ ^[0-9]+$ ]] && [ "$BROWSER_CHOICE" -ge 1 ] && [ "$BROWSER_CHOICE" -le ${#BROWSER_NAMES[@]} ]; then
    OPEN_BROWSER_CMD="${BROWSER_CMDS[$((BROWSER_CHOICE - 1))]}"
fi

# 5. Start G1DM Unified Server
PORT=${PORT:-8055}
echo -e "\n${BRIGHT_BLUE}${BOLD}┌── [5/5] Starting G1DM Core Service${RESET}"
echo -e "${CYAN}│  • Binding listener to ${BRIGHT_WHITE}127.0.0.1:${PORT}${CYAN} (Local Loopback)...${RESET}"

# Start G1DM server in background, in its own process group so kill -PGID works
PORT="${PORT}" NODE_ENV=production node dist/main/server.js &
SERVER_PID=$!

# Track whether we have already run the shutdown sequence so the EXIT trap
# (which fires after INT/TERM handlers return) doesn't double-print.
_SHUTDOWN_DONE=0

_do_shutdown() {
    # Guard against re-entry (EXIT fires after INT/TERM handlers return).
    [ "$_SHUTDOWN_DONE" -eq 1 ] && return
    _SHUTDOWN_DONE=1

    echo -e "\n${BRIGHT_YELLOW}🛑 Stopping G1DM Core Server (PID: ${SERVER_PID})...${RESET}"

    # Send SIGTERM first — lets the Node process flush the DB.
    kill -TERM "$SERVER_PID" 2>/dev/null || true

    # Give it up to 5 seconds to exit gracefully.
    local waited=0
    while kill -0 "$SERVER_PID" 2>/dev/null && [ $waited -lt 50 ]; do
        sleep 0.1
        waited=$((waited + 1))
    done

    # Force-kill if it's still alive after the grace period.
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        echo -e "${YELLOW}⚠  Force-killing unresponsive server...${RESET}"
        kill -KILL "$SERVER_PID" 2>/dev/null || true
    fi

    echo -e "${GREEN}✔ G1DM stopped. Goodbye!${RESET}"
}

trap '_do_shutdown; exit 0' INT TERM
trap '_do_shutdown'         EXIT

# Readiness Probe: wait until server is actively responding
echo -en "${CYAN}│  • Awaiting server readiness probe... ${RESET}"
MAX_RETRIES=50
RETRY_COUNT=0
READY=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/browser/health" 2>/dev/null || echo "")
    if [ "$HTTP_STATUS" = "200" ]; then
        READY=1
        break
    fi
    echo -en "${BRIGHT_MAGENTA}•${RESET}"
    sleep 0.15
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $READY -eq 1 ]; then
    echo -e " ${BRIGHT_GREEN}${BOLD}[ONLINE]${RESET}"
else
    echo -e " ${BRIGHT_YELLOW}[TIMEOUT - PROCEEDING]${RESET}"
fi
echo -e "${BRIGHT_BLUE}└── Initialized.${RESET}\n"

# Rich Dashboard Status Box
echo -e "${BRIGHT_GREEN}${BOLD}═══════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "  ${BRIGHT_GREEN}${BOLD}🚀 G1DM CORE ENGINE & HIGH-PERFORMANCE WEB UI IS ACTIVE${RESET}"
echo -e "${BRIGHT_GREEN}${BOLD}═══════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}🌐 Web Dashboard:${RESET}    ${BRIGHT_WHITE}${UNDERLINE}${URL}${RESET}"
echo -e "  ${BRIGHT_BLUE}${BOLD}⚡ REST API:${RESET}         ${BRIGHT_WHITE}${URL}/api/v1${RESET}"
echo -e "  ${BRIGHT_MAGENTA}${BOLD}📋 OpenAPI Docs:${RESET}     ${BRIGHT_WHITE}${URL}/api/v1/openapi.json${RESET}"
echo -e "  ${BRIGHT_YELLOW}${BOLD}🧩 Extension Dir:${RESET}    ${GRAY}${CHROME_EXT_DIR}${RESET}"
echo -e "${BRIGHT_GREEN}${BOLD}═══════════════════════════════════════════════════════════════════════════${RESET}"

if [ -n "$OPEN_BROWSER_CMD" ]; then
    SELECTED_NAME="${BROWSER_NAMES[$((BROWSER_CHOICE - 1))]}"
    echo -e "\n${BRIGHT_CYAN}✨ Launching ${BRIGHT_WHITE}${BOLD}${SELECTED_NAME}${RESET}${BRIGHT_CYAN} with G1DM...${RESET}"
    eval "$OPEN_BROWSER_CMD '$URL'" >/dev/null 2>&1 &
fi

echo -e "\n${BRIGHT_YELLOW}${BOLD}💡 Tip:${RESET} ${GRAY}Press ${BRIGHT_WHITE}Ctrl + C${GRAY} at any time to gracefully terminate the server.${RESET}\n"

# Wait for the server. When Ctrl+C (SIGINT) is pressed the shell delivers
# SIGINT to this script; the trap calls _do_shutdown which sends SIGTERM to
# the node child. wait then returns once the child exits.
wait "$SERVER_PID" 2>/dev/null || true
