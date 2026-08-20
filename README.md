# G1DM — Next-Generation Internet Download Manager
### Commercial-Grade, Autonomous, Multi-Threaded Download Platform & Media Intelligence Engine

**G1DM** is a real, production-grade, next-generation Internet Download Manager built with TypeScript, Node.js, and React / Next.js. It features a coordinated **Parallel Transfer Fabric**, **Dynamic Segmentation**, **Work-Stealing**, **HTTP/3 / QUIC**, **Adaptive Concurrency**, **Live HLS / DASH Video Resolution Intelligence**, **Browser Self-Healing**, and an automated test suite of **206 tests across 82 suites**.

---

## 📑 Table of Contents

1. [System Requirements](#-system-requirements)
2. [One-Click Quick Start](#-one-click-quick-start)
   * [Linux & macOS](#1-linux--macos)
   * [Windows](#2-windows)
3. [Manual Installation & Setup](#-manual-installation--setup)
4. [Universal Browser Extensions Setup](#-universal-browser-extensions-setup)
   * [Google Chrome, Brave, and Chromium](#1-google-chrome-brave-and-chromium)
   * [Microsoft Edge](#2-microsoft-edge)
   * [Mozilla Firefox](#3-mozilla-firefox)
   * [Apple Safari](#4-apple-safari-macos)
   * [Registering Native Messaging Hosts](#5-registering-native-messaging-hosts-bidirectional-ipc)
5. [Command-Line Interface (CLI) Guide](#-command-line-interface-cli-guide)
6. [REST API & OpenAPI 3.0 Documentation](#-rest-api--openapi-30-documentation)
7. [Running the 206-Test Verification Suite](#-running-the-206-test-verification-suite)
8. [Architecture & Subsystems](#-architecture--subsystems)
9. [Troubleshooting & FAQs](#-troubleshooting--faqs)

---

## 💻 System Requirements

| Component | Minimum Requirement | Recommended |
| :--- | :--- | :--- |
| **Operating System** | Windows 10/11, macOS 11+, or Linux (Ubuntu, Debian, Fedora, Arch) | Latest Stable 64-bit / ARM64 |
| **Node.js** | Node.js v18.0.0 or higher | Node.js v20 LTS or v22 |
| **Package Manager** | npm v9.0.0 or higher | npm v10+ |
| **Memory (RAM)** | 512 MB available | 2 GB available |
| **Disk Space** | 200 MB for installation | SSD storage for high-speed downloads |

---

## ⚡ One-Click Quick Start

G1DM includes automated bootstrap scripts that verify prerequisites, install dependencies, compile the application, configure supported browser native-host integrations, prompt for a browser to open, and start the unified server.

### 1. Linux & macOS

Open your terminal and run:

```bash
chmod +x start-ui.sh
./start-ui.sh
```

### 2. Windows

Double-click `start-ui.bat` or run it from Command Prompt / PowerShell:

```cmd
start-ui.bat
```

When you launch either script, G1DM automatically:
* configures the available native-host integrations supported by the bundled installer scripts
* detects installed browsers and prompts you to choose which browser to open
* starts the local-only service on [http://127.0.0.1:8055](http://127.0.0.1:8055)

Once launched, access G1DM in your browser:
* 🌐 **Web UI Dashboard**: [http://127.0.0.1:8055](http://127.0.0.1:8055)
* ⚡ **REST API v1**: [http://127.0.0.1:8055/api/v1](http://127.0.0.1:8055/api/v1)
* 📋 **OpenAPI 3.0 JSON**: [http://127.0.0.1:8055/api/v1/openapi.json](http://127.0.0.1:8055/api/v1/openapi.json)

---

## 🛠️ Manual Installation & Setup

If you prefer building and running step-by-step:

### Step 1: Clone and Navigate to Directory
```bash
git clone https://github.com/urstrulyg1/g1-download-manager.git
cd g1-download-manager
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Build Backend and Frontend
```bash
# Compiles TypeScript backend (dist/main/) and Next.js frontend (src/renderer/.next)
npm run build
```

### Step 4: Start the G1DM Unified Server
```bash
PORT=8055 npm start
```
The server binds to `127.0.0.1:8055` by default when launched via [`./start-ui.sh`](start-ui.sh) or [`start-ui.bat`](start-ui.bat). For manual startup with [`npm start`](package.json:19), set the port explicitly, for example `PORT=8055 npm start`.

### Development Mode (with Hot Reloading)
```bash
npm run dev
```

---

## 🌐 Universal Browser Extensions Setup

G1DM includes companion extension packages for all major browsers located in the `resources/extensions/` directory.

The startup launchers ([`start-ui.sh`](start-ui.sh) and [`start-ui.bat`](start-ui.bat)) automatically run the bundled native-host installers for supported browsers before starting the service. This configures native messaging for supported local browsers, but it does **not** silently install every browser extension for you.

```text
resources/
├── extensions/
│   ├── chrome/               # Google Chrome, Microsoft Edge, Brave, Chromium (Manifest V3)
│   ├── firefox/              # Mozilla Firefox (WebExtensions V2/V3)
│   └── safari/               # Apple Safari Web Extension format
└── native-host/              # Native Messaging Host & Installer Scripts
```

---

### 1. Google Chrome, Brave, and Chromium

When launched via [`start-ui.sh`](start-ui.sh) or [`start-ui.bat`](start-ui.bat), native-host integration is configured automatically where supported by the bundled installer.

1. Open your browser and navigate to:
   * **Chrome**: `chrome://extensions/`
   * **Brave**: `brave://extensions/`
   * **Chromium**: `chrome://extensions/`
2. Toggle on **Developer mode** in the top-right corner.
3. Click the **Load unpacked** button in the top-left.
4. Select the directory:
   ```text
   <path-to-g1dm>/resources/extensions/chrome
   ```
5. The **G1DM Companion** extension is now active! Pin it to your toolbar.

---

### 2. Microsoft Edge

When launched via [`start-ui.bat`](start-ui.bat), native-host integration is configured automatically on Windows by the bundled installer.

1. Open Microsoft Edge and navigate to `edge://extensions/`.
2. Enable **Developer mode** in the left sidebar.
3. Click **Load unpacked** and select the directory:
   ```text
   <path-to-g1dm>/resources/extensions/chrome
   ```

---

### 3. Mozilla Firefox

When launched via [`start-ui.sh`](start-ui.sh) or [`start-ui.bat`](start-ui.bat), native-host integration is configured automatically where supported by the bundled installer.

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Navigate to `resources/extensions/firefox/` and select:
   ```text
   resources/extensions/firefox/manifest.json
   ```

---

### 4. Apple Safari (macOS)

Safari still requires manual packaging and enablement. The launcher can open Safari, but Safari extension packaging must still be completed manually.

1. Ensure Xcode and Command Line Tools are installed on your Mac.
2. Run the Apple Safari Web Extension Converter:
   ```bash
   xcrun safari-web-extension-converter resources/extensions/safari --app-name "G1DM Safari Companion"
   ```
3. Open the generated Xcode project, build and run with your developer certificate to activate in Safari Preferences $\to$ Extensions.

---

### 5. Registering Native Messaging Hosts (Bidirectional IPC)

If you use [`start-ui.sh`](start-ui.sh) or [`start-ui.bat`](start-ui.bat), this registration step is attempted automatically for the browsers supported by the installer scripts. Use the manual commands below only if you need to re-run or troubleshoot native-host setup.

To enable native messaging communication (instant download interception and link capture):

#### On Linux & macOS:
```bash
chmod +x resources/native-host/install-host.sh
./resources/native-host/install-host.sh
```

#### On Windows:
Right-click and select **Run as Administrator** on:
```cmd
resources\native-host\install-host.bat
```
*(This automatically writes the manifest path to the Windows Registry under `HKCU\Software\Google\Chrome\NativeMessagingHosts` and `Mozilla\NativeMessagingHosts`).*

---

## ⌨️ Command-Line Interface (CLI) Guide

G1DM includes a full-featured CLI executable (`g1dm`) for terminal automation and headless servers.

```bash
# Display help manual
npm run cli -- help

# Add and start a download
npm run cli -- add "https://example.com/file.zip" --name "my_archive.zip" --out "~/Downloads"

# List all downloads
npm run cli -- list

# Machine-readable JSON output (ideal for scripts and CI/CD)
npm run cli -- list --json

# Inspect detailed download telemetry & segment states
npm run cli -- inspect <download-id> --json

# Download Controls
npm run cli -- pause <download-id>
npm run cli -- resume <download-id>
npm run cli -- cancel <download-id>
npm run cli -- delete <download-id> --delete-file

# System & Engine Status
npm run cli -- status --json

# Run System Diagnostics
npm run cli -- diag

# Run Database & Storage Doctor
npm run cli -- doctor

# Set Global Bandwidth Limit (in KB/s, 0 = unlimited)
npm run cli -- speed-limit 2048
```

---

## 📋 REST API & OpenAPI 3.0 Documentation

G1DM provides a versioned REST API (`/api/v1`) with full OpenAPI 3.0 specifications.

### Core Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/openapi.json` | Complete OpenAPI 3.0.3 specification JSON |
| `GET` | `/api/v1/downloads` | List all managed downloads |
| `POST` | `/api/v1/downloads` | Enqueue a new download |
| `GET` | `/api/v1/downloads/:id` | Get download details, segment map, and telemetry |
| `POST` | `/api/v1/downloads/:id/pause` | Pause an active download |
| `POST` | `/api/v1/downloads/:id/resume` | Resume a paused download |
| `DELETE` | `/api/v1/downloads/:id` | Remove a download record (optional `?deleteFile=true`) |
| `POST` | `/api/media/secure-detect` | Inspect HTTPS video resources, HLS, DASH, and resolutions |
| `GET` | `/api/browser/health` | Inspect browser extension health and native host statuses |
| `POST` | `/api/browser/repair` | One-click self-repair for browser native messaging hosts |
| `GET` | `/api/network/quality` | Live RTT, jitter, and bandwidth budget report |
| `GET` | `/api/storage/pools` | Multi-drive storage pool capacity and throughput |
| `GET` | `/api/support-bundle` | Export sanitized diagnostic support bundle |

---

## 🧪 Running the 206-Test Verification Suite

G1DM maintains **206 automated unit, integration, adversarial, chaos, and property-based tests across 82 test suites** with a 100% pass rate.

To run the complete test suite:

```bash
npm test
```

### Test Coverage Highlights
* **`test/platform_service.test.ts`**: Cross-platform path resolution and capability detection.
* **`test/universal_browser_manager.test.ts`**: Browser detection and native messaging round-trip loopback tests.
* **`test/autonomous_planner.test.ts`**: Pre-computed execution plans and Plan vs. Actual variance analysis.
* **`test/segment_ledger.test.ts`**: Atomic claiming, Zero-Overlap, and Zero-Gap guarantees.
* **`test/parallel_writer.test.ts`**: Random-access offset writes and memory backpressure thresholds.
* **`test/completion_verifier.test.ts`**: Multi-stage validation, gap checks, and HTML error traps.
* **`test/stall_recovery.test.ts`**: $0\text{ KB/s}$ stall detection and transparent socket restart.
* **`test/resume_safety.test.ts`**: ETag and Last-Modified mutation checks.
* **`test/dash_parser.test.ts` & `test/hls_advanced.test.ts`**: DASH MPD and HLS master multi-bitrate parsing.
* **`test/security_audit.test.ts`**: Hardware-rooted vault and zero synthetic secret leakage.
* **`test/extreme_concurrency.test.ts`**: 50+ simultaneous downloads under performance budgets.

---

## 🏛️ Architecture & Subsystems

```text
                        G1DM Commercial Platform
                                   │
              ┌────────────────────┴────────────────────┐
              │          Autopilot Control Center       │
              │          Resource Governor & QoS        │
              └────────────────────┬────────────────────┘
                                   │
                         Transfer Coordinator
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
     HTTP/1.1                    HTTP/2                     HTTP/3 (QUIC)
     (Keep-Alive)             (Multiplexed)              (Alt-Svc / UDP)
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
                         Transfer Worker Pool
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ↓                          ↓                          ↓
    Worker 1                   Worker 2                   Worker N
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   ↓
                         Atomic Segment Ledger
                                   ↓
                      Parallel File Writer (Disk)
                                   ↓
                           Memory Backpressure
                                   ↓
                         Completion Verifier
                                   ↓
                          Atomic Finalization
```

1. **Parallel Transfer Fabric**: Workers download non-overlapping byte ranges simultaneously into preallocated files via random-access descriptors.
2. **Work-Stealing 2.0**: Idle workers steal uncompleted range halves from slower workers without dropping active sockets.
3. **Recovery Orchestrator**: Automatically handles server throttling (`429`/`503` AIMD backoff), network resets (`ECONNRESET` backoff with jitter), and low-disk space pauses.
4. **Hardware-Derived AES-256-GCM Vault**: Encrypts credentials with machine-derived salt keys, guaranteeing zero plaintext storage.
5. **Universal Media Intelligence**: Discovers real video resolutions ($2160\text{p} \dots 360\text{p}$), audio renditions, and WebVTT subtitles with zero fabrication.

---

## ❓ Troubleshooting & FAQs

### Q1: The browser extension shows "Offline". How do I connect it?
Make sure the G1DM unified server is running ([`./start-ui.sh`](start-ui.sh) or [`start-ui.bat`](start-ui.bat) on port `8055`). The extension connects to `http://127.0.0.1:8055` by default. You can test the connection in the extension popup or the Web UI's **Compatibility & Self-Healing Center**.

### Q2: How do I change the default download folder?
Navigate to **Settings $\to$ General $\to$ Default Download Folder**, or pass `--out <dir>` in the CLI.

### Q3: Port 8055 is already in use by another service. What should I do?
You can run G1DM on any custom port:
```bash
PORT=8080 ./start-ui.sh
```
On Windows, use `set PORT=8080 && start-ui.bat`.

### Q4: Can G1DM download DRM-protected videos?
No. In accordance with strict security standards, G1DM **does not bypass DRM, encryption protections, paywalls, or access controls**. If a video is protected with Widevine, FairPlay, or PlayReady, G1DM truthfully reports `Protected Media — Download Unavailable`.

---

## 📄 License

G1DM is released under the **MIT License**.
