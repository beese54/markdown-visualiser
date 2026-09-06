# Code review comparison — qodo methodology vs Claude Code

Two AI code reviews of the same 4,265 LOC, at the same commit, on the same day, by the same model —
differing only in **review architecture**.

**→ Start with [`COMPARISON.md`](COMPARISON.md).**

## The one-line result

33 findings between them. **Exactly 2 are the same finding** — a 6.5% overlap. They are not better
or worse than each other; they are answering different questions.

| | Arm A — qodo methodology | Arm B — Claude Code `/code-review high` |
|---|---|---|
| Findings | 20 (after dedup) | 13 |
| Files opened | 0 — retrieval-bound | 31 of 31 |
| Non-source context | spec, DoD, README, standards | none |
| Ran the code | no | yes — 3 findings reproduced |
| Citation accuracy | 86% | 100% |
| Answers | "does this match what we said we'd build?" | "does this code actually work?" |

## Reading order

1. **[`COMPARISON.md`](COMPARISON.md)** — the analysis. What each arm uniquely found, where each went wrong, and why.
2. **[`verification.md`](verification.md)** — both arms checked against the real source with one method. Nothing here is taken on trust.
3. **[`METHODOLOGY.md`](METHODOLOGY.md)** — how each was run, and the limitations that constrain what can be claimed.
4. **[`PLAN.md`](PLAN.md)** — the experimental design and fairness controls, written before the runs.

## The runs themselves

- `arm-a-qodo/specialist-{security,pattern,requirements}.md` — the three specialists' raw findings
- `arm-a-qodo/ensemble.md` — combine → deduplicate → risk triage
- `arm-b-claude-code/findings.md` — verbatim `/code-review high src server` output
- `arm-b-claude-code/run-notes.md` — what it read, how long it took, what it executed

## The context engine (Arm A)

A working implementation of the course's pipeline, not a mock:

- `context-engine/chunk.mjs` — AST chunking via the real TypeScript compiler API → 199 chunks
- `context-engine/retrieve.py` — MiniLM embeddings → Chroma → selective retrieval (75–82% context reduction)
- `context-engine/bundles/` — the five bundles the specialists actually received
- `context-engine/retrieval-report.md` — what was retrieved, with similarity scores

```bash
node code-review-comparison/context-engine/chunk.mjs .
python code-review-comparison/context-engine/retrieve.py
python code-review-comparison/check_citations.py
```

## Important caveat

The **qodo product is not installed here** and no qodo key is present. Arm A implements the
*methodology taught in the DeepLearning.AI × Qodo course* — context engine, selective retrieval,
specialist ensemble, dedup, risk triage. It is **not** the commercial tool, and nothing here
supports a claim about qodo's PR integration, memory layer or cross-repo analysis.

Full limitations in [`METHODOLOGY.md`](METHODOLOGY.md#known-limitations-of-this-comparison).
