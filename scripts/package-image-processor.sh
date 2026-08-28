#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="$repo_root/infrastructure/aws/lambda"
output_path="${1:-/tmp/our-pictures-image-processor.zip}"
build_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir"' EXIT

cp "$source_dir/index.mjs" "$source_dir/package.json" "$source_dir/package-lock.json" "$build_dir/"
(
  cd "$build_dir"
  npm_config_os=linux npm_config_cpu=arm64 \
    npm ci --omit=dev --include=optional
  npm install --no-save --force --package-lock=false \
    @img/sharp-linux-arm64@0.35.4 \
    @img/sharp-libvips-linux-arm64@1.3.3
  test -d node_modules/@img/sharp-linux-arm64
  test -d node_modules/@img/sharp-libvips-linux-arm64
  zip -qr "$output_path" index.mjs package.json package-lock.json node_modules
)
unzip -tq "$output_path"
echo "$output_path"
