#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="$ROOT_DIR/tools"
ARCHIVE="$TOOLS_DIR/temurin-jre21-mac-aarch64.tar.gz"
TARGET_DIR="$TOOLS_DIR/jdk-21.0.8+9-jre"

if [[ -x "$TARGET_DIR/Contents/Home/bin/java" ]]; then
  echo "Local Java runtime already present at $TARGET_DIR"
  exit 0
fi

mkdir -p "$TOOLS_DIR"
echo "Downloading local Temurin JRE 21 (macOS arm64)..."
curl -L -o "$ARCHIVE" "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.8%2B9/OpenJDK21U-jre_aarch64_mac_hotspot_21.0.8_9.tar.gz"

echo "Extracting Java runtime..."
tar -xzf "$ARCHIVE" -C "$TOOLS_DIR"

echo "Done. Local Java available at: $TARGET_DIR/Contents/Home"
