// Headless replay of dsh-strata against a LIVE `dsh web` (read-only).
//
// Prerequisites:
//   1. `dsh web --port 3080` running with this plugin linked into the profile.
//   2. Chrome with remote debugging:
//      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//        --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/strata-chrome \
//        --window-size=1400,900 --no-first-run about:blank
//      (do NOT pass --virtual-time-budget: the SSE stream hangs it)
//   3. node test/replay/replay.mjs [session-title-regex]
//      The session should be long enough to have a "Load earlier" pager; the
//      default regex picks the first row whose title matches.
//
// What it checks: the wall lists the whole log, an unloaded-card jump chain
// loads and lands, the wall reopens afterwards (busy flag released), paging
// to the top keeps the DOM bounded, a jump to prompt #1 ends honestly (pager
// exhausted or amber "incomplete"), every card is loaded after a full load,
// and no runtime exceptions were thrown.
import { connect, sleep, STATE, CONSISTENCY } from './cdplib.mjs'
const { send, evaluate, errors, close, wasNew } = await connect()
const log = (...a) => console.log(...a)
const check = (name, ok, detail = '') => log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''))
const state = () => evaluate(STATE)
const keyEsc = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }) }
const pattern = process.argv[2] || '.'
if (wasNew) { await send('Page.navigate', { url: 'http://localhost:3080/' }); await sleep(3000) }
await evaluate(`new Promise((r) => { const t = setInterval(() => { if (document.querySelector('[class*=sessionRow]')) { clearInterval(t); r() } }, 100); setTimeout(r, 8000) })`)
for (let t = 0; t < 4; t += 1) { const n = await evaluate(`(() => { const els = Array.from(document.querySelectorAll('button, [role=button], div, span')).filter(e => e.children.length === 0 && /展开其余|Show .* more/i.test(e.textContent)); els.forEach(e => e.click()); return els.length })()`); await sleep(400); if (n === 0) break }
const row = await evaluate(`Array.from(document.querySelectorAll('[class*=sessionRow]')).findIndex(r => new RegExp(${JSON.stringify(pattern)}).test(r.textContent))`)
if (row === -1) { console.log('no session row matches', pattern); process.exit(2) }
await evaluate(`document.querySelectorAll('[class*=sessionRow]')[${row}].click()`)
await sleep(2500)
await evaluate(`document.querySelector('.dsh-strata-zoom button[data-zoom="init"]').click()`)
await sleep(500)
let s = await state()
log('session:', JSON.stringify({ rows: s.rows, users: s.users, older: s.older, h: s.scrollHeight }))
const rx = s.railRect.x + s.railRect.width / 2
const openWall = async () => {
  s = await state()
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rx, y: s.railRect.y + 5 })
  await sleep(200)
  for (let y = 4; y < s.railRect.height - 4; y += 3) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rx, y: s.railRect.y + y })
    await sleep(25)
    if ((await evaluate(`document.querySelector('.dsh-strata-wall').dataset.show`)) === '1') return true
  }
  return false
}
const jumpChain = async (selector, maxWait) => {
  const before = await state()
  const idx = await evaluate(`document.querySelector('${selector}')?.dataset.wallIndex`)
  await evaluate(`document.querySelector('${selector}').click()`)
  let sawLoading = false, endState = '', ticks = 0
  for (; ticks < maxWait / 250; ticks += 1) {
    await sleep(250)
    const st = await state()
    if (st.loading === '1') sawLoading = true
    if (st.loadstate) endState = st.loadstate
    if (sawLoading && st.loading === '0') break
  }
  await sleep(1800)
  const after = await state()
  return { idx, sawLoading, endState, before, after, seconds: ticks / 4 }
}
let opened = await openWall()
await sleep(3000)
s = await state()
log('wall:', JSON.stringify({ title: s.title, cards: s.cards, cardsOn: s.cardsOn, unloadedOn: s.unloadedOn, pagers: s.pagers }))
check('wall shows the whole log beyond the loaded window', opened && s.unloadedOn > 0, 'unloadedOn=' + s.unloadedOn)
if (s.unloadedOn > 0) {
  // Nearest unloaded card = highest index among unloaded visible ones.
  const nearest = await evaluate(`Array.from(document.querySelectorAll('.dsh-strata-wallcard[data-on="1"][data-loaded="0"]')).map(c => Number(c.dataset.wallIndex)).sort((a,b) => b-a)[0]`)
  const r = await jumpChain(`.dsh-strata-wallcard[data-wall-index="${nearest}"]`, 120000)
  log('jump nearest #' + r.idx + ':', JSON.stringify({ sawLoading: r.sawLoading, endState: r.endState, secs: r.seconds, rows: r.before.rows + ' -> ' + r.after.rows, scroll: Math.round(r.before.scrollTop) + ' -> ' + Math.round(r.after.scrollTop), wall: r.after.wallShow, loading: r.after.loading }))
  check('nearest unloaded jump: chain done, wall closed, landed', r.sawLoading && r.endState === '' && r.after.wallShow === '0' && r.after.loading === '0' && r.after.rows > r.before.rows)
  // The flashed row should be near the reading line: the target card's index maps to a loaded user row now.
  const landed = await evaluate(`(() => { const sc = document.querySelector('[data-conversation-scroll]'); const rows = Array.from(sc.querySelectorAll('[data-chat-flow-kind="user"],[data-chat-flow-kind="steering"]')); const scr = sc.getBoundingClientRect(); const near = rows.filter(r => { const b = r.getBoundingClientRect(); return b.top >= scr.top - 5 && b.top <= scr.top + sc.clientHeight * 0.4 }); return near.length })()`)
  check('a user row sits at the reading line after the jump', landed > 0, 'near=' + landed)
  const c = await evaluate(CONSISTENCY)
  check('canvas/dots consistent after the chain', c.miss === 0, JSON.stringify(c))

  // Reopen, page to the very top, jump to prompt #1 — the long chain must end
  // honestly (done with pager exhausted, or amber incomplete on cap/stall).
  opened = await openWall()
  await sleep(800)
  check('wall reopens after the chain (wallBusy released)', opened)
  for (let t = 0; t < 40; t += 1) {
    const pagers = await evaluate(`Array.from(document.querySelectorAll('.dsh-strata-wallpager')).map(p => p.dataset.on)`)
    if (pagers[0] !== '1') break
    await evaluate(`document.querySelectorAll('.dsh-strata-wallpager')[0].click()`)
    await sleep(300)
  }
  // Cards are created on demand, so DOM order is not index order: the
  // window's first card is the SMALLEST index among the cards that are on.
  const first = await evaluate(`String(Math.min(...Array.from(document.querySelectorAll('.dsh-strata-wallcard[data-on="1"]')).map(c => Number(c.dataset.wallIndex))))`)
  const cards = await state()
  log('top of wall:', JSON.stringify({ first, cards: cards.cards, cardsOn: cards.cardsOn, pagers: cards.pagers }))
  check('paged to the top of the wall with bounded DOM', first === '0' && cards.cards <= cards.cardsOn + 14)
  const r2 = await jumpChain(`.dsh-strata-wallcard[data-wall-index="0"]`, 300000)
  log('jump #1:', JSON.stringify({ sawLoading: r2.sawLoading, endState: r2.endState, secs: r2.seconds, rows: r2.before.rows + ' -> ' + r2.after.rows, older: r2.after.older, olderBtn: r2.after.olderBtn, scroll: Math.round(r2.after.scrollTop), wall: r2.after.wallShow, loading: r2.after.loading }))
  const honest = (r2.endState === '' && r2.after.older === '0') || r2.endState === 'incomplete'
  // A short session may already be fully on hand after the first chain; then
  // there is nothing to load and the jump is a plain one.
  const loadedOrNothingLeft = r2.sawLoading || r2.before.older === '0'
  check('jump to #1 ends honestly (done+exhausted or incomplete)', loadedOrNothingLeft && r2.after.loading === '0' && honest)
  if (r2.endState === '') check('#1 landed at the top of the transcript', r2.after.scrollTop < 200, 'scrollTop=' + Math.round(r2.after.scrollTop))
  opened = await openWall()
  await sleep(2500)
  s = await state()
  log('wall after full load:', JSON.stringify({ title: s.title, users: s.users, cards: s.cards, cardsOn: s.cardsOn, unloadedOn: s.unloadedOn, pagers: s.pagers }))
  check('after full load every card is loaded (no unloaded cards)', opened && s.unloadedOn === 0 && Number(s.title.match(/(\d+)/)[1]) === s.users, s.title + ' vs users ' + s.users)
  await keyEsc()
}
log('errors:', errors.length ? errors.join('\n') : 'none')
check('no runtime exceptions or strata console errors', errors.length === 0)
close(); process.exit(0)
