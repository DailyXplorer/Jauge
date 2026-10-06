#!/bin/sh
# Installs a user LaunchAgent that refreshes the data and the AI market brief every 30 minutes:
#   pnpm job    (data:refresh, then insights:run, under one lock)
# Usage: scripts/install-launchd.sh            install or reinstall
#        scripts/install-launchd.sh --uninstall
set -eu

LABEL="io.jauge.insights"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$PLIST"
  echo "Removed $LABEL."
  exit 0
fi

PNPM=$(command -v pnpm) || { echo "pnpm not found in PATH" >&2; exit 1; }
NODE=$(command -v node) || { echo "node not found in PATH" >&2; exit 1; }
# launchd starts jobs with a minimal PATH; give it the directories of the current node and pnpm.
JOB_PATH="$(dirname "$NODE"):$(dirname "$PNPM"):/usr/bin:/bin:/usr/sbin:/sbin"

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}
DIR_XML=$(xml_escape "$PROJECT_DIR")

mkdir -p "$HOME/Library/LaunchAgents" "$PROJECT_DIR/data-cache"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>pnpm job</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$DIR_XML</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(xml_escape "$JOB_PATH")</string>
  </dict>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$DIR_XML/data-cache/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$DIR_XML/data-cache/launchd.err.log</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST" >/dev/null
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Installed $LABEL: runs every 30 min from $PROJECT_DIR, logs in data-cache/."
