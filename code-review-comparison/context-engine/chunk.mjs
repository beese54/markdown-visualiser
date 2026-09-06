// Context Engine — Step 1: AST-based chunking (qodo course L5)
// Extracts functions, classes, React components, types and top-level consts
// from the TypeScript sources using the real TypeScript compiler AST.
import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv[2] ?? '.';
const TARGETS = ['src', 'server'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

const files = TARGETS.flatMap((t) => walk(join(ROOT, t)));
const chunks = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = relative(ROOT, file).split(String.fromCharCode(92)).join('/');

  const emit = (node, type, name) => {
    const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    const content = text.split('\n').slice(start - 1, end).join('\n');
    if (content.trim().length < 20) return;      // skip trivia
    chunks.push({ type, name: name || '<anon>', file_path: rel, start_line: start, end_line: end, content });
  };

  const visit = (node) => {
    if (ts.isFunctionDeclaration(node)) emit(node, 'function', node.name?.text);
    else if (ts.isClassDeclaration(node)) emit(node, 'class', node.name?.text);
    else if (ts.isInterfaceDeclaration(node)) emit(node, 'interface', node.name.text);
    else if (ts.isTypeAliasDeclaration(node)) emit(node, 'type', node.name.text);
    else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) emit(node, 'method', node.name.text);
    else if (ts.isVariableStatement(node) && node.parent === sf) {
      for (const d of node.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        const isFn = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        // React components: capitalised arrow fns in .tsx
        const isComponent = isFn && rel.endsWith('.tsx') && /^[A-Z]/.test(d.name.text);
        emit(node, isComponent ? 'component' : isFn ? 'function' : 'const', d.name.text);
      }
      return; // don't descend into a statement we already emitted
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
}

writeFileSync(join(ROOT, 'code-review-comparison/context-engine/chunks.json'),
  JSON.stringify(chunks, null, 2));

const dist = {};
for (const c of chunks) dist[c.type] = (dist[c.type] ?? 0) + 1;
const totalChars = chunks.reduce((n, c) => n + c.content.length, 0);
console.log(`files indexed : ${files.length}`);
console.log(`chunks created: ${chunks.length}`);
console.log(`total chars   : ${totalChars.toLocaleString()}`);
console.log('distribution  :');
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)}: ${v}`);
