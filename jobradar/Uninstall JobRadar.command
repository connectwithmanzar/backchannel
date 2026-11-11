#!/bin/bash
# Stops JobRadar's background running and daily run, and removes the Dock app.
# Your JobRadar folder and search history (~/JobRadar) are kept.
UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/com.jobradar.app" 2>/dev/null
launchctl bootout "gui/$UID_NUM/com.jobradar.daily" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/com.jobradar.app.plist" "$HOME/Library/LaunchAgents/com.jobradar.daily.plist"
rm -rf "$HOME/Applications/JobRadar.app"
echo "JobRadar background and daily run removed. Drag the JobRadar icon off your Dock if it's still there."
echo "Your files are still in ~/JobRadar."
