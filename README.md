# Steam Manifest Hub

**Steam Manifest Hub** is a versatile tool designed to generate and download Steam application manifests using an App ID. It integrates directly with the [ManifestHub Database](https://github.com/SteamAutoCracks/ManifestHub/) to retrieve data, primarily for use with tools like SteamTools.

This repository offers two ways to use the tool: a robust **Command Line Interface (CLI)** and a modern **Web Interface**.

## 🚀 Features

* **Dual CLI Support**:
* `.bat` script for native Windows execution.
* `.py` script for cross-platform support (Windows, macOS, Linux).


* **Web Interface**: A responsive HTML5/Tailwind CSS interface for easy access via a browser.
* **Automated Checks**: Instantly validates AppIDs against the ManifestHub database via the GitHub API.
* **Direct Downloads**: Generates direct download links for manifest files.

## 🛠️ Installation & Requirements

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/steam-manifest-hub.git
cd steam-manifest-hub

```

### 2. Python Requirements (For CLI)

If you intend to use the Python version of the tool, you will need to install the `requests` library:

```bash
pip install requests

```

*Note: The script uses standard libraries (`os`, `sys`, `re`, `time`) alongside `requests`.*

## 📖 Usage

### Option 1: CLI Edition (Windows Batch)

Simply double-click the `Steam Manifest Hub - CLI Edition.bat` file.

1. Launch the script.
2. Read and accept the disclaimer by pressing `Y`.
3. Enter your desired Steam AppID when prompted.

### Option 2: CLI Edition (Python)

Run the Python script from your terminal:

```bash
python "Steam Manifest Hub - CLI Edition.py"

```

1. The script will clear the screen and present the disclaimer.
2. Accept the disclaimer to proceed.
3. Enter a numeric AppID to search the database.

### Option 3: Web Interface

Open `index.html` in any modern web browser.

1. Click "I Understand & Accept The Risks" on the disclaimer modal.
2. Enter the AppID in the input field.
3. Click **CHECK MANIFEST** to search.
4. If found, a download button will appear.

## ⚠️ Disclaimer

**Please Read Carefully:**
This script and website are for **informational purposes only**. The authors are not responsible for any consequences that may arise from using the provided data.

* This project is **not affiliated** with Valve, Steam, or any other Valve products.
* All manifests are downloaded from the ManifestHub Database; please show them support on GitHub.

## 📄 License

This project is licensed under the **Apache License 2.0**.
See the [LICENSE](https://www.google.com/search?q=LICENSE) file for details.

> "License" shall mean the terms and conditions for use, reproduction, and distribution as defined by Sections 1 through 9 of this document.

## 👥 Credits

* **CLI Edition**: © 2026 SSMG4
* **Web Edition**: Made by TrioNine
* **Data Source**: [SteamAutoCracks/ManifestHub](https://github.com/SteamAutoCracks/ManifestHub/)
