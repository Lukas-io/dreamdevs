#!/bin/bash

# Downloads and extracts the merchant activity CSV dataset from Google Drive.
# Run this once before starting the application.
#
# Usage: bash scripts/download-data.sh

set -e

FILE_ID="1wOBfiRf-uCTobaPr1XAb6xOCa1zAAUm1"
DOWNLOAD_URL="https://drive.usercontent.google.com/download?id=$FILE_ID&export=download&confirm=t"
ZIP_FILE="data.zip"
DATA_DIR="./data"

echo "📦 Downloading dataset..."

curl -L "$DOWNLOAD_URL" -o "$ZIP_FILE" --progress-bar

if [ ! -f "$ZIP_FILE" ]; then
  echo "❌ Download failed. Please download manually from:"
  echo "   https://drive.google.com/file/d/$FILE_ID/view?usp=sharing"
  exit 1
fi

echo "📂 Extracting to $DATA_DIR..."

mkdir -p "$DATA_DIR"
unzip -o "$ZIP_FILE" "*.csv" -d "$DATA_DIR" 2>/dev/null || unzip -o "$ZIP_FILE" -d "$DATA_DIR"

# Flatten any nested folder structure from the zip
find "$DATA_DIR" -name "*.csv" ! -path "$DATA_DIR/*.csv" -exec mv {} "$DATA_DIR/" \;
find "$DATA_DIR" -type d -empty -delete

rm "$ZIP_FILE"

CSV_COUNT=$(ls "$DATA_DIR"/*.csv 2>/dev/null | wc -l | tr -d ' ')
echo "✅ Done. $CSV_COUNT CSV file(s) ready in $DATA_DIR/"
