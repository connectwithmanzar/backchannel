#!/bin/bash
# One-time setup: JobRadar app in your Dock, always-on in the background, and a daily 8:00 auto-run.
# Run it again any time to update. To remove everything, run "Uninstall JobRadar.command".
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$HOME/JobRadar"            # macOS blocks background apps from Downloads/Desktop/Documents, so JobRadar lives here
AGENTS="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"
export PATH="$HOME/.local/bin:$PATH"

echo "1/5  Checking uv (handles Python for you)..."
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
UV="$(command -v uv)"

echo "2/5  Copying JobRadar to $HOME_DIR (your search history comes along)..."
mkdir -p "$HOME_DIR/data"
if [ "$SRC" != "$HOME_DIR" ]; then
  cp -f "$SRC"/*.py "$SRC"/requirements.txt "$SRC"/README.md "$HOME_DIR"/
  cp -f "$SRC"/*.command "$HOME_DIR"/ 2>/dev/null || true
  for f in "$SRC"/data/*; do [ -e "$f" ] && [ ! -e "$HOME_DIR/data/$(basename "$f")" ] && cp "$f" "$HOME_DIR/data/"; done
fi
cd "$HOME_DIR"
"$UV" run --python 3.12 --with-requirements requirements.txt python -c "import jobspy, streamlit" >/dev/null

echo "3/5  Stopping any JobRadar already running..."
launchctl bootout "gui/$UID_NUM/com.jobradar.app" 2>/dev/null || true
launchctl bootout "gui/$UID_NUM/com.jobradar.daily" 2>/dev/null || true
pkill -f "streamlit run app.py" 2>/dev/null || true
sleep 2

echo "4/5  Setting up background running and the daily 8:00 run..."
mkdir -p "$AGENTS"
cat > "$AGENTS/com.jobradar.app.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.jobradar.app</string>
  <key>WorkingDirectory</key><string>$HOME_DIR</string>
  <key>ProgramArguments</key><array>
    <string>$UV</string><string>run</string><string>--python</string><string>3.12</string>
    <string>--with-requirements</string><string>requirements.txt</string>
    <string>streamlit</string><string>run</string><string>app.py</string>
    <string>--server.headless</string><string>true</string><string>--server.port</string><string>8501</string>
    <string>--server.address</string><string>127.0.0.1</string>
    <string>--browser.gatherUsageStats</string><string>false</string>
  </array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$HOME_DIR/data/app.log</string>
  <key>StandardErrorPath</key><string>$HOME_DIR/data/app.log</string>
</dict></plist>
EOF
cat > "$AGENTS/com.jobradar.daily.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.jobradar.daily</string>
  <key>WorkingDirectory</key><string>$HOME_DIR</string>
  <key>ProgramArguments</key><array>
    <string>$UV</string><string>run</string><string>--python</string><string>3.12</string>
    <string>--with-requirements</string><string>requirements.txt</string>
    <string>python</string><string>autorun.py</string>
  </array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$HOME_DIR/data/autorun.out</string>
  <key>StandardErrorPath</key><string>$HOME_DIR/data/autorun.out</string>
</dict></plist>
EOF
launchctl bootstrap "gui/$UID_NUM" "$AGENTS/com.jobradar.app.plist"
launchctl bootstrap "gui/$UID_NUM" "$AGENTS/com.jobradar.daily.plist"

echo "5/5  Creating the JobRadar app and adding it to your Dock..."
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/JobRadar.app"
osacompile -o "$HOME/Applications/JobRadar.app" -e 'open location "http://localhost:8501"'
if ! defaults read com.apple.dock persistent-apps 2>/dev/null | grep -q "Applications/JobRadar.app"; then
  defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://$HOME/Applications/JobRadar.app/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>"
  killall Dock
fi

echo "Waiting for JobRadar to start..."
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:8501 && break; sleep 2; done
open "http://localhost:8501"
echo ""
echo "Done. Click JobRadar in your Dock any time. It starts by itself when your Mac starts,"
echo "and your saved daily search runs every morning at 8:00. You can close this window."
