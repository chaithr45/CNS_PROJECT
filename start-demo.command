#!/usr/bin/env bash
# CipherCam - start the demo (macOS). Double-click me in Finder.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js LTS from nodejs.org, then run this script again."
  read -r -p "Press Enter to close" _
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "First start: installing CipherCam (needs internet once)..."
  npm install || { echo "npm install failed."; read -r -p "Press Enter to close" _; exit 1; }
fi
npm run demo
