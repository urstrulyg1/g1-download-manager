# ⚡ G1DM — Next-Generation Internet Download Manager
### Commercial-Grade, Autonomous, Multi-Threaded Download Platform & Media Intelligence Engine

**G1DM** is a production-grade, next-generation Internet Download Manager built with TypeScript, Node.js, and React / Next.js. Engineered to surpass legacy paid tools like *Internet Download Manager (IDM)*, *Folx PRO*, and *Downie*, G1DM delivers a coordinated **Parallel Transfer Fabric**, **Dynamic Multi-Threaded Segmentation**, **Work-Stealing 2.0**, **Multi-Source Mirror Swarming**, **In-Browser Live Stream Preview**, **8K Video Floating Pill Sniffer**, **Zero-Day Pre-Download Threat Scanner**, **Network Interface Bonding**, and an automated verification suite of **281 tests across 93 suites (100% pass rate)**.

---

## 📑 Table of Contents

1. [🏆 Feature Matrix & Competitor Comparison](#-feature-matrix--competitor-comparison)
2. [✨ Core Features & Key Advantages](#-core-features--key-advantages)
   * [1. Media & Streaming Superpowers](#1-media--streaming-superpowers)
   * [2. Speed, Protocols & Network Multipliers](#2-speed-protocols--network-multipliers)
   * [3. Security & Zero-Day Threat Intelligence](#3-security--zero-day-threat-intelligence)
   * [4. Cloud Storage & Debrid Resolvers](#4-cloud-storage--debrid-resolvers)
   * [5. Automation, Rules & Smart Workflows](#5-automation-rules--smart-workflows)
   * [6. Remote Control & Client Ecosystem](#6-remote-control--client-ecosystem)
3. [💻 System Requirements](#-system-requirements)
4. [🚀 One-Click Quick Start Guide (Per OS)](#-one-click-quick-start-guide-per-os)
   * [macOS (Apple Silicon & Intel)](#1-macos-apple-silicon-m1m2m3m4--intel)
   * [Windows (10 / 11)](#2-windows-10--11-64-bit--arm64)
   * [Linux (Ubuntu, Debian, Fedora, Arch) & Headless Servers](#3-linux-ubuntu-debian-fedora-arch--headless-servers)
5. [🌐 Browser Companion Extensions Setup](#-browser-companion-extensions-setup)
   * [Google Chrome, Brave, and Chromium](#1-google-chrome-brave-and-chromium)
   * [Microsoft Edge](#2-microsoft-edge)
   * [Mozilla Firefox](#3-mozilla-firefox)
   * [Apple Safari (macOS)](#4-apple-safari-macos)
   * [Native Messaging Host IPC](#5-native-messaging-host-ipc)
6. [⌨️ Command-Line Interface (CLI) Guide](#-command-line-interface-cli-guide)
7. [📋 REST API & OpenAPI 3.0 Documentation](#-rest-api--openapi-30-documentation)
8. [🧪 Verification Suite & Test Coverage](#-verification-suite--test-coverage)
9. [🏛️ Architecture & Subsystems](#-architecture--subsystems)
10. [❓ Troubleshooting & FAQs](#-troubleshooting--faqs)
11. [❤️ Credits & License](#-credits--license)

---

## 🏆 Feature Matrix & Competitor Comparison

| Capability / Feature | G1DM (Free & Open) | IDM ($24.95/yr) | Folx PRO ($19.95) | Downie ($19.99) | JDownloader 2 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Parallel Dynamic Segmentation** | ✅ **Yes (Work-Stealing 2.0)** | ✅ Yes (Basic) | ✅ Yes | ❌ No | ✅ Yes |
| **8K (4320p) & 4K Floating Video Pill** | ✅ **Yes (Full Codec Matrix)** | ⚠️ Basic 1080p | ❌ No | ⚠️ App Only | ❌ No |
| **Pre-Download Zero-Day Threat Scanner** | ✅ **Yes (Heuristic & MIME)** | ❌ No | ❌ No | ❌ No | ❌ No |
| **Play/Preview Media While Downloading** | ✅ **Yes (HTTP 206 Partial)** | ❌ No | ❌ No | ❌ No | ❌ No |
| **Multi-Source Mirror Swarming** | ✅ **Yes (RTT-Balanced)** | ❌ No (Single Host) | ❌ No | ❌ No | ⚠️ Basic |
| **Multi-Interface Channel Bonding** | ✅ **Yes (Ethernet+Wi-Fi+5G)** | ❌ No | ❌ No | ❌ No | ❌ No |
| **Live Stream Sliding-Window DVR** | ✅ **Yes (HLS/DASH Rewind)**| ❌ Fails on rollover | ❌ No | ⚠️ Basic | ❌ No |
| **Cloud Link & Debrid Resolvers** | ✅ **Yes (GDrive/Mega/Debrid)**| ❌ Needs 3rd party | ❌ No | ⚠️ Basic | ✅ Yes |
| **Auto-Archive Extraction & Passwords** | ✅ **Yes (Auto-Dictionary)** | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **Hardware-Encrypted AES-256 Vault** | ✅ **Yes (PIN/Key Rooted)** | ❌ Plaintext only | ❌ Plaintext | ❌ Plaintext | ❌ Plaintext |
| **Remote Telegram / Discord Bot** | ✅ **Yes (Direct Commands)** | ❌ No | ❌ No | ❌ No | ⚠️ MyJDownloader |
| **Automated Verification Test Suite** | ✅ **281 Tests / 93 Suites** | ❌ Closed Source | ❌ Closed | ❌ Closed | ❌ Untracked |

---

## ✨ Core Features & Key Advantages

### 1. Media & Streaming Superpowers
* **In-Video Floating Download Pill**:
  - Automatically mounts an ultra-sleek glassmorphic pill directly onto any `<video>` element on any website (YouTube, Vimeo, Twitter/X, streaming sites, MSE, Blobs, HLS, DASH).
  - Dynamic resolution selection: **8K (4320p FUHD)**, **4K (2160p UHD)**, **2K (1440p QHD)**, **1080p (Full HD)**, **720p (HD)**, **480p**, **360p**, and **240p**.
  - Comprehensive container & codec matrix: `MKV (HEVC / H.265)`, `MKV (AV1)`, `MP4 (H.264)`, `MP4 (HEVC)`, `WebM (VP9 / AV1)`, `MOV (ProRes/H.264)`.
  - Lossless audio extraction: `FLAC (24-bit/96kHz Lossless)`, `WAV (1411k PCM)`, `M4A (AAC 320k)`, `MP3 (320k)`, `OGG (OPUS 160k)`.
  - Real-time estimated file sizes for every resolution and format combination.
* **Instant In-Browser Video Preview While Downloading (`StreamPreviewService`)**:
  - Watch and seek through videos at 10%–20% progress via **HTTP 206 Partial Content** directly from partial disk descriptors (`.g1dm.part`) without waiting for 100% completion.
* **Live Stream Auto-DVR (`LiveStreamDVR`)**:
  - Capture live HLS and DASH broadcasts with automatic sliding-window buffer capture, historical rewind stitching, and zero packet loss.
* **Playlist & Channel Batch Grabber (`PlaylistBatchGrabber`)**:
  - Recursively extracts and enqueues all items from YouTube playlists, artist channels, or sound albums with sequential index numbering.
* **Multi-Track Audio & Subtitle Downloader (`MultiTrackExtractor`)**:
  - Extract and mux multiple language audio tracks and subtitles (`.srt` / `.vtt`) into a single container.
* **Lossless In-App Media Trimmer & Transcoder (`MediaTranscoder`)**:
  - Trim timestamps or convert video/audio formats directly inside G1DM.

---

### 2. Speed, Protocols & Network Multipliers
* **Parallel Dynamic Segmentation & Work-Stealing 2.0**:
  - Automatically splits files into non-overlapping byte ranges. Idle workers steal range halves from slower workers to maximize link throughput.
* **Multi-Source Mirror Swarming (`MultiMirrorSwarmEngine`)**:
  - Downloads from multiple mirror URLs simultaneously for a single file, distributing segments based on RTT latency and multiplying speeds when hosts rate-limit.
* **Multi-Interface Channel Bonding (`ChannelBonding`)**:
  - Combines multiple network adapters (e.g. Ethernet + Wi-Fi + 5G mobile hotspot) by dispatching parallel sockets across local IP interfaces simultaneously.
* **Dynamic RTT Latency Sense (`LatencySense`)**:
  - Monitors local network gateway ping. Automatically throttles downloads when user is gaming or in a video meeting, then restores 100% speed when idle.
* **IPv4 / IPv6 Multipath Dual-Stack Racing (`DualStackSelector`)**:
  - Races IPv4 vs IPv6 RTT to route sockets through the fastest connection path.
* **BitTorrent & WebTorrent Engine (`TorrentEngine`)**:
  - Native torrent and magnet link downloader with DHT, PEX, and hybrid HTTP web-seeding.

---

### 3. Security & Zero-Day Threat Intelligence
* **Pre-Download Zero-Day Link Scanner (`MaliciousLinkScanner`)**:
  - **Threat Vector Heuristics**: Analyzes target URLs *before* downloading starts for raw IP downloads on non-standard ports, high-risk malware TLDs (`.top`, `.work`, `.click`, `.cam`), ephemeral C2 tunnels (`ngrok.io`, `serveo.net`, `loca.lt`), and brand typosquatting (`paypal-verify`, `appleid-auth`).
  - **Disguised Executable Traps**: Detects double-extension tricks (`invoice.pdf.exe`, `photo.jpg.vbs`).
  - **MIME-Header Conflict Protection**: Compares server `Content-Type` headers against declared extensions to block executable payload spoofing.
  - **Safety Warning Banner**: Displays risk score, risk factors, and requires explicit user override before starting suspicious downloads.
* **Hardware-Encrypted Secure Vault (`EncryptedVault`)**:
  - Password-protected container with AES-256-GCM authenticated encryption for confidential files.
* **Automated Hash Verification (`ChecksumVerifier`)**:
  - Validates SHA-256, SHA-512, and MD5 checksums with automated byte-range repair.

---

### 4. Cloud Storage & Debrid Resolvers
* **Direct Cloud Link Resolvers (`CloudLinkResolver`)**:
  - One-click direct link extraction and quota bypass for **Google Drive**, **Dropbox**, **GitHub Releases & Raw**, and **MediaFire**.
* **Multi-Host Debrid Resolvers (`DebridManager`)**:
  - Native API support for Real-Debrid, AllDebrid, Premiumize, and Mega.nz.
* **Auto-Backup to NAS & Cloud (`CloudSyncManager`)**:
  - Automatically replicates completed downloads to SMB, NFS, WebDAV, AWS S3, or Nextcloud storage.

---

### 5. Automation, Rules & Smart Workflows
* **Smart Regex & File Routing Automator (`RuleEngine` & `RuleSimulator`)**:
  - Automatically routes completed downloads into custom folder hierarchies based on URL patterns, file size, MIME type, or date.
* **Automated Archive Extraction (`AutoExtractor`)**:
  - Unpacks `.zip`, `.rar`, `.7z`, and `.tar.gz` upon completion with built-in password dictionary matching.
* **Post-Download Custom Scripts & Webhooks (`WebhookTrigger`)**:
  - Triggers Discord, Telegram, or Slack webhooks and launches custom shell scripts on completion.
* **OS Power Governor (`PowerGovernor`)**:
  - Puts the system to sleep, shuts down, or disconnects VPN once the queue finishes.

---

### 6. Remote Control & Client Ecosystem
* **Telegram & Discord Control Bot (`ControlBot`)**:
  - Send `/download <url>` to your private bot from your smartphone; G1DM downloads it on your computer and notifies you when finished.
* **Mobile Progressive Web App (PWA)**:
  - Mobile-responsive dashboard accessible over local Wi-Fi or Tailscale.
* **Directory Drop Target (`DropBoxWatcher`)**:
  - Watches local folders for `.url` or `.torrent` files to auto-start downloads.

---

## 💻 System Requirements

| Component | Minimum Requirement | Recommended |
| :--- | :--- | :--- |
| **Operating System** | macOS 11+, Windows 10/11 (x64/ARM64), or Linux (Ubuntu, Debian, Fedora, Arch) | Latest Stable 64-bit / ARM64 |
| **Node.js** | Node.js v18.0.0 or higher | Node.js v20 LTS or v22 |
| **Package Manager** | npm v9.0.0 or higher | npm v10+ |
| **Memory (RAM)** | 512 MB available | 2 GB available |
| **Disk Space** | 200 MB for installation | Fast SSD for multi-gigabit downloads |

---

## 🚀 One-Click Quick Start Guide (Per OS)

G1DM includes automated bootstrap launchers that verify prerequisites, validate browser extensions, generate high-res icon assets, compile the backend & frontend, configure native messaging, and start the service.

### 1. macOS (Apple Silicon M1/M2/M3/M4 & Intel)

1. Open **Terminal** and navigate to the directory:
   ```bash
   cd ~/Desktop/Sovereign_Core/g1-download-manager
   ```
2. Make the launcher executable and run:
   ```bash
   chmod +x start-ui.sh
   ./start-ui.sh
   ```
3. The launcher will automatically prompt you to select your preferred browser (Google Chrome, Brave, Edge, Safari, Firefox) and launch with the G1DM Companion extension auto-loaded!

---

### 2. Windows 10 / 11 (64-bit & ARM64)

1. Open **Command Prompt** or **PowerShell** (or double-click `start-ui.bat` in File Explorer):
   ```cmd
   start-ui.bat
   ```
2. The launcher automatically validates extension packages, configures Windows Registry native-messaging keys, and launches Chrome/Edge with `--load-extension` enabled.

---

### 3. Linux (Ubuntu, Debian, Fedora, Arch) & Headless Servers

1. Make executable and run:
   ```bash
   chmod +x start-ui.sh
   ./start-ui.sh
   ```
2. **Headless Linux Server / Docker Mode**:
   ```bash
   PORT=8055 node dist/main/server.js
   ```
   Access the web dashboard remotely from any device on your LAN at `http://<server-ip>:8055`.

---

## 🌐 Browser Companion Extensions Setup

Companion packages for all major browsers are located in `resources/extensions/`.

### 1. Google Chrome, Brave, and Chromium
When launched via [`./start-ui.sh`](start-ui.sh) or [`start-ui.bat`](start-ui.bat), the browser can launch with the extension auto-loaded. To install permanently:
1. Navigate to `chrome://extensions/` (or `brave://extensions/`).
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the directory:
   ```text
   <path-to-g1dm>/resources/extensions/chrome
   ```

---

### 2. Microsoft Edge
1. Open Edge and navigate to `edge://extensions/`.
2. Enable **Developer mode** in the left sidebar.
3. Click **Load unpacked** and select:
   ```text
   <path-to-g1dm>/resources/extensions/chrome
   ```

---

### 3. Mozilla Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select:
   ```text
   <path-to-g1dm>/resources/extensions/firefox/manifest.json
   ```

---

### 4. Apple Safari (macOS)
1. Convert the Safari extension package using Xcode:
   ```bash
   xcrun safari-web-extension-converter resources/extensions/safari --app-name "G1DM Safari Companion"
   ```
2. Open the generated Xcode project and click **Run**.
3. Enable in Safari $\to$ Preferences $\to$ Extensions.

---

### 5. Native Messaging Host IPC
To enable instant bidirectional download capture:
* **macOS / Linux**: `./resources/native-host/install-host.sh`
* **Windows**: Right-click `resources\native-host\install-host.bat` $\to$ **Run as Administrator**.

---

## ⌨️ Command-Line Interface (CLI) Guide

```bash
# Display CLI Manual
npm run cli -- help

# Add and start a download
npm run cli -- add "https://example.com/file.zip" --name "my_archive.zip" --out "~/Downloads"

# List all downloads
npm run cli -- list

# JSON output for automation/scripts
npm run cli -- list --json

# Inspect detailed download telemetry & segment map
npm run cli -- inspect <download-id> --json

# Download Controls
npm run cli -- pause <download-id>
npm run cli -- resume <download-id>
npm run cli -- delete <download-id> --delete-file

# Run Diagnostics & Health Checks
npm run cli -- diag
npm run cli -- doctor

# Set Global Bandwidth Limit (KB/s, 0 = unlimited)
npm run cli -- speed-limit 2048
```

---

## 📋 REST API & OpenAPI 3.0 Documentation

Full OpenAPI 3.0 documentation is available at `http://127.0.0.1:8055/api/v1/openapi.json`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/openapi.json` | OpenAPI 3.0.3 specification JSON |
| `GET` | `/api/v1/downloads` | List all downloads with telemetry and segment states |
| `POST` | `/api/v1/downloads` | Enqueue a new download |
| `GET` | `/api/downloads/:id/stream` | **HTTP 206 Partial Content** live stream player endpoint |
| `GET` | `/api/downloads/:id/preview-status`| Inspect buffer readiness for in-app media preview |
| `POST` | `/api/cloud/resolve` | Extract direct stream URLs from Google Drive / Dropbox |
| `POST` | `/api/mirrors/swarm/probe` | Probe and rank multi-mirror host endpoints |
| `GET` | `/api/browser/health` | Inspect extension health and native host connection status |
| `GET` | `/api/network/quality` | Live RTT, jitter, and network quality score |
| `GET` | `/api/support-bundle` | Export sanitized diagnostic support package |

---

## 🧪 Verification Suite & Test Coverage

G1DM maintains an automated test suite of **281 tests across 93 test suites** with a 100% pass rate:

```bash
npm test
```

```text
PASS test/power_features.test.ts
PASS test/malicious_link_scanner.test.ts
PASS test/stream_preview.test.ts
PASS test/multi_mirror_swarm.test.ts
PASS test/cloud_resolver.test.ts
PASS test/encrypted_vault_hardening.test.ts
PASS test/auto_extractor_real.test.ts
PASS test/control_bot.test.ts
PASS test/power_governor.test.ts
PASS test/threat_intel.test.ts
PASS test/security_hardening.test.ts
...
Test Suites: 93 passed, 93 total
Tests:       281 passed, 281 total
Snapshots:   0 total
Time:        15.6 s
```

---

## 🏛️ Architecture & Subsystems

```text
                        G1DM Commercial Platform
                                   │
              ┌────────────────────┴────────────────────┐
              │          Autopilot Control Center       │
              │          Resource Governor & QoS        │
              │          Zero-Day Threat Scanner        │
              └────────────────────┬────────────────────┘
                                   │
                          Transfer Coordinator
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
     HTTP/1.1                    HTTP/2                     HTTP/3 (QUIC)
   Multi-Mirror               Multi-Stream                Alt-Svc / UDP
  Swarm Engine              Multiplexed Pipes           Channel Bonding
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
                          Transfer Worker Pool
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ↓                          ↓                          ↓
    Worker 1                   Worker 2                   Worker N
 (Work-Stealing)            (Work-Stealing)            (Work-Stealing)
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   ↓
                         Atomic Segment Ledger
                                   ↓
                      Parallel File Writer (Disk)
                                   ↓
                     Live In-Browser Stream Player
                      (HTTP 206 Partial Content)
                                   ↓
                          Completion Verifier
                                   ↓
                       Post-Download Automation
                     (Auto-Extract / Webhooks)
```

---

## ❓ Troubleshooting & FAQs

### Q1: The browser extension shows "Offline". How do I connect it?
Ensure the G1DM unified server is running ([`./start-ui.sh`](start-ui.sh) or [`start-ui.bat`](start-ui.bat) on port `8055`). The extension connects to `http://127.0.0.1:8055` by default. You can test connectivity in the extension popup or the Web UI's **Compatibility & Self-Healing Center**.

### Q2: How do I change the default download folder?
Navigate to **Settings $\to$ General $\to$ Default Download Folder**, or pass `--out <dir>` in the CLI.

### Q3: How do I preview videos while they are still downloading?
In the **Downloads View**, click the **▶ (Film Icon)** button on any active video/audio download. The in-app player will stream directly from the buffered chunks.

### Q4: Can G1DM download DRM-protected videos?
No. In accordance with strict security standards, G1DM **does not bypass DRM, encryption protections, paywalls, or access controls**. If a video is protected with Widevine, FairPlay, or PlayReady, G1DM truthfully reports `Protected Media — Download Unavailable`.

### Q5: How do I secure remote LAN or Tailscale access?
Configure an API key in **Settings $\to$ Security $\to$ Remote Access API Key** or set the environment variable:
```bash
G1DM_API_KEY=your-secret-token ./start-ui.sh
```
Once configured, non-loopback clients must supply `Authorization: Bearer <your-secret-token>`.

---

## ❤️ Credits & License

**Made with ❤️ by Jeevan**

G1DM is released under the **MIT License**.
