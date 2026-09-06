"""Context Engine — Steps 2-4 (qodo course L5):
embeddings -> vector index -> SELECTIVE retrieval per specialist agent."""
import json, os, warnings, pathlib
warnings.filterwarnings('ignore')
os.environ['ANONYMIZED_TELEMETRY'] = 'False'
import chromadb
from chromadb.utils import embedding_functions

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
N_RESULTS = 30                      # ~15% of the index, matching the course's 15/99 ratio

chunks = json.load(open(HERE / 'chunks.json', encoding='utf-8'))
print(f'loaded {len(chunks)} chunks')

ef = embedding_functions.DefaultEmbeddingFunction()
client = chromadb.EphemeralClient()
col = client.create_collection('repo', embedding_function=ef)

docs = [f"# {c['type']}: {c['name']} ({c['file_path']}:{c['start_line']}-{c['end_line']})\n{c['content']}"
        for c in chunks]
col.add(ids=[str(i) for i in range(len(chunks))], documents=docs,
        metadatas=[{k: c[k] for k in ('type','name','file_path','start_line','end_line')} for c in chunks])
print(f'indexed {col.count()} chunks (384-dim all-MiniLM-L6-v2)')

# Each specialist gets its own retrieval queries -> its own selective context bundle.
AGENTS = {
 'security': [
   "HTML sanitization allowlist, raw HTML passthrough, dangerouslySetInnerHTML, XSS",
   "file system path handling, directory traversal, resolving user supplied paths",
   "spawning a browser process, playwright launch arguments, sandbox flags",
   "HTTP route handler, request body parsing, size limits, untrusted input validation",
   "URL parsing, protocol allowlist, javascript: and data: URI handling, link rewriting",
   "secrets, tokens, credentials, environment variables, CORS headers",
 ],
 'pattern': [
   "error handling convention, try catch, failure propagation, result types",
   "state management store, selectors, actions, immutability",
   "React component structure, hooks, effects, cleanup, memoisation",
   "async concurrency control, promise pool, cancellation, aborting work",
   "module boundary, exported public API surface, shared helper reuse",
   "resource lifecycle, opening and closing handles, browser page teardown",
 ],
 'requirements': [
   "markdown ingestion, folder walking, reading order, front matter",
   "rendering pipeline, remark rehype plugins, syntax highlighting, math, diagrams",
   "malformed markdown repair, unclosed fences, broken tables, repair notices",
   "export to standalone HTML and PDF, print stylesheet, asset inlining",
   "reader shell, index sidebar, progress rail, cross document links, accessibility",
   "large document set performance, limits, timeouts, concurrency caps",
 ],
}

full_chars = sum(len(d) for d in docs)
report = ['# Context Engine — retrieval report', '',
          f'- Index: **{len(chunks)} chunks** from 31 TS/TSX files, {full_chars:,} chars',
          f'- Embedding: `all-MiniLM-L6-v2` (384-dim), local ONNX',
          f'- Vector store: Chroma (ephemeral), cosine similarity',
          f'- Selective retrieval: top {N_RESULTS} chunks per specialist (union over its queries)', '']

bundles = HERE / 'bundles'; bundles.mkdir(exist_ok=True)
for agent, queries in AGENTS.items():
    scored = {}
    for q in queries:
        r = col.query(query_texts=[q], n_results=12)
        for cid, dist in zip(r['ids'][0], r['distances'][0]):
            sim = 1 - dist
            if sim > scored.get(cid, -9): scored[cid] = sim
    top = sorted(scored.items(), key=lambda kv: -kv[1])[:N_RESULTS]
    sel = [(chunks[int(cid)], sim) for cid, sim in top]
    sel_chars = sum(len(docs[int(cid)]) for cid, _ in top)

    out = [f'# Selective context bundle — {agent} agent', '',
           f'Retrieved {len(sel)} of {len(chunks)} chunks '
           f'({sel_chars:,} of {full_chars:,} chars — '
           f'{(1-sel_chars/full_chars)*100:.1f}% reduction vs full context)', '']
    for c, sim in sel:
        out.append(f"## {c['type']}: `{c['name']}` — `{c['file_path']}:{c['start_line']}-{c['end_line']}` (sim {sim:+.3f})")
        out.append('```ts'); out.append(c['content']); out.append('```'); out.append('')
    (bundles / f'{agent}.md').write_text('\n'.join(out), encoding='utf-8')

    report.append(f'## {agent} agent')
    report.append(f'- {len(sel)} chunks, {sel_chars:,} chars '
                  f'({(1-sel_chars/full_chars)*100:.1f}% reduction vs full context)')
    report.append('- top 8 retrieved:')
    for c, sim in sel[:8]:
        report.append(f"  - `{c['file_path']}:{c['start_line']}` — {c['type']} `{c['name']}` (sim {sim:+.3f})")
    report.append('')
    print(f'{agent:13s}: {len(sel):3d} chunks, {sel_chars:6,d} chars '
          f'({(1-sel_chars/full_chars)*100:.1f}% reduction)')

(HERE / 'retrieval-report.md').write_text('\n'.join(report), encoding='utf-8')
print('wrote bundles/ + retrieval-report.md')
