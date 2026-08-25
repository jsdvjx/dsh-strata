export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export async function connect() {
  const list = await (await fetch('http://localhost:9333/json/list')).json()
  let page = list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:3080'))
  if (!page) page = await (await fetch('http://localhost:9333/json/new?about:blank', { method: 'PUT' })).json()
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  let id = 0
  const pending = new Map()
  const errors = []
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id !== undefined) {
      const p = pending.get(msg.id); pending.delete(msg.id)
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
      return
    }
    if (msg.method === 'Runtime.exceptionThrown') errors.push('EXC ' + JSON.stringify(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text).slice(0, 400))
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
      if (/strata/i.test(text)) errors.push('CONSOLE ' + text.slice(0, 300))
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const myId = ++id; pending.set(myId, { resolve, reject }); ws.send(JSON.stringify({ id: myId, method, params }))
  })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    return r.result.value
  }
  await send('Runtime.enable')
  await send('Page.enable')
  const close = () => { ws.close() }
  return { send, evaluate, errors, close, wasNew: !list.find((t) => t.url.startsWith('http://localhost:3080')) }
}
export const STATE = `(() => {
  const root = document.querySelector('.dsh-strata-root')
  const rail = root && root.querySelector('.dsh-strata-rail')
  const sc = document.querySelector('[data-conversation-scroll]')
  return {
    show: root && root.dataset.show, expanded: root && root.dataset.expanded, loading: root && root.dataset.loading, loadstate: root && root.dataset.loadstate,
    railRect: rail && rail.getBoundingClientRect().toJSON(),
    anchors: root ? root.querySelectorAll('.dsh-strata-anchor').length : -1,
    userDots: root ? root.querySelectorAll('.dsh-strata-anchor[data-tone="user"]').length : -1,
    rows: document.querySelectorAll('[data-chat-anchor-key]').length,
    users: document.querySelectorAll('[data-chat-flow-kind="user"],[data-chat-flow-kind="steering"]').length,
    scrollTop: sc && sc.scrollTop, scrollHeight: sc && sc.scrollHeight, clientHeight: sc && sc.clientHeight,
    zoom: root ? Array.from(root.querySelectorAll('.dsh-strata-zoom button')).map(b => b.dataset.zoom + ':' + b.dataset.active).join(',') : '',
    older: root && root.querySelector('.dsh-strata-older').dataset.available,
    olderBtn: !!Array.from(document.querySelectorAll('[data-conversation-scroll] button')).find(b => /加载更早|load\\s?older|earlier/i.test(b.textContent)),
    loadbar: root && root.querySelector('.dsh-strata-loadbar').style.width,
    wallShow: document.querySelector('.dsh-strata-wall')?.dataset.show,
    cards: document.querySelectorAll('.dsh-strata-wallcard').length,
    cardsOn: document.querySelectorAll('.dsh-strata-wallcard[data-on="1"]').length,
    unloadedOn: document.querySelectorAll('.dsh-strata-wallcard[data-on="1"][data-loaded="0"]').length,
    paths: document.querySelectorAll('.dsh-strata-walllink path').length,
    pagers: Array.from(document.querySelectorAll('.dsh-strata-wallpager')).map(p => p.dataset.on).join(''),
    title: document.querySelector('.dsh-strata-walltitle')?.textContent,
  }
})()`
export const CONSISTENCY = `(() => {
  const root = document.querySelector('.dsh-strata-root')
  const canvas = root.querySelector('.dsh-strata-canvas')
  const g = canvas.getContext('2d')
  const ratio = window.devicePixelRatio || 1
  const dots = Array.from(root.querySelectorAll('.dsh-strata-anchor[data-tone="user"]'))
  let hit = 0, miss = 0, sample = []
  for (const dot of dots) {
    const y = parseFloat(dot.style.top)
    const px = g.getImageData(canvas.width - 2, Math.max(0, Math.min(canvas.height - 1, Math.round(y * ratio))), 1, 1).data
    if (px[3] > 40) hit += 1; else { miss += 1; if (sample.length < 4) sample.push(Math.round(y)) }
  }
  return { dots: dots.length, hit, miss, sample }
})()`
