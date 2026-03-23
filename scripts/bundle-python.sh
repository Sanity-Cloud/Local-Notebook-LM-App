#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

echo "Bundling Python packages into python-packages/..."
rm -rf python-packages
mkdir -p python-packages

python3 -m pip install \
  --target python-packages \
  --upgrade \
  -r local_notebooklm/requirements.txt

# Remove __pycache__ and .pyc files to keep bundle clean
find python-packages -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
find python-packages -name "*.pyc" -delete 2>/dev/null || true

echo "Done. Packages bundled to python-packages/"
