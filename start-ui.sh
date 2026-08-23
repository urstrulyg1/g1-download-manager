#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
#  G1DM — Next-Generation Internet Download Manager
#  Universal Launcher  ·  Linux / macOS
# ==============================================================================

# ── Color & formatting palette ────────────────────────────────────────────────
BOLD="\033[1m";  DIM="\033[2m";  RESET="\033[0m";  UNDERLINE="\033[4m"

RED="\033[31m";   GREEN="\033[32m";  YELLOW="\033[33m"
BLUE="\033[34m";  CYAN="\033[36m";   WHITE="\033[37m";  GRAY="\033[90m"

BRIGHT_RED="\033[91m";    BRIGHT_GREEN="\033[92m";   BRIGHT_YELLOW="\033[93m"
BRIGHT_BLUE="\033[94m";   BRIGHT_MAGENTA="\033[95m"; BRIGHT_CYAN="\033[96m"
BRIGHT_WHITE="\033[97m"

# ── Helper printers ───────────────────────────────────────────────────────────
print_step()  { echo -e "${BRIGHT_BLUE}${BOLD}┌── $1${RESET}"; }
print_ok()    { echo -e "${GREEN}│  ✔ $1${RESET}"; }
print_info()  { echo -e "${CYAN}│  • $1${RESET}"; }
print_warn()  { echo -e "${BRIGHT_YELLOW}│  ⚠  $1${RESET}"; }
print_error() { echo -e "${BRIGHT_RED}${BOLD}│  ✖ $1${RESET}"; }
print_done()  { echo -e "${BRIGHT_BLUE}└── Done.${RESET}\n"; }
print_fail()  { echo -e "${BRIGHT_RED}└── Aborted.${RESET}\n"; }
print_sep()   { echo -e "${GRAY}│${RESET}"; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BRIGHT_CYAN}${BOLD}  ╔═══════════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BRIGHT_CYAN}${BOLD}  ║                                                                       ║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║  ${BRIGHT_MAGENTA}██████╗  ██╗ ██████╗  ███╗   ███╗                                   ${BRIGHT_CYAN}║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║  ${BRIGHT_MAGENTA}██╔════╝ ███║ ██╔══██╗ ████╗ ████║  ${BRIGHT_WHITE}${BOLD}Next-Gen Internet Download Mgr  ${BRIGHT_CYAN}║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║  ${BRIGHT_MAGENTA}██║ ███╗  ██║ ██║  ██║ ██╔████╔██║  ${DIM}Universal Core Engine & Web UI  ${RESET}${BRIGHT_CYAN}${BOLD}║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║  ${BRIGHT_MAGENTA}██║  ██║  ██║ ██║  ██║ ██║╚██╔╝██║  ${BRIGHT_YELLOW}v2.0-PRO${BRIGHT_CYAN} · ${BRIGHT_GREEN}Production Ready     ${BRIGHT_CYAN}║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║  ${BRIGHT_MAGENTA}╚██████╔╝  ██║ ██████╔╝ ██║ ╚═╝ ██║  ${GRAY}High-Performance Core Engine    ${BRIGHT_CYAN}║${RESET}"
echo -e "  ${BRIGHT_CYAN}${BOLD}║   ${BRIGHT_MAGENTA}╚═════╝   ╚═╝ ╚═════╝  ╚═╝     ╚═╝                                  ${BRIGHT_CYAN}║${RESET}"
echo -e "${BRIGHT_CYAN}${BOLD}  ║                                                                       ║${RESET}"
echo -e "${BRIGHT_CYAN}${BOLD}  ╚═══════════════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Resolve script directory ──────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 1 — System Prerequisites
# ═══════════════════════════════════════════════════════════════════════════════
print_step "[1/5] System Prerequisites"

_require_cmd() {
    local cmd="$1" label="$2" hint="$3"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        print_error "$label is not installed or not in PATH."
        [ -n "$hint" ] && echo -e "${YELLOW}│       $hint${RESET}"
        print_fail; exit 1
    fi
}

_require_cmd node "Node.js" "Install Node.js v18+ from https://nodejs.org"
_require_cmd npm  "npm"     ""

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v 2>/dev/null || echo "n/a")

# Warn if Node.js is older than v18
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -lt 18 ]; then
    print_warn "Node.js ${NODE_VERSION} detected — v18 or newer is recommended."
else
    print_ok "Node.js ${BRIGHT_WHITE}${NODE_VERSION}${GREEN}  (npm ${BRIGHT_WHITE}v${NPM_VERSION}${GREEN})"
fi
print_done

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 2 — Dependencies
# ═══════════════════════════════════════════════════════════════════════════════
print_step "[2/5] Dependencies"
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    print_info "node_modules not found — running ${BRIGHT_WHITE}npm install${CYAN}..."
    if ! npm install; then
        print_error "npm install failed."; print_fail; exit 1
    fi
    print_ok "Dependencies installed."
else
    print_ok "node_modules present & up to date."
fi
print_done

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 3 — Browser Extension Integrity
# ═══════════════════════════════════════════════════════════════════════════════
print_step "[3/5] Browser Extension Integrity"

print_info "Generating icons & dynamic assets..."
if ! node scripts/build/generate-extension-icons.js 2>&1 | sed 's/^/│     /'; then
    print_error "Failed to generate extension icons."; print_fail; exit 1
fi

print_info "Validating manifest & sandbox permissions..."
if ! node scripts/build/validate-extensions.js 2>&1 | sed 's/^/│     /'; then
    print_error "Extension integrity check failed — inspect manifest before launching."
    print_fail; exit 1
fi

print_ok "Companion extension verified & ready."
print_done

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 4 — Build
# ═══════════════════════════════════════════════════════════════════════════════
print_step "[4/5] Build  (TypeScript backend + Next.js frontend)"
print_info "Compiling — this may take a moment on first run..."
if ! npm run build 2>&1 | grep -E "^(error|warn|✓|Route|  )" | sed 's/^/│     /'; then
    # grep exits 1 when no lines match; run build independently to capture real exit code
    npm run build
fi
print_ok "Build complete."
print_done

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 5 — Browser selection
# ═══════════════════════════════════════════════════════════════════════════════
PORT="${PORT:-8055}"
URL="http://127.0.0.1:${PORT}"
CHROME_EXT_DIR="$SCRIPT_DIR/resources/extensions/chrome"

BROWSER_NAMES=()
BROWSER_CMDS=()
BROWSER_TAGS=()   # "ext" | "plain" | "headless"

_add_browser() {
    # $1=name  $2=command  $3=tag
    BROWSER_NAMES+=("$1")
    BROWSER_CMDS+=("$2")
    BROWSER_TAGS+=("$3")
}

# ── Native-host silent setup ──────────────────────────────────────────────────
if [ -x "resources/native-host/install-host.sh" ]; then
    ./resources/native-host/install-host.sh >/tmp/g1dm-native-host.log 2>&1 || true
fi

# ── Detect browsers (macOS) ───────────────────────────────────────────────────
if [[ "$(uname -s)" == "Darwin" ]]; then
    if [ -d "/Applications/Google Chrome.app" ]; then
        _add_browser \
            "Google Chrome  +  G1DM Extension" \
            "'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --load-extension='${CHROME_EXT_DIR}'" \
            "ext"
    fi
    if [ -d "/Applications/Brave Browser.app" ]; then
        _add_browser \
            "Brave Browser  +  G1DM Extension" \
            "'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' --load-extension='${CHROME_EXT_DIR}'" \
            "ext"
    fi
    if [ -d "/Applications/Microsoft Edge.app" ]; then
        _add_browser \
            "Microsoft Edge  +  G1DM Extension" \
            "'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' --load-extension='${CHROME_EXT_DIR}'" \
            "ext"
    fi
    if [ -d "/Applications/Firefox.app" ]; then
        _add_browser "Firefox" "open -a '/Applications/Firefox.app'" "plain"
    fi
    if [ -d "/Applications/Safari.app" ]; then
        _add_browser "Safari" "open -a '/Applications/Safari.app'" "plain"
    fi

# ── Detect browsers (Linux) ───────────────────────────────────────────────────
else
    for _bin in google-chrome google-chrome-stable chromium chromium-browser; do
        if command -v "$_bin" >/dev/null 2>&1; then
            _add_browser \
                "Google Chrome / Chromium  +  G1DM Extension" \
                "${_bin} --load-extension='${CHROME_EXT_DIR}'" \
                "ext"
            break
        fi
    done
    if command -v brave-browser >/dev/null 2>&1; then
        _add_browser \
            "Brave Browser  +  G1DM Extension" \
            "brave-browser --load-extension='${CHROME_EXT_DIR}'" \
            "ext"
    fi
    if command -v microsoft-edge >/dev/null 2>&1 || command -v microsoft-edge-stable >/dev/null 2>&1; then
        _EDGE_BIN=$(command -v microsoft-edge-stable 2>/dev/null || command -v microsoft-edge)
        _add_browser \
            "Microsoft Edge  +  G1DM Extension" \
            "${_EDGE_BIN} --load-extension='${CHROME_EXT_DIR}'" \
            "ext"
    fi
    if command -v firefox >/dev/null 2>&1; then
        _add_browser "Firefox" "firefox" "plain"
    fi
fi

_add_browser "Default system browser" "open" "plain"
_add_browser "Headless / API-only mode (no browser)" "" "headless"

# ── Print browser menu ────────────────────────────────────────────────────────
echo -e "${BRIGHT_CYAN}${BOLD}  ┌─ Browser Selection ─────────────────────────────────────────────────┐${RESET}"
for i in "${!BROWSER_NAMES[@]}"; do
    idx=$((i + 1))
    tag="${BROWSER_TAGS[$i]}"
    name="${BROWSER_NAMES[$i]}"
    case "$tag" in
        ext)      badge="${BRIGHT_GREEN}${BOLD}[Extension]${RESET}" ;;
        plain)    badge="${CYAN}[Browser]${RESET}  " ;;
        headless) badge="${GRAY}[Headless]${RESET} " ;;
    esac
    echo -e "  ${BRIGHT_CYAN}${BOLD}║${RESET}  ${BRIGHT_YELLOW}${idx})${RESET}  ${badge}  ${BRIGHT_WHITE}${name}${RESET}"
done
echo -e "${BRIGHT_CYAN}${BOLD}  └─────────────────────────────────────────────────────────────────────┘${RESET}"

# Find the best default (first extension-capable browser, else last option)
DEFAULT_OPTION=${#BROWSER_NAMES[@]}
for i in "${!BROWSER_TAGS[@]}"; do
    if [ "${BROWSER_TAGS[$i]}" = "ext" ]; then
        DEFAULT_OPTION=$((i + 1)); break
    fi
done

echo ""
echo -en "${BRIGHT_YELLOW}${BOLD}  ➤  Choose an option [${BRIGHT_WHITE}${DEFAULT_OPTION}${BRIGHT_YELLOW}]: ${RESET}"
read -r BROWSER_CHOICE
BROWSER_CHOICE="${BROWSER_CHOICE:-$DEFAULT_OPTION}"

OPEN_BROWSER_CMD=""
SELECTED_BROWSER_NAME=""
if [[ "$BROWSER_CHOICE" =~ ^[0-9]+$ ]] \
   && [ "$BROWSER_CHOICE" -ge 1 ] \
   && [ "$BROWSER_CHOICE" -le "${#BROWSER_NAMES[@]}" ]; then
    OPEN_BROWSER_CMD="${BROWSER_CMDS[$((BROWSER_CHOICE - 1))]}"
    SELECTED_BROWSER_NAME="${BROWSER_NAMES[$((BROWSER_CHOICE - 1))]}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 5 — Start server
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
print_step "[5/5] Starting G1DM Core Service"
print_info "Binding to ${BRIGHT_WHITE}127.0.0.1:${PORT}${CYAN} (loopback only)..."

# ── Graceful shutdown ─────────────────────────────────────────────────────────
_SHUTDOWN_DONE=0
_do_shutdown() {
    [ "$_SHUTDOWN_DONE" -eq 1 ] && return
    _SHUTDOWN_DONE=1
    echo -e "\n${BRIGHT_YELLOW}${BOLD}  🛑  Shutting down G1DM (PID ${SERVER_PID})...${RESET}"
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    local waited=0
    while kill -0 "$SERVER_PID" 2>/dev/null && [ $waited -lt 50 ]; do
        sleep 0.1; waited=$((waited + 1))
    done
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        echo -e "${BRIGHT_YELLOW}  ⚠   Graceful timeout — force-killing...${RESET}"
        kill -KILL "$SERVER_PID" 2>/dev/null || true
    fi
    echo -e "${BRIGHT_GREEN}  ✔   G1DM stopped cleanly. Goodbye!${RESET}\n"
}
# ── Clean up any lingering process on the target port ────────────────────────
if command -v lsof >/dev/null 2>&1; then
    _EXISTING_PID=$(lsof -ti :"${PORT}" 2>/dev/null || true)
    if [ -n "$_EXISTING_PID" ]; then
        print_info "Reclaiming port ${PORT} (stopping existing process on port)..."
        kill -9 $_EXISTING_PID 2>/dev/null || true
        sleep 0.5
    fi
fi

# ── Launch server ─────────────────────────────────────────────────────────────
SERVER_PID=""
trap '_do_shutdown; exit 0' INT TERM
trap '_do_shutdown'          EXIT

PORT="${PORT}" NODE_ENV=production node dist/main/server.js &
SERVER_PID=$!

# ── Animated readiness probe ──────────────────────────────────────────────────
echo -en "${CYAN}│  • Waiting for server${RESET}"
SPINNER=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
MAX_RETRIES=60
RETRY_COUNT=0
READY=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "http://127.0.0.1:${PORT}/api/browser/health" 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        READY=1; break
    fi
    echo -en " ${BRIGHT_MAGENTA}${SPINNER[$((RETRY_COUNT % ${#SPINNER[@]}))]}${RESET}"
    sleep 0.15
    RETRY_COUNT=$((RETRY_COUNT + 1))
done
echo ""

if [ $READY -eq 1 ]; then
    print_ok "Server online  ${GRAY}(HTTP 200 on /api/browser/health)${RESET}"
else
    print_warn "Readiness timeout — proceeding anyway. Check logs if the UI does not load."
fi

echo -e "${BRIGHT_BLUE}└── Initialized.${RESET}"
echo ""

# ── Status dashboard ──────────────────────────────────────────────────────────
echo -e "${BRIGHT_GREEN}${BOLD}  ╔═══════════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BRIGHT_GREEN}${BOLD}  ║            🚀  G1DM CORE ENGINE & WEB UI  ·  ACTIVE                  ║${RESET}"
echo -e "${BRIGHT_GREEN}${BOLD}  ╠═══════════════════════════════════════════════════════════════════════╣${RESET}"
echo -e "${BRIGHT_GREEN}${BOLD}  ║${RESET}  ${BRIGHT_CYAN}${BOLD}🌐  Web Dashboard${RESET}   ${BRIGHT_WHITE}${UNDERLINE}${URL}${RESET}"
echo -e "${BRIGHT_GREEN}${BOLD}  ║${RESET}  ${BRIGHT_BLUE}${BOLD}⚡  REST API${RESET}        ${BRIGHT_WHITE}${URL}/api/v1${RESET}"
echo -e "${BRIGHT_GREEN}${BOLD}  ║${RESET}  ${BRIGHT_MAGENTA}${BOLD}📋  OpenAPI Docs${RESET}    ${BRIGHT_WHITE}${URL}/api/v1/openapi.json${RESET}"
echo -e "${BRIGHT_GREEN}${BOLD}  ║${RESET}  ${BRIGHT_YELLOW}${BOLD}🧩  Extension${RESET}       ${GRAY}${CHROME_EXT_DIR}${RESET}"
echo -e "${BRIGHT_GREEN}${BOLD}  ╚═══════════════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Launch browser ────────────────────────────────────────────────────────────
if [ -n "$OPEN_BROWSER_CMD" ]; then
    echo -e "${BRIGHT_CYAN}  ✨  Launching ${BRIGHT_WHITE}${BOLD}${SELECTED_BROWSER_NAME}${RESET}${BRIGHT_CYAN}...${RESET}"
    eval "$OPEN_BROWSER_CMD \"$URL\"" >/dev/null 2>&1 &
fi

echo -e "${GRAY}  ────────────────────────────────────────────────────────────────────────${RESET}"
echo -e "  ${BRIGHT_YELLOW}${BOLD}💡${RESET}  ${GRAY}Press ${BRIGHT_WHITE}Ctrl + C${GRAY} to stop the server gracefully.${RESET}"
echo ""

# ── Keep alive ────────────────────────────────────────────────────────────────
wait "$SERVER_PID" 2>/dev/null || true
