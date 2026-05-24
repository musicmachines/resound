# Resound

Browser-based 8-voice step-sequencer drum machine. Rust core compiled to
WebAssembly owns musical state; Web Audio handles playback; plain HTML/CSS
renders the UI. See [`docs/resound-v1-spec.md`](docs/resound-v1-spec.md) for
the full v1 spec.

## Prerequisites

- Rust (stable) with the `wasm32-unknown-unknown` target
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/)
- Node.js 18+ and [`pnpm`](https://pnpm.io)

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
npm install -g pnpm@9
```

## Dev workflow

Two terminals:

```bash
# 1. Rust → WASM watch
cd src/crate
cargo watch -s "wasm-pack build --target web --out-dir ../web/wasm --dev"

# 2. Vite dev server
cd src/web
pnpm install   # first time only
pnpm dev
```

Vite serves `index.html` at <http://localhost:5173>. HMR refreshes on TS/CSS
changes; a fresh `wasm-pack build` triggers a module reload.

For a one-shot build without `cargo watch`:

```bash
cd src/crate && wasm-pack build --target web --out-dir ../web/wasm --dev
cd src/web   && pnpm dev
```

## Production build

```bash
cd src/crate && wasm-pack build --release --target web --out-dir ../web/wasm
cd src/web   && pnpm build
```

Output lands in `src/web/dist/` — a folder of static files deployable to any
static host (GitHub Pages, Cloudflare Pages, S3, etc.). Quick local preview:

```bash
cd src/web && pnpm preview
```

## Testing

```bash
cd src/crate && cargo test
```

The Rust core is pure and time-independent — pattern mutations, transport,
mixer, and the `pull_events` cursor contract are all covered by unit tests.
The JS scheduler/audio layer is exercised in-browser.

## Project layout

```
resound/
├── docs/                  Specs and design notes
├── src/
│   ├── crate/             Rust core (compiles to WASM)
│   │   ├── src/{lib,pattern,transport,mixer,samples}.rs
│   │   └── samples/       Bundled kit WAVs
│   └── web/               TypeScript + Vite
│       ├── index.html
│       └── src/{audio,ui}/
└── README.md
```
