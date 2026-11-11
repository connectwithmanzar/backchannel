#!/bin/bash
# Starts JobRadar by hand. If you ran "Install JobRadar.command", you don't need this: use the Dock icon.
cd "$(dirname "$0")"
if curl -s -o /dev/null http://localhost:8501; then
  echo "JobRadar is already running. Opening it..."
  open "http://localhost:8501"
  exit 0
fi
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv (one-time, handles Python for you)..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
echo "Starting JobRadar... your browser will open at http://localhost:8501"
echo "Keep this window open while you use it. Close it to stop."
uv run --python 3.12 --with-requirements requirements.txt streamlit run app.py --server.address 127.0.0.1 --server.headless false --browser.gatherUsageStats false
