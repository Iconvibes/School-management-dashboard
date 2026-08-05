#!/usr/bin/env bash
# Rebuild edutrack-pitch-deck.pdf from edutrack-pitch-deck.html.
#
# Why screenshots + Pillow instead of Chrome --print-to-pdf?
#   Headless Chrome's print pagination is unreliable for exact-size slides;
#   screenshotting each slide at 1280x720 and assembling with Pillow is
#   deterministic — 14 pages, pixel-perfect, every time.
#
# Usage: bash scripts/make-pitch-pdf.sh
# Requirements: Google Chrome installed, Python with Pillow (pip install pillow)
set -e
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
DECK="$(pwd)/edutrack-pitch-deck.html"
OUT="$(pwd)/edutrack-pitch-deck.pdf"
SHOTS="$(pwd)/.deck-shots"

mkdir -p "$SHOTS"

for i in $(seq 0 13); do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1280,720 \
    --screenshot="$SHOTS/slide-$i.png" "file://$DECK#$i" >/dev/null 2>&1
done

python - "$SHOTS" "$OUT" <<'PY'
import sys
from PIL import Image

shots, out = sys.argv[1], sys.argv[2]
imgs = [Image.open(f"{shots}/slide-{i}.png").convert("RGB") for i in range(14)]
imgs[0].save(out, save_all=True, append_images=imgs[1:], resolution=96.0)
print("PDF written:", out)
PY

echo "Done — 14 slides -> $OUT"
