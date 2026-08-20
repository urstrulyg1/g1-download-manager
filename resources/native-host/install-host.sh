#!/usr/bin/env bash
set -e

# ==============================================================================
# G1DM Native Messaging Host Installer (Linux & macOS)
# Automatically registers native messaging manifests for Chrome, Firefox, Edge, Brave
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_JS="$DIR/g1dm-native-host.js"
chmod +x "$HOST_JS"

echo "Registering G1DM Native Messaging Host..."

# 1. Linux Manifest Locations
if [ "$(uname -s)" = "Linux" ]; then
    # Chrome
    CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    mkdir -p "$CHROME_DIR"
    sed "s|HOST_PATH|$HOST_JS|g" "$DIR/com.g1dm.native_host.json" > "$CHROME_DIR/com.g1dm.native_host.json"

    # Chromium / Brave
    BRAVE_DIR="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    mkdir -p "$BRAVE_DIR"
    sed "s|HOST_PATH|$HOST_JS|g" "$DIR/com.g1dm.native_host.json" > "$BRAVE_DIR/com.g1dm.native_host.json"

    # Firefox
    FIREFOX_DIR="$HOME/.mozilla/native-messaging-hosts"
    mkdir -p "$FIREFOX_DIR"
    sed "s|HOST_PATH|$HOST_JS|g" "$DIR/com.g1dm.native_host.firefox.json" > "$FIREFOX_DIR/com.g1dm.native_host.json"

    echo "✓ Registered manifests for Chrome, Brave, and Firefox on Linux."
fi

# 2. macOS Manifest Locations
if [ "$(uname -s)" = "Darwin" ]; then
    # Chrome
    CHROME_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    mkdir -p "$CHROME_DIR"
    sed "s|HOST_PATH|$HOST_JS|g" "$DIR/com.g1dm.native_host.json" > "$CHROME_DIR/com.g1dm.native_host.json"

    # Firefox
    FIREFOX_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
    mkdir -p "$FIREFOX_DIR"
    sed "s|HOST_PATH|$HOST_JS|g" "$DIR/com.g1dm.native_host.firefox.json" > "$FIREFOX_DIR/com.g1dm.native_host.json"

    echo "✓ Registered manifests for Chrome and Firefox on macOS."
fi

echo "G1DM Native Messaging Host setup complete."
