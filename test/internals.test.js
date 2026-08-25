import { test } from 'node:test'
import assert from 'node:assert/strict'
import { internals, id } from './load.js'

const {
  windowFor, canvasSignatureOf, scrubTarget, visibleRange, wheelPixels,
  createThumbSuppressor, promptOf, parsePrompts, createPromptParser,
  createPromptStore, createHistoryLoader, LOAD_PAGE_CAP, CSS,
} = internals

test('module loads under the factory format', () => {
  assert.equal(id, 'dsh-strata')
})

// ── P1-1: canvas cache follows the zoomed window ──────────────────────────
test('zoomed window slides with scrollTop; full window does not', () => {
  const near1 = windowFor('init', 4000, 2000, 1000, 400)
  const near2 = windowFor('init', 4000, 2000, 1500, 400)
  assert.equal(near1.extent, 2000)
  assert.equal(near1.offset, 200)
  assert.equal(near2.offset, 700)
  const all1 = windowFor('all', 4000, 2000, 1000, 400)
  const all2 = windowFor('all', 4000, 2000, 1500, 400)
  assert.deepEqual(all1, { offset: 0, extent: 4000 })
  assert.deepEqual(all2, all1)
  // The window never leaves the content.
  assert.equal(windowFor('init', 4000, 2000, 3900, 400).offset, 2000)
  assert.equal(windowFor('mid', 4000, 1500, 0, 400).extent, 3000)
  assert.equal(windowFor('mid', 4000, 3000, 0, 400).extent, 4000)
})

test('canvas signature changes when the window moves in 近/中, not in 全', () => {
  const base = { railW: 12, railH: 300, contentHeight: 4000, count: 50, hoverIndex: -1, colorStamp: 'x', dpr: 2 }
  const sig = (mode, scrollTop) => {
    const w = windowFor(mode, 4000, 2000, scrollTop, 400)
    return canvasSignatureOf({ ...base, zoomMode: mode, offset: w.offset, k: 300 / w.extent })
  }
  assert.notEqual(sig('init', 1000), sig('init', 1500))
  assert.notEqual(sig('init', 1500), sig('init', 2000))
  assert.equal(sig('all', 1000), sig('all', 1500))
  assert.equal(sig('all', 1500), sig('all', 2000))
  // DPR is part of the key too.
  assert.notEqual(
    canvasSignatureOf({ ...base, zoomMode: 'all', offset: 0, k: 0.075 }),
    canvasSignatureOf({ ...base, zoomMode: 'all', offset: 0, k: 0.075, dpr: 1 }),
  )
})

// ── P1-2: scrub is an absolute mapping against a frozen window ────────────
test('one pixel of drag is one pixel of rail, never cumulative', () => {
  const drag = { offset: 800, extent: 2000 }
  const railH = 300
  const at = (y) => scrubTarget(drag, y, railH, 400)
  assert.equal(at(225), 800 + 0.75 * 2000 - 200)
  const step = at(226) - at(225)
  assert.ok(Math.abs(step - 2000 / 300) < 1e-9)
  assert.ok(Math.abs((at(227) - at(226)) - step) < 1e-9)
  // Clamped at the rail's ends.
  assert.equal(at(-50), at(0))
  assert.equal(at(999), at(300))
})

// ── visible range: binary search over stacked rows ────────────────────────
test('visibleRange finds the bands touching an interval', () => {
  const bands = []
  for (let i = 0; i < 100; i += 1) bands.push({ top: i * 50, height: 40 })
  assert.deepEqual(visibleRange(bands, 0, 4950), { start: 0, end: 99 })
  assert.deepEqual(visibleRange(bands, 1000, 1100), { start: 20, end: 22 })
  // A band whose body straddles `lo` is included.
  assert.deepEqual(visibleRange(bands, 1030, 1100), { start: 20, end: 22 })
  // The gap after a band's bottom does not pull it in.
  assert.deepEqual(visibleRange(bands, 1045, 1100), { start: 21, end: 22 })
  const empty = visibleRange(bands, 99999, 100000)
  assert.ok(empty.end < empty.start)
  assert.deepEqual(visibleRange([], 0, 10), { start: 0, end: -1 })
})

// ── P3-1: wheel deltaMode ─────────────────────────────────────────────────
test('wheel deltas normalise to pixels across modes', () => {
  assert.equal(wheelPixels(3, 0, 20, 800), 3)
  assert.equal(wheelPixels(3, 1, 20, 800), 60)
  assert.equal(wheelPixels(1, 2, 20, 800), 800)
  assert.equal(wheelPixels(-2, 1, 20, 800), -40)
})

// ── P2-3: native scrollbar variables restored exactly ─────────────────────
function fakeStyle(initial) {
  const props = new Map(Object.entries(initial))
  return {
    getPropertyValue: (n) => (props.has(n) ? props.get(n).value : ''),
    getPropertyPriority: (n) => (props.has(n) ? props.get(n).priority : ''),
    setProperty: (n, v, p = '') => props.set(n, { value: v, priority: p }),
    removeProperty: (n) => props.delete(n),
    dump: () => Object.fromEntries(props),
  }
}

test('thumb suppressor hands back pre-existing inline values and priorities', () => {
  const names = ['--a', '--b']
  const el = { style: fakeStyle({ '--a': { value: 'red', priority: 'important' } }) }
  const thumb = createThumbSuppressor(names)
  thumb.hold(el)
  assert.equal(el.style.getPropertyValue('--a'), 'transparent')
  assert.equal(el.style.getPropertyValue('--b'), 'transparent')
  thumb.release()
  assert.deepEqual(el.style.dump(), { '--a': { value: 'red', priority: 'important' } })
  assert.equal(thumb.held(), null)
})

test('thumb suppressor restores the old element when the scroller is swapped', () => {
  const names = ['--a']
  const a = { style: fakeStyle({ '--a': { value: 'one', priority: '' } }) }
  const b = { style: fakeStyle({}) }
  const thumb = createThumbSuppressor(names)
  thumb.hold(a)
  thumb.hold(b)
  assert.equal(a.style.getPropertyValue('--a'), 'one')
  assert.equal(b.style.getPropertyValue('--a'), 'transparent')
  thumb.hold(b) // idempotent
  thumb.release()
  assert.deepEqual(b.style.dump(), {})
})

// ── prompts: append-origin user messages only, streamed ───────────────────
const ev = (seq, text, extra = {}) => JSON.stringify({
  type: 'user/message', seq, time: seq * 1000, surfaceOp: 'append',
  data: { id: 'm' + seq, source: { kind: 'user' }, content: [{ type: 'text', text }] },
  ...extra,
})

test('promptOf mirrors the host projection', () => {
  assert.deepEqual(promptOf(JSON.parse(ev(1, ' hi '))), { seq: 1, time: 1000, text: 'hi' })
  assert.equal(promptOf(JSON.parse(ev(2, 'x', { surfaceOp: { op: 'replace', start: 1, end: 2 } }))), null)
  const plugin = JSON.parse(ev(3, 'ctx'))
  plugin.data.source = { kind: 'plugin', plugin: 'compact' }
  assert.equal(promptOf(plugin), null)
  assert.equal(promptOf({ type: 'assistant/message', data: {} }), null)
  // Legacy logs without a marker still count.
  const legacy = JSON.parse(ev(4, 'old'))
  delete legacy.surfaceOp
  assert.equal(promptOf(legacy).text, 'old')
  const image = JSON.parse(ev(5, 'see'))
  image.data.content.push({ type: 'image' })
  assert.equal(promptOf(image).text, 'see🖼')
})

test('streaming parser matches whole-text parsing across chunk boundaries', () => {
  const lines = [ev(1, 'one'), '{"type":"assistant/message","seq":2}', 'garbage', ev(3, 'three'), ev(4, 'four')]
  const text = lines.join('\n') + '\n'
  const whole = parsePrompts(text)
  assert.deepEqual(whole.map((p) => p.seq), [1, 3, 4])
  for (const size of [1, 7, 33, 1000]) {
    const parser = createPromptParser()
    for (let i = 0; i < text.length; i += size) parser.push(text.slice(i, i + size))
    assert.deepEqual(parser.end(), whole, 'chunk size ' + size)
  }
  // No trailing newline: the last line still counts.
  assert.equal(parsePrompts(lines.join('\n')).length, 3)
})

// ── P1-3 / P1-4: session-scoped prompt store ──────────────────────────────
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const rows = (...keys) => keys.map((key, i) => ({ key, time: i, text: 'dom:' + key }))
const full = (n) => Array.from({ length: n }, (_, i) => ({ seq: i + 1, time: 0, text: 'log:' + (i + 1) }))

test('store: cache stays valid across prepends, staling only on append', async () => {
  let session = 'A'
  let clock = 0
  const pending = []
  const store = createPromptStore({
    fetchPrompts: () => {
      const d = deferred()
      pending.push(d)
      return d.promise
    },
    getSessionId: () => session,
    now: () => clock,
  })
  // 100 prompts in the log, 20 loaded.
  let loaded = rows(...Array.from({ length: 20 }, (_, i) => 'k' + (81 + i)))
  const first = store.get('A', loaded, () => loaded)
  assert.equal(first.complete, false)
  assert.equal(first.prompts.length, 20)
  assert.equal(first.prompts[0].text, 'dom:k81')
  pending[0].resolve(full(100))
  assert.equal(await first.pending, await first.pending)
  const list = await first.pending
  assert.equal(list.length, 100)
  // Prepend 30 more rows: the tail is unchanged, the cache still covers it.
  loaded = rows(...Array.from({ length: 50 }, (_, i) => 'k' + (51 + i)))
  const afterPrepend = store.get('A', loaded, () => loaded)
  assert.equal(afterPrepend.complete, true)
  assert.equal(afterPrepend.prompts, list)
  assert.equal(pending.length, 1)
  // Append one message: the old tail is no longer the last row; the new
  // row is grafted from the DOM, no refetch.
  loaded = loaded.concat(rows('k101'))
  const afterAppend = store.get('A', loaded, () => loaded)
  assert.equal(afterAppend.complete, true)
  assert.equal(afterAppend.prompts.length, 101)
  assert.equal(afterAppend.prompts[100].text, 'dom:k101')
  assert.equal(afterAppend.prompts[99].text, 'log:100')
  assert.equal(pending.length, 1)
  // The count alone would have said "fresh" here too — the key says stale.
  const replaced = rows(...Array.from({ length: 21 }, (_, i) => 'z' + i))
  const stale = store.get('A', replaced, () => replaced)
  assert.equal(stale.complete, false)
  assert.equal(pending.length, 2)
})

test('store: a late response from the previous session never lands', async () => {
  let session = 'A'
  const pending = []
  const store = createPromptStore({
    fetchPrompts: (sessionId) => {
      const d = deferred()
      pending.push({ sessionId, d })
      return d.promise
    },
    getSessionId: () => session,
    now: () => 0,
  })
  const rowsA = rows('a1', 'a2')
  const reqA = store.get('A', rowsA, () => rowsA)
  session = 'B'
  store.invalidate('B')
  const rowsB = rows('b1')
  const reqB = store.get('B', rowsB, () => rowsB)
  assert.equal(pending.length, 2)
  // A finishes AFTER B was requested.
  pending[1].d.resolve(full(1))
  pending[0].d.resolve(full(2))
  assert.equal(await reqA.pending, null)
  const listB = await reqB.pending
  assert.equal(listB.length, 1)
  assert.equal(store.peek().sessionId, 'B')
  // B's cache survived A's late completion.
  assert.equal(store.get('B', rowsB, () => rowsB).complete, true)
})

test('store: a superseded request is aborted and cannot clear the newer one', async () => {
  const signals = []
  const pending = []
  let session = 'A'
  const store = createPromptStore({
    fetchPrompts: (sessionId, signal) => {
      signals.push(signal)
      const d = deferred()
      pending.push(d)
      return d.promise
    },
    getSessionId: () => session,
    now: () => 0,
  })
  const r = rows('x')
  store.get('A', r, () => r)
  session = 'B'
  store.invalidate('B')
  assert.equal(signals[0].aborted, true)
  const rb = rows('y')
  const reqB = store.get('B', rb, () => rb)
  pending[0].reject(new Error('aborted'))
  await Promise.resolve()
  await Promise.resolve()
  // B's request is still the live one; the same call returns the same task.
  assert.equal(store.get('B', rb, () => rb).pending, reqB.pending)
})

test('store: failures back off instead of refetching on every hover', async () => {
  let clock = 0
  let calls = 0
  const store = createPromptStore({
    fetchPrompts: () => {
      calls += 1
      return Promise.reject(new Error('export 500'))
    },
    getSessionId: () => 'A',
    now: () => clock,
  })
  const r = rows('x')
  assert.equal(await store.get('A', r, () => r).pending, null)
  assert.equal(store.get('A', r, () => r).pending, null)
  assert.equal(calls, 1)
  clock = 2500
  await store.get('A', r, () => r).pending
  assert.equal(calls, 2)
  clock = 5000
  store.get('A', r, () => r)
  assert.equal(calls, 2, 'second backoff doubled to 4s')
})

// ── P2-1: history loader ──────────────────────────────────────────────────
function fakeHost({ pages = Infinity, grow = 500, latency = 1, stallAfter = Infinity } = {}) {
  let height = 1000
  let clock = 0
  let remaining = pages
  let queued = 0
  let clicks = 0
  const button = { click() { clicks += 1; if (remaining > 0 && clicks <= stallAfter) queued = latency } }
  const deps = {
    button: () => (remaining > 0 ? button : null),
    height: () => height,
    now: () => clock,
    wait: async (ms) => {
      clock += ms
      if (queued > 0) {
        queued -= 1
        if (queued === 0) {
          height += grow
          remaining -= 1
        }
      }
    },
    onPage: () => {},
    pagesLanded: () => pages - remaining,
    clicks: () => clicks,
  }
  return deps
}

test('loader: reaches the goal and reports done', async () => {
  const host = fakeHost({ pages: 10 })
  const loader = createHistoryLoader(host)
  const progress = []
  const result = await loader.run('zoom', () => host.height() < 2500, (p) => progress.push(p))
  assert.deepEqual(result, { status: 'done', pages: 3 })
  assert.deepEqual(progress, [1, 2, 3])
  assert.equal(loader.active(), null)
})

test('loader: a page with no progress stops the chain at once', async () => {
  const host = fakeHost({ pages: 10, stallAfter: 2 })
  const loader = createHistoryLoader(host)
  const result = await loader.run('jump', () => true)
  assert.equal(result.status, 'stalled')
  assert.equal(result.pages, 2)
  assert.equal(host.clicks(), 3, 'one click that timed out, not sixty')
})

test('loader: the page cap is reported, not swallowed as success', async () => {
  const host = fakeHost({ pages: Infinity })
  const loader = createHistoryLoader(host)
  const result = await loader.run('zoom', () => true)
  assert.equal(result.status, 'capped')
  assert.equal(result.pages, LOAD_PAGE_CAP)
})

test('loader: running out of pager before the goal is exhausted', async () => {
  const host = fakeHost({ pages: 2 })
  const loader = createHistoryLoader(host)
  const result = await loader.run('jump', () => true)
  assert.deepEqual(result, { status: 'exhausted', pages: 2 })
})

test('loader: cancel (mode/session switch) ends the chain and frees the owner', async () => {
  const host = fakeHost({ pages: 10, latency: 3 })
  const loader = createHistoryLoader(host)
  const task = loader.run('zoom', () => true)
  assert.equal(loader.active().kind, 'zoom')
  loader.cancel()
  const result = await task
  assert.equal(result.status, 'cancelled')
  assert.equal(loader.active(), null)
})

test('loader: a new run supersedes the active one instead of being dropped', async () => {
  const host = fakeHost({ pages: 10, latency: 3 })
  const loader = createHistoryLoader(host)
  const auto = loader.run('auto', () => true)
  let want = 2
  const zoom = loader.run('zoom', () => want-- > 0)
  assert.equal(loader.active().kind, 'zoom')
  assert.equal((await auto).status, 'cancelled')
  assert.equal((await zoom).status, 'done')
})

// ── P2-2: pagers keep their rows ──────────────────────────────────────────
test('wall pagers reserve their height while hidden', () => {
  const rule = CSS.match(/\.dsh-strata-wallpager \{([^}]*)\}/)[1]
  assert.match(rule, /visibility:\s*hidden/)
  assert.doesNotMatch(rule, /display:\s*none/)
  assert.match(CSS, /\.dsh-strata-wallpager\[data-on="1"\]\s*\{[^}]*visibility:\s*visible/)
})
