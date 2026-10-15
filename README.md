<div align="center">

  <img src="static/logo.svg" alt="WhatsMyPC Logo" width="120" height="120" />

  # WhatsMyPC

  **A sleek, lightning-fast hardware telemetry & system intelligence dashboard for Windows built with Rust & WebView2.**

  <p align="center">
    <a href="#key-features">Key Features</a> •
    <a href="#quick-start--installation">Installation</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#building-from-source">Build from Source</a> •
    <a href="#keyboard-shortcuts">Shortcuts</a> •
    <a href="#license">License</a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Platform" />
    <img src="https://img.shields.io/badge/Language-Rust-orange?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" />
    <img src="https://img.shields.io/badge/GUI-Tao%20%2B%20Wry%20(WebView2)-FF5500?style=for-the-badge" alt="GUI" />
    <img src="https://img.shields.io/badge/Installer-MSI%20%2F%20WiX%20v7-green?style=for-the-badge&logo=windows-terminal&logoColor=white" alt="Installer" />
    <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
  </p>

</div>

---

## ⚡ Overview

**WhatsMyPC** is a lightweight, zero-bloat Windows desktop utility designed to give you a complete, granular view of your PC's hardware and telemetry in real time.

Unlike heavy Electron-based or web-wrapped tools, **WhatsMyPC** is compiled into a native **Rust binary** backed by Microsoft's hardware-accelerated **WebView2** engine. It launches instantly, uses minimal memory, and runs completely silent in the background with zero annoying command-prompt popups.

---

## 🌟 Key Features (v2.0)

### 🖥️ 1. Hardware & System Telemetry
- **Overview**: Animated health score, device identity (CPU, GPU, RAM, storage, Windows build), live CPU / memory / GPU / disk tiles with sparklines, network chart, drive space and top processes.
- **Processor**: Live load ring and 2-minute history chart with hover read-outs, per-core heat tiles, cache/socket specs and session peak.
- **Memory**: Usage ring, commit charge, installed modules per slot (including empty slots available for upgrade).
- **Graphics**: Every adapter with vendor, dedicated/integrated, VRAM, driver version and age, active display mode.
- **Storage**: Live read/write chart, active time, drive health, wear/temperature (when available) and volume usage.
- **Network**: Live throughput chart, session data totals, adapter details with one-click copy of IP / MAC / DNS, built-in speed test with history.
- **Battery**: Charge, status, wear-based health rating and capacity.

### 🛡️ 2. System Insight
- **Security score**: Defender, tamper protection, definitions age, firewall profiles, UAC, Secure Boot and BitLocker as a pass / review / at-risk checklist.
- **Windows Update**: Pending updates (security flagged) and recently installed KB patches.
- **Reliability**: 60-day timeline of app crashes, hangs, blue screens and unexpected shutdowns with filters.
- **Drivers, Installed apps, Startup, Devices**: Searchable, sortable tables with filters and CSV export.

### 🛠️ 3. Tools
- **Process manager**: Live, sortable, searchable; End task with a safety warning for Windows system processes.
- **Connections**: Listening ports and established connections per process, with "reachable from network" count.
- **Benchmark**: Multi-core CPU and disk read/write, with saved history and comparison to your best run.
- **Cleanup**: Temp and cache cleaner (always confirmed first) with freed-space history.
- **Alerts**: Configurable CPU / memory / drive space / temperature thresholds with sustained-duration rules.
- **Report & export**: Copy specs, or download a full HTML report or raw JSON.
- **Command palette (`Ctrl + K`)**: Jump to any page or run any action.
- **Gaming overlay**: Compact always-on-top HUD for CPU, GPU, RAM, disk, temperatures and network.
- **Personalisation**: Dark / Light / System theme, 7 accent colours, compact sidebar, refresh rate and °C / °F.
- **Fully offline**: No CDN or web fonts; icons are bundled inline.

---

## 🚀 Quick Start & Installation

### Option 1: Windows Installer (.msi) — *Recommended*
Download the latest `WhatsMyPC-v1.0.0.msi` from the [Releases](https://github.com/anuzdhk/WhatsMyPC/releases) page or locate it in the `WhatMyPC_Final` folder:
1. Double-click **`WhatsMyPC-v1.0.0.msi`**.
2. Follow the setup prompts.
3. Access **WhatsMyPC** directly from your Windows Start Menu or Desktop shortcut.

### Option 2: Portable Package
No installation needed! Download `WhatsMyPC-v1.0.0-Portable.zip`, unpack the archive anywhere, and run `WhatsMyPC.exe`.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | Open Quick Search & Command Palette |
| <kbd>Ctrl</kbd> + <kbd>C</kbd> | Copy Essential Specs to Clipboard |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Capture Screenshot of Dashboard |
| <kbd>Ctrl</kbd> + <kbd>O</kbd> | Toggle Floating Gaming Overlay |
| <kbd>Ctrl</kbd> + <kbd>B</kbd> | Toggle Compact Sidebar |
| <kbd>Esc</kbd> | Close Modals / Clear Search |

---

## 🏗️ Architecture

```mermaid
flowchart TD
    subgraph Frontend ["Modern Web UI (WebView2)"]
        UI[Dashboard / Single-Page UI]
        Icons["Flaticon UIcons (Rounded)"]
        Theme["Dark & Light Dynamic Themes"]
    end

    subgraph RustBackend ["Native Rust Core (whatsmypc)"]
        HTTP[Embedded Rouille HTTP Engine :47321]
        Sys[sysinfo Native Telemetry Engine]
        WinAPI[Windows API & Subprocess Orchestrator]
    end

    subgraph Subsystems ["Windows OS Layer"]
        WMI[WMI / CIM Hardware Sensors]
        Perf[Performance Counters & PowerShell Bridge]
        NVMe[SMART & Storage Controller]
    end

    UI <-->|JSON REST APIs| HTTP
    HTTP <--> Sys
    Sys <--> WinAPI
    WinAPI <-->|CREATE_NO_WINDOW Flag| Perf
    WinAPI <--> WMI
    WinAPI <--> NVMe
```

### Highlights:
- **No Console Popups**: Child processes and telemetry probes use Windows `CREATE_NO_WINDOW (0x08000000)` and `-WindowStyle Hidden` flags for completely silent background polling.
- **Native Window Host**: Powered by `tao` and `wry`, eliminating the multi-hundred megabyte overhead of Chromium browsers.
- **Offline Capable**: Bundled with all local assets, SVG icons, and styles.

---

## 🛠️ Building from Source

### Prerequisites
1. **Rust & Cargo** (1.75+ recommended):
   ```powershell
   winget install Rustlang.Rustup
   ```
2. **Microsoft Edge WebView2 Runtime** (installed by default on Windows 10/11).
3. **WiX Toolset v7** *(optional, only needed for building the `.msi`)*:
   ```powershell
   dotnet tool install --global wix
   ```

### Build Executable
```powershell
# Clone the repository
git clone https://github.com/anuzdhk/WhatsMyPC.git
cd WhatsMyPC/pcpedia_rust

# Build optimized release binary
cargo build --release
```
The compiled executable will be located at:
```
pcpedia_rust/target/release/whatsmypc.exe
```

### Build MSI Package
```powershell
cd WhatMyPC_Final
wix build "WhatsMyPC.wxs" -o "WhatsMyPC-v1.0.0.msi"
```

---

## 📋 Clipboard Specs Format Sample

When you click **Copy Specs** or press <kbd>Ctrl</kbd> + <kbd>C</kbd>, WhatsMyPC outputs a clean summary:

```text
==================================================
                 WhatsMyPC Specs
==================================================
CPU:     AMD Ryzen 7 5800H with Radeon Graphics (8 Cores, 16 Threads)
RAM:     16 GB DDR4 (3200 MHz)
OS:      Windows 11 Home Single Language (Build 26100.2894)
Storage: 512 GB NVMe SSD (280 GB Free)
GPU:     NVIDIA GeForce RTX 3060 Laptop GPU (6 GB VRAM)
==================================================
Generated by WhatsMyPC
```

---

## 🤝 Contributing

Contributions, feature requests, and bug reports are welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

<div align="center">
  <sub>Crafted with ❤️ and Rust for Windows.</sub>
</div>
