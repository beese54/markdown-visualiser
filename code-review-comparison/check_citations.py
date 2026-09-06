"""Objective evidence check: does every `file:line` citation point inside the file?"""
import re, sys, pathlib, io
ROOT = pathlib.Path('.')
lens = {}
for p in list(ROOT.glob('src/**/*.ts*')) + list(ROOT.glob('server/*.ts')):
    rel = p.as_posix()
    lens[rel] = len(io.open(p, encoding='utf-8').read().splitlines())

CITE = re.compile(r'((?:src|server)/[\w/.-]+\.tsx?):(\d+)(?:\s*[-–]\s*(\d+))?')

def check(path, label):
    txt = io.open(path, encoding='utf-8').read()
    seen, ok, bad, unknown = set(), 0, [], 0
    for m in CITE.finditer(txt):
        f, a, b = m.group(1), int(m.group(2)), m.group(3)
        hi = int(b) if b else a
        key = (f, a, hi)
        if key in seen: continue
        seen.add(key)
        n = lens.get(f)
        if n is None: unknown += 1; continue
        if a >= 1 and hi <= n: ok += 1
        else: bad.append(f'{f}:{a}-{hi} (file has {n} lines)')
    total = ok + len(bad)
    pct = f'{ok/total*100:.0f}%' if total else 'n/a'
    print(f'{label:24s} {ok:3d}/{total:3d} in range ({pct})' + (f'  [{unknown} unknown file]' if unknown else ''))
    for b in bad: print(f'      OUT OF RANGE: {b}')
    return ok, total

for f, label in [
    ('code-review-comparison/arm-a-qodo/specialist-security.md',     'A: security'),
    ('code-review-comparison/arm-a-qodo/specialist-pattern.md',      'A: pattern'),
    ('code-review-comparison/arm-a-qodo/specialist-requirements.md', 'A: requirements'),
    ('code-review-comparison/arm-b-claude-code/findings.md',         'B: claude code'),
]:
    if pathlib.Path(f).exists(): check(f, label)
    else: print(f'{label:24s} (not yet written)')
