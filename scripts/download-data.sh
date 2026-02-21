#!/bin/bash

# Downloads and extracts the merchant activity CSV dataset from Google Drive.
# Run this once before starting the application.
#
# Usage: bash scripts/download-data.sh

set -e

FILE_ID="1wOBfiRf-uCTobaPr1XAb6xOCa1zAAUm1"
DOWNLOAD_URL="https://drive.usercontent.google.com/download?id=$FILE_ID&export=download&confirm=t"
ZIP_FILE="data.zip"
TMP_DIR="./tmp_extract"
DATA_DIR="./data"

echo "📦 Downloading dataset..."

curl -L "$DOWNLOAD_URL" -o "$ZIP_FILE" --progress-bar

if [ ! -f "$ZIP_FILE" ]; then
  echo "❌ Download failed. Please download manually from:"
  echo "   https://drive.google.com/file/d/$FILE_ID/view?usp=sharing"
  exit 1
fi

echo "📂 Extracting..."

mkdir -p "$TMP_DIR"
mkdir -p "$DATA_DIR"

# Extract outer zip
unzip -o "$ZIP_FILE" -d "$TMP_DIR"

# The zip may contain a nested data.zip — extract that too
INNER_ZIP=$(find "$TMP_DIR" -name "data.zip" | head -1)
if [ -n "$INNER_ZIP" ]; then
  echo "📂 Found nested data.zip — extracting CSVs..."
  unzip -o "$INNER_ZIP" -d "$TMP_DIR/inner"
  find "$TMP_DIR/inner" -name "*.csv" -exec mv {} "$DATA_DIR/" \;
else
  # No nested zip — just grab any CSVs directly
  find "$TMP_DIR" -name "*.csv" -exec mv {} "$DATA_DIR/" \;
fi

# Cleanup
rm -rf "$TMP_DIR"
rm -f "$ZIP_FILE"

CSV_COUNT=$(ls "$DATA_DIR"/*.csv 2>/dev/null | wc -l | tr -d ' ')
echo "✅ Done. $CSV_COUNT CSV file(s) ready in $DATA_DIR/"
