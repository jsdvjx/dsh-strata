// Browser half of dsh-strata, hand-authored in the factory format
// dsh-client-modules serves (same shape tsdown emits, no build step).
//
// What it contributes: one `shell.overlay` entry that paints a minimap of the
// loaded conversation over the right edge of the transcript scrollport.
//
// Data channel: none. Geometry and semantics both come from the anchors the
// conversation view already publishes — `[data-conversation-scroll]` for the
// scrollport, `[data-chat-anchor-key]` for each flow row, `data-chat-flow-kind`
// for that row's registered Chat Node kind, `[data-composer-seat]` for the
// sticky composer to stay clear of. Reading layout instead of session state is
// what makes this a minimap rather than a tick rail: a band's height is the
// row's REAL rendered height, so the map is a proportional compression of the
// scroll extent and the lens maps 1:1 onto scrollTop.
window.__ModuleLoader__.load({
  id: 'dsh-strata',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const react = require('react')
    const h = react.createElement

    const ID = 'dsh-strata'

    // The rail replaces the native scrollbar, so its resting width is the
    // reserved gutter plus a couple of pixels of the padding beside it.
    const REST_W_MIN = 12
    const HOVER_W = 26
    // Strip left of the rail holding the clickable anchor dots.
    const ANCHOR_W = 14
    // Two anchors closer than this collapse to one; errors and compaction
    // boundaries are never dropped, they are the reason to look.
    const ANCHOR_MIN_GAP = 7
    const PAD = 10
    const MIN_RAIL_H = 80
    // Below this the transcript barely scrolls and a map buys nothing.
    const SHOW_RATIO = 1.06
    const PIN_KEY = 'dsh-strata.pinned'
    // The theme's documented scrollbar seam: rebinding this pair to
    // `transparent` on a scrolling element draws no thumb on either engine
    // path while the gutter stays reserved (ui-sidebar uses the same seam).
    const THUMB_VARS = ['--dsh-scrollbar-thumb', '--dsh-scrollbar-thumb-hover']
    // Kinds that earn a clickable anchor dot beside the rail.
    const ANCHOR_TONES = {
      'user': 'user',
      'steering': 'user',
      'turn-error': 'error',
      'compaction': 'mark',
      'manual-compaction': 'mark',
    }

    // ── styles ────────────────────────────────────────────────────────────
    // Doubled class selectors buy specificity over the overlay layer's
    // `.overlayLayer > *` pointer-events rule, whose stylesheet order relative
    // to this tag is not guaranteed.
    const CSS = `
.dsh-strata-root.dsh-strata-root {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity .16s ease;
  /* Semantic, not decorative: blue is you, green is a command you ran, amber
     is trouble the run recovered from, red is failure, grey is the agent
     working. The brand and label-bluish tokens are NOT usable here — both
     resolve to near-white in the dark theme, which is exactly the emphasis the
     user rows need to own. */
  --dsh-strata-user: var(--dsw-alias-state-business-primary, #679efe);
  --dsh-strata-assistant: var(--dsw-alias-label-tertiary, #adb2b8);
  --dsh-strata-tool: var(--dsw-alias-label-caption, #81858c);
  --dsh-strata-command: var(--dsw-alias-state-success-primary, #22c55e);
  /* label-secondary would invert prominence between themes (it is the DARKEST
     grey in light mode), and an injected context row should stay quiet in
     both — so it shares the assistant tone and separates by width and alpha. */
  --dsh-strata-context: var(--dsw-alias-label-tertiary, #adb2b8);
  --dsh-strata-warn: var(--dsw-alias-state-warn-primary, #f59e0b);
  --dsh-strata-error: var(--dsw-alias-state-error-primary, #f25a5a);
  --dsh-strata-mark: var(--dsw-alias-label-caption, #81858c);
}
.dsh-strata-root.dsh-strata-root[data-show="1"] { opacity: 1; }
/* Hidden means gone, not merely invisible: a transparent rail still sitting in
   the gutter would swallow clicks meant for the scrollbar it just handed back. */
.dsh-strata-root[data-show="0"] .dsh-strata-rail.dsh-strata-rail,
.dsh-strata-root[data-show="0"] .dsh-strata-anchor.dsh-strata-anchor { pointer-events: none; }
.dsh-strata-rail.dsh-strata-rail {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  pointer-events: auto;
  touch-action: none;
  cursor: pointer;
  border-radius: 7px;
  background: transparent;
  transition: background .16s ease;
}
.dsh-strata-anchors {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  pointer-events: none;
}
.dsh-strata-anchor.dsh-strata-anchor {
  position: absolute;
  right: 3px;
  width: 7px;
  height: 7px;
  margin: -3.5px 0 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: currentColor;
  color: var(--dsh-strata-user);
  opacity: .7;
  cursor: pointer;
  pointer-events: auto;
  transition: opacity .12s ease, transform .12s ease;
}
/* Generous invisible hit box: a 7px dot is a poor click target on its own. */
.dsh-strata-anchor.dsh-strata-anchor::before {
  content: "";
  position: absolute;
  inset: -6px -7px;
}
.dsh-strata-anchor.dsh-strata-anchor:hover,
.dsh-strata-anchor.dsh-strata-anchor[data-active="1"] {
  opacity: 1;
  transform: scale(1.4);
}
.dsh-strata-anchor.dsh-strata-anchor[data-tone="error"] { color: var(--dsh-strata-error); }
.dsh-strata-anchor.dsh-strata-anchor[data-tone="mark"] {
  color: var(--dsh-strata-mark);
  width: 10px;
  height: 3px;
  margin-top: -1.5px;
  border-radius: 1px;
  opacity: .55;
}
.dsh-strata-root[data-expanded="1"] .dsh-strata-rail.dsh-strata-rail {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 134, 142, .12));
}
.dsh-strata-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: .8;
  transition: opacity .16s ease;
}
.dsh-strata-root[data-expanded="1"] .dsh-strata-canvas { opacity: 1; }
.dsh-strata-lens {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  border-radius: 5px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 134, 142, .45));
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 134, 142, .14));
  pointer-events: none;
}
.dsh-strata-older {
  position: absolute;
  left: 50%;
  top: -13px;
  transform: translateX(-50%);
  display: none;
  width: 18px;
  height: 12px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #8b9099);
  cursor: pointer;
  line-height: 1;
  font-size: 10px;
}
.dsh-strata-older:hover { color: var(--dsw-alias-label-primary, #1c1e21); }
.dsh-strata-root[data-expanded="1"] .dsh-strata-older[data-available="1"] { display: block; }
.dsh-strata-card {
  position: absolute;
  right: calc(100% + 10px);
  top: 0;
  width: 264px;
  box-sizing: border-box;
  padding: 8px 10px 9px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128, 134, 142, .3));
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-3, #22242a);
  box-shadow: 0 6px 20px rgba(0, 0, 0, .18);
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s ease;
}
.dsh-strata-card[data-show="1"] { opacity: 1; }
.dsh-strata-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  color: var(--dsw-alias-label-tertiary, #8b9099);
  font-size: 11px;
  line-height: 16px;
}
.dsh-strata-dot { width: 7px; height: 7px; border-radius: 2px; flex: none; }
.dsh-strata-card-body {
  color: var(--dsw-alias-label-primary, #e8eaed);
  font-size: 12px;
  line-height: 17px;
  max-height: 102px;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-strata-root.dsh-strata-root, .dsh-strata-canvas, .dsh-strata-card { transition: none; }
}
`
    const cssTagId = ID + '/minimap.css'
    if (typeof document !== 'undefined'
      && document.querySelector('style[data-plugin-css=' + JSON.stringify(cssTagId) + ']') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = ID
      tag.dataset.pluginCss = cssTagId
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ── paint table ───────────────────────────────────────────────────────
    // Keyed by `data-chat-flow-kind` — the registered Chat Node kinds. `width`
    // is a fraction of the rail: user turns take the full width and everything
    // the agent did indents from the right, so the ragged left edge IS the
    // "what did I ask" index, readable without hovering anything.
    const SPECS = {
      'user': { tone: 'user', width: 1, min: 5, round: 2.5, alpha: 1 },
      'steering': { tone: 'user', width: 0.8, min: 4, round: 2, alpha: 0.95 },
      'assistant-step': { tone: 'assistant', width: 0.55, min: 2, round: 1, alpha: 0.5 },
      'turn-tail': { tone: 'assistant', width: 0.55, min: 1, round: 1, alpha: 0.4 },
      'tool-call': { tone: 'tool', width: 0.3, min: 1.5, round: 1, alpha: 0.85 },
      'command': { tone: 'command', width: 0.45, min: 2, round: 1, alpha: 0.9 },
      'context': { tone: 'context', width: 0.42, min: 2, round: 1, alpha: 0.45 },
      'model-retry': { tone: 'warn', width: 0.6, min: 2, round: 1, alpha: 0.95 },
      'turn-error': { tone: 'error', width: 1, min: 3, round: 1, alpha: 1 },
      'turn-max-tokens': { tone: 'warn', width: 1, min: 3, round: 1, alpha: 0.95 },
      'compaction': { tone: 'mark', width: 1, min: 2, rule: true, alpha: 0.8 },
      'manual-compaction': { tone: 'mark', width: 1, min: 2, rule: true, alpha: 0.8 },
      'unknown': { tone: 'assistant', width: 0.3, min: 1.5, round: 1, alpha: 0.5 },
    }
    const FALLBACK = { tone: 'assistant', width: 0.3, min: 1.5, round: 1, alpha: 0.5 }
    const TONES = ['user', 'assistant', 'tool', 'command', 'context', 'warn', 'error', 'mark']

    const DICT = {
      zh: {
        'user': '我的消息',
        'steering': '插话',
        'assistant-step': '模型回复',
        'turn-tail': '回合小结',
        'tool-call': '工具调用',
        'command': '命令',
        'context': '上下文注入',
        'model-retry': '模型重试',
        'turn-error': '回合失败',
        'turn-max-tokens': '输出被截断',
        'compaction': '上下文压缩',
        'manual-compaction': '手动压缩',
        'unknown': '未知事件',
        'older': '载入更早的历史',
        'empty': '（无文本）',
      },
      en: {
        'user': 'Your message',
        'steering': 'Steering',
        'assistant-step': 'Model reply',
        'turn-tail': 'Turn tail',
        'tool-call': 'Tool call',
        'command': 'Command',
        'context': 'Context injection',
        'model-retry': 'Model retry',
        'turn-error': 'Turn failed',
        'turn-max-tokens': 'Output capped',
        'compaction': 'Compaction',
        'manual-compaction': 'Manual compaction',
        'unknown': 'Unknown event',
        'older': 'Load older history',
        'empty': '(no text)',
      },
    }

    /**
     * Pick the dictionary once per page: the shell's locale is not a service
     * this plugin injects, and the document language is what it renders in.
     * @returns the label table for the current language.
     */
    function dictionary() {
      const lang = String(document.documentElement.lang || navigator.language || 'en').toLowerCase()
      return lang.indexOf('zh') === 0 ? DICT.zh : DICT.en
    }

    /**
     * Clamp a number into a closed range.
     * @param value - raw value.
     * @param min - lower bound.
     * @param max - upper bound.
     * @returns the bounded value.
     */
    function clamp(value, min, max) {
      return value < min ? min : value > max ? max : value
    }

    /**
     * Whether a flow kind is one of the user's own contributions — the two
     * kinds the map emphasises (full width, floor height, painted last).
     * @param kind - the row's `data-chat-flow-kind`.
     * @returns true for user-authored rows.
     */
    function isUserKind(kind) {
      return kind === 'user' || kind === 'steering'
    }

    /**
     * Mount the imperative minimap engine onto the slot entry's root element.
     *
     * Everything below the React seam is plain DOM: the map re-reads layout on
     * scroll and mutation, and a canvas keeps repaints off the layout path
     * while a turn streams.
     * @param root - the entry's own element (already in the overlay layer).
     * @returns disposer removing every listener, observer and timer.
     */
    function mountMinimap(root) {
      const doc = root.ownerDocument
      const T = dictionary()

      const rail = doc.createElement('div')
      rail.className = 'dsh-strata-rail'
      const canvas = doc.createElement('canvas')
      canvas.className = 'dsh-strata-canvas'
      const lens = doc.createElement('div')
      lens.className = 'dsh-strata-lens'
      const older = doc.createElement('button')
      older.className = 'dsh-strata-older'
      older.type = 'button'
      older.title = T.older
      older.textContent = '⌃'
      const card = doc.createElement('div')
      card.className = 'dsh-strata-card'
      const cardHead = doc.createElement('div')
      cardHead.className = 'dsh-strata-card-head'
      const cardDot = doc.createElement('span')
      cardDot.className = 'dsh-strata-dot'
      const cardKind = doc.createElement('span')
      const cardBody = doc.createElement('div')
      cardBody.className = 'dsh-strata-card-body'
      cardHead.append(cardDot, cardKind)
      card.append(cardHead, cardBody)
      const anchorsEl = doc.createElement('div')
      anchorsEl.className = 'dsh-strata-anchors'
      anchorsEl.style.width = ANCHOR_W + 'px'
      rail.append(canvas, lens, older)
      root.append(anchorsEl, rail, card)

      const g = canvas.getContext('2d')

      let scroller = null
      let bands = []
      let anchorCandidates = []
      let anchorEntries = []
      let anchorSignature = ''
      let activeAnchor = -1
      let thumbHidden = false
      let userTotal = 0
      let contentHeight = 1
      let railH = 0
      let railW = REST_W_MIN
      let structureDirty = true
      let lastScrollHeight = -1
      let hoverIndex = -1
      let dragging = false
      let expanded = false
      let pinned = false
      let frame = 0
      let colors = null
      let colorStamp = null
      let canvasSignature = ''
      let olderButton = null
      let disposed = false

      try {
        pinned = window.localStorage.getItem(PIN_KEY) === '1'
      } catch {
        // Private-mode storage refusal: the pin is a convenience, not state.
      }

      const schedule = () => {
        if (disposed || frame !== 0) return
        frame = window.requestAnimationFrame(paint)
      }
      const markDirty = () => {
        structureDirty = true
        schedule()
      }

      const resizeObserver = new ResizeObserver(markDirty)
      const flowObserver = new MutationObserver(markDirty)
      // The theme presenter writes resolved alias tokens onto body, so a theme
      // switch is an attribute mutation, not an event this plugin can hear.
      const themeObserver = new MutationObserver(() => {
        colorStamp = null
        canvasSignature = ''
        schedule()
      })
      themeObserver.observe(doc.body, { attributes: true, attributeFilter: ['style', 'data-ds-dark-theme', 'class'] })

      /**
       * Resolve (and re-bind to) the live transcript scrollport.
       *
       * The resident conversation shell keeps one scrollport across session
       * switches, but a composition change or remount can replace it, so the
       * binding is re-checked rather than captured once.
       * @returns true when a scrollport is bound.
       */
      function ensureScroller() {
        const found = doc.querySelector('[data-conversation-scroll]')
        if (found === scroller && found !== null && found.isConnected) return true
        if (scroller !== null) {
          suppressNativeThumb(false)
          scroller.removeEventListener('scroll', schedule)
          resizeObserver.disconnect()
          flowObserver.disconnect()
        }
        scroller = found
        if (scroller === null) return false
        scroller.addEventListener('scroll', schedule, { passive: true })
        resizeObserver.observe(scroller)
        flowObserver.observe(scroller, { childList: true, subtree: true, characterData: true })
        structureDirty = true
        return true
      }

      /**
       * Take over (or hand back) the transcript's own scrollbar.
       *
       * The map IS the scrollbar while it is up, so the native thumb would be
       * a second, redundant one in the same gutter. Rebinding the theme's
       * thumb pair to `transparent` is the documented seam for that and keeps
       * the gutter reserved, so nothing reflows. Handing it back on hide is
       * not optional: a view this map stands down on (Trajectory) must not be
       * left with no scrollbar at all.
       * @param on - whether the native thumb should be suppressed.
       */
      function suppressNativeThumb(on) {
        if (scroller === null || on === thumbHidden) return
        for (const name of THUMB_VARS) {
          if (on) scroller.style.setProperty(name, 'transparent')
          else scroller.style.removeProperty(name)
        }
        thumbHidden = on
      }

      /**
       * Read the tone palette out of the rail's computed custom properties, so
       * the canvas paints in whatever the active theme resolved.
       * @returns tone name -> CSS color.
       */
      function palette() {
        const stamp = (doc.body.dataset.dsDarkTheme || '') + '|' + (doc.body.getAttribute('style') || '').length
        if (colors !== null && colorStamp === stamp) return colors
        const computed = window.getComputedStyle(rail)
        const next = {}
        for (const tone of TONES) {
          next[tone] = computed.getPropertyValue('--dsh-strata-' + tone).trim() || '#8b9099'
        }
        colors = next
        colorStamp = stamp
        return colors
      }

      /**
       * Find the "load older" control, which sits in the scroll content above
       * the first flow row while the window is truncated. Absence simply means
       * the map already covers the whole session.
       * @param firstRow - the topmost anchored flow row, when one exists.
       * @returns the button, or null.
       */
      function findOlderButton(firstRow) {
        if (firstRow === undefined || firstRow === null) return null
        let positional = null
        for (const button of scroller.querySelectorAll('button')) {
          const relation = button.compareDocumentPosition(firstRow)
          // Only a control that precedes the first row can be the pager.
          if ((relation & Node.DOCUMENT_POSITION_FOLLOWING) === 0) continue
          // The pager's own label wins; position alone is the fallback, so a
          // future control injected above the flow cannot hijack the cap.
          if (/加载更早|load\s?older|earlier/i.test(button.textContent || '')) return button
          if (positional === null) positional = button
        }
        return positional
      }

      /**
       * Re-measure every flow row into content-space bands. Called on mutation
       * and on scroll-height change, never on plain scroll.
       */
      function rebuild() {
        const scrollerRect = scroller.getBoundingClientRect()
        const scrollTop = scroller.scrollTop
        const rows = scroller.querySelectorAll('[data-chat-anchor-key]')
        const next = []
        let users = 0
        for (const row of rows) {
          const rect = row.getBoundingClientRect()
          if (rect.height <= 0) continue
          const kind = row.dataset.chatFlowKind || 'unknown'
          const band = {
            el: row,
            kind,
            top: rect.top - scrollerRect.top + scrollTop,
            height: rect.height,
            // A failed tool or command marks its own row; the map borrows that
            // verdict rather than re-deriving one. `data-state` is the shared
            // convention (ToolRow, GenericCommandCard, StateDot) and the only
            // one that actually appears on a failed row — `data-error` exists
            // on inner IO text in a couple of renderers, so it is kept as a
            // secondary probe, never the primary one.
            error: row.querySelector('[data-state="error"], [data-error]') !== null,
            userIndex: -1,
          }
          if (isUserKind(kind)) {
            band.userIndex = users
            users += 1
          }
          const tone = band.error && !isUserKind(kind) ? 'error' : ANCHOR_TONES[kind]
          if (tone !== undefined) band.anchorTone = tone
          next.push(band)
        }
        bands = next
        userTotal = users
        anchorCandidates = []
        for (let index = 0; index < bands.length; index += 1) {
          if (bands[index].anchorTone !== undefined) anchorCandidates.push(index)
        }
        anchorSignature = ''
        contentHeight = Math.max(scroller.scrollHeight, 1)
        olderButton = findOlderButton(rows[0])
        older.dataset.available = olderButton === null ? '0' : '1'
      }

      /**
       * Park the rail against the scrollport's right edge, inside the gutter
       * the transcript reserves for its scrollbar and clear of the sticky
       * composer seat.
       */
      function layout() {
        const scrollerRect = scroller.getBoundingClientRect()
        const host = root.offsetParent || root.parentElement
        const hostRect = host === null ? { left: 0, top: 0 } : host.getBoundingClientRect()
        const seat = scroller.querySelector('[data-composer-seat]')
        const floor = seat === null
          ? scrollerRect.bottom
          : Math.min(scrollerRect.bottom, seat.getBoundingClientRect().top - 6)
        const barWidth = parseFloat(
          window.getComputedStyle(doc.body).getPropertyValue('--dsh-scrollbar-width'),
        )
        const gutter = Number.isFinite(barWidth) ? barWidth : 8
        const top = scrollerRect.top + PAD
        // The rail sits IN the scrollbar's own gutter (it replaces the thumb),
        // widening leftwards over the transcript's padding while hovered.
        railW = expanded ? HOVER_W : Math.max(REST_W_MIN, gutter + 4)
        railH = Math.max(MIN_RAIL_H, floor - top - PAD)
        const rootW = ANCHOR_W + railW
        rail.style.width = railW + 'px'
        anchorsEl.style.height = railH + 'px'
        root.style.width = rootW + 'px'
        root.style.height = railH + 'px'
        root.style.transform = 'translate('
          + Math.round(scrollerRect.right - hostRect.left - rootW - 1) + 'px, '
          + Math.round(top - hostRect.top) + 'px)'
      }

      /**
       * Rebuild the anchor dots beside the rail: one clickable target per
       * user turn, plus every failure and compaction boundary. Dots that would
       * collide are dropped — except failures and boundaries, which are the
       * reason someone reaches for the map in the first place.
       */
      function syncAnchors() {
        const kept = []
        let lastY = -Infinity
        for (const index of anchorCandidates) {
          const band = bands[index]
          const y = band.top * scale()
          if (y - lastY < ANCHOR_MIN_GAP && band.anchorTone === 'user') continue
          kept.push({ index, y, tone: band.anchorTone })
          lastY = y
        }
        const signature = kept.map((a) => a.index + '@' + Math.round(a.y) + a.tone).join(',')
        if (signature === anchorSignature) return
        anchorSignature = signature
        anchorsEl.textContent = ''
        anchorEntries = kept
        for (const anchor of kept) {
          const band = bands[anchor.index]
          const dot = doc.createElement('button')
          dot.type = 'button'
          dot.className = 'dsh-strata-anchor'
          dot.dataset.tone = anchor.tone
          dot.dataset.index = String(anchor.index)
          dot.style.top = Math.round(anchor.y) + 'px'
          const counted = band.userIndex >= 0 && userTotal > 1
          dot.title = (T[band.kind] || T.unknown)
            + (counted ? ' ' + (band.userIndex + 1) + '/' + userTotal : '')
          dot.setAttribute('aria-label', dot.title)
          anchorsEl.append(dot)
        }
        activeAnchor = -1
      }

      /**
       * Content-space -> rail-space scale for the current map.
       * @returns pixels of rail per pixel of transcript.
       */
      function scale() {
        return railH / contentHeight
      }

      /**
       * Rail-space geometry of one band, with the floor its kind declares so a
       * one-line prompt never compresses to nothing.
       * @param band - measured band.
       * @returns `{ y, h, spec }` in rail pixels.
       */
      function geometryOf(band) {
        const spec = SPECS[band.kind] || FALLBACK
        return { y: band.top * scale(), h: Math.max(spec.min, band.height * scale()), spec }
      }

      /** Repaint the band canvas; skipped while nothing that affects it changed. */
      function paintCanvas() {
        const tones = palette()
        const signature = [
          railW, railH, contentHeight, bands.length, hoverIndex, colorStamp,
        ].join(':')
        if (signature === canvasSignature) return
        canvasSignature = signature

        const ratio = window.devicePixelRatio || 1
        canvas.width = Math.max(1, Math.round(railW * ratio))
        canvas.height = Math.max(1, Math.round(railH * ratio))
        g.setTransform(ratio, 0, 0, ratio, 0, 0)
        g.clearRect(0, 0, railW, railH)

        // Two passes: the agent's work first, the user's turns over the top,
        // so an emphasised band is never buried by a long reply behind it.
        for (let pass = 0; pass < 2; pass += 1) {
          for (let index = 0; index < bands.length; index += 1) {
            const band = bands[index]
            if ((pass === 0) === isUserKind(band.kind)) continue
            const { y, h: height, spec } = geometryOf(band)
            const width = Math.max(2, railW * spec.width)
            const x = railW - width
            g.globalAlpha = index === hoverIndex ? 1 : spec.alpha
            g.fillStyle = band.error ? tones.error : tones[spec.tone]
            if (spec.rule === true) {
              // A compaction is a boundary, not a body: draw it as a rule so
              // "the model stopped seeing history here" reads at a glance.
              g.fillRect(0, Math.round(y) + 0.5, railW, 1)
              g.globalAlpha = 0.35
              g.fillRect(0, Math.round(y) + 2.5, railW, 1)
              continue
            }
            const radius = Math.min(spec.round, height / 2, width / 2)
            g.beginPath()
            if (typeof g.roundRect === 'function') {
              g.roundRect(x, y, width, height, radius)
            } else {
              g.rect(x, y, width, height)
            }
            g.fill()
          }
        }
        g.globalAlpha = 1
      }

      /** Move the viewport lens onto the current scroll position. */
      function paintLens() {
        const viewport = scroller.clientHeight * scale()
        const height = Math.max(10, viewport)
        const y = clamp(scroller.scrollTop * scale(), 0, Math.max(0, railH - height))
        lens.style.height = Math.round(height) + 'px'
        lens.style.transform = 'translateY(' + Math.round(y) + 'px)'
        // "You are here": the last anchor at or above the reading line.
        const reading = scroller.scrollTop + scroller.clientHeight * 0.25
        let current = -1
        for (let i = 0; i < anchorEntries.length; i += 1) {
          if (bands[anchorEntries[i].index].top <= reading) current = i
        }
        if (current === activeAnchor) return
        const dots = anchorsEl.children
        if (activeAnchor >= 0 && dots[activeAnchor] !== undefined) {
          delete dots[activeAnchor].dataset.active
        }
        if (current >= 0 && dots[current] !== undefined) dots[current].dataset.active = '1'
        activeAnchor = current
      }

      /**
       * Show or hide the whole surface.
       * @param next - whether the map has something worth showing.
       */
      function setVisible(next) {
        root.dataset.show = next ? '1' : '0'
        suppressNativeThumb(next)
        if (!next) hideCard()
      }

      /** The frame body: rebind, re-measure when dirty, then paint. */
      function paint() {
        frame = 0
        if (disposed) return
        if (!ensureScroller()) {
          setVisible(false)
          return
        }
        if (structureDirty || scroller.scrollHeight !== lastScrollHeight) {
          rebuild()
          lastScrollHeight = scroller.scrollHeight
          structureDirty = false
          canvasSignature = ''
        }
        if (bands.length === 0 || contentHeight <= scroller.clientHeight * SHOW_RATIO) {
          setVisible(false)
          return
        }
        setVisible(true)
        layout()
        syncAnchors()
        paintCanvas()
        paintLens()
      }

      /**
       * Hit-test the rail. User bands win ties: they are the thing the map is
       * for, and a long reply overlaps every prompt inside it.
       * @param y - pointer offset within the rail.
       * @returns band index, or -1.
       */
      function bandAt(y) {
        let best = -1
        let bestScore = Infinity
        for (let index = 0; index < bands.length; index += 1) {
          const { y: top, h: height } = geometryOf(bands[index])
          if (y < top - 2 || y > top + height + 2) continue
          const score = (isUserKind(bands[index].kind) ? 0 : 1000)
            + Math.abs(top + height / 2 - y)
          if (score < bestScore) {
            bestScore = score
            best = index
          }
        }
        return best
      }

      /**
       * Readable preview of a row, taken from what it actually rendered.
       * @param band - hovered band.
       * @returns collapsed, bounded text.
       */
      function previewOf(band) {
        const raw = band.el.innerText || band.el.textContent || ''
        const text = raw.replace(/\s+/g, ' ').trim()
        if (text === '') return T.empty
        return text.length > 220 ? text.slice(0, 220) + '…' : text
      }

      /**
       * Show the preview card beside a band.
       * @param index - band index.
       */
      function showCard(index) {
        const band = bands[index]
        const spec = SPECS[band.kind] || FALLBACK
        const tones = palette()
        const counted = band.userIndex >= 0 && userTotal > 1
        cardDot.style.background = band.error ? tones.error : tones[spec.tone]
        cardKind.textContent = (T[band.kind] || T.unknown)
          + (counted ? ' · ' + (band.userIndex + 1) + '/' + userTotal : '')
        cardBody.textContent = previewOf(band)
        card.dataset.show = '1'
        const { y, h: height } = geometryOf(band)
        const offset = clamp(y + height / 2 - 28, 0, Math.max(0, railH - card.offsetHeight))
        card.style.transform = 'translateY(' + Math.round(offset) + 'px)'
      }

      /** Retract the preview card. */
      function hideCard() {
        card.dataset.show = '0'
      }

      /**
       * Scroll a band into reading position and mark where it landed.
       * @param index - band index.
       */
      function jumpTo(index) {
        const band = bands[index]
        const target = Math.max(0, band.top - scroller.clientHeight * 0.12)
        scroller.scrollTo({ top: target, behavior: 'smooth' })
        if (typeof band.el.animate !== 'function') return
        // A Web Animation leaves no class or inline style behind, so a React
        // re-render of that row cannot clobber it mid-flight.
        const tones = palette()
        band.el.animate(
          [
            { boxShadow: '0 0 0 2px ' + tones.user, borderRadius: '10px' },
            { boxShadow: '0 0 0 2px transparent', borderRadius: '10px' },
          ],
          { duration: 1100, easing: 'ease-out' },
        )
      }

      /**
       * Proportional scrub: the lens centre follows the pointer.
       * @param y - pointer offset within the rail.
       */
      function scrub(y) {
        const ratio = clamp(y / railH, 0, 1)
        scroller.scrollTop = ratio * contentHeight - scroller.clientHeight / 2
      }

      /**
       * Pointer offset inside the rail.
       * @param event - pointer event on the rail.
       * @returns y in rail pixels.
       */
      function railY(event) {
        return event.clientY - rail.getBoundingClientRect().top
      }

      const onEnter = () => {
        expanded = true
        root.dataset.expanded = '1'
        canvasSignature = ''
        schedule()
      }
      const onLeave = () => {
        if (dragging) return
        expanded = pinned
        root.dataset.expanded = pinned ? '1' : '0'
        hoverIndex = -1
        hideCard()
        canvasSignature = ''
        schedule()
      }
      const onMove = (event) => {
        if (dragging) {
          scrub(railY(event))
          return
        }
        const index = bandAt(railY(event))
        if (index === hoverIndex) return
        hoverIndex = index
        canvasSignature = ''
        if (index === -1) hideCard()
        else showCard(index)
        schedule()
      }
      const onDown = (event) => {
        if (event.button !== 0) return
        const y = railY(event)
        const index = bandAt(y)
        if (index === -1) scrub(y)
        else jumpTo(index)
        dragging = true
        rail.setPointerCapture(event.pointerId)
        event.preventDefault()
      }
      const onUp = (event) => {
        if (!dragging) return
        dragging = false
        if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId)
      }
      const onWheel = (event) => {
        scroller.scrollBy({ top: event.deltaY })
        event.preventDefault()
      }
      const onDoubleClick = () => {
        pinned = !pinned
        try {
          window.localStorage.setItem(PIN_KEY, pinned ? '1' : '0')
        } catch {
          // Storage refusal only costs the preference its persistence.
        }
      }
      const onOlder = (event) => {
        event.stopPropagation()
        if (olderButton !== null) olderButton.click()
      }

      /**
       * Resolve the band index behind an anchor-strip event target.
       * @param target - event target.
       * @returns band index, or -1.
       */
      const anchorIndexOf = (target) => {
        const dot = target instanceof Element ? target.closest('.dsh-strata-anchor') : null
        if (dot === null) return -1
        const parsed = Number(dot.dataset.index)
        return Number.isInteger(parsed) && bands[parsed] !== undefined ? parsed : -1
      }
      // Anchor hover deliberately does NOT expand the rail: the pointer never
      // enters the rail, so its pointerleave would never fire to collapse it.
      const onAnchorClick = (event) => {
        const index = anchorIndexOf(event.target)
        if (index === -1) return
        event.preventDefault()
        jumpTo(index)
      }
      const onAnchorOver = (event) => {
        const index = anchorIndexOf(event.target)
        if (index === -1) return
        // Light the mapped band too, so the dot and its stratum read as one.
        hoverIndex = index
        canvasSignature = ''
        showCard(index)
        schedule()
      }
      const onAnchorOut = (event) => {
        if (anchorIndexOf(event.target) === -1) return
        if (anchorIndexOf(event.relatedTarget) !== -1) return
        hoverIndex = -1
        canvasSignature = ''
        hideCard()
        schedule()
      }
      anchorsEl.addEventListener('click', onAnchorClick)
      anchorsEl.addEventListener('mouseover', onAnchorOver)
      anchorsEl.addEventListener('mouseout', onAnchorOut)
      // The dots sit outside the rail, but a wheel gesture over them should
      // scroll the transcript all the same — dead zones read as bugs.
      anchorsEl.addEventListener('wheel', onWheel, { passive: false })
      rail.addEventListener('pointerenter', onEnter)
      rail.addEventListener('pointerleave', onLeave)
      rail.addEventListener('pointermove', onMove)
      rail.addEventListener('pointerdown', onDown)
      rail.addEventListener('pointerup', onUp)
      rail.addEventListener('pointercancel', onUp)
      rail.addEventListener('wheel', onWheel, { passive: false })
      rail.addEventListener('dblclick', onDoubleClick)
      older.addEventListener('click', onOlder)
      window.addEventListener('resize', schedule)

      if (pinned) {
        expanded = true
        root.dataset.expanded = '1'
      }

      // Safety net for the states no observer reports: a scrollport swapped in
      // by a composition change, or a sticky composer that grew under us.
      const ticker = window.setInterval(schedule, 800)
      schedule()

      return () => {
        disposed = true
        if (frame !== 0) window.cancelAnimationFrame(frame)
        window.clearInterval(ticker)
        window.removeEventListener('resize', schedule)
        rail.removeEventListener('pointerenter', onEnter)
        rail.removeEventListener('pointerleave', onLeave)
        rail.removeEventListener('pointermove', onMove)
        rail.removeEventListener('pointerdown', onDown)
        rail.removeEventListener('pointerup', onUp)
        rail.removeEventListener('pointercancel', onUp)
        rail.removeEventListener('wheel', onWheel)
        rail.removeEventListener('dblclick', onDoubleClick)
        older.removeEventListener('click', onOlder)
        anchorsEl.removeEventListener('click', onAnchorClick)
        anchorsEl.removeEventListener('mouseover', onAnchorOver)
        anchorsEl.removeEventListener('mouseout', onAnchorOut)
        anchorsEl.removeEventListener('wheel', onWheel)
        // Hand the scrollbar back before letting go of the element.
        suppressNativeThumb(false)
        if (scroller !== null) scroller.removeEventListener('scroll', schedule)
        resizeObserver.disconnect()
        flowObserver.disconnect()
        themeObserver.disconnect()
        anchorsEl.remove()
        rail.remove()
        card.remove()
      }
    }

    /**
     * The slot entry: a bare element the imperative engine owns.
     * @returns the overlay entry element.
     */
    function TraceMinimap() {
      const ref = react.useRef(null)
      react.useEffect(() => {
        const element = ref.current
        if (element === null) return undefined
        return mountMinimap(element)
      }, [])
      return h('div', { ref, className: 'dsh-strata-root', 'data-plugin': ID, 'data-show': '0' })
    }

    /** Required services: the slot registry alone; no session data is read. */
    const inject = ['slots']

    /**
     * Client plugin body: one additive entry in the frame-wide overlay layer.
     * @param ctx - client context.
     */
    function apply(ctx) {
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'strata',
        order: 40,
      }, TraceMinimap))
    }

    exports.TraceMinimap = TraceMinimap
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
