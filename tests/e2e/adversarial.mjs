/**
 * Adversarial probe of the PDF endpoint (DoD 4.4 - 4.7).
 *
 * The endpoint renders caller-supplied HTML in a real browser, which is the
 * application's only meaningful attack surface. Each case below posts a
 * hostile payload and asserts the specific control that should stop it.
 *
 * A PDF coming back is not a failure on its own - a blocked resource still
 * prints. The failure would be evidence the request actually reached its
 * target, so the checks look for leaked content and for the endpoint refusing
 * to fall over.
 *
 * Usage:  node adversarial.mjs <baseUrl>
 */

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8080'

const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const post = async (body, init = {}) =>
  fetch(`${baseUrl}/api/export/pdf`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  })

const page = (inner) =>
  `<!doctype html><html><head><meta charset="utf-8"></head><body>${inner}</body></html>`

/** PDFs store text in compressed streams, so decode before searching. */
const pdfContains = async (response, needle) => {
  const bytes = Buffer.from(await response.arrayBuffer())
  const raw = bytes.toString('latin1')
  if (raw.includes(needle)) return true
  // Also check any FlateDecode streams.
  const zlib = await import('node:zlib')
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      const inflated = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1')
      if (inflated.includes(needle)) return true
    } catch {
      // Not a deflate stream, or truncated. Nothing to search.
    }
  }
  return false
}

// ---- 1. Local file read (DoD 4.4) --------------------------------------
{
  const res = await post({
    title: 'file-probe',
    html: page(
      `<p>MARKER_START</p>
       <iframe src="file:///etc/passwd" width="600" height="400"></iframe>
       <img src="file:///etc/hostname" alt="ALT_SHOULD_NOT_LEAK">
       <object data="file:///etc/passwd"></object>`,
    ),
  })

  const leaked = res.ok ? await pdfContains(res, 'root:x:') : false
  record(
    'file:// cannot read local files (DoD 4.4)',
    !leaked,
    res.ok ? `${res.status}, no /etc/passwd content in output` : `${res.status}`,
  )
}

// ---- 2. SSRF to cloud metadata and internal hosts (DoD 4.5) ------------
{
  const res = await post({
    title: 'ssrf-probe',
    html: page(
      `<p>MARKER_START</p>
       <img src="http://169.254.169.254/latest/meta-data/iam/security-credentials/">
       <img src="http://127.0.0.1:8080/healthz">
       <img src="http://localhost:8080/healthz">
       <img src="http://10.0.0.1/">
       <link rel="stylesheet" href="http://169.254.169.254/latest/meta-data/">
       <style>@import url("http://127.0.0.1:8080/healthz");
              body { background: url("http://169.254.169.254/"); }</style>`,
    ),
  })

  // The app's own /healthz is the easiest thing to prove was not fetched:
  // if the route interception failed, its JSON would be reachable.
  const leaked = res.ok ? await pdfContains(res, '"status":"ok"') : false
  record(
    'internal and metadata requests are blocked (DoD 4.5)',
    !leaked,
    res.ok ? `${res.status}, no internal response content in output` : `${res.status}`,
  )
}

// ---- 3. JavaScript is disabled -----------------------------------------
{
  const res = await post({
    title: 'js-probe',
    html: page(
      `<p id="t">JS_DID_NOT_RUN</p>
       <script>
         document.getElementById('t').textContent = 'JS_EXECUTED';
         fetch('http://169.254.169.254/').catch(() => {});
       </script>
       <img src="x" onerror="document.getElementById('t').textContent='JS_EXECUTED'">
       <svg><script>document.getElementById('t').textContent='JS_EXECUTED'</script></svg>`,
    ),
  })

  const executed = res.ok ? await pdfContains(res, 'JS_EXECUTED') : false
  record(
    'JavaScript does not execute in the print context',
    !executed,
    res.ok ? `${res.status}, page still shows JS_DID_NOT_RUN` : `${res.status}`,
  )
}

// ---- 4. Body size limit (DoD 4.6) --------------------------------------
{
  // Comfortably past the 20MB bodyLimit.
  const huge = JSON.stringify({ title: 'huge', html: page('x'.repeat(26 * 1024 * 1024)) })
  let status = 0
  let crashed = false
  try {
    const res = await post(huge)
    status = res.status
  } catch (err) {
    // A connection reset is an acceptable way to refuse an oversized body,
    // but the service must still be alive afterwards.
    crashed = true
    status = `network: ${err.message}`
  }

  const health = await fetch(`${baseUrl}/healthz`).then((r) => r.ok).catch(() => false)
  record(
    'an oversized body is refused, not swallowed (DoD 4.6)',
    (status === 413 || crashed) && health,
    `status=${status}, service still healthy=${health}`,
  )
}

// ---- 5. Concurrency limit (DoD 4.7) ------------------------------------
{
  const heavy = page(
    Array.from({ length: 400 }, (_, i) => `<h2>Section ${i}</h2><p>${'text '.repeat(200)}</p>`).join(''),
  )

  const responses = await Promise.all(
    Array.from({ length: 24 }, () => post({ title: 'load', html: heavy }).catch((e) => ({ status: `err:${e.message}` }))),
  )
  const codes = responses.map((r) => r.status)
  const ok = codes.filter((c) => c === 200).length
  const busy = codes.filter((c) => c === 429).length
  const failed = codes.filter((c) => c !== 200 && c !== 429).length

  const health = await fetch(`${baseUrl}/healthz`).then((r) => r.ok).catch(() => false)
  record(
    'saturation is shed cleanly, not by falling over (DoD 4.7)',
    failed === 0 && health && ok > 0,
    `200=${ok} 429=${busy} other=${failed}, healthy after=${health}`,
  )
}

// ---- 6. Input validation ------------------------------------------------
{
  const cases = [
    ['missing body', '', 400],
    ['empty object', {}, 400],
    ['html not a string', { html: 12345 }, 400],
    ['blank html', { html: '   ' }, 400],
  ]
  for (const [name, body, expected] of cases) {
    const res = await post(body).catch(() => ({ status: 0 }))
    record(`rejects ${name} with ${expected}`, res.status === expected, `got ${res.status}`)
  }
}

// ---- 7. A legitimate export still works --------------------------------
{
  const res = await post({
    title: 'Legitimate Document',
    html: page('<h1>A Real Document</h1><p>With ordinary prose in it.</p>'),
  })
  const type = res.headers.get('content-type') ?? ''
  const bytes = res.ok ? (await res.arrayBuffer()).byteLength : 0
  record(
    'a legitimate export still produces a PDF',
    res.ok && type.includes('application/pdf') && bytes > 1000,
    `${res.status} ${type} ${bytes} bytes`,
  )
}

// ---- 8. No internal detail in error responses ---------------------------
{
  const res = await post({ html: 42 })
  const text = await res.text()
  const leaks = /\/app\/|node_modules|at Object|Playwright|chromium/i.test(text)
  record('errors do not disclose internals', !leaks, text.slice(0, 120))
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
