# ADR-005: Repair markdown for rendering only, and report every repair

## Status

Accepted

## Context

Document sets are written by several people over time. Heading hierarchies skip levels, files carry several H1s, and list indentation is inconsistent. Rendering these literally gives a wrong structure and an unusable index.

## Options Considered

- Render literally.
- Repair silently.
- Repair for rendering and record each change for the user.

## Decision

A remark plugin normalises structure before HTML conversion and pushes a `RepairNote` (rule, line, before, after, detail) for each change. The UI lists them. The source file is never modified.

## Rationale

`src/pipeline/plugins/remark-repair.ts` and `src/types/domain.ts`: repairing without telling the user is editing their writing behind their back. Five rules exist: `heading-skip`, `duplicate-h1`, `list-nesting`, `mixed-markers`, `unbalanced-emphasis`.

## Consequences

- Every new repair rule must emit a note.
- `unbalanced-emphasis` only reports. `mixed-markers` normalises list tight/loose spacing, not marker characters, because mdast does not keep marker characters (comment in the plugin).
- A leading H1 that repeats the document title is dropped and reported, since the reader prints the title itself.

## Related Components

`src/pipeline/plugins/remark-repair.ts`, `src/reader/RepairNotice.tsx`, [DATA_MODEL.md](../DATA_MODEL.md)

<!-- sources: src/pipeline/plugins/remark-repair.ts, src/types/domain.ts, tasks/todo.md -->
