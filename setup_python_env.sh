#!/usr/bin/env bash
# =============================================================================
# CrowdShield — Python Virtual Environment Setup
# Creates a venv inside ai_core/ and installs all required packages.
#
# Usage:
#   bash setup_python_env.sh
#
# After running, activate the venv:
#   source ai_core/venv/bin/activate        # Linux / macOS
#   ai_core\venv\Scripts\activate           # Windows (cmd)
# =============================================================================

set -euo pipefail

# --- Locate the repo root (parent of this script's directory) ----------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}"
VENV_DIR="${REPO_ROOT}/ai_core/venv"

echo "==> Repo root:       ${REPO_ROOT}"
echo "==> Virtual env dir: ${VENV_DIR}"

# --- Create the virtual environment ------------------------------------------
if [ ! -d "${VENV_DIR}" ]; then
    echo "==> Creating virtual environment..."
    python -m venv "${VENV_DIR}"
else
    echo "==> Virtual environment already exists, reusing it."
fi

# --- Activate the venv --------------------------------------------------------
# shellcheck disable=SC1091
# Resolve the correct activate script path for the current platform.
if [ -f "${VENV_DIR}/bin/activate" ]; then
    # shellcheck disable=SC1091
    source "${VENV_DIR}/bin/activate"
elif [ -f "${VENV_DIR}/Scripts/activate" ]; then
    # Windows (Git Bash / MSYS) style venv
    # shellcheck disable=SC1091
    source "${VENV_DIR}/Scripts/activate"
else
    echo "ERROR: Could not locate an activate script inside ${VENV_DIR}." >&2
    exit 1
fi

# --- Upgrade pip and install packages -----------------------------------------
echo "==> Upgrading pip..."
python -m pip install --upgrade pip

echo "==> Installing CrowdShield Python dependencies..."
python -m pip install \
    ultralytics \
    opencv-python \
    numpy \
    pandas \
    fastapi \
    uvicorn \
    python-socketio \
    supabase \
    google-generativeai \
    anthropic \
    faster-whisper \
    edge-tts \
    gTTS \
    requests \
    python-dotenv \
    websockets \
    pytest

echo ""
echo "==> Done! Virtual environment created at: ${VENV_DIR}"
echo "    Activate it with:"
echo "      source ai_core/venv/bin/activate   (Linux/macOS)"
echo "      ai_core\\venv\\Scripts\\activate      (Windows cmd)"
echo ""
echo "    Sanity check:"
echo "      python -c \"import ultralytics, cv2, fastapi; print('OK')\""
