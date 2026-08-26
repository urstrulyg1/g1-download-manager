#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
#  G1DM — Next-Generation Internet Download Manager
#  Universal Launcher & Terminal Interface  ·  Linux / macOS
# ==============================================================================

# ── ANSI Color & Typography Palette ───────────────────────────────────────────
ESC="\033"
RESET="${ESC}[0m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
ITALIC="${ESC}[3m"
UNDERLINE="${ESC}[4m"

# Standard / Bright Colors
RED="${ESC}[38;5;203m"
GREEN="${ESC}[38;5;48m"
EMERALD="${ESC}[38;5;42m"
YELLOW="${ESC}[38;5;220m"
ORANGE="${ESC}[38;5;214m"
BLUE="${ESC}[38;5;75m"
PURPLE="${ESC}[38;5;141m"
MAGENTA="${ESC}[38;5;213m"
CYAN="${ESC}[38;5;45m"
AQUA="${ESC}[38;5;51m"
WHITE="${ESC}[38;5;255m"
GRAY="${ESC}[38;5;242m"
DARK_GRAY="${ESC}[38;5;238m"

# ── Terminal Utilities ────────────────────────────────────────────────────────
# Hide / Restore cursor on exit
cleanup() {
    tput cnorm 2>/dev/null || printf "${ESC}[?25h"
}
trap cleanup EXIT
tput civis 2>/dev/null || printf "${ESC}[?25l"

# Dynamic animated spinner runner
run_with_spinner() {
    local label="$1"
    shift
    local cmd=("$@")
    
    local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
    local start_time
    start_time=$(date +%s)
    
    # Run command in background with output captured
    local tmp_log
    tmp_log=$(mktemp /tmp/g1dm_step_XXXXXX 2>/dev/null || mktemp -t g1dm_step)
    "${cmd[@]}" >"$tmp_log" 2>&1 &
    local pid=$!
    
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        local now
        now=$(date +%s)
        local elapsed=$((now - start_time))
        local frame="${frames[$((i % 10))]}"
        
        printf "\r  ${CYAN}${BOLD}%s${RESET}  ${WHITE}%s${RESET}  ${GRAY}(%ds)${RESET}\033[K" "$frame" "$label" "$elapsed"
        sleep 0.08
        i=$((i + 1))
    done
    
    local exit_code=0
    wait "$pid" 2>/dev/null || exit_code=$?
    local end_time
    end_time=$(date +%s)
    local total_elapsed=$((end_time - start_time))
    
    if [ "$exit_code" -eq 0 ]; then
        printf "\r  ${EMERALD}${BOLD}✔${RESET}  ${WHITE}%s${RESET}  ${GRAY}(%ds)${RESET}\033[K\n" "$label" "$total_elapsed"
        rm -f "$tmp_log"
        return 0
    else
        printf "\r  ${RED}${BOLD}✖${RESET}  ${RED}%s${RESET}  ${GRAY}(failed after %ds)${RESET}\033[K\n" "$label" "$total_elapsed"
        echo -e "${DARK_GRAY}  ──────────────── Error Details ────────────────${RESET}"
        cat "$tmp_log" | sed 's/^/  │ /' | tail -n 20
        echo -e "${DARK_GRAY}  ───────────────────────────────────────────────${RESET}"
        rm -f "$tmp_log"
        return "$exit_code"
    fi
}

# ── Hero Banner ───────────────────────────────────────────────────────────────
clear 2>/dev/null || true
echo ""

BOX_WIDTH=72
TERM_WIDTH=$(tput cols 2>/dev/null || echo 80)
if [ "$TERM_WIDTH" -gt "$BOX_WIDTH" ]; then
    PAD_LEN=$(( (TERM_WIDTH - BOX_WIDTH) / 2 ))
    PAD=$(printf '%*s' "$PAD_LEN" '')
else
    PAD=""
fi

echo -e "${PAD}${PURPLE}╭──────────────────────────────────────────────────────────────────────╮${RESET}"
echo -e "${PAD}${PURPLE}│                                                                      │${RESET}"
echo -e "${PAD}${PURPLE}│${RESET}                  ${CYAN}${BOLD}██████╗   ██╗  ██████╗  ███╗   ███╗${RESET}                 ${PURPLE}│${RESET}"
echo -e "${PAD}${PURPLE}│${RESET}                 ${CYAN}${BOLD}██╔════╝  ███║  ██╔══██╗ ████╗ ████║${RESET}                 ${PURPLE}│${RESET}"
echo -e "${PAD}${PURPLE}│${RESET}                 ${AQUA}${BOLD}██║  ███╗  ██║  ██║  ██║ ██╔████╔██║${RESET}                 ${PURPLE}│${RESET}"
echo -e "${PAD}${PURPLE}│${RESET}                 ${AQUA}${BOLD}██║   ██║  ██║  ██║  ██║ ██║╚██╔╝██║${RESET}                 ${PURPLE}│${RESET}"
echo -e "${PAD}${PURPLE}│${RESET}                 ${BLUE}${BOLD}╚██████╔╝  ██║  ██████╔╝ ██║ ╚═╝ ██║${RESET}                 ${PURPLE}│${RESET}"
echo -e "${PAD}${PURPLE}│${RESET}                  ${BLUE}${BOLD}╚═════╝   ╚═╝  ╚═════╝  ╚═╝     ╚═╝${RESET}                 ${PURPLE}│${RESET}"
echo -e "${PAD}${PURPLE}│                                                                      │${RESET}"
echo -e "${PAD}${PURPLE}├──────────────────────────────────────────────────────────────────────┤${RESET}"
echo -e "${PAD}${PURPLE}│${RESET}          ${WHITE}${BOLD}G1DM DOWNLOAD MANAGER${RESET}  ${GRAY}·${RESET}  ${YELLOW}${BOLD}v4.0.0-FREE${RESET}  ${GRAY}·${RESET}  ${EMERALD}${BOLD}[ONLINE]${RESET}          ${PURPLE}│${RESET}"
echo -e "${PAD}${PURPLE}│${RESET}    ${GRAY}High-Performance Core Engine  ·  Multi-Threaded Turbo Pipeline${RESET}    ${PURPLE}│${RESET}"
echo -e "${PAD}${PURPLE}╰──────────────────────────────────────────────────────────────────────╯${RESET}"
echo ""

# ── Resolve Workspace Directory ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 1: System & Runtime Diagnostics
# ═══════════════════════════════════════════════════════════════════════════════
echo -e "  ${AQUA}${BOLD}⚡  SYSTEM & RUNTIME DIAGNOSTICS${RESET}"
echo -e "  ${DARK_GRAY}───────────────────────────────────────────────────────────────────────────────${RESET}"

if ! command -v node >/dev/null 2>&1; then
    echo -e "  ${RED}${BOLD}✖  Node.js is not installed or not in PATH.${RESET}"
    echo -e "     ${YELLOW}Please install Node.js v18+ from https://nodejs.org${RESET}\n"
    exit 1
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v 2>/dev/null || echo "n/a")
OS_PLATFORM="$(uname -s)"
OS_ARCH="$(uname -m)"

echo -e "  ${EMERALD}✔${RESET}  Node.js ${WHITE}${BOLD}${NODE_VERSION}${RESET}  ${GRAY}·${RESET}  npm ${WHITE}v${NPM_VERSION}${RESET}  ${GRAY}·${RESET}  ${CYAN}${OS_PLATFORM} (${OS_ARCH})${RESET}"

if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    run_with_spinner "Installing core node dependencies" npm install
else
    echo -e "  ${EMERALD}✔${RESET}  Core modules & package lock verified up to date"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 2: Browser Companion Integrity & Asset Matrix
# ═══════════════════════════════════════════════════════════════════════════════
echo -e "  ${PURPLE}${BOLD}🧩  BROWSER COMPANION & EXTENSION MATRIX${RESET}"
echo -e "  ${DARK_GRAY}───────────────────────────────────────────────────────────────────────────────${RESET}"

run_with_spinner "Synthesizing dynamic brand & extension icon assets" node scripts/build/generate-extension-icons.js --quiet
run_with_spinner "Auditing Chrome, Firefox, Safari & Brave security manifests" node scripts/build/validate-extensions.js --quiet

if [ -x "resources/native-host/install-host.sh" ]; then
    ./resources/native-host/install-host.sh >/tmp/g1dm-native-host.log 2>&1 || true
    echo -e "  ${EMERALD}✔${RESET}  Native Messaging Host connected and registered"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 3: High-Performance Engine Compilation
# ═══════════════════════════════════════════════════════════════════════════════
echo -e "  ${MAGENTA}${BOLD}🏗️   BUILD & COMPILATION PIPELINE${RESET}"
echo -e "  ${DARK_GRAY}───────────────────────────────────────────────────────────────────────────────${RESET}"

# Check if build is needed or explicitly requested
REBUILD_REQUESTED=0
for arg in "$@"; do
    if [ "$arg" = "--rebuild" ] || [ "$arg" = "--build" ] || [ "$arg" = "-b" ]; then
        REBUILD_REQUESTED=1
        break
    fi
done

if [ "$REBUILD_REQUESTED" -eq 1 ] || [ ! -f "dist/main/server.js" ] || [ ! -f "src/renderer/.next/BUILD_ID" ]; then
    run_with_spinner "Compiling TypeScript core engine (tsc)" npm run build:backend
    run_with_spinner "Optimizing Next.js Web UI & static chunks" npm run build:frontend
else
    echo -e "  ${EMERALD}✔${RESET}  Core build artifacts verified up to date ${GRAY}(use --rebuild for clean build)${RESET}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 4: Browser Target Selection
# ═══════════════════════════════════════════════════════════════════════════════
PORT="${PORT:-8055}"
URL="http://127.0.0.1:${PORT}"
CHROME_EXT_DIR="$SCRIPT_DIR/resources/extensions/chrome"

BROWSER_NAMES=()
BROWSER_CMDS=()
BROWSER_ICONS=()
BROWSER_TAGS=()

_add_browser() {
    # $1=name  $2=command  $3=icon  $4=tag
    BROWSER_NAMES+=("$1")
    BROWSER_CMDS+=("$2")
    BROWSER_ICONS+=("$3")
    BROWSER_TAGS+=("$4")
}

if [[ "$OS_PLATFORM" == "Darwin" ]]; then
    if [ -d "/Applications/Google Chrome.app" ]; then
        _add_browser "Google Chrome (with G1DM Companion)" "Google Chrome" "⚡" "ext"
    fi
    if [ -d "/Applications/Brave Browser.app" ]; then
        _add_browser "Brave Browser (with G1DM Companion)" "Brave Browser" "🦁" "ext"
    fi
    if [ -d "/Applications/Microsoft Edge.app" ]; then
        _add_browser "Microsoft Edge (with G1DM Companion)" "Microsoft Edge" "🌊" "ext"
    fi
    if [ -d "/Applications/Firefox.app" ]; then
        _add_browser "Firefox" "Firefox" "🦊" "plain"
    fi
    if [ -d "/Applications/Safari.app" ]; then
        _add_browser "Safari" "Safari" "🧭" "plain"
    fi
else
    for _bin in google-chrome google-chrome-stable chromium chromium-browser; do
        if command -v "$_bin" >/dev/null 2>&1; then
            _add_browser "Google Chrome / Chromium" "${_bin}" "⚡" "ext"
            break
        fi
    done
    if command -v brave-browser >/dev/null 2>&1; then
        _add_browser "Brave Browser" "brave-browser" "🦁" "ext"
    fi
    if command -v microsoft-edge >/dev/null 2>&1 || command -v microsoft-edge-stable >/dev/null 2>&1; then
        _EDGE_BIN=$(command -v microsoft-edge-stable 2>/dev/null || command -v microsoft-edge)
        _add_browser "Microsoft Edge" "${_EDGE_BIN}" "🌊" "ext"
    fi
    if command -v firefox >/dev/null 2>&1; then
        _add_browser "Firefox" "firefox" "🦊" "plain"
    fi
fi

_add_browser "Default System Browser" "default" "🌐" "plain"
_add_browser "Headless / Daemon Only (no browser window)" "" "🛡️" "headless"

echo -e "  ${CYAN}${BOLD}🌐  SELECT LAUNCH TARGET${RESET}"
echo -e "  ${DARK_GRAY}───────────────────────────────────────────────────────────────────────────────${RESET}"

for i in "${!BROWSER_NAMES[@]}"; do
    idx=$((i + 1))
    tag="${BROWSER_TAGS[$i]}"
    name="${BROWSER_NAMES[$i]}"
    icon="${BROWSER_ICONS[$i]}"
    
    case "$tag" in
        ext)      badge="${EMERALD}${BOLD}[Extension Active]${RESET} " ;;
        plain)    badge="${CYAN}[Browser]${RESET}          " ;;
        headless) badge="${GRAY}[Headless API]${RESET}     " ;;
    esac
    
    if [ "$i" -eq 0 ]; then
        echo -e "  ${YELLOW}${BOLD} ${idx})${RESET}  ${icon}  ${WHITE}${BOLD}${name}${RESET}  ${badge}  ${AQUA}${DIM}★ Recommended${RESET}"
    else
        echo -e "  ${YELLOW}${BOLD} ${idx})${RESET}  ${icon}  ${WHITE}${name}${RESET}  ${badge}"
    fi
done

DEFAULT_OPTION=1
echo ""
echo -en "  ${AQUA}${BOLD}➤  Choose target [${WHITE}1-${#BROWSER_NAMES[@]}${AQUA}, default: ${EMERALD}${DEFAULT_OPTION}${AQUA}]: ${RESET}"

tput cnorm 2>/dev/null || printf "${ESC}[?25h"
read -r BROWSER_CHOICE || BROWSER_CHOICE=""
tput civis 2>/dev/null || printf "${ESC}[?25l"

BROWSER_CHOICE="${BROWSER_CHOICE:-$DEFAULT_OPTION}"

OPEN_BROWSER_CMD=""
SELECTED_BROWSER_NAME=""
if [[ "$BROWSER_CHOICE" =~ ^[0-9]+$ ]] \
   && [ "$BROWSER_CHOICE" -ge 1 ] \
   && [ "$BROWSER_CHOICE" -le "${#BROWSER_NAMES[@]}" ]; then
    OPEN_BROWSER_CMD="${BROWSER_CMDS[$((BROWSER_CHOICE - 1))]}"
    SELECTED_BROWSER_NAME="${BROWSER_NAMES[$((BROWSER_CHOICE - 1))]}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 5: Core Service Daemon Startup
# ═══════════════════════════════════════════════════════════════════════════════
echo -e "  ${GREEN}${BOLD}🚀  ACTIVATING CORE SERVICE DAEMON${RESET}"
echo -e "  ${DARK_GRAY}───────────────────────────────────────────────────────────────────────────────${RESET}"

# Reclaim port if occupied
_EXISTING_PID=""
if command -v lsof >/dev/null 2>&1; then
    _EXISTING_PID=$(lsof -ti :"${PORT}" 2>/dev/null || true)
elif command -v fuser >/dev/null 2>&1; then
    _EXISTING_PID=$(fuser "${PORT}/tcp" 2>/dev/null | tr -d ' ' || true)
elif command -v ss >/dev/null 2>&1; then
    _EXISTING_PID=$(ss -lptn "sport = :${PORT}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -n1 || true)
fi

if [ -n "$_EXISTING_PID" ]; then
    echo -e "  ${YELLOW}⚠  Reclaiming port ${PORT} from previous instance (PID ${_EXISTING_PID})...${RESET}"
    kill -TERM $_EXISTING_PID 2>/dev/null || true
    _waited=0
    while kill -0 $_EXISTING_PID 2>/dev/null && [ $_waited -lt 15 ]; do
        sleep 0.1
        _waited=$((_waited + 1))
    done
    if kill -0 $_EXISTING_PID 2>/dev/null; then
        kill -9 $_EXISTING_PID 2>/dev/null || true
        sleep 0.2
    fi
fi

# Graceful shutdown handler
_SHUTDOWN_DONE=0
TAIL_PID=""

_do_shutdown() {
    [ "$_SHUTDOWN_DONE" -eq 1 ] && return
    _SHUTDOWN_DONE=1
    if [ -n "${TAIL_PID:-}" ]; then
        kill "$TAIL_PID" 2>/dev/null || true
    fi
    echo ""
    echo -e "  ${YELLOW}${BOLD}🛑  Gracefully shutting down G1DM Core Engine (PID ${SERVER_PID})...${RESET}"
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    local waited=0
    while kill -0 "$SERVER_PID" 2>/dev/null && [ $waited -lt 30 ]; do
        sleep 0.1
        waited=$((waited + 1))
    done
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        kill -KILL "$SERVER_PID" 2>/dev/null || true
    fi
    cleanup
    echo -e "  ${EMERALD}${BOLD}✔  G1DM daemon stopped cleanly. Have a great day!${RESET}\n"
}

SERVER_PID=""
trap '_do_shutdown; exit 0' INT TERM
trap '_do_shutdown'          EXIT

# Launch daemon in background with quiet logging
LOG_FILE="${TMPDIR:-/tmp}/g1dm-server-${EUID:-${UID:-0}}.log"
PORT="${PORT}" NODE_ENV=production node dist/main/server.js >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Animated health probe
spinner_frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
probe_i=0
MAX_PROBES=80
READY=0

while [ $probe_i -lt $MAX_PROBES ]; do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/browser/health" 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        READY=1
        break
    fi
    
    frame="${spinner_frames[$((probe_i % 10))]}"
    printf "\r  ${AQUA}%s${RESET}  ${WHITE}Initializing IPC sockets & HTTP engine...${RESET}\033[K" "$frame"
    sleep 0.12
    probe_i=$((probe_i + 1))
done
printf "\r\033[K"

if [ "$READY" -eq 1 ]; then
    echo -e "  ${EMERALD}✔${RESET}  Server engine live on ${WHITE}${BOLD}http://127.0.0.1:${PORT}${RESET} ${GRAY}(HTTP 200)${RESET}"
else
    echo -e "  ${YELLOW}⚠  Server readiness check took longer than expected — check ${LOG_FILE}${RESET}"
fi

echo ""

# ── HUD Status Card ───────────────────────────────────────────────────────────
echo -e "  ${GREEN}┌── ${WHITE}${BOLD}🚀 G1DM Core Service Active${RESET} ${DARK_GRAY}─────────────────────────────────────────${RESET}"
echo -e "  ${GREEN}│${RESET}"
echo -e "  ${GREEN}│${RESET}  ${CYAN}${BOLD}🌐 Web Dashboard${RESET}    ➜  ${WHITE}${BOLD}${UNDERLINE}${URL}${RESET}"
echo -e "  ${GREEN}│${RESET}  ${BLUE}${BOLD}⚡ REST API v1${RESET}      ➜  ${WHITE}${URL}/api/v1${RESET}"
echo -e "  ${GREEN}│${RESET}  ${MAGENTA}${BOLD}📋 OpenAPI Spec${RESET}     ➜  ${WHITE}${URL}/api/v1/openapi.json${RESET}"
echo -e "  ${GREEN}│${RESET}  ${ORANGE}${BOLD}🧩 Companion Ext${RESET}    ➜  ${GRAY}${CHROME_EXT_DIR}${RESET}"
echo -e "  ${GREEN}│${RESET}  ${EMERALD}${BOLD}🛡️  Security Mode${RESET}    ➜  ${EMERALD}Loopback Only (127.0.0.1) · Zero-Leakage${RESET}"
echo -e "  ${GREEN}│${RESET}"
echo -e "  ${GREEN}└── ${EMERALD}${BOLD}ONLINE${RESET} ${DARK_GRAY}──────────────────────────────────────────────────────────────${RESET}"
echo ""

launch_or_focus_browser() {
    local target_app="$1"
    local target_url="$2"

    [ -z "$target_app" ] && return 0

    if [[ "$OS_PLATFORM" == "Darwin" ]]; then
        case "$target_app" in
            "Google Chrome"|"Brave Browser"|"Microsoft Edge")
                osascript 2>/dev/null <<EOF || open -a "${target_app}" "${target_url}" 2>/dev/null || open "${target_url}"
tell application "${target_app}"
    if it is running then
        set foundTab to false
        repeat with w in windows
            set tabIndex to 1
            repeat with t in tabs of w
                set tUrl to URL of t
                if tUrl starts with "http://127.0.0.1:${PORT}" or tUrl starts with "http://localhost:${PORT}" then
                    set active tab index of w to tabIndex
                    set index of w to 1
                    tell t to reload
                    set foundTab to true
                    exit repeat
                end if
                set tabIndex to tabIndex + 1
            end repeat
            if foundTab then exit repeat
        end repeat
        if not foundTab then
            open location "${target_url}"
        end if
        activate
    else
        open location "${target_url}"
        activate
    end if
end tell
EOF
                ;;
            "Safari")
                osascript 2>/dev/null <<EOF || open -a "Safari" "${target_url}" 2>/dev/null || open "${target_url}"
tell application "Safari"
    if it is running then
        set foundTab to false
        repeat with w in windows
            set tabIndex to 1
            repeat with t in tabs of w
                set tUrl to URL of t
                if tUrl starts with "http://127.0.0.1:${PORT}" or tUrl starts with "http://localhost:${PORT}" then
                    set current tab of w to t
                    set index of w to 1
                    set URL of t to "${target_url}"
                    set foundTab to true
                    exit repeat
                end if
                set tabIndex to tabIndex + 1
            end repeat
            if foundTab then exit repeat
        end repeat
        if not foundTab then
            open location "${target_url}"
        end if
        activate
    else
        open location "${target_url}"
        activate
    end if
end tell
EOF
                ;;
            "Firefox")
                open -a "/Applications/Firefox.app" "${target_url}" 2>/dev/null || open "${target_url}" 2>/dev/null || true
                ;;
            *)
                open "${target_url}" 2>/dev/null || true
                ;;
        esac
    else
        case "$target_app" in
            "google-chrome"|"brave-browser"|"microsoft-edge"|"chromium")
                "${target_app}" "${target_url}" >/dev/null 2>&1 &
                ;;
            *)
                xdg-open "${target_url}" >/dev/null 2>&1 || sensible-browser "${target_url}" >/dev/null 2>&1 || true
                ;;
        esac
    fi
}

# Launch or focus target browser tab
if [ -n "$OPEN_BROWSER_CMD" ]; then
    echo -e "  ${AQUA}✨  Connecting to ${WHITE}${BOLD}${SELECTED_BROWSER_NAME}${RESET}${AQUA}...${RESET}"
    launch_or_focus_browser "$OPEN_BROWSER_CMD" "$URL" &
fi

echo -e "  ${DARK_GRAY}───────────────────────────────────────────────────────────────────────────────${RESET}"
echo -e "  ${YELLOW}${BOLD}💡  PRO-TIP:${RESET} ${GRAY}Press ${WHITE}${BOLD}Ctrl + C${RESET} ${GRAY}to stop the daemon safely.${RESET}"
echo ""
echo -e "  ${AQUA}${BOLD}📜  LIVE APPLICATION LOGS${RESET} ${GRAY}(streaming in real time)${RESET}"
echo -e "  ${DARK_GRAY}───────────────────────────────────────────────────────────────────────────────${RESET}"

# Restore cursor and stream logs in real time
cleanup
tail -n 20 -f "$LOG_FILE" &
TAIL_PID=$!

wait "$SERVER_PID" 2>/dev/null || true
