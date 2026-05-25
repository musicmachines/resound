#!/usr/bin/env bash
# Build the Rust crate to WASM, ensure node deps, start the Vite dev server.
# Run from any directory — the script cd's to its own location.

set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
CRATE="$ROOT/src/crate"
WEB="$ROOT/src/web"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing: $1 — see README.md prerequisites"; exit 1; }
}
require cargo
require wasm-pack
require pnpm

PROFILE="--dev"
WATCH=""
for arg in "$@"; do
  case "$arg" in
    --release) PROFILE="--release" ;;
    --watch)   WATCH="1" ;;
    -h|--help)
      cat <<EOF
Usage: ./dev.sh [--release] [--watch]

  (no flags)   Build wasm (dev), then run vite dev server.
  --release    Build wasm with optimizations (slower, smaller bundle).
  --watch      Use cargo-watch to rebuild wasm on Rust file changes.
               Requires \`cargo install cargo-watch\` once.
EOF
      exit 0
      ;;
    *) echo "unknown flag: $arg (try --help)"; exit 1 ;;
  esac
done

echo "== building wasm ($PROFILE) =="
(cd "$CRATE" && wasm-pack build "$PROFILE" --target web --out-dir "$WEB/wasm")

if [ ! -d "$WEB/node_modules" ]; then
  echo "== installing node deps =="
  (cd "$WEB" && pnpm install)
fi

# Optional: keep rebuilding wasm on Rust file changes in the background.
if [ -n "$WATCH" ]; then
  command -v cargo-watch >/dev/null 2>&1 || {
    echo "cargo-watch not installed; run \`cargo install cargo-watch\` first";
    exit 1;
  }
  echo "== starting cargo-watch (rebuilds wasm on src/crate changes) =="
  (cd "$CRATE" && cargo watch -s "wasm-pack build $PROFILE --target web --out-dir $WEB/wasm" >/tmp/resound-wasm-watch.log 2>&1) &
  WATCH_PID=$!
  trap "kill $WATCH_PID 2>/dev/null || true" EXIT
  echo "   pid $WATCH_PID, log /tmp/resound-wasm-watch.log"
fi

echo "== starting vite dev server =="
exec sh -c "cd '$WEB' && pnpm dev"
