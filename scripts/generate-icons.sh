#!/usr/bin/env bash
# Generate app icons from favicon.svg using macOS tools.
# Usage: bash scripts/generate-icons.sh

set -euo pipefail
cd "$(dirname "$0")/.."

SVG="public/favicon.svg"
if [ ! -f "$SVG" ]; then echo "Error: $SVG not found"; exit 1; fi

# --- Rasterise SVG to a high-res PNG (1024px) using macOS built-in tools ---
# We use qlmanage (Quick Look) which handles SVGs natively on macOS.
TMP_DIR=$(mktemp -d)
MASTER="$TMP_DIR/icon-1024.png"

echo "Rendering SVG to 1024x1024 PNG..."
qlmanage -t -s 1024 -o "$TMP_DIR" "$SVG" 2>/dev/null
mv "$TMP_DIR/favicon.svg.png" "$MASTER"

# --- Web icons ---
echo "Generating web icons..."
sips -z 192 192 "$MASTER" --out public/icon-192x192.png >/dev/null
sips -z 512 512 "$MASTER" --out public/icon-512x512.png >/dev/null
sips -z 180 180 "$MASTER" --out public/apple-touch-icon-180x180.png >/dev/null

# --- macOS .icns (for Electron) ---
echo "Generating macOS .icns..."
ICONSET="$TMP_DIR/icon.iconset"
mkdir -p "$ICONSET"
for SIZE in 16 32 64 128 256 512; do
  sips -z $SIZE $SIZE "$MASTER" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
  DOUBLE=$((SIZE * 2))
  if [ $DOUBLE -le 1024 ]; then
    sips -z $DOUBLE $DOUBLE "$MASTER" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
  fi
done

iconutil -c icns -o electron/icon.icns "$ICONSET"

# Cleanup
rm -rf "$TMP_DIR"

echo "Done! Generated:"
echo "  public/icon-192x192.png"
echo "  public/icon-512x512.png"
echo "  public/apple-touch-icon-180x180.png"
echo "  electron/icon.icns"
