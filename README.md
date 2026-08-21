# ⚡ G1DM — Next-Generation Internet Download Manager
### Commercial-Grade, Autonomous, Multi-Threaded Download Platform & Media Intelligence Engine

**G1DM** is a real, production-grade, next-generation Internet Download Manager built with TypeScript, Node.js, and React / Next.js. Engineered to surpass legacy paid tools like *Internet Download Manager (IDM)*, *Folx PRO*, and *Downie*, G1DM delivers a coordinated **Parallel Transfer Fabric**, **Dynamic Multi-Threaded Segmentation**, **Work-Stealing 2.0**, **Multi-Source Mirror Swarming**, **In-Browser Live Stream Preview**, **8K Floating Video Pill Sniffer**, **Pre-Download Zero-Day Threat Scanner**, **Network Interface Bonding**, **Live Stream Auto-DVR**, **Telegram Remote Control Bot**, **Encrypted Vault**, **Automated Archive Extraction with Passwords**, and an automated verification suite of **281 tests across 93 test suites (100% pass rate)**.

---

## 📑 Table of Contents

1. [🏆 Feature Matrix & Competitor Comparison](#-feature-matrix--competitor-comparison)
2. [✨ Master Feature Index & Deep Dive](#-master-feature-index--deep-dive)
   * [1. Parallel Transfer Engine & Core Protocols](#1-parallel-transfer-engine--core-protocols)
   * [2. Media, Video & Streaming Superpowers](#2-media-video--streaming-superpowers)
   * [3. Security, Privacy & Zero-Day Threat Defense](#3-security-privacy--zero-day-threat-defense)
   * [4. Speed, Protocols & Multipath Multipliers](#4-speed-protocols--multipath-multipliers)
   * [5. Cloud Storage, Debrid & File Host Resolvers](#5-cloud-storage-debrid--file-host-resolvers)
   * [6. Automation, Smart Rules & Archive Intelligence](#6-automation-smart-rules--archive-intelligence)
   * [7. Remote Control, Mobile Ecosystem & Webhooks](#7-remote-control-mobile-ecosystem--webhooks)
   * [8. Modern Glassmorphic UI & Developer Tools](#8-modern-glassmorphic-ui--developer-tools)
3. [💻 System Requirements](#-system-requirements)
4. [🚀 One-Click Quick Start Guide (Per OS)](#-one-click-quick-start-guide-per-os)
   * [macOS (Apple Silicon M1/M2/M3/M4 & Intel)](#1-macos-apple-silicon-m1m2m3m4--intel)
   * [Windows (10 / 11 64-bit & ARM64)](#2-windows-10--11-64-bit--arm64)
   * [Linux (Ubuntu, Debian, Fedora, Arch) & Headless Servers](#3-linux-ubuntu-debian-fedora-arch--headless-servers)
5. [🌐 Browser Companion Extensions Setup](#-browser-companion-extensions-setup)
   * [Google Chrome, Brave, and Chromium](#1-google-chrome-brave-and-chromium)
   * [Microsoft Edge](#2-microsoft-edge)
   * [Mozilla Firefox](#3-mozilla-firefox)
   * [Apple Safari (macOS)](#4-apple-safari-macos)
   * [Native Messaging Host IPC](#5-native-messaging-host-ipc)
6. [⌨️ Command-Line Interface (CLI) Guide](#-command-line-interface-cli-guide)
7. [📋 REST API & OpenAPI 3.0 Documentation](#-rest-api--openapi-30-documentation)
8. [🧪 Verification Suite & Test Coverage (281 Tests)](#-verification-suite--test-coverage-281-tests)
9. [🏛️ Architecture & Subsystems Flow](#-architecture--subsystems-flow)
10. [❓ Troubleshooting & FAQs](#-troubleshooting--faqs)
11. [❤️ Credits & License](#-credits--license)

---

## 🏆 Feature Matrix & Competitor Comparison

### 📊 Master Comparison Scorecard (Zero-Scroll Responsive Matrix)

| Feature | G1DM | IDM | NeatDM | FDM | JD2 | Folx | Downie | Motrix |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Work-Stealing Dynamic Segmentation** | ✅ | ⚠️ Basic | ⚠️ Static | ⚠️ Basic | ⚠️ Basic | ✅ | ❌ | ✅ |
| **8K / 4K In-Video Floating Pill** | ✅ | ⚠️ 1080p | ⚠️ 1080p | ❌ | ❌ | ❌ | ⚠️ App | ❌ |
| **Stream / Preview While Downloading** | ✅ | ❌ | ❌ | ⚠️ Torrent | ❌ | ❌ | ❌ | ❌ |
| **Pre-Download Zero-Day Threat Scanner**| ✅ | ❌ | ❌ | ⚠️ Post | ❌ | ❌ | ❌ | ❌ |
| **Multi-Source Mirror Swarming** | ✅ | ❌ | ❌ | ❌ | ⚠️ Basic | ❌ | ❌ | ⚠️ CLI |
| **Multi-Interface Channel Bonding** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Live Stream Sliding-Window DVR** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ Basic | ❌ |
| **BitTorrent & WebTorrent Engine** | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Cloud (GDrive/Dropbox) Resolvers** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ⚠️ Basic | ❌ |
| **Multi-Host Debrid Resolvers** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Auto-Archive Extraction & Passwords** | ✅ | ❌ | ❌ | ⚠️ ZIP | ✅ | ❌ | ❌ | ❌ |
| **Hardware AES-256 Encrypted Vault** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Telegram / Discord Remote Bot** | ✅ | ❌ | ❌ | ❌ | ⚠️ Web | ❌ | ❌ | ⚠️ Web |
| **Ping-Adaptive Zero-Lag Throttling** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Playlist & Channel Batch Grabber** | ✅ | ⚠️ Basic | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| **In-App Media Trimmer & Transcoder** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Multi-Track Audio & Subtitle Muxing**| ✅ | ❌ | ❌ | ❌ | ⚠️ Plugins| ❌ | ⚠️ Basic | ❌ |
| **Cross-Platform (macOS / Win / Linux)**| ✅ | ❌ Win only| ⚠️ Mac/Win| ✅ | ✅ Java | ❌ Mac only| ❌ Mac only| ✅ |
| **REST API & OpenAPI 3.0 Specs** | ✅ | ❌ | ❌ | ❌ | ⚠️ RPC | ❌ | ❌ | ⚠️ RPC |
| **Price / License** | **Free & MIT** | $24.95/yr | Free | Free | Free | $19.95 | $19.99 | Free |

---

### 🔍 Detailed Comparative Breakdown

#### 1. G1DM vs Commercial Paid Managers (IDM, Folx PRO, Downie 4)
* **Internet Download Manager (IDM - $24.95/yr)**: Limited to Windows only; lacks pre-download threat scanning, 8K floating sniffer with codec selection, video stream preview during download, mirror swarming, channel bonding, live stream DVR, and remote bot control.
* **Folx PRO ($19.95)**: macOS only; lacks in-video pill sniffer, zero-day threat scanner, mirror swarming, cloud link bypass resolvers, and encrypted hardware vault.
* **Downie 4 ($19.99)**: macOS only; focused purely on video grabbing without multi-threaded general file transfer acceleration, mirror swarming, channel bonding, or archive extraction.

#### 2. G1DM vs Popular Free Tools (NeatDM, FDM, JDownloader 2, Motrix)
* **Neat Download Manager (NeatDM)**: Lightweight but uses static segmentation without work-stealing, lacks video previewing while downloading, live stream DVR, cloud resolvers, and automated archive password unlocking.
* **Free Download Manager (FDM)**: Good general tool, but lacks floating in-video pill with codec matrix, pre-download threat scanner, mirror swarming, and hardware-encrypted vaults.
* **JDownloader 2**: Powerful link grabber but heavy Java runtime footprint; lacks in-video floating pill overlay, HTTP 206 live stream preview player, and multi-NIC network bonding.
* **Aria2 / Motrix**: Fast multi-threaded CLI/Electron frontend, but lacks in-video sniffer, pre-download security scanner, live stream DVR, and cloud link resolvers.

---

## ✨ Master Feature Index & Deep Dive

### 1. Parallel Transfer Engine & Core Protocols
* **Parallel Dynamic Segmentation (`DynamicSegmentScheduler.ts`)**: Automatically calculates optimal segment chunks based on file size, network bandwidth, and server capabilities.
* **Work-Stealing 2.0 (`ParallelTransferEngine.ts`)**: Idle or fast worker connections dynamically halve and steal remaining byte ranges from slower connections, eliminating tail-end bottlenecking.
* **HTTP/1.1, HTTP/2 & HTTP/3 (QUIC) Engine (`HttpDownloader.ts`, `Http2Downloader.ts`, `Http3Downloader.ts`)**: Multiplexed stream pipelining and UDP-based QUIC transfer acceleration with automatic `Alt-Svc` negotiation.
* **Multi-Connection FTP & FTPS (`FtpDownloader.ts`)**: High-speed multi-threaded FTP downloads with active/passive mode auto-selection and TLS encryption.
* **Multi-Source Mirror Swarming (`MultiMirrorSwarmEngine.ts`)**: Aggregates and downloads from multiple mirror host URLs concurrently for a single file, balancing chunks by RTT latency and multiplying throughput.
* **Atomic Segment Ledger (`SegmentLedger.ts`)**: Memory-mapped segment state ledger enforcing zero-gap, zero-overlap atomic file writes.
* **Zero-Lag Stall Detector (`StallDetector.ts`)**: Instantly detects $0\text{ KB/s}$ connection stalls and seamlessly reconnects sockets without losing downloaded bytes.
* **Server Policy Engine & AIMD Backoff (`ServerPolicyEngine.ts`)**: Intelligent additive-increase/multiplicative-decrease backoff for servers with rate limits (`429 Too Many Requests`, `503 Service Unavailable`).
* **High-Precision Monotonic Clock (`MonotonicClock.ts`)**: Microsecond-precision transfer timing immune to operating system clock drift or NTP adjustments.
* **Resume Safety Engine (`ResumeSafetyEngine.ts`)**: Verifies `ETag` and `Last-Modified` timestamps before resuming to prevent file corruption from upstream server file changes.
* **Completion Verifier (`CompletionVerifier.ts`)**: Multi-stage validation confirming total bytes, content hashes, and detecting fake HTML error responses masquerading as valid files.
* **Configurable Download Profiles (`DownloadProfiles.ts`)**: One-click operational profiles (`TURBO`, `LOW_MEMORY`, `BATTERY_SAVER`, `SILENT_BACKGROUND`, `HIGH_RESILIENCE`).

---

### 2. Media, Video & Streaming Superpowers
* **Universal In-Video Floating Download Pill (`content.js`)**:
  - Automatically mounts a glassmorphic download pill directly onto any `<video>` element across all web pages (YouTube, Vimeo, Twitter/X, streaming sites, MSE, Blob URLs, HLS, DASH).
  - Tracks video position during scrolling, resizing, and fullscreen transitions.
  - Dropdown includes complete resolution tiers: **8K (4320p FUHD)**, **4K (2160p UHD)**, **2K (1440p QHD)**, **1080p (Full HD)**, **720p (HD)**, **480p**, **360p**, and **240p**.
  - All container & codec combinations: `MKV (HEVC/H.265)`, `MKV (AV1)`, `MP4 (H.264)`, `MP4 (HEVC)`, `WebM (VP9/AV1)`, `MOV (ProRes/H.264)`.
  - Lossless audio extraction: `FLAC (24-bit/96kHz Lossless)`, `WAV (1411k PCM)`, `M4A (AAC 320k)`, `MP3 (320k)`, `OGG (OPUS 160k)`.
  - Real-time estimated file sizes calculated for every resolution and format combination.
* **In-Browser Live Stream Preview While Downloading (`StreamPreviewService.ts` & `MediaPreviewModal.tsx`)**:
  - Watch and seek through videos at 10%–20% progress via **HTTP 206 Partial Content** range requests directly from `.g1dm.part` random-access file descriptors.
  - Features playback speed adjustments (`0.75x`–`2.0x`), buffer status indicators, and fullscreen toggle.
* **Live Stream Auto-DVR (`LiveStreamDVR.ts`)**:
  - Capture live HLS and DASH broadcasts with automatic sliding-window `#EXT-X-MEDIA-SEQUENCE` capture, historical buffer rewind, and seamless chunk stitching into finalized `.mkv`/`.mp4` files.
* **Playlist & Channel Batch Grabber (`PlaylistBatchGrabber.ts`)**:
  - Recursively extracts and enqueues all videos from YouTube playlists, artist channels, or media albums with sequential index numbering (`01 - Title.mp4`).
* **Multi-Track Audio & Subtitle Downloader (`MultiTrackExtractor.ts`)**:
  - Extracts and muxes multiple audio languages (e.g. English + Spanish + Commentary) and subtitles (`.srt` / `.vtt`) into a single container.
* **In-App Media Trimmer & Transcoder (`MediaTranscoder.ts`)**:
  - Lossless timestamp trimming and container conversion (`.mkv` $\leftrightarrow$ `.mp4` $\leftrightarrow$ `.webm`) directly inside the application.
* **Metadata & Cover Art Auto-Tagger (`MetadataInjector.ts`)**:
  - Automatically fetches and embeds ID3 tags, artist names, album art, movie posters, and chapter markers into downloaded files.
* **Media Library & Stream Inspector (`MediaLibrary.ts` & `VideoInspector.ts`)**:
  - Inspect video codecs, color spaces (HDR/SDR), frame rates, bitrates, audio channels, and duration.
* **HLS & DASH Manifest Parsers (`HlsEngine.ts`, `DashEngine.ts`, `DashManifestParser.ts`)**:
  - Comprehensive multi-bitrate master playlist and multi-period MPD representation parser.

---

### 3. Security, Privacy & Zero-Day Threat Defense
* **Pre-Download Zero-Day Link Scanner (`MaliciousLinkScanner.ts`)**:
  - **Threat Vector Heuristics**: Analyzes target URLs *before* downloading starts for raw IP downloads on non-standard ports, high-risk malware TLDs (`.top`, `.work`, `.click`, `.cam`), ephemeral C2 tunnels (`ngrok.io`, `serveo.net`, `loca.lt`), and brand typosquatting (`paypal-verify`, `appleid-auth`).
  - **Disguised Executable Traps**: Detects double-extension tricks (`invoice.pdf.exe`, `photo.jpg.vbs`).
  - **MIME-Header Conflict Protection**: Compares server `Content-Type` headers against declared extensions to block executable payload spoofing.
  - **Safety Warning Banner (`AddDownloadModal.tsx`)**: Displays risk score, identified threat factors, and requires explicit user override before starting suspicious downloads.
* **Hardware-Encrypted Secure Vault (`EncryptedVault.ts`)**:
  - Password-protected container with AES-256-GCM authenticated encryption for confidential files, PIN-protected via the Power Features view.
* **URL Guard & SSRF Protection (`UrlGuard.ts`)**:
  - Blocks server-side requests to internal loopback, private RFC1918 subnets, and cloud metadata endpoints (`169.254.169.254`).
* **Path Guard & Directory Traversal Defense (`PathGuard.ts`)**:
  - Enforces canonical filesystem path isolation, preventing directory traversal attacks (`../../etc/passwd`) and stripping control characters.
* **TLS Policy Enforcement (`TlsPolicy.ts` & `TlsInspector.ts`)**:
  - Enforces modern TLS 1.2/1.3 cipher suites and validates SSL certificates with safe SNI handling for raw IP targets.
* **Secret Redaction Engine (`Redact.ts`)**:
  - Automatically masks passwords, API tokens, cookies, and sensitive query parameters from logs, error reports, and support bundles.
* **Hardware-Rooted Secret Store (`SecretStore.ts`)**:
  - Encrypts stored passwords and proxies using machine-derived cryptographic salts.
* **Security Audit & Privacy Center (`SecurityAudit.ts` & `PrivacyCenter.ts`)**:
  - Audit report scoring and full transparency over network telemetry.
* **Antivirus Scanner Integration (`SecurityScanner.ts`)**:
  - Automated scanning hooks for local ClamAV or custom third-party antivirus CLI engines.

---

### 4. Speed, Protocols & Multipath Multipliers
* **Multi-Interface Channel Bonding (`ChannelBonding.ts`)**:
  - Bonds multiple physical network adapters (e.g. Ethernet + Wi-Fi + 5G mobile hotspot) by dispatching parallel sockets across local IP interfaces simultaneously.
* **BitTorrent & Magnet Link Swarm (`TorrentEngine.ts`)**:
  - Full BitTorrent client with DHT, peer exchange (PEX), and torrent-to-HTTP web-seed aggregation.
* **Dynamic RTT Latency Sense (`LatencySense.ts`)**:
  - Senses local network gateway ping. Automatically throttles background download speed when gaming or in video calls, then restores 100% speed when idle.
* **IPv4 / IPv6 Multipath Dual-Stack Racing (`DualStackSelector.ts`)**:
  - Races IPv4 vs IPv6 RTT to route sockets through the lowest-latency connection path.
* **Network Quality Monitor (`NetworkQualityService.ts`)**:
  - Real-time RTT latency, jitter, packet loss scoring, and bandwidth budget calculator.
* **Network Path Diagnostics (`NetworkPathDiagnostics.ts`)**:
  - Discovers network hops, DNS resolution latency, and MTU packet size limits.
* **Universal Proxy Management (`ProxyConfig`)**:
  - HTTP, HTTPS, and SOCKS5 proxy support with authentication.

---

### 5. Cloud Storage, Debrid & File Host Resolvers
* **Direct Cloud Link Resolvers (`CloudLinkResolver.ts`)**:
  - Direct export link extraction and quota bypass for **Google Drive**, **Dropbox**, **GitHub Releases & Raw**, and **MediaFire**.
* **Multi-Host Debrid Resolvers (`DebridManager.ts`)**:
  - Native API support for Real-Debrid, AllDebrid, Premiumize, and Mega.nz for uncapped direct downloads.
* **Cloud & NAS Auto-Replication (`CloudSyncManager.ts`)**:
  - Automatically replicates completed downloads to SMB, NFS, WebDAV, AWS S3, or Nextcloud storage.
* **Watched Folder Drop-Box (`DropBoxWatcher.ts`)**:
  - Watches local directories for `.url` or `.torrent` files to auto-start downloads.
* **Browser Cookie Forwarding (`BrowserIntegrationService.ts`)**:
  - Forwards session cookies from companion extensions to download member-only, private, or authenticated video streams without manual login setup.

---

### 6. Automation, Smart Rules & Archive Intelligence
* **Smart Regex & File Routing Automator (`RuleEngine.ts` & `RuleSimulator.ts`)**:
  - Automatically routes completed downloads into custom folder hierarchies based on URL patterns, file size, MIME type, or date.
* **Automated Archive Extraction with Password Dictionary (`AutoExtractor.ts` & `ArchiveIntelligence.ts`)**:
  - Automatically unpacks `.zip`, `.rar`, `.7z`, and `.tar.gz` upon completion with built-in password dictionary matching and optional archive cleanup.
* **Post-Download Custom Scripts & Webhooks (`WebhookTrigger.ts`)**:
  - Triggers Discord, Telegram, or Slack webhooks and launches custom shell scripts on completion.
* **OS Power Governor (`PowerGovernor.ts`)**:
  - Puts the system to sleep, shuts down, or disconnects VPN once the queue finishes.
* **Automated Site Grabber (`SiteGrabber.ts`)**:
  - Crawls websites, extracts images/media/PDFs, and rewrites links for complete offline browsing.
* **Batch Link Extractor (`LinkBatchExtractor.ts`)**:
  - Extracts and filters multiple download links from raw text, HTML source, or clipboard content.
* **Priority Download Queues (`QueuesView.tsx` & `SyncQueueManager.ts`)**:
  - Organize downloads into customized queues with scheduled operating windows and concurrent limits.
* **Clipboard Watcher (`ClipboardToast.tsx`)**:
  - Automatically detects downloadable URLs copied to the clipboard and offers instant download toasts.

---

### 7. Remote Control, Mobile Ecosystem & Webhooks
* **Telegram & Discord Control Bot (`ControlBot.ts`)**:
  - Send `/download <url>`, `/status`, or `/pause` commands to your private bot from your smartphone; G1DM downloads files on your computer and notifies you when done.
* **Mobile Progressive Web App (PWA) (`manifest.json` & `sw.js`)**:
  - Mobile-responsive interface installable as a standalone app on iOS, iPadOS, and Android.
* **Compatibility & Self-Healing Center (`CompatibilityCenter.tsx`)**:
  - One-click diagnosis and self-repair for browser companion extensions and native messaging hosts.
* **Sanitized Support Bundle Generator (`SupportBundle.ts`)**:
  - Export one-click redacted diagnostic bundles for troubleshooting without exposing personal tokens.

---

### 8. Modern Glassmorphic UI & Developer Tools
* **Rich Glassmorphic Design System**:
  - Designed with Tailwind-free custom CSS, glassmorphic blur filters, micro-animations, and 3 tailored themes (**Dark**, **OLED Pure Black**, and **Light**).
* **Power Features Dashboard (`PowerFeaturesView.tsx`)**:
  - Dedicated interactive control hub for the Encrypted Vault, Live Stream DVR, Playlist Grabber, Telegram Bot, Debrid Accounts, and Channel Bonding.
* **Command Palette (`CommandPalette.tsx`)**:
  - Keyboard-first command palette (`Ctrl+K` / `Cmd+K` or `Ctrl+N` / `Cmd+N`) for instant navigation, searching, and setting adjustments.
* **Action Center Drawer (`ActionCenterDrawer.tsx`)**:
  - Quick-access drawer for system alerts, storage maintenance, and active errors (`Ctrl+Shift+D`).
* **Multilingual Internationalization (`i18n.ts`)**:
  - Native localization support for English, Spanish, French, German, Japanese, Chinese, and Hindi.
* **Full REST API & OpenAPI 3.0 Specs (`ApiV1.ts`)**:
  - Standardized REST API for third-party integrations (Sonarr, Radarr, Lidarr, home automation scripts).
* **CLI Executable (`g1dm`)**:
  - Command-line tool for terminal workflows and headless servers.
* **Footer Credits**:
  - Centered credits acknowledging creation with ❤️ by Jeevan.

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

## 🧪 Verification Suite & Test Coverage (281 Tests)

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

## 🏛️ Architecture & Subsystems Flow

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
