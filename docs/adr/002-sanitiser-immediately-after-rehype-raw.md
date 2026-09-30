# ADR-002: Sanitiser placed immediately after rehype-raw

## Status

Accepted

## Context

Dropped markdown may embed raw HTML. `rehype-raw` turns that into real elements, which is the dangerous step. KaTeX, Shiki and Mermaid generate markup (`style=`, `<svg>`, `<math>`, many classes) that a sanitiser would normally reject.

## Options Considered

- Sanitise last, after all generators, and whitelist their output.
- Sanitise immediately after `rehype-raw`, and run generators downstream.

## Decision

`rehype-sanitize` runs immediately after `rehype-raw`. Generators run after it. Nothing user-controlled may be added below the boundary.

## Rationale

Per comments in `src/pipeline/render.ts` and `src/pipeline/sanitize.ts`: sanitising last would force permitting `style=`, `<svg>`, `<math>`, `<annotation>` and dozens of KaTeX classes, a large surface that is what an attacker wants. The schema instead permits only marker classes the generators look for. `img src` is an explicit value allowlist (raster `data:` only, SVG excluded), because `hast-util-sanitize` accepts an attribute if any definition matches. A `data:text/html` XSS was found and fixed during development (`tasks/todo.md`).

## Consequences

- The schema stays small. Every plugin added after the boundary must be trusted and must not pass user data through.
- `rehype-assets` was hardened the same way, so a downstream plugin cannot reintroduce what the sanitiser rejected (`tasks/todo.md`).
- Sanitiser upgrades need the hostile-payload tests.

## Related Components

`src/pipeline/sanitize.ts`, `src/pipeline/render.ts`, [SECURITY.md](../SECURITY.md)

<!-- sources: src/pipeline/render.ts, src/pipeline/sanitize.ts, tasks/todo.md -->
