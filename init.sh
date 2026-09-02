#!/usr/bin/env bash
# Reproducible environment initialisation for markdown-visualiser.
# Safe to re-run. Exits non-zero on the first real failure.
set -euo pipefail

REQUIRED_NODE_MAJOR=20
SKILLS_REPO="https://github.com/MengTo/Skills.git"
SKILLS_DIR=".claude/skills/mengto"
# Only the skills that inform this project's design direction.
SKILLS_WANTED=(
  "web-design/book-serif-index"
  "web-design/light-mode-paper-technical"
  "web-design/beautiful-shadows"
  "web-design/progressive-blur"
  "web-design/scroll-progress-timeline"
  "web-design/masked-reveal"
  "web-design/editorial-tech"
)

say() { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

say "Checking toolchain"
command -v node >/dev/null || die "node is not installed"
command -v npm  >/dev/null || die "npm is not installed"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge "$REQUIRED_NODE_MAJOR" ] \
  || die "Node >= ${REQUIRED_NODE_MAJOR} required, found $(node -v)"
printf '    node %s / npm %s\n' "$(node -v)" "$(npm -v)"
command -v docker >/dev/null && printf '    %s\n' "$(docker --version)" \
  || say "docker not found - container targets will be unavailable"

say "Installing dependencies"
if [ -f package-lock.json ]; then npm ci; else npm install; fi

say "Vendoring MengTo design skills (MIT)"
if [ -d "$SKILLS_DIR" ]; then
  say "    already vendored, skipping (delete $SKILLS_DIR to refresh)"
else
  TMP="$(mktemp -d)"
  # Sparse, depth-1 clone: we only want a handful of SKILL.md files, not 123.
  if git clone --depth 1 --filter=blob:none --sparse "$SKILLS_REPO" "$TMP/Skills" 2>/dev/null; then
    ( cd "$TMP/Skills" && git sparse-checkout set "${SKILLS_WANTED[@]/#/agent-skills/}" >/dev/null 2>&1 || true )
    mkdir -p "$SKILLS_DIR"
    for s in "${SKILLS_WANTED[@]}"; do
      if [ -d "$TMP/Skills/agent-skills/$s" ]; then
        cp -r "$TMP/Skills/agent-skills/$s" "$SKILLS_DIR/$(basename "$s")"
        printf '    + %s\n' "$(basename "$s")"
      fi
    done
    cp "$TMP/Skills/LICENSE" "$SKILLS_DIR/LICENSE" 2>/dev/null || true
  else
    say "    clone failed (offline?) - design tokens are already committed, continuing"
  fi
  rm -rf "$TMP"
fi

say "Typechecking"
npm run typecheck

say "Building"
npm run build

say "Running tests"
npm test -- --run

say "Ready.  Next:  docker compose up --build   ->  http://localhost:8080"
