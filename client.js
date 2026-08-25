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
/* Generous invisible hit box: a 7px dot is a poor click target on its own.
   Kept tight enough that neighbouring halos in a dense, fully-loaded rail
   do not swallow each other. */
.dsh-strata-anchor.dsh-strata-anchor::before {
  content: "";
  position: absolute;
  inset: -4px -5px;
}
/* Hit priority is semantic, not DOM order: a later error dot's halo must not
   eat the hover or the click on the user dot underneath — user dots open the wall. */
.dsh-strata-anchor.dsh-strata-anchor { z-index: 1; }
.dsh-strata-anchor.dsh-strata-anchor[data-tone="user"] { z-index: 2; }
.dsh-strata-anchor.dsh-strata-anchor[data-tone="mark"] { z-index: 0; }
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
  box-sizing: border-box;
  border-radius: 5px;
  border: 1.5px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #679efe) 78%, transparent);
  background: transparent;
  /* Edge glow: an outer halo that spills past the rail plus a faint inner
     wash, so the lens reads even on the 12px resting rail. */
  box-shadow:
    0 0 7px 1px color-mix(in srgb, var(--dsw-alias-state-business-primary, #679efe) 45%, transparent),
    inset 0 0 5px color-mix(in srgb, var(--dsw-alias-state-business-primary, #679efe) 28%, transparent);
  pointer-events: none;
}
/* The classic minimap focus treatment: everything OUTSIDE the viewport dims
   toward the page background, so the undimmed window plus its blue edge reads
   at a glance. Own radii — the rail cannot clip (the ⌃ sits above it). */
.dsh-strata-shade {
  position: absolute;
  left: 0;
  width: 100%;
  pointer-events: none;
  background: color-mix(in srgb, var(--dsw-alias-bg-base, #151517) 52%, transparent);
}
.dsh-strata-shade[data-edge="top"] { top: 0; border-radius: 7px 7px 0 0; }
.dsh-strata-shade[data-edge="bottom"] { border-radius: 0 0 7px 7px; }
/* Pure indicator, not a control: history above loads by scrolling to the top,
   so this only has to say "there is more" — visible whenever that is true. */
.dsh-strata-older {
  position: absolute;
  left: 50%;
  top: -13px;
  transform: translateX(-50%);
  display: none;
  width: 22px;
  height: 13px;
  color: var(--dsw-alias-label-tertiary, #8b9099);
  opacity: .7;
  pointer-events: none;
  line-height: 1;
  font-size: 11px;
  text-align: center;
}
.dsh-strata-older[data-available="1"] { display: block; }
/* Clue wall: a floating panel over the right half of the screen, opened by
   HOVERING a user dot. Cards run in one chronological column (so the bezier
   back to each anchor dot never crosses another card); paging buttons at the
   top and bottom take over when the column cannot fit. */
/* No board behind the notes: the cards float straight over the transcript,
   which stays visible through the gaps. The container is a transparent hover
   region only. */
.dsh-strata-wall {
  position: fixed;
  top: 14px;
  bottom: 14px;
  right: 64px;
  width: min(calc(50vw - 90px), 620px);
  min-width: 360px;
  z-index: 90;
  display: none;
  flex-direction: column;
  box-sizing: border-box;
}
.dsh-strata-wall[data-show="1"] { display: flex; }
.dsh-strata-walllink {
  position: absolute;
  left: 0;
  top: 0;
  width: calc(100% + 64px);
  height: 100%;
  overflow: visible;
  pointer-events: none;
  z-index: 5;
}
.dsh-strata-wallhead {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex: none;
  align-self: flex-start;
  margin-bottom: 8px;
  padding: 4px 11px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128, 134, 142, .3));
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-3, #22242a);
}
.dsh-strata-walltitle {
  color: var(--dsw-alias-label-primary, #e8eaed);
  font-size: 13px;
  font-weight: 600;
}
.dsh-strata-wallhint {
  flex: none;
  color: var(--dsw-alias-label-caption, #81858c);
  font-size: 10.5px;
}
.dsh-strata-wallbody {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.dsh-strata-wallpager {
  flex: none;
  /* Always occupies its row: a pager that toggled between absent and
     present would resize the card area AFTER the cards were packed against
     the old height, clipping the bottom row. Hidden means invisible and
     inert, never gone from the flow. */
  display: block;
  visibility: hidden;
  pointer-events: none;
  padding: 3px 0;
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128, 134, 142, .45));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3, #22242a);
  color: var(--dsw-alias-label-tertiary, #adb2b8);
  font-size: 11px;
  cursor: pointer;
}
.dsh-strata-wallpager:hover {
  color: var(--dsw-alias-label-primary, #e8eaed);
  border-color: var(--dsw-alias-border-l3, rgba(128, 134, 142, .6));
}
.dsh-strata-wallpager[data-on="1"] { visibility: visible; pointer-events: auto; }
.dsh-strata-wallcard {
  position: absolute;
  box-sizing: border-box;
  padding: 7px 11px 8px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128, 134, 142, .3));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3, #22242a);
  cursor: pointer;
  visibility: hidden;
  pointer-events: none;
  /* Position swaps glide: when the spotlight claims the slot nearest its
     anchor, the displaced cards trade places on a spring. */
  transition:
    top .28s cubic-bezier(.34, 1.56, .64, 1),
    left .28s cubic-bezier(.34, 1.56, .64, 1),
    border-color .12s ease;
}
.dsh-strata-wallcard[data-on="1"] { visibility: visible; pointer-events: auto; }
/* Unloaded-jump loading lives on the RAIL: the wall retires first, then the
   ⌃ pulses and a thin bar above the rail fills with REAL progress (chunks of
   history landed over chunks needed) while the map morphs, and finally the
   glide-and-flash jump plays. */
.dsh-strata-loadbar {
  position: absolute;
  top: -4px;
  left: 0;
  height: 2px;
  width: 0%;
  background: var(--dsh-strata-user);
  border-radius: 1px;
  opacity: 0;
  /* Slow glide between progress milestones so chunked loads read as one
     continuous pull, not a stutter. */
  transition: width .9s cubic-bezier(.25, .6, .3, 1), opacity .25s ease;
}
.dsh-strata-root[data-loading="1"] .dsh-strata-loadbar { opacity: 1; }
/* A chain that stalled, hit its page cap, or ran out of pager before the
   goal was met says so: the bar and the ⌃ turn amber instead of pretending
   the session is fully on hand. */
.dsh-strata-root[data-loadstate="incomplete"] .dsh-strata-loadbar,
.dsh-strata-root[data-loadstate="incomplete"] .dsh-strata-older {
  background: var(--dsh-strata-warn);
  color: var(--dsh-strata-warn);
  animation: none;
}
.dsh-strata-root[data-loadstate="incomplete"] .dsh-strata-older { background: transparent; }
.dsh-strata-root[data-loading="1"] .dsh-strata-older {
  color: var(--dsh-strata-user);
  opacity: 1;
  animation: dsh-strata-oldpulse .9s ease-in-out infinite;
}
@keyframes dsh-strata-oldpulse {
  50% { transform: translateX(-50%) scale(1.3); }
}
/* Scale switcher under the rail: how much of the session the map spans —
   the initial window, half, or everything. Shown while the rail is awake. */
.dsh-strata-zoom {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: none;
  pointer-events: auto;
  flex-direction: column;
  gap: 1px;
  padding: 1px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128, 134, 142, .3));
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-3, #22242a);
}
.dsh-strata-root[data-expanded="1"] .dsh-strata-zoom { display: inline-flex; }
.dsh-strata-zoom button {
  width: 19px;
  height: 17px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #adb2b8);
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
}
.dsh-strata-zoom button:hover { color: var(--dsw-alias-label-primary, #e8eaed); }
.dsh-strata-zoom button[data-active="1"] {
  background: color-mix(in srgb, var(--dsh-strata-user) 22%, transparent);
  color: var(--dsh-strata-user);
}
.dsh-strata-wallcard:hover {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #679efe) 70%, transparent);
}
.dsh-strata-wallcard[data-focus="1"] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #679efe) 80%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary, #679efe) 25%, transparent);
}
.dsh-strata-wallcard:focus-visible,
.dsh-strata-wallpager:focus-visible,
.dsh-strata-zoom button:focus-visible {
  outline: 2px solid var(--dsh-strata-user);
  outline-offset: 1px;
}
.dsh-strata-wall .dsh-strata-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.dsh-strata-wallcard[data-loaded="0"] { border-style: dashed; }
.dsh-strata-wallcard[data-loaded="0"] .dsh-strata-wallcardbody {
  color: var(--dsw-alias-label-tertiary, #adb2b8);
}
.dsh-strata-wallcardhead {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
  color: var(--dsw-alias-label-caption, #81858c);
  font-size: 10.5px;
  line-height: 15px;
  white-space: nowrap;
  overflow: hidden;
}
.dsh-strata-wallcardhead::before {
  content: "";
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 999px;
  background: var(--dsh-strata-user);
}
.dsh-strata-wallcard[data-loaded="0"] .dsh-strata-wallcardhead::before {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--dsh-strata-user);
}
.dsh-strata-wallno {
  flex: none;
  font-weight: 700;
  font-size: 12px;
  color: var(--dsh-strata-user);
}
.dsh-strata-wallcardbody {
  color: var(--dsw-alias-label-primary, #e8eaed);
  font-size: 12px;
  line-height: 17px;
  overflow: hidden;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 10;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-strata-root.dsh-strata-root, .dsh-strata-canvas,
  .dsh-strata-wallcard, .dsh-strata-older { transition: none; animation: none; }
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
        'older': '上方还有更早的历史（滚到顶部自动加载）',
        'empty': '（无文本）',
        'unloaded': '未加载',
        'loading': '载入中…',
        'wallTitle': '本会话 {n} 条发言',
        'wallHint': '点击卡片跳转 · Esc 关闭',
        'pageUp': '↑ 更早 {n} 条',
        'pageDown': '↓ 更新 {n} 条',
        'zoomInit': '初始视野：会话打开时的范围',
        'zoomMid': '中等视野：两倍初始范围（按需补载）',
        'zoomAll': '全景：整个会话（自动补载历史）',
        'zoomGroup': '地图视野',
        'railLabel': '会话地图：方向键滚动，Enter 打开线索墙',
        'cardLabel': '第 {i}/{n} 条发言：',
        'incomplete': '历史未能完整加载',
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
        'older': 'Older history above — scroll to the top to load it',
        'empty': '(no text)',
        'unloaded': 'not loaded',
        'loading': 'loading…',
        'wallTitle': '{n} prompts in this session',
        'wallHint': 'Click a card to jump · Esc closes',
        'pageUp': '↑ {n} earlier',
        'pageDown': '↓ {n} later',
        'zoomInit': 'Initial view: the range at session open',
        'zoomMid': 'Medium: twice the initial range (loads as needed)',
        'zoomAll': 'Full: the whole session (loads history)',
        'zoomGroup': 'Map scale',
        'railLabel': 'Session map: arrow keys scroll, Enter opens the prompt wall',
        'cardLabel': 'Prompt {i} of {n}: ',
        'incomplete': 'History did not fully load',
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

    // ── pure logic ────────────────────────────────────────────────────────
    // Everything in this block is DOM-free and exported through
    // `exports.internals`, so the geometry, the caches and the loading
    // state machine can be exercised under `node --test` without a browser.

    /**
     * The display window one zoom mode asks for.
     * @param mode - 'init' | 'mid' | 'all'.
     * @param contentHeight - total scroll extent in content px.
     * @param initialExtent - the extent at session open (0 = unknown).
     * @param scrollTop - current scroll position.
     * @param clientHeight - viewport height.
     * @returns `offset` and `extent` in content px.
     */
    function windowFor(mode, contentHeight, initialExtent, scrollTop, clientHeight) {
      let extent = contentHeight
      if (mode === 'init' && initialExtent > 0) {
        extent = Math.min(contentHeight, initialExtent)
      } else if (mode === 'mid' && initialExtent > 0) {
        // Twice the initial view — always a full step out from 近, loading
        // the difference on demand when it is not in the window yet.
        extent = Math.min(contentHeight, initialExtent * 2)
      }
      if (extent < contentHeight) {
        const center = scrollTop + clientHeight / 2
        return { offset: clamp(center - extent / 2, 0, contentHeight - extent), extent }
      }
      return { offset: 0, extent: contentHeight }
    }

    /**
     * Cache key for the band canvas. Everything that moves a pixel is in it:
     * the rail box, the content, the hover, the palette AND the display
     * mapping — a zoomed window slides with scrollTop, so `offset`/`k` have
     * to be part of the key or the bitmap goes stale under moving anchors.
     * @param p - signature parts.
     * @returns a string equal iff the bitmap would be identical.
     */
    function canvasSignatureOf(p) {
      return [
        p.railW, p.railH, p.contentHeight, p.count, p.hoverIndex, p.colorStamp,
        p.zoomMode,
        // Quantised to a quarter rail-pixel: below that nothing repaints.
        Math.round(p.offset * p.k * 4),
        Math.round(p.k * 1e6),
        p.dpr,
      ].join(':')
    }

    /**
     * Absolute scrub mapping for one drag gesture. The window is FROZEN at
     * pointerdown: in a zoomed mode the live window follows scrollTop, so
     * re-deriving it on every move would add the previous move's shift on
     * top of the next — the pointer would race away from the thumb.
     * @param drag - `{ offset, extent }` captured at pointerdown.
     * @param y - pointer offset within the rail.
     * @param railH - rail height.
     * @param clientHeight - viewport height.
     * @returns the scrollTop that centres the viewport under the pointer.
     */
    function scrubTarget(drag, y, railH, clientHeight) {
      return drag.offset + clamp(y / railH, 0, 1) * drag.extent - clientHeight / 2
    }

    /**
     * Index range of bands intersecting a content-space interval. Bands are
     * flow rows — stacked, non-overlapping, ascending `top` — so a binary
     * search on `top` finds the edges without touching the middle.
     * @param bands - measured bands, ascending by top.
     * @param lo - interval start in content px.
     * @param hi - interval end in content px.
     * @returns `{ start, end }` inclusive; `end < start` when empty.
     */
    function visibleRange(bands, lo, hi) {
      let a = 0
      let b = bands.length
      // First band whose top is past `lo`; its predecessor may still reach.
      while (a < b) {
        const m = (a + b) >> 1
        if (bands[m].top < lo) a = m + 1
        else b = m
      }
      let start = a
      if (start > 0 && bands[start - 1].top + bands[start - 1].height >= lo) start -= 1
      a = start
      b = bands.length
      while (a < b) {
        const m = (a + b) >> 1
        if (bands[m].top <= hi) a = m + 1
        else b = m
      }
      return { start, end: a - 1 }
    }

    /**
     * Normalise a wheel delta to pixels.
     * @param deltaY - raw delta.
     * @param deltaMode - 0 pixel, 1 line, 2 page.
     * @param lineHeight - px per line.
     * @param pageHeight - px per page.
     * @returns pixels to scroll by.
     */
    function wheelPixels(deltaY, deltaMode, lineHeight, pageHeight) {
      if (deltaMode === 1) return deltaY * lineHeight
      if (deltaMode === 2) return deltaY * pageHeight
      return deltaY
    }

    /**
     * Take over an element's scrollbar-thumb variables and hand them back
     * EXACTLY as found — a theme or another plugin may own inline values on
     * the same element, and `removeProperty` would erase them.
     * @param names - the custom properties to rebind.
     * @returns `{ hold(el), release(), held() }`.
     */
    function createThumbSuppressor(names) {
      let held = null
      const release = () => {
        if (held === null) return
        for (const entry of held.saved) {
          if (entry.value === '') held.el.style.removeProperty(entry.name)
          else held.el.style.setProperty(entry.name, entry.value, entry.priority)
        }
        held = null
      }
      const hold = (el) => {
        if (held !== null && held.el === el) return
        release()
        const saved = names.map((name) => ({
          name,
          value: el.style.getPropertyValue(name),
          priority: el.style.getPropertyPriority(name),
        }))
        held = { el, saved }
        for (const name of names) el.style.setProperty(name, 'transparent')
      }
      return { hold, release, held: () => (held === null ? null : held.el) }
    }

    /**
     * A user prompt out of one session event, or null. Mirrors the host's
     * chat projection: only APPEND-origin `user/message` events with a
     * human source are rows; replacement events (compaction checkpoints)
     * and plugin-injected context never reach the transcript as prompts.
     * @param event - parsed session event.
     * @returns `{ seq, time, text }` or null.
     */
    function promptOf(event) {
      if (event === null || typeof event !== 'object' || event.type !== 'user/message') return null
      if (event.surfaceOp !== undefined && event.surfaceOp !== 'append') return null
      const data = event.data
      if (data === undefined || data === null || (data.source && data.source.kind) !== 'user') return null
      let body = ''
      for (const block of data.content || []) {
        if (block.type === 'text') body += block.text
        else if (block.type === 'image') body += '🖼 '
      }
      return { seq: event.seq, time: event.time, text: body.trim() }
    }

    /**
     * Streaming JSONL prompt extractor: feed decoded chunks as they land,
     * finish with `end()`. Only one partial line is ever held, so a long
     * log never materialises as a whole string plus a whole line array.
     * @returns `{ push(chunk), end() }`.
     */
    function createPromptParser() {
      const prompts = []
      let rest = ''
      const take = (line) => {
        if (line === '' || line.indexOf('"user/message"') === -1) return
        let event
        try {
          event = JSON.parse(line)
        } catch {
          return
        }
        const prompt = promptOf(event)
        if (prompt !== null) prompts.push(prompt)
      }
      return {
        push(chunk) {
          rest += chunk
          let at = rest.indexOf('\n')
          while (at !== -1) {
            take(rest.slice(0, at))
            rest = rest.slice(at + 1)
            at = rest.indexOf('\n')
          }
        },
        end() {
          take(rest)
          rest = ''
          return prompts
        },
      }
    }

    /**
     * Whole-text convenience over the streaming parser.
     * @param text - the JSONL artifact.
     * @returns prompts in log order.
     */
    function parsePrompts(text) {
      const parser = createPromptParser()
      parser.push(text)
      return parser.end()
    }

    /**
     * Session-scoped prompt list with a freshness test that cannot lie.
     *
     * The loaded transcript window is a contiguous SUFFIX of the log, so a
     * cached full list is valid exactly while its last prompt is still the
     * last loaded user row — identified by that row's anchor key, not by a
     * count (a count grows on prepend AND on append; only append staling
     * the cache). Rows appended since the fetch are grafted from the DOM
     * instead of re-downloading the log. Requests carry a generation and an
     * AbortController; a session switch or a newer request retires them,
     * and a retired request never writes the cache or reaches a caller.
     * @param deps - `{ fetchPrompts(sessionId, signal), getSessionId(), now() }`.
     * @returns the store.
     */
    function createPromptStore(deps) {
      let cache = null
      let inflight = null
      let failure = null
      let generation = 0

      const fromRows = (rows) => rows.map((row) => ({
        seq: -1, time: row.time, text: row.text, key: row.key,
      }))

      /**
       * Full list for the current rows if the cache still covers them.
       * @param sessionId - current session.
       * @param rows - loaded user rows `{ key, time, text }`, in order.
       * @returns prompts, or null when the cache is missing or stale.
       */
      const cached = (sessionId, rows) => {
        if (cache === null || cache.sessionId !== sessionId) return null
        if (rows.length === 0) return cache.prompts
        if (cache.prompts.length < rows.length) return null
        let at = -1
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i].key === cache.lastKey) {
            at = i
            break
          }
        }
        if (at === -1) return null
        if (at < rows.length - 1) {
          cache = {
            sessionId,
            prompts: cache.prompts.concat(fromRows(rows.slice(at + 1))),
            lastKey: rows[rows.length - 1].key,
          }
        }
        return cache.prompts
      }

      const abortInflight = () => {
        if (inflight === null) return
        try {
          inflight.controller.abort()
        } catch {
          // Already settled.
        }
        inflight = null
      }

      /**
       * @param sessionId - current session.
       * @param rows - loaded user rows now.
       * @param currentRows - reads the loaded user rows when the fetch lands.
       * @returns `{ prompts, complete, pending }` — `pending` resolves to
       *   the full list, or null when the request was retired or failed.
       */
      const get = (sessionId, rows, currentRows) => {
        const hit = cached(sessionId, rows)
        if (hit !== null) return { prompts: hit, complete: true, pending: null }
        const partial = fromRows(rows)
        if (sessionId === undefined) return { prompts: partial, complete: false, pending: null }
        if (inflight !== null && inflight.sessionId === sessionId) {
          return { prompts: partial, complete: false, pending: inflight.task }
        }
        if (failure !== null && failure.sessionId === sessionId && deps.now() < failure.until) {
          return { prompts: partial, complete: false, pending: null }
        }
        abortInflight()
        generation += 1
        const gen = generation
        const controller = typeof AbortController === 'function' ? new AbortController() : { abort() {}, signal: undefined }
        let request
        try {
          request = Promise.resolve(deps.fetchPrompts(sessionId, controller.signal))
        } catch (error) {
          request = Promise.reject(error)
        }
        const task = request
          .then((prompts) => {
            const live = inflight !== null && inflight.gen === gen
            if (!live || deps.getSessionId() !== sessionId) return null
            inflight = null
            failure = null
            const tail = currentRows()
            if (prompts.length < tail.length) {
              // The log is shorter than the transcript (a row the export has
              // not caught up with yet) — cannot be aligned; back off rather
              // than re-download on the next hover.
              failure = { sessionId, until: deps.now() + 2000, backoff: 2000 }
              return null
            }
            cache = {
              sessionId,
              prompts,
              lastKey: tail.length === 0 ? undefined : tail[tail.length - 1].key,
            }
            return prompts
          }, () => {
            const live = inflight !== null && inflight.gen === gen
            if (live) inflight = null
            if (live && deps.getSessionId() === sessionId) {
              const backoff = failure !== null && failure.sessionId === sessionId
                ? Math.min(failure.backoff * 2, 30000)
                : 2000
              failure = { sessionId, until: deps.now() + backoff, backoff }
            }
            return null
          })
        inflight = { sessionId, gen, controller, task }
        return { prompts: partial, complete: false, pending: task }
      }

      /**
       * The session moved on (or the surface is going away): retire the
       * request and drop a cache that no longer belongs to the stage.
       * @param sessionId - the session now current (undefined = all).
       */
      const invalidate = (sessionId) => {
        if (inflight !== null && inflight.sessionId !== sessionId) abortInflight()
        if (cache !== null && cache.sessionId !== sessionId) cache = null
        if (failure !== null && failure.sessionId !== sessionId) failure = null
      }

      return {
        get,
        invalidate,
        dispose: () => {
          abortInflight()
          cache = null
        },
        peek: () => cache,
      }
    }

    /** Safety cap on pages per chain — reported, never silently swallowed. */
    const LOAD_PAGE_CAP = 60
    /** How long one page may take before the chain calls it stalled. */
    const LOAD_PAGE_TIMEOUT = 5000

    /**
     * The one owner of "load older history" work. Auto-paging near the top,
     * a zoom that needs more session on hand and a wall jump above the
     * loaded window all run through here, so there is one task at a time,
     * one cancel, and a status that says whether the goal was reached.
     * @param deps - `{ button(), height(), now(), wait(ms), onPage(grown) }`.
     * @returns `{ run(kind, need, onProgress), cancel(), active() }`.
     */
    function createHistoryLoader(deps) {
      let gen = 0
      let active = null

      /**
       * Page until `need()` turns false.
       * @param kind - 'auto' | 'zoom' | 'jump' (for the status line).
       * @param need - whether another page is still wanted.
       * @param onProgress - `(pages)` after each landed page.
       * @returns `{ status, pages }` — status is 'done' | 'stalled' |
       *   'capped' | 'exhausted' | 'cancelled'.
       */
      const run = async (kind, need, onProgress) => {
        gen += 1
        const mine = gen
        let pages = 0
        const finish = (status) => {
          if (active !== null && active.gen === mine) active = null
          return { status, pages }
        }
        const task = (async () => {
          while (need()) {
            if (pages >= LOAD_PAGE_CAP) return finish('capped')
            const el = deps.button()
            if (el === null || el === undefined) return finish('exhausted')
            const before = deps.height()
            const started = deps.now()
            el.click()
            while (deps.height() === before && deps.now() - started < LOAD_PAGE_TIMEOUT) {
              await deps.wait(150)
              if (mine !== gen) return finish('cancelled')
            }
            if (mine !== gen) return finish('cancelled')
            const grown = deps.height() - before
            // No progress on a page is a terminal fault, not a reason to
            // click sixty more times.
            if (grown <= 0) return finish('stalled')
            pages += 1
            deps.onPage(grown)
            if (onProgress !== undefined) onProgress(pages)
            if (mine !== gen) return finish('cancelled')
          }
          return finish('done')
        })()
        active = { kind, gen: mine, task }
        return task
      }
      const cancel = () => {
        gen += 1
        active = null
      }
      return { run, cancel, active: () => active }
    }

    /**
     * Mount the imperative minimap engine onto the slot entry's root element.
     *
     * Everything below the React seam is plain DOM: the map re-reads layout
     * when rows appear, leave or change size, and a canvas keeps repaints
     * off the layout path while a turn streams.
     * @param root - the entry's own element (already in the overlay layer).
     * @param getSessionId - reads the staged session id.
     * @param subscribeSessions - subscribes to session-list changes.
     * @returns disposer removing every listener, observer and timer.
     */
    function mountMinimap(root, getSessionId, subscribeSessions) {
      const doc = root.ownerDocument
      const T = dictionary()

      const rail = doc.createElement('div')
      rail.className = 'dsh-strata-rail'
      // Scrollbar semantics: assistive tech reads the rail as the scroll
      // control it replaces, and the keyboard drives it like one.
      rail.setAttribute('role', 'scrollbar')
      rail.setAttribute('aria-orientation', 'vertical')
      rail.setAttribute('aria-valuemin', '0')
      rail.setAttribute('aria-valuemax', '100')
      rail.setAttribute('aria-label', T.railLabel)
      rail.tabIndex = 0
      const canvas = doc.createElement('canvas')
      canvas.className = 'dsh-strata-canvas'
      canvas.setAttribute('aria-hidden', 'true')
      const shadeTop = doc.createElement('div')
      shadeTop.className = 'dsh-strata-shade'
      shadeTop.dataset.edge = 'top'
      const shadeBottom = doc.createElement('div')
      shadeBottom.className = 'dsh-strata-shade'
      shadeBottom.dataset.edge = 'bottom'
      const lens = doc.createElement('div')
      lens.className = 'dsh-strata-lens'
      const zoomer = doc.createElement('div')
      zoomer.className = 'dsh-strata-zoom'
      zoomer.setAttribute('role', 'group')
      zoomer.setAttribute('aria-label', T.zoomGroup)
      const ZOOMS = [
        { mode: 'init', glyph: '近', title: T.zoomInit },
        { mode: 'mid', glyph: '中', title: T.zoomMid },
        { mode: 'all', glyph: '全', title: T.zoomAll },
      ]
      for (const z of ZOOMS) {
        const button = doc.createElement('button')
        button.type = 'button'
        button.dataset.zoom = z.mode
        button.textContent = z.glyph
        button.title = z.title
        button.setAttribute('aria-label', z.title)
        zoomer.append(button)
      }
      const loadbar = doc.createElement('div')
      loadbar.className = 'dsh-strata-loadbar'
      const older = doc.createElement('div')
      older.className = 'dsh-strata-older'
      older.setAttribute('aria-hidden', 'true')
      older.title = T.older
      older.textContent = '⌃'
      const anchorsEl = doc.createElement('div')
      anchorsEl.className = 'dsh-strata-anchors'
      anchorsEl.style.width = ANCHOR_W + 'px'
      // The clue wall lives on document.body: the root carries a transform,
      // which would re-anchor position:fixed to itself.
      const wall = doc.createElement('div')
      wall.className = 'dsh-strata-wall'
      wall.setAttribute('role', 'region')
      const wallLink = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
      wallLink.setAttribute('class', 'dsh-strata-walllink')
      wallLink.setAttribute('aria-hidden', 'true')
      const wallHead = doc.createElement('div')
      wallHead.className = 'dsh-strata-wallhead'
      const wallTitle = doc.createElement('div')
      wallTitle.className = 'dsh-strata-walltitle'
      const wallHint = doc.createElement('div')
      wallHint.className = 'dsh-strata-wallhint'
      wallHead.append(wallTitle, wallHint)
      const wallBody = doc.createElement('div')
      wallBody.className = 'dsh-strata-wallbody'
      const wallPagerTop = doc.createElement('button')
      wallPagerTop.type = 'button'
      wallPagerTop.className = 'dsh-strata-wallpager'
      const wallCards = doc.createElement('div')
      wallCards.style.cssText = 'flex:1;position:relative;min-height:0;overflow:hidden'
      const wallPagerBottom = doc.createElement('button')
      wallPagerBottom.type = 'button'
      wallPagerBottom.className = 'dsh-strata-wallpager'
      wallBody.append(wallPagerTop, wallCards, wallPagerBottom)
      wall.append(wallLink, wallHead, wallBody)
      doc.body.appendChild(wall)
      rail.append(canvas, shadeTop, shadeBottom, lens, older, loadbar)
      root.append(anchorsEl, rail, zoomer)

      const g = canvas.getContext('2d')
      const thumb = createThumbSuppressor(THUMB_VARS)

      let scroller = null
      let bands = []
      /** Row element -> its band, for the incremental resize path. */
      let bandByEl = new Map()
      let userBandIndex = []
      // Map scale: 'all' spans the whole loaded session, 'init' restores the
      // extent at session open, 'mid' twice that. Zoomed windows slide with
      // the reading position and are immune to prepend rescaling.
      const ZOOM_KEY = 'dsh-strata.zoom'
      let zoomMode = 'init'
      let initialExtent = 0
      let initialSession
      let currentSession
      try {
        const saved = window.localStorage.getItem(ZOOM_KEY)
        if (saved === 'init' || saved === 'mid' || saved === 'all') zoomMode = saved
      } catch {
        // Storage refusal only costs persistence.
      }
      let anchorCandidates = []
      let anchorEntries = []
      let anchorSignature = ''
      let activeAnchor = -1
      let userTotal = 0
      let contentHeight = 1
      let railH = 0
      let railW = REST_W_MIN
      let lineHeight = 16
      let seatEl = null
      let structureDirty = true
      let layoutDirty = true
      /** Rows the ResizeObserver reported since the last frame -> new height. */
      const resizedRows = new Map()
      let observedRows = new WeakSet()
      let lastScrollHeight = -1
      let hoverIndex = -1
      /** Drag gesture on the rail, window frozen at pointerdown. */
      let drag = null
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
      const markLayout = () => {
        layoutDirty = true
        schedule()
      }

      // Scrollport: its size reflows every row, so re-measure. The composer
      // seat only moves the rail's floor, so it gets a layout pass alone.
      const resizeObserver = new ResizeObserver(() => {
        layoutDirty = true
        markDirty()
      })
      const seatObserver = new ResizeObserver(markLayout)
      // Individual flow rows: a streaming reply grows its own row every
      // frame, and the observer hands over the new border-box height, so
      // the map updates that ONE band and shifts the rest arithmetically —
      // no rect is read.
      const rowObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const box = entry.borderBoxSize && entry.borderBoxSize.length > 0
            ? entry.borderBoxSize[0].blockSize
            : entry.contentRect.height
          resizedRows.set(entry.target, box)
        }
        schedule()
      })
      const ROW_SEL = '[data-chat-anchor-key]'
      const ERROR_SEL = '[data-state="error"], [data-error]'
      const carriesRow = (node) => node instanceof Element
        && (node.matches(ROW_SEL) || node.querySelector(ROW_SEL) !== null)
      const carriesError = (node) => node instanceof Element
        && (node.matches(ERROR_SEL) || node.querySelector(ERROR_SEL) !== null)
      // Structure changes (rows added, removed, re-kinded, failing; the pager
      // appearing or going) rebuild; text churn INSIDE a row does not — its
      // only geometric effect is a height change, which the row observer
      // reports.
      const flowObserver = new MutationObserver((records) => {
        let structural = false
        for (const record of records) {
          const target = record.target
          const row = target instanceof Element ? target.closest(ROW_SEL) : null
          if (record.type === 'attributes') {
            const band = row === null ? undefined : bandByEl.get(row)
            if (band === undefined || band.error !== (row.querySelector(ERROR_SEL) !== null)) {
              structural = true
              break
            }
            continue
          }
          if (row === null) {
            structural = true
            break
          }
          for (const node of record.addedNodes) {
            if (carriesRow(node) || carriesError(node)) {
              structural = true
              break
            }
          }
          if (structural) break
          for (const node of record.removedNodes) {
            if (carriesRow(node) || carriesError(node)) {
              structural = true
              break
            }
          }
          if (structural) break
        }
        if (structural) markDirty()
      })
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
          thumb.release()
          scroller.removeEventListener('scroll', schedule)
          scroller.removeEventListener('wheel', releasePin)
          scroller.removeEventListener('pointerdown', releasePin)
          resizeObserver.disconnect()
          seatObserver.disconnect()
          rowObserver.disconnect()
          flowObserver.disconnect()
          observedRows = new WeakSet()
          bandByEl = new Map()
          resizedRows.clear()
          seatEl = null
        }
        scroller = found
        if (scroller === null) return false
        scroller.addEventListener('scroll', schedule, { passive: true })
        scroller.addEventListener('wheel', releasePin, { passive: true })
        scroller.addEventListener('pointerdown', releasePin, { passive: true })
        resizeObserver.observe(scroller)
        flowObserver.observe(scroller, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-state', 'data-error', 'data-chat-flow-kind'],
        })
        structureDirty = true
        layoutDirty = true
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
       * left with no scrollbar at all — and it is handed back with whatever
       * inline values were there before, not merely cleared.
       * @param on - whether the native thumb should be suppressed.
       */
      function suppressNativeThumb(on) {
        if (scroller === null) return
        if (on) thumb.hold(scroller)
        else thumb.release()
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
       * Re-measure every flow row into content-space bands. Called on
       * structural change and on an unexplained scroll-height change, never
       * on plain scroll or on in-row text churn.
       */
      function rebuild() {
        const scrollerRect = scroller.getBoundingClientRect()
        const scrollTop = scroller.scrollTop
        const rows = scroller.querySelectorAll(ROW_SEL)
        const next = []
        const byEl = new Map()
        let users = 0
        for (const row of rows) {
          const rect = row.getBoundingClientRect()
          if (rect.height <= 0) continue
          const kind = row.dataset.chatFlowKind || 'unknown'
          const band = {
            el: row,
            kind,
            index: next.length,
            top: rect.top - scrollerRect.top + scrollTop,
            height: rect.height,
            // Border-box height as the ResizeObserver will report it (a
            // transform in flight makes the rect differ); deltas are taken
            // against this, never against the rect.
            box: row.offsetHeight,
            // A failed tool or command marks its own row; the map borrows that
            // verdict rather than re-deriving one. `data-state` is the shared
            // convention (ToolRow, GenericCommandCard, StateDot) and the only
            // one that actually appears on a failed row — `data-error` exists
            // on inner IO text in a couple of renderers, so it is kept as a
            // secondary probe, never the primary one.
            error: row.querySelector(ERROR_SEL) !== null,
            userIndex: -1,
          }
          if (isUserKind(kind)) {
            band.userIndex = users
            users += 1
          }
          const tone = band.error && !isUserKind(kind) ? 'error' : ANCHOR_TONES[kind]
          if (tone !== undefined) band.anchorTone = tone
          next.push(band)
          byEl.set(row, band)
          if (!observedRows.has(row)) {
            observedRows.add(row)
            rowObserver.observe(row)
          }
        }
        for (const el of bandByEl.keys()) {
          if (byEl.has(el)) continue
          rowObserver.unobserve(el)
          observedRows.delete(el)
        }
        bands = next
        bandByEl = byEl
        resizedRows.clear()
        userTotal = users
        userBandIndex = []
        for (let index = 0; index < bands.length; index += 1) {
          if (bands[index].userIndex >= 0) userBandIndex.push(index)
        }
        anchorCandidates = []
        for (let index = 0; index < bands.length; index += 1) {
          if (bands[index].anchorTone !== undefined) anchorCandidates.push(index)
        }
        anchorSignature = ''
        const nextHeight = Math.max(scroller.scrollHeight, 1)
        // Remember the extent at session open — the 'init' zoom restores it.
        const sid = getSessionId()
        if (sid !== initialSession && bands.length > 0) {
          initialSession = sid
          initialExtent = nextHeight
        }
        // Start the rescale morph in the SAME frame the growth lands: waiting
        // for the load poll would paint one hard frame of the end state first.
        if (loader.active() !== null && nextHeight > contentHeight) {
          startMorph(nextHeight - contentHeight)
        }
        contentHeight = nextHeight
        olderButton = findOlderButton(rows[0])
        older.dataset.available = olderButton === null ? '0' : '1'
      }

      /**
       * Fold the rows' reported size changes into the bands without reading
       * layout: the changed band takes its new height and every band below
       * it shifts by the difference.
       */
      function applyResizes() {
        let changed = false
        for (const [el, height] of resizedRows) {
          const band = bandByEl.get(el)
          if (band === undefined) continue
          const delta = height - band.box
          if (Math.abs(delta) < 0.5) continue
          band.box = height
          band.height += delta
          for (let i = band.index + 1; i < bands.length; i += 1) bands[i].top += delta
          changed = true
        }
        resizedRows.clear()
        if (!changed) return
        contentHeight = Math.max(scroller.scrollHeight, 1)
        canvasSignature = ''
        anchorSignature = ''
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
        if (seat !== seatEl) {
          if (seatEl !== null) seatObserver.unobserve(seatEl)
          seatEl = seat
          if (seat !== null) seatObserver.observe(seat)
        }
        const floor = seat === null
          ? scrollerRect.bottom
          : Math.min(scrollerRect.bottom, seat.getBoundingClientRect().top - 6)
        const bodyStyle = window.getComputedStyle(doc.body)
        const barWidth = parseFloat(bodyStyle.getPropertyValue('--dsh-scrollbar-width'))
        const gutter = Number.isFinite(barWidth) ? barWidth : 8
        const scrollerStyle = window.getComputedStyle(scroller)
        const lh = parseFloat(scrollerStyle.lineHeight)
        lineHeight = Number.isFinite(lh) && lh > 0
          ? lh
          : (parseFloat(scrollerStyle.fontSize) || 13.5) * 1.2
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
        zoomer.style.top = (railH + 6) + 'px'
        root.style.transform = 'translate('
          + Math.round(scrollerRect.right - hostRect.left - rootW - 1) + 'px, '
          + Math.round(top - hostRect.top) + 'px)'
      }

      /**
       * Rebuild the anchor dots beside the rail: one clickable target per
       * user turn, plus every failure and compaction boundary. Dots that would
       * collide are dropped — except failures and boundaries, which are the
       * reason someone reaches for the map in the first place.
       * @param view - this frame's display mapping.
       */
      function syncAnchors(view) {
        const kept = []
        let lastY = -Infinity
        const lo = view.offset - 6 / view.k
        const hi = view.offset + (railH + 6) / view.k
        // Candidates are ascending band indices; skip straight to the window.
        let from = 0
        let to = anchorCandidates.length
        while (from < to) {
          const m = (from + to) >> 1
          if (bands[anchorCandidates[m]].top < lo) from = m + 1
          else to = m
        }
        for (let c = from; c < anchorCandidates.length; c += 1) {
          const index = anchorCandidates[c]
          const band = bands[index]
          if (band.top > hi) break
          const y = (band.top - view.offset) * view.k
          if (y < -6 || y > railH + 6) continue
          if (y - lastY < ANCHOR_MIN_GAP && band.anchorTone === 'user') continue
          kept.push({ index, y, tone: band.anchorTone })
          lastY = y
        }
        const signature = kept.map((a) => a.index + '@' + Math.round(a.y) + a.tone).join(',')
        if (signature === anchorSignature) return
        anchorSignature = signature
        anchorEntries = kept
        // Update in place, never wholesale. A streaming turn rescales the map
        // on every delta; replacing the buttons between a press and its
        // release makes the browser retarget the click at the container — a
        // silently dead click. The top dot invites exactly that: its position
        // barely moves while everything below it reflows.
        const dots = anchorsEl.children
        while (dots.length > kept.length) anchorsEl.lastElementChild.remove()
        for (let i = 0; i < kept.length; i += 1) {
          const anchor = kept[i]
          const band = bands[anchor.index]
          let dot = dots[i]
          if (dot === undefined) {
            dot = doc.createElement('button')
            dot.type = 'button'
            dot.className = 'dsh-strata-anchor'
            anchorsEl.append(dot)
          }
          dot.dataset.tone = anchor.tone
          dot.dataset.index = String(anchor.index)
          delete dot.dataset.active
          dot.style.top = Math.round(anchor.y) + 'px'
          const counted = band.userIndex >= 0 && userTotal > 1
          const label = (T[band.kind] || T.unknown)
            + (counted ? ' ' + (band.userIndex + 1) + '/' + userTotal : '')
          dot.title = label
          dot.setAttribute('aria-label', label)
        }
        activeAnchor = -1
      }

      /**
       * Rescale morph: when a chunk of older history prepends, the map does
       * not snap — the old strata glide from their old positions to the new,
       * compressed ones, and the new history slides in from the top. Encoded
       * as two eased parameters: `offset` (the prepended height, easing to 0)
       * and `height` (the displayed content height, easing to the real one).
       */
      let morph = null
      /** Easing state for a zoom-mode switch: from -> current target. */
      let zoomAnim = null

      /**
       * The current mode's target display window (no animation applied).
       * @returns offset and extent in content px.
       */
      function targetWindow() {
        return windowFor(
          zoomMode, contentHeight, initialExtent,
          scroller === null ? 0 : scroller.scrollTop,
          scroller === null ? 0 : scroller.clientHeight,
        )
      }

      /**
       * Current display mapping, morph-aware. Computed ONCE per frame and
       * handed to every consumer, so the canvas, the dots, the lens and the
       * hit test never disagree about where a band is.
       * @returns `offset` in content px and `k` (rail px per content px).
       */
      function viewParams() {
        const target = targetWindow()
        // A mode switch glides from the old window to the new one.
        if (zoomAnim !== null) {
          const t = (performance.now() - zoomAnim.start) / zoomAnim.duration
          if (t >= 1) {
            zoomAnim = null
          } else {
            const eased = 1 - Math.pow(1 - t, 3)
            return {
              offset: zoomAnim.fromOffset + (target.offset - zoomAnim.fromOffset) * eased,
              k: railH / (zoomAnim.fromExtent + (target.extent - zoomAnim.fromExtent) * eased),
            }
          }
        }
        if (target.extent < contentHeight) {
          // Zoomed scales are pinned: a prepend shifts the offset, never the
          // scale, so no morph applies here.
          return { offset: target.offset, k: railH / target.extent }
        }
        if (morph !== null) {
          const t = (performance.now() - morph.start) / morph.duration
          if (t >= 1) {
            morph = null
          } else {
            const eased = 1 - Math.pow(1 - t, 3)
            return {
              offset: morph.fromOffset * (1 - eased),
              k: railH / (morph.fromHeight + (contentHeight - morph.fromHeight) * eased),
            }
          }
        }
        return { offset: 0, k: railH / contentHeight }
      }

      /**
       * Begin (or restack) the rescale morph for a prepended chunk.
       * @param prepended - content px inserted above the old window.
       */
      function startMorph(prepended) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const current = viewParams()
        morph = {
          start: performance.now(),
          duration: 420,
          // Stacking on a morph in flight: freeze the currently DISPLAYED
          // mapping as the new starting point, so chained loads stay smooth.
          fromHeight: railH / current.k,
          fromOffset: current.offset + prepended,
        }
      }

      /**
       * Rail-space geometry of one band, with the floor its kind declares so a
       * one-line prompt never compresses to nothing.
       * @param band - measured band.
       * @param view - display mapping.
       * @returns `{ y, h, spec }` in rail pixels.
       */
      function geometryOf(band, view) {
        const spec = SPECS[band.kind] || FALLBACK
        return {
          y: (band.top - view.offset) * view.k,
          h: Math.max(spec.min, band.height * view.k),
          spec,
        }
      }

      /**
       * Repaint the band canvas; skipped while nothing that affects it
       * changed. Only bands inside the display window are visited.
       * @param view - display mapping.
       */
      function paintCanvas(view) {
        const tones = palette()
        const ratio = window.devicePixelRatio || 1
        const signature = canvasSignatureOf({
          railW, railH, contentHeight, count: bands.length, hoverIndex, colorStamp,
          zoomMode, offset: view.offset, k: view.k, dpr: ratio,
        })
        if (signature === canvasSignature) return
        canvasSignature = signature

        canvas.width = Math.max(1, Math.round(railW * ratio))
        canvas.height = Math.max(1, Math.round(railH * ratio))
        g.setTransform(ratio, 0, 0, ratio, 0, 0)
        g.clearRect(0, 0, railW, railH)

        // The window plus the tallest floor a band can wear, in content px.
        const slack = 8 / view.k
        const range = visibleRange(bands, view.offset - slack, view.offset + railH / view.k + slack)
        // Two passes: the agent's work first, the user's turns over the top,
        // so an emphasised band is never buried by a long reply behind it.
        for (let pass = 0; pass < 2; pass += 1) {
          for (let index = range.start; index <= range.end; index += 1) {
            const band = bands[index]
            if ((pass === 0) === isUserKind(band.kind)) continue
            const { y, h: height, spec } = geometryOf(band, view)
            if (y + height < -4 || y > railH + 4) continue
            const hovered = index === hoverIndex
            // Hover must not change the band's geometry — a size flick at this
            // scale reads as jitter. Feedback is purely photometric: full
            // alpha, a same-color glow, and a brightness lift painted onto the
            // SAME path.
            const width = Math.max(2, railW * spec.width)
            const x = railW - width
            g.globalAlpha = hovered ? 1 : spec.alpha
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
            if (hovered) {
              g.shadowColor = g.fillStyle
              g.shadowBlur = 7
            }
            g.beginPath()
            if (typeof g.roundRect === 'function') {
              g.roundRect(x, y, width, height, radius)
            } else {
              g.rect(x, y, width, height)
            }
            g.fill()
            if (hovered) {
              g.shadowBlur = 0
              g.shadowColor = 'transparent'
              // Brightness lift on the identical path: works on opaque bands
              // (where raising alpha is a no-op) without touching geometry.
              g.globalAlpha = 0.22
              g.fillStyle = '#ffffff'
              g.fill()
            }
          }
        }
        g.globalAlpha = 1
      }

      /**
       * Move the viewport lens onto the current scroll position.
       * @param view - display mapping.
       */
      function paintLens(view) {
        const viewport = scroller.clientHeight * view.k
        const height = Math.max(10, viewport)
        const y = clamp((scroller.scrollTop - view.offset) * view.k, 0, Math.max(0, railH - height))
        lens.style.height = Math.round(height) + 'px'
        lens.style.transform = 'translateY(' + Math.round(y) + 'px)'
        shadeTop.style.height = Math.max(0, Math.round(y)) + 'px'
        shadeBottom.style.top = Math.round(y + height) + 'px'
        shadeBottom.style.height = Math.max(0, Math.round(railH - y - height)) + 'px'
        const denom = Math.max(1, contentHeight - scroller.clientHeight)
        rail.setAttribute('aria-valuenow', String(Math.round(clamp(scroller.scrollTop / denom, 0, 1) * 100)))
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
        if (!next) closeWall()
      }

      /**
       * The staged session moved: retire everything that belonged to the
       * old one — its prompt list, any load chain still clicking, the wall.
       */
      function checkSession() {
        const sid = getSessionId()
        if (sid === currentSession) return
        currentSession = sid
        promptStore.invalidate(sid)
        loader.cancel()
        closeWall()
        resetWall()
        structureDirty = true
      }

      // ── history loading: one owner ───────────────────────────────────────
      const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
      const loader = createHistoryLoader({
        button: () => olderButton,
        height: () => (scroller === null || !scroller.isConnected ? -1 : scroller.scrollHeight),
        now: () => Date.now(),
        wait,
        onPage: () => {
          if (disposed || scroller === null || !scroller.isConnected) return
          // Re-measure synchronously so the chain's `need()` sees the landed
          // page (userTotal, olderButton) before deciding on the next one.
          rebuild()
          lastScrollHeight = scroller.scrollHeight
          structureDirty = false
          canvasSignature = ''
          schedule()
        },
      })
      let loadEpoch = 0

      /**
       * Run a load chain with the rail's loading choreography: pulsing ⌃,
       * progress bar, and an honest ending — 100% only when the goal was
       * met, amber when the chain stalled, hit its cap or ran out of pager.
       * @param kind - 'zoom' | 'jump'.
       * @param need - whether another page is still wanted.
       * @param progress - `(pages) => percent` for the bar.
       * @returns the loader status.
       */
      async function runChain(kind, need, progress) {
        loadEpoch += 1
        const epoch = loadEpoch
        root.dataset.loading = '1'
        delete root.dataset.loadstate
        loadbar.style.width = '6%'
        const result = await loader.run(kind, need, (pages) => {
          if (epoch !== loadEpoch) return
          loadbar.style.width = clamp(Math.round(progress(pages)), 6, 99) + '%'
        })
        if (disposed || epoch !== loadEpoch) return result.status
        if (result.status === 'cancelled' && loader.active() !== null) {
          // Another chain took the bar over; it will land it.
          return result.status
        }
        if (result.status === 'done') {
          loadbar.style.width = '100%'
          await wait(200)
        } else if (result.status !== 'cancelled') {
          root.dataset.loadstate = 'incomplete'
          older.title = T.incomplete
          await wait(1200)
        }
        if (disposed || epoch !== loadEpoch) return result.status
        root.dataset.loading = '0'
        delete root.dataset.loadstate
        older.title = T.older
        window.setTimeout(() => {
          if (epoch === loadEpoch) loadbar.style.width = '0%'
        }, 300)
        return result.status
      }

      let autoLoadChaining = false
      let lastAutoLoad = 0
      // A click-jump near the top must not fight the load chain: defer loads
      // until the smooth scroll lands, then keep the CLICKED row pinned at the
      // reading line across every prepend — the transcript holds still while
      // only the rail morphs. Any user scroll intent releases the pin.
      let jumpHold = 0
      let pinnedEl = null
      let pinnedUntil = 0
      const releasePin = () => {
        pinnedEl = null
      }

      /**
       * Load older history the moment the reader nears the top — scrolling up
       * IS the request, no matter how the view got there (wheel, lens drag,
       * anchor jump, Home). Trigger inside the top 10% of the CURRENT scroll
       * range, then chain further loads until 30% of headroom stands above the
       * reading position — one chunk barely moves the needle on a long
       * session, and a reader who just topped out would top out again two
       * wheel-ticks later. Every ratio reads the live scrollHeight, so a
       * grown scale never dilutes the thresholds. One load in flight at a
       * time; DSH's anchored prepend keeps the reading position.
       */
      function maybeAutoLoadOlder() {
        if (loader.active() !== null || olderButton === null) return
        if (performance.now() < jumpHold) return
        const range = Math.max(1, scroller.scrollHeight - scroller.clientHeight)
        const ratio = scroller.scrollTop / range
        if (ratio > (autoLoadChaining ? 0.3 : 0.1)) {
          autoLoadChaining = false
          return
        }
        const now = Date.now()
        if (now - lastAutoLoad < 400) return
        lastAutoLoad = now
        let once = true
        loader.run('auto', () => {
          const wanted = once
          once = false
          return wanted
        }).then((result) => {
          if (disposed || scroller === null || !scroller.isConnected) return
          if (result.pages > 0) {
            autoLoadChaining = true
            if (pinnedEl !== null && pinnedEl.isConnected && Date.now() < pinnedUntil) {
              const drift = pinnedEl.getBoundingClientRect().top
                - scroller.getBoundingClientRect().top
                - scroller.clientHeight * 0.12
              // DSH's own anchored prepend usually holds the row; correct
              // only real drift, never nudge a row already in place.
              if (Math.abs(drift) > 48) scroller.scrollTop += drift
            }
          }
          markDirty()
        })
      }

      /** The frame body: rebind, re-measure when dirty, then paint. */
      function paint() {
        frame = 0
        if (disposed) return
        if (!ensureScroller()) {
          setVisible(false)
          return
        }
        checkSession()
        if (structureDirty) {
          rebuild()
          lastScrollHeight = scroller.scrollHeight
          structureDirty = false
          canvasSignature = ''
        } else if (resizedRows.size > 0) {
          applyResizes()
          lastScrollHeight = scroller.scrollHeight
        } else if (scroller.scrollHeight !== lastScrollHeight) {
          // Growth nobody reported (a row inserted without a structural
          // mutation we recognised): fall back to a full measure.
          rebuild()
          lastScrollHeight = scroller.scrollHeight
          canvasSignature = ''
        }
        if (bands.length === 0 || contentHeight <= scroller.clientHeight * SHOW_RATIO) {
          setVisible(false)
          return
        }
        setVisible(true)
        if (layoutDirty) {
          layout()
          layoutDirty = false
          canvasSignature = ''
        }
        const animating = morph !== null || zoomAnim !== null
        const view = viewParams()
        syncAnchors(view)
        paintCanvas(view)
        paintLens(view)
        maybeAutoLoadOlder()
        if (wallOpen) updateWallLinks()
        if (animating) schedule()
      }

      /**
       * Hit-test the rail. User bands win ties: they are the thing the map is
       * for, and a long reply overlaps every prompt inside it. Only the bands
       * around the pointer's content position are examined.
       * @param y - pointer offset within the rail.
       * @param view - display mapping.
       * @returns band index, or -1.
       */
      function bandAt(y, view) {
        const at = view.offset + y / view.k
        const slack = 8 / view.k
        const range = visibleRange(bands, at - slack, at + slack)
        let best = -1
        let bestScore = Infinity
        for (let index = range.start; index <= range.end; index += 1) {
          const { y: top, h: height } = geometryOf(bands[index], view)
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

      // ── clue wall: every user message, full screen ──────────────────────
      // The loaded window is a contiguous suffix of the append-only log, so
      // the LAST K user events map 1:1 in order onto the K user bands; the
      // rest come from the export endpoint. Hovering a user dot opens the
      // wall; clicking a card jumps (chain-loading first when the message
      // sits above the loaded window); Esc / a gap click close it. Only the
      // cards in (and just around) the visible window exist as DOM.
      const WALL_BUFFER = 6
      let wallOpen = false
      let wallBusy = false
      let wallDom = null
      let wallFocusIdx = -1
      /** Current visible window [a, b] into the prompt list. */
      let wallWin = { a: 0, b: -1 }
      /** Persistent connector paths, keyed by prompt index. */
      const wallPaths = new Map()

      /**
       * Fetch and inflate the session's full log through the export endpoint.
       * The ZIP's sizes live in the central directory (streaming writer), so
       * the entry is located from there and inflated with deflate-raw; the
       * inflated text is parsed line by line as it streams.
       * @param sessionId - session to export.
       * @param signal - abort signal for the request.
       * @returns prompts in log order.
       */
      async function fetchPrompts(sessionId, signal) {
        const res = await fetch('/api/session.export?sessionId=' + encodeURIComponent(sessionId), { signal })
        if (!res.ok) throw new Error('export ' + res.status)
        const buf = new Uint8Array(await res.arrayBuffer())
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
        let eocd = -1
        for (let i = buf.length - 22; i >= 0; i -= 1) {
          if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
        }
        if (eocd === -1) throw new Error('no zip directory')
        const count = view.getUint16(eocd + 10, true)
        let offset = view.getUint32(eocd + 16, true)
        for (let n = 0; n < count; n += 1) {
          if (offset + 46 > buf.length || view.getUint32(offset, true) !== 0x02014b50) break
          const method = view.getUint16(offset + 10, true)
          const csize = view.getUint32(offset + 20, true)
          const nameLen = view.getUint16(offset + 28, true)
          const extraLen = view.getUint16(offset + 30, true)
          const commentLen = view.getUint16(offset + 32, true)
          const localOffset = view.getUint32(offset + 42, true)
          const name = new TextDecoder().decode(buf.subarray(offset + 46, offset + 46 + nameLen))
          if (name === 'session.jsonl') {
            if (localOffset + 30 > buf.length) throw new Error('truncated export')
            const lnl = view.getUint16(localOffset + 26, true)
            const lel = view.getUint16(localOffset + 28, true)
            const start = localOffset + 30 + lnl + lel
            if (start + csize > buf.length) throw new Error('truncated export')
            const raw = buf.subarray(start, start + csize)
            const parser = createPromptParser()
            if (method === 0) {
              parser.push(new TextDecoder().decode(raw))
              return parser.end()
            }
            const stream = new Blob([raw]).stream()
              .pipeThrough(new DecompressionStream('deflate-raw'))
            const reader = stream.getReader()
            const decoder = new TextDecoder()
            for (;;) {
              const { value, done } = await reader.read()
              if (done) break
              if (signal !== undefined && signal.aborted) throw new Error('aborted')
              parser.push(decoder.decode(value, { stream: true }))
            }
            parser.push(decoder.decode())
            return parser.end()
          }
          offset += 46 + nameLen + extraLen + commentLen
        }
        throw new Error('session.jsonl not in export')
      }

      const promptStore = createPromptStore({
        fetchPrompts,
        getSessionId,
        now: () => Date.now(),
      })

      /**
       * The loaded user rows as the prompt store wants them: a stable key
       * per row, with the preview text read lazily (innerText forces layout,
       * and the freshness test only needs the keys).
       * @returns rows in transcript order.
       */
      function loadedRows() {
        const rows = []
        for (let u = 0; u < userBandIndex.length; u += 1) {
          const band = bands[userBandIndex[u]]
          rows.push({
            key: band.el.dataset.chatAnchorKey || ('#' + u),
            time: Number(band.el.dataset.time) || 0,
            get text() {
              return previewOf(band)
            },
          })
        }
        return rows
      }

      /** Drop the wall's DOM and state (session switch, dispose). */
      function resetWall() {
        wallCards.textContent = ''
        wallLink.textContent = ''
        wallPaths.clear()
        wallDom = null
        wallWin = { a: 0, b: -1 }
        wallFocusIdx = -1
      }

      /**
       * Bind the wall to one prompt list; a no-op when it already is.
       * @param prompts - the full prompt list.
       */
      function setWallPrompts(prompts) {
        if (wallDom !== null && wallDom.prompts === prompts) return
        resetWall()
        wallDom = {
          prompts,
          /** index -> { el, no, meta, fresh } for the cards that exist. */
          cards: new Map(),
          /** index -> measured height at the current column width. */
          heights: new Map(),
          colW: -1,
          /** index -> last read viewport rect. */
          rects: new Map(),
          settleUntil: 0,
        }
      }

      /**
       * The card element for one prompt, created on demand.
       * @param i - prompt index.
       * @returns the card ref.
       */
      function cardFor(i) {
        let ref = wallDom.cards.get(i)
        if (ref !== undefined) return ref
        const prompt = wallDom.prompts[i]
        const el = doc.createElement('div')
        el.className = 'dsh-strata-wallcard'
        el.dataset.wallIndex = String(i)
        el.dataset.on = '0'
        el.setAttribute('role', 'button')
        el.tabIndex = 0
        const head = doc.createElement('div')
        head.className = 'dsh-strata-wallcardhead'
        const no = doc.createElement('span')
        no.className = 'dsh-strata-wallno'
        const meta = doc.createElement('span')
        head.append(no, meta)
        const body = doc.createElement('div')
        body.className = 'dsh-strata-wallcardbody'
        body.textContent = prompt.text === '' ? T.empty : prompt.text
        el.append(head, body)
        // Land silently; the swap spring only applies to LATER moves.
        el.style.transition = 'none'
        el.style.width = wallDom.colW + 'px'
        wallCards.append(el)
        ref = { el, no, meta, fresh: true }
        wallDom.cards.set(i, ref)
        return ref
      }

      /**
       * Measured height of one card, measuring a small run of neighbours in
       * the same direction at once so a window expansion costs one layout
       * per batch rather than one per card.
       * @param i - prompt index.
       * @param dir - -1 growing upward, +1 downward.
       * @returns height in px.
       */
      function heightOf(i, dir) {
        const known = wallDom.heights.get(i)
        if (known !== undefined) return known
        const total = wallDom.prompts.length
        const from = dir < 0 ? Math.max(0, i - WALL_BUFFER) : i
        const to = dir < 0 ? i : Math.min(total - 1, i + WALL_BUFFER)
        const pending = []
        for (let j = from; j <= to; j += 1) {
          if (!wallDom.heights.has(j)) pending.push(j)
        }
        for (const j of pending) cardFor(j)
        for (const j of pending) wallDom.heights.set(j, wallDom.cards.get(j).el.offsetHeight)
        return wallDom.heights.get(i)
      }

      /**
       * Drop cards (and their strings) far outside the window.
       * @param a - window start.
       * @param b - window end.
       */
      function pruneCards(a, b) {
        for (const [i, ref] of wallDom.cards) {
          if (i >= a - WALL_BUFFER && i <= b + WALL_BUFFER) continue
          ref.el.remove()
          wallDom.cards.delete(i)
          wallDom.rects.delete(i)
          const path = wallPaths.get(i)
          if (path !== undefined) {
            path.remove()
            wallPaths.delete(i)
          }
        }
      }

      /**
       * The focus card's anchor-side slot: rightmost column, vertically
       * aligned with its dot on the rail.
       * @param areaTop - card area top in viewport px.
       * @returns local y of the dot centre, or null (no dot resolvable).
       */
      function wallAnchorLocalY(areaTop) {
        if (wallDom === null) return null
        const total = wallDom.prompts.length
        const loadedStart = Math.max(0, total - userTotal)
        const userIdx = wallFocusIdx - loadedStart
        if (userIdx < 0 || userBandIndex[userIdx] === undefined) return null
        const dot = anchorsEl.querySelector('[data-index="' + userBandIndex[userIdx] + '"]')
        if (dot === null) return null
        const rect = dot.getBoundingClientRect()
        return rect.top + rect.height / 2 - areaTop
      }

      /**
       * Pack cards a..b into masonry columns. The focused card claims the
       * slot NEAREST its anchor — rightmost column, centred on the dot — and
       * the rest flow chronologically around the reservation. Bounded by
       * the on-screen window (a few dozen cards at most), never by the
       * session, so a from-scratch pass per probe stays trivial.
       * @param heightAt - `(i) => px` for cards in the window.
       * @param a - window start.
       * @param b - window end (inclusive).
       * @param geometry - {cols, colW, gap, areaH, anchorY} for this pass.
       * @param place - card placement sink (i, left, top), or null to only measure.
       * @returns tallest column height.
       */
      function packWindow(heightAt, a, b, geometry, place) {
        const { cols, colW, gap, areaH, anchorY } = geometry
        const col = new Array(cols).fill(0)
        let reserved = null
        const focus = wallFocusIdx
        if (focus >= a && focus <= b && anchorY !== null && cols > 1) {
          const h = heightAt(focus)
          const top = clamp(anchorY - h / 2, 0, Math.max(0, areaH - h))
          reserved = { top: top - gap, bottom: top + h + gap }
          if (place !== null) place(focus, (cols - 1) * (colW + gap), top)
        }
        for (let i = a; i <= b; i += 1) {
          if (reserved !== null && i === focus) continue
          const h = heightAt(i)
          let best = -1
          let bestY = Infinity
          for (let c = 0; c < cols; c += 1) {
            let y = col[c]
            if (reserved !== null && c === cols - 1
              && y + h > reserved.top && y < reserved.bottom) {
              y = reserved.bottom
            }
            if (y < bestY) {
              bestY = y
              best = c
            }
          }
          if (place !== null) place(i, best * (colW + gap), bestY)
          col[best] = bestY + h + gap
        }
        let max = Math.max(...col)
        if (reserved !== null) max = Math.max(max, reserved.bottom - gap)
        return max
      }

      /**
       * Lay the wall out as a packed collage. Cards take exactly the height
       * their content needs; the window holds as many as genuinely fit; the
       * spotlight card always lands nearest its anchor, and position changes
       * animate as swaps. Only the window (plus a small buffer) exists as
       * DOM; heights are cached per column width.
       * @param mode - 'around' the focus (default), 'up' ending at anchor,
       *   'down' starting at anchor, or 'keep' the current window.
       * @param anchor - window anchor index for 'up'/'down'.
       */
      function layoutWall(mode, anchor) {
        if (wallDom === null) return
        const prompts = wallDom.prompts
        const total = prompts.length
        wallTitle.textContent = T.wallTitle.replace('{n}', String(total))
        wall.setAttribute('aria-label', wallTitle.textContent)
        wallHint.textContent = T.wallHint
        // The pagers always occupy their rows (visibility, not display), so
        // this measure is the area the cards will really have.
        const area = wallCards.getBoundingClientRect()
        const gap = 10
        const cols = clamp(Math.round(area.width / 230), 1, 3)
        const colW = Math.floor((area.width - gap * (cols - 1)) / cols)
        if (colW !== wallDom.colW) {
          wallDom.colW = colW
          wallDom.heights.clear()
          for (const ref of wallDom.cards.values()) ref.el.style.width = colW + 'px'
        }
        const geometry = {
          cols,
          colW,
          gap,
          areaH: area.height - 4,
          anchorY: wallAnchorLocalY(area.top),
        }
        const heightAt = (i) => heightOf(i, 1)
        const fits = (a, b, dir) => {
          heightOf(dir < 0 ? a : b, dir)
          return packWindow(heightAt, a, b, geometry, null) <= geometry.areaH
        }
        let a
        let b
        if (total === 0) {
          a = 0
          b = -1
        } else if (mode === 'keep' && wallWin.b >= wallWin.a) {
          a = clamp(wallWin.a, 0, total - 1)
          b = clamp(wallWin.b, a, total - 1)
          heightOf(a, 1)
          heightOf(b, 1)
        } else if (mode === 'up') {
          // Page toward earlier cards, then BACKFILL the leftover room with
          // later ones — the window slides, it does not shrink; whatever no
          // longer fits moves to the bottom pager.
          b = clamp(anchor, 0, total - 1)
          a = b
          heightOf(b, -1)
          while (a > 0 && fits(a - 1, b, -1)) a -= 1
          while (b < total - 1 && fits(a, b + 1, 1)) b += 1
        } else if (mode === 'down') {
          a = clamp(anchor, 0, total - 1)
          b = a
          heightOf(a, 1)
          while (b < total - 1 && fits(a, b + 1, 1)) b += 1
          while (a > 0 && fits(a - 1, b, -1)) a -= 1
        } else {
          const focus = clamp(wallFocusIdx, 0, total - 1)
          a = focus
          b = focus
          heightOf(focus, 1)
          let expand = true
          while (expand) {
            expand = false
            if (a > 0 && fits(a - 1, b, -1)) {
              a -= 1
              expand = true
            }
            if (b < total - 1 && fits(a, b + 1, 1)) {
              b += 1
              expand = true
            }
          }
        }
        wallWin = { a, b }
        for (const [i, ref] of wallDom.cards) {
          ref.el.dataset.on = i >= a && i <= b ? '1' : '0'
        }
        pruneCards(a, b)
        const fresh = []
        packWindow(heightAt, a, b, geometry, (i, left, top) => {
          // A card whose height is cached may have been pruned since it was
          // measured; it is re-created here, so the window flag is set on
          // placement, not only in the sweep above.
          const ref = cardFor(i)
          ref.el.dataset.on = '1'
          ref.el.style.left = Math.round(left) + 'px'
          ref.el.style.top = Math.round(top) + 'px'
          if (ref.fresh) fresh.push(ref)
        })
        wallDom.rects.clear()
        wallDom.settleUntil = performance.now() + 400
        wallPagerTop.dataset.on = a > 0 ? '1' : '0'
        wallPagerTop.textContent = T.pageUp.replace('{n}', String(a))
        wallPagerTop.setAttribute('aria-hidden', a > 0 ? 'false' : 'true')
        wallPagerBottom.dataset.on = b < total - 1 ? '1' : '0'
        wallPagerBottom.textContent = T.pageDown.replace('{n}', String(total - 1 - b))
        wallPagerBottom.setAttribute('aria-hidden', b < total - 1 ? 'false' : 'true')
        if (fresh.length > 0) {
          window.requestAnimationFrame(() => {
            for (const ref of fresh) {
              ref.fresh = false
              ref.el.style.transition = ''
            }
          })
        }
        restyleWall()
      }

      /**
       * Update focus/loaded styling, head texts and strings WITHOUT moving
       * any card — the wall-side hover path, so the card under the pointer
       * never slides away.
       */
      function restyleWall() {
        if (wallDom === null) return
        const prompts = wallDom.prompts
        const total = prompts.length
        const loadedStart = Math.max(0, total - userTotal)
        for (let i = wallWin.a; i <= wallWin.b; i += 1) {
          const ref = wallDom.cards.get(i)
          if (ref === undefined) continue
          const { el, no, meta } = ref
          el.dataset.loaded = i >= loadedStart ? '1' : '0'
          el.dataset.focus = i === wallFocusIdx ? '1' : '0'
          no.textContent = String(i + 1)
          const when = prompts[i].time > 0
            ? new Date(prompts[i].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : ''
          meta.textContent = '/' + total + (when === '' ? '' : ' · ' + when)
            + (i < loadedStart ? ' · ' + T.unloaded : '')
          el.setAttribute('aria-label',
            T.cardLabel.replace('{i}', String(i + 1)).replace('{n}', String(total))
            + (prompts[i].text === '' ? T.empty : prompts[i].text)
            + (i < loadedStart ? ' (' + T.unloaded + ')' : ''))
        }
        schedule()
      }

      /**
       * Bezier from every visible card's right edge to its anchor dot
       * (dashed toward the rail top for prompts above the loaded window).
       * Only the spotlight hangs by a solid string; every other card's is
       * dashed and faint. Paths persist across frames — only their
       * attributes change — and card rects are re-read only while a layout
       * is still settling (the wall is fixed; transcript scrolling moves
       * the dots, not the cards).
       */
      function updateWallLinks() {
        if (wallDom === null || !wallOpen) return
        const wallRect = wall.getBoundingClientRect()
        const railRect = rail.getBoundingClientRect()
        const total = wallDom.prompts.length
        const loadedStart = Math.max(0, total - userTotal)
        wallLink.setAttribute('width', String(Math.round(wallRect.width + 64)))
        wallLink.setAttribute('height', String(Math.round(wallRect.height)))
        const settling = performance.now() < wallDom.settleUntil
        for (const [i, path] of wallPaths) {
          if (i < wallWin.a || i > wallWin.b) {
            path.remove()
            wallPaths.delete(i)
          }
        }
        for (let i = wallWin.a; i <= wallWin.b; i += 1) {
          const ref = wallDom.cards.get(i)
          if (ref === undefined) continue
          let cardRect = wallDom.rects.get(i)
          if (cardRect === undefined || settling) {
            cardRect = ref.el.getBoundingClientRect()
            wallDom.rects.set(i, cardRect)
          }
          const startX = cardRect.right - wallRect.left
          const startY = cardRect.top + cardRect.height / 2 - wallRect.top
          let endX = wallRect.width + 60
          let endY = railRect.top + 2 - wallRect.top
          if (i >= loadedStart) {
            const bandIdx = userBandIndex[i - loadedStart]
            const dot = bandIdx === undefined
              ? null
              : anchorsEl.querySelector('[data-index="' + bandIdx + '"]')
            if (dot !== null) {
              const dotRect = dot.getBoundingClientRect()
              endX = dotRect.left + dotRect.width / 2 - wallRect.left
              endY = dotRect.top + dotRect.height / 2 - wallRect.top
            }
          }
          const focused = i === wallFocusIdx
          let path = wallPaths.get(i)
          if (path === undefined) {
            path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
            path.setAttribute('fill', 'none')
            path.setAttribute('stroke', 'var(--dsh-strata-user)')
            wallLink.append(path)
            wallPaths.set(i, path)
          }
          path.setAttribute('stroke-width', focused ? '1.5' : '1')
          path.setAttribute('stroke-opacity', focused ? '0.85' : '0.3')
          // The spotlight is the ONLY solid string; every other card hangs
          // by a dashed one.
          if (focused) path.removeAttribute('stroke-dasharray')
          else path.setAttribute('stroke-dasharray', '4 4')
          const midX = (startX + endX) / 2
          path.setAttribute('d',
            'M ' + Math.round(startX) + ' ' + Math.round(startY)
            + ' C ' + Math.round(midX) + ' ' + Math.round(startY)
            + ', ' + Math.round(midX) + ' ' + Math.round(endY)
            + ', ' + Math.round(endX) + ' ' + Math.round(endY))
        }
        if (settling) schedule()
      }

      /**
       * Open (or refocus) the wall on one LOADED user message; the window
       * centres on it. The prompt list comes from the session-scoped store:
       * the loaded rows at once, the full log when it lands — and only if
       * the stage is still the session that was asked for.
       * @param userIdx - index among the loaded user bands.
       * @param focus - move keyboard focus onto the spotlight card.
       */
      function openWall(userIdx, focus) {
        if (wallBusy) return
        const sessionId = getSessionId()
        wallOpen = true
        cancelWallClose()
        const spotlight = (prompts) => {
          setWallPrompts(prompts)
          wall.dataset.show = '1'
          wallFocusIdx = clamp(
            Math.max(0, prompts.length - userTotal) + userIdx, 0, prompts.length - 1)
          layoutWall('around')
          if (focus === true) {
            const ref = wallDom.cards.get(wallFocusIdx)
            if (ref !== undefined) ref.el.focus({ preventScroll: true })
          }
        }
        const result = promptStore.get(sessionId, loadedRows(), loadedRows)
        spotlight(result.prompts)
        if (result.pending === null) return
        result.pending.then((prompts) => {
          if (disposed || !wallOpen || prompts === null) return
          if (getSessionId() !== sessionId) return
          if (wallDom !== null && wallDom.prompts === prompts) return
          spotlight(prompts)
        })
      }

      /** Close the wall; keyboard focus returns to the rail if it was inside. */
      function closeWall() {
        if (!wallOpen) return
        wallOpen = false
        wall.dataset.show = '0'
        if (wall.contains(doc.activeElement)) rail.focus({ preventScroll: true })
      }

      let wallCloseTimer = 0
      /** Grace-close: leaving the wall AND the rail for 400ms retires it. */
      function scheduleWallClose() {
        if (!wallOpen || wallBusy) return
        if (wallCloseTimer !== 0) window.clearTimeout(wallCloseTimer)
        wallCloseTimer = window.setTimeout(() => {
          wallCloseTimer = 0
          closeWall()
        }, 400)
      }
      /** A pointer back on the wall or the rail keeps it alive. */
      function cancelWallClose() {
        if (wallCloseTimer !== 0) {
          window.clearTimeout(wallCloseTimer)
          wallCloseTimer = 0
        }
      }

      /**
       * Jump to wall entry i, chain-loading older history first when the
       * entry sits above the loaded window, then close the wall.
       * @param i - index into the full prompt list.
       */
      async function wallJump(i) {
        if (wallDom === null || wallBusy) return
        const prompts = wallDom.prompts
        if (prompts[i] === undefined) return
        const loadedStartNow = () => Math.max(0, prompts.length - userTotal)
        if (i >= loadedStartNow()) {
          const bandIdx = userBandIndex[i - loadedStartNow()]
          closeWall()
          if (bandIdx !== undefined) jumpTo(bandIdx)
          return
        }
        // Sequence: the wall retires FIRST, then the rail carries the
        // loading (pulsing ⌃ + real progress bar + the morphs the chunks
        // trigger anyway), and only then the glide-and-flash jump plays.
        wallBusy = true
        closeWall()
        const startLoaded = loadedStartNow()
        let status = 'cancelled'
        try {
          status = await runChain('jump', () => i < loadedStartNow(), () => {
            // Real progress: user rows landed over user rows needed.
            const fraction = clamp(
              (startLoaded - loadedStartNow()) / Math.max(1, startLoaded - i), 0, 1)
            return 6 + fraction * 94
          })
        } finally {
          wallBusy = false
        }
        if (disposed || status !== 'done') return
        const bandIdx = userBandIndex[i - loadedStartNow()]
        if (bandIdx !== undefined) jumpTo(bandIdx)
      }

      const wallIndexOf = (target) => {
        const el = target instanceof Element ? target.closest('.dsh-strata-wallcard') : null
        if (el === null) return -1
        const parsed = Number(el.dataset.wallIndex)
        return Number.isInteger(parsed) ? parsed : -1
      }
      const onWallClick = (event) => {
        const i = wallIndexOf(event.target)
        if (i !== -1) {
          event.preventDefault()
          wallJump(i)
          return
        }
        // The pagers and the title pill are controls, not gaps.
        if (event.target instanceof Element
          && (event.target.closest('.dsh-strata-wallpager') !== null
            || wallHead.contains(event.target))) {
          return
        }
        // A click in the gaps (the transcript shows through) closes the wall.
        closeWall()
      }
      /**
       * Spotlight the card under the pointer (or the one that took focus).
       * @param target - event target.
       */
      const spotlightCard = (target) => {
        const i = wallIndexOf(target)
        if (i === -1 || i === wallFocusIdx || wallDom === null) return
        wallFocusIdx = i
        // Light the mapped band on the rail too.
        const loadedStart = Math.max(0, wallDom.prompts.length - userTotal)
        if (i >= loadedStart && userBandIndex[i - loadedStart] !== undefined) {
          hoverIndex = userBandIndex[i - loadedStart]
          canvasSignature = ''
        }
        restyleWall()
      }
      const onWallOver = (event) => spotlightCard(event.target)
      const onWallFocus = (event) => spotlightCard(event.target)
      const onWallKey = (event) => {
        if (!wallOpen) return
        if (event.key === 'Escape') {
          event.stopPropagation()
          closeWall()
          return
        }
        if ((event.key === 'Enter' || event.key === ' ') && wall.contains(event.target)) {
          const i = wallIndexOf(event.target)
          if (i === -1) return
          event.preventDefault()
          wallJump(i)
        }
      }
      const onPageUp = () => {
        layoutWall('up', wallWin.a - 1)
      }
      const onPageDown = () => {
        layoutWall('down', wallWin.b + 1)
      }
      wall.addEventListener('click', onWallClick)
      wall.addEventListener('mouseover', onWallOver)
      wall.addEventListener('focusin', onWallFocus)
      wall.addEventListener('pointerenter', cancelWallClose)
      wall.addEventListener('pointerleave', scheduleWallClose)
      wallPagerTop.addEventListener('click', onPageUp)
      wallPagerBottom.addEventListener('click', onPageDown)
      doc.addEventListener('keydown', onWallKey, true)

      /**
       * Break the chat view's follow-the-end ownership before an upward
       * glide. Its pinned zone is the last 24px: a smooth scroll eases out of
       * the floor so slowly that its first frames stay inside the zone, and
       * any column resize there (constant while a freshly opened session
       * settles) re-pins to the floor and kills the animation — the click
       * looks dead. An instant hop past the zone reads as reader input in the
       * view's scroll ledger and releases the pin before the glide starts.
       * @param target - glide destination in content px.
       */
      function escapeFollow(target) {
        const floor = scroller.scrollHeight - scroller.clientHeight
        if (target >= floor - 24) return
        if (floor - scroller.scrollTop <= 26) {
          scroller.scrollTop = Math.max(0, floor - 64)
        }
      }

      /**
       * Scroll a band into reading position and flash where it landed.
       * @param index - band index.
       */
      function jumpTo(index) {
        const band = bands[index]
        if (band === undefined) return
        const target = Math.max(0, band.top - scroller.clientHeight * 0.12)
        escapeFollow(target)
        // Hold auto-load until the glide lands; smooth-scroll time grows with
        // distance, so the hold does too (long glides took >1s in practice).
        const distance = Math.abs(target - scroller.scrollTop)
        jumpHold = performance.now() + clamp(500 + distance / 12, 600, 1800)
        pinnedEl = band.el
        pinnedUntil = Date.now() + 6000
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
       * Proportional scrub against the window frozen at pointerdown: the
       * lens centre follows the pointer, and one pixel of pointer travel is
       * always the same one pixel of rail.
       * @param y - pointer offset within the rail.
       */
      function scrubTo(y) {
        if (drag === null) return
        releasePin()
        scroller.scrollTop = scrubTarget(drag, y, railH, scroller.clientHeight)
      }

      /**
       * Pointer offset inside the rail.
       * @param event - pointer event on the rail.
       * @returns y in rail pixels.
       */
      function railY(event) {
        return event.clientY - rail.getBoundingClientRect().top
      }

      let collapseTimer = 0
      const cancelCollapse = () => {
        cancelWallClose()
        if (collapseTimer !== 0) {
          window.clearTimeout(collapseTimer)
          collapseTimer = 0
        }
      }
      const onEnter = () => {
        cancelCollapse()
        expanded = true
        root.dataset.expanded = '1'
        markLayout()
      }
      // Grace-period collapse: the older cap sits above the rail and the dots
      // beside it, so the pointer legitimately grazes past the root's edge on
      // the way to both. Collapsing on a timer instead of on the boundary
      // event keeps the surface up through the crossing; re-entry cancels.
      const onLeave = () => {
        if (drag !== null) return
        scheduleWallClose()
        if (collapseTimer !== 0) window.clearTimeout(collapseTimer)
        collapseTimer = window.setTimeout(() => {
          collapseTimer = 0
          expanded = pinned
          root.dataset.expanded = pinned ? '1' : '0'
          hoverIndex = -1
          markLayout()
        }, 300)
      }
      /** Drag starts only past this much pointer travel — a click is a click. */
      const DRAG_SLOP = 3
      const onMove = (event) => {
        const y = railY(event)
        if (drag !== null) {
          if (!drag.moved && Math.abs(y - drag.startY) < DRAG_SLOP) return
          drag.moved = true
          scrubTo(y)
          return
        }
        const index = bandAt(y, viewParams())
        if (index === hoverIndex) return
        hoverIndex = index
        canvasSignature = ''
        if (index !== -1 && isUserKind(bands[index].kind)) {
          openWall(bands[index].userIndex)
        }
        schedule()
      }
      const onDown = (event) => {
        if (event.button !== 0) return
        const view = viewParams()
        const y = railY(event)
        const index = bandAt(y, view)
        // Freeze the display window for the whole gesture (see scrubTarget).
        drag = { startY: y, offset: view.offset, extent: railH / view.k, moved: false }
        if (index === -1) scrubTo(y)
        else jumpTo(index)
        rail.setPointerCapture(event.pointerId)
        event.preventDefault()
      }
      const onUp = (event) => {
        if (drag === null) return
        drag = null
        if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId)
      }
      const onWheel = (event) => {
        scroller.scrollBy({
          top: wheelPixels(event.deltaY, event.deltaMode, lineHeight, scroller.clientHeight),
        })
        event.preventDefault()
      }
      /** Reflect the active zoom on the switcher buttons. */
      function paintZoom() {
        for (const button of zoomer.children) {
          const on = button.dataset.zoom === zoomMode
          button.dataset.active = on ? '1' : '0'
          button.setAttribute('aria-pressed', on ? 'true' : 'false')
        }
      }
      paintZoom()

      const onZoomClick = (event) => {
        const button = event.target instanceof Element
          ? event.target.closest('button[data-zoom]')
          : null
        if (button === null) return
        const mode = button.dataset.zoom
        if (mode === zoomMode) return
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const current = viewParams()
          zoomAnim = {
            fromOffset: current.offset,
            fromExtent: railH / current.k,
            start: performance.now(),
            duration: 450,
          }
        }
        zoomMode = mode
        try {
          window.localStorage.setItem(ZOOM_KEY, mode)
        } catch {
          // Persistence only.
        }
        paintZoom()
        canvasSignature = ''
        anchorSignature = ''
        schedule()
        // A mode switch retires whatever chain the previous mode started —
        // 全 -> 近 must not keep pulling history in the background.
        const active = loader.active()
        if (active !== null && active.kind === 'zoom') loader.cancel()
        if (mode !== 'all' && mode !== 'mid') return
        // 全 pulls the whole history in; 中 pulls until twice the initial
        // extent is on hand — both with the rail loading bar. An auto page
        // in flight is superseded, never waited out.
        const goal = initialExtent * 2
        const need = () => olderButton !== null
          && (mode === 'all' || scroller.scrollHeight < goal)
        if (!need()) return
        const startHeight = scroller.scrollHeight
        runChain('zoom', need, (pages) => (mode === 'mid'
          ? 10 + 90 * clamp((scroller.scrollHeight - startHeight) / Math.max(1, goal - startHeight), 0, 1)
          : 100 * (1 - Math.pow(0.7, pages + 1))))
      }
      zoomer.addEventListener('click', onZoomClick)

      const onKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          // Keyboard route into the wall: spotlight the prompt you are at.
          let userIdx = -1
          if (activeAnchor >= 0 && anchorEntries[activeAnchor] !== undefined) {
            userIdx = bands[anchorEntries[activeAnchor].index].userIndex
          }
          if (userIdx < 0 && userBandIndex.length > 0) {
            userIdx = bands[userBandIndex[userBandIndex.length - 1]].userIndex
          }
          if (userIdx < 0) return
          event.preventDefault()
          openWall(userIdx, true)
          return
        }
        releasePin()
        const page = scroller.clientHeight
        const steps = {
          ArrowUp: -page * 0.15,
          ArrowDown: page * 0.15,
          PageUp: -page * 0.85,
          PageDown: page * 0.85,
        }
        if (event.key in steps) {
          if (steps[event.key] < 0) escapeFollow(scroller.scrollTop + steps[event.key])
          scroller.scrollBy({ top: steps[event.key], behavior: 'smooth' })
        } else if (event.key === 'Home') {
          escapeFollow(0)
          scroller.scrollTo({ top: 0, behavior: 'smooth' })
        } else if (event.key === 'End') {
          scroller.scrollTo({ top: contentHeight, behavior: 'smooth' })
        } else {
          return
        }
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
      /**
       * Nearest anchor to a viewport y, for clicks whose target dot vanished
       * mid-press (the browser then retargets at the container).
       * @param clientY - click position.
       * @returns band index, or -1 when nothing is within reach.
       */
      const anchorAtY = (clientY) => {
        const y = clientY - anchorsEl.getBoundingClientRect().top
        let best = -1
        let bestDistance = 12
        for (const anchor of anchorEntries) {
          const distance = Math.abs(anchor.y - y)
          if (distance < bestDistance) {
            bestDistance = distance
            best = anchor.index
          }
        }
        return best !== -1 && bands[best] !== undefined ? best : -1
      }
      const onAnchorClick = (event) => {
        let index = anchorIndexOf(event.target)
        if (index === -1) index = anchorAtY(event.clientY)
        if (index === -1) return
        event.preventDefault()
        // Hover already summons the wall; a click takes the shortest path.
        jumpTo(index)
      }
      const onAnchorOver = (event) => {
        const index = anchorIndexOf(event.target)
        if (index === -1) return
        // Light the mapped band too, so the dot and its stratum read as one.
        hoverIndex = index
        canvasSignature = ''
        if (isUserKind(bands[index].kind)) openWall(bands[index].userIndex)
        schedule()
      }
      const onAnchorOut = (event) => {
        if (anchorIndexOf(event.target) === -1) return
        if (anchorIndexOf(event.relatedTarget) !== -1) return
        hoverIndex = -1
        canvasSignature = ''
        schedule()
      }
      anchorsEl.addEventListener('click', onAnchorClick)
      anchorsEl.addEventListener('mouseover', onAnchorOver)
      anchorsEl.addEventListener('mouseout', onAnchorOut)
      // The dots sit outside the rail, but a wheel gesture over them should
      // scroll the transcript all the same — dead zones read as bugs.
      anchorsEl.addEventListener('wheel', onWheel, { passive: false })
      rail.addEventListener('pointerenter', onEnter)
      // Collapse on leaving the ROOT, not the rail: expansion shifts the dot
      // column 14px left, so collapsing the moment the pointer crosses from
      // the rail toward a dot would slide that dot out from under the aim.
      root.addEventListener('pointerleave', onLeave)
      // Re-entering ANY part of the surface cancels a pending collapse, so
      // crossing between the rail and the dot column never races the grace
      // timer.
      root.addEventListener('pointerenter', cancelCollapse)
      rail.addEventListener('pointermove', onMove)
      rail.addEventListener('pointerdown', onDown)
      rail.addEventListener('pointerup', onUp)
      rail.addEventListener('pointercancel', onUp)
      rail.addEventListener('wheel', onWheel, { passive: false })
      rail.addEventListener('dblclick', onDoubleClick)
      rail.addEventListener('keydown', onKeyDown)
      const onResize = () => {
        // The wall is fixed and vw-sized: its cards move with the window.
        if (wallOpen) layoutWall('keep')
        markLayout()
      }
      window.addEventListener('resize', onResize)
      const onVisibility = () => {
        if (doc.hidden) return
        layoutDirty = true
        markDirty()
      }
      doc.addEventListener('visibilitychange', onVisibility)
      // Session switches arrive from the store, not from a poll.
      const unsubscribeSessions = subscribeSessions(schedule)

      if (pinned) {
        expanded = true
        root.dataset.expanded = '1'
      }

      // Safety net for the states no observer reports (a scrollport swapped
      // in by a composition change, a DPR change): a slow tick, idle while
      // the page is hidden. Scroll, size, structure and session changes all
      // have their own signals now.
      const ticker = window.setInterval(() => {
        if (doc.hidden) return
        markLayout()
      }, 3000)
      schedule()

      return () => {
        disposed = true
        loader.cancel()
        promptStore.dispose()
        unsubscribeSessions()
        if (collapseTimer !== 0) window.clearTimeout(collapseTimer)
        if (frame !== 0) window.cancelAnimationFrame(frame)
        window.clearInterval(ticker)
        window.removeEventListener('resize', onResize)
        doc.removeEventListener('visibilitychange', onVisibility)
        rail.removeEventListener('pointerenter', onEnter)
        root.removeEventListener('pointerleave', onLeave)
        root.removeEventListener('pointerenter', cancelCollapse)
        rail.removeEventListener('pointermove', onMove)
        rail.removeEventListener('pointerdown', onDown)
        rail.removeEventListener('pointerup', onUp)
        rail.removeEventListener('pointercancel', onUp)
        rail.removeEventListener('wheel', onWheel)
        rail.removeEventListener('dblclick', onDoubleClick)
        rail.removeEventListener('keydown', onKeyDown)
        zoomer.removeEventListener('click', onZoomClick)
        anchorsEl.removeEventListener('click', onAnchorClick)
        anchorsEl.removeEventListener('mouseover', onAnchorOver)
        anchorsEl.removeEventListener('mouseout', onAnchorOut)
        anchorsEl.removeEventListener('wheel', onWheel)
        // Hand the scrollbar back — with its original inline values — before
        // letting go of the element.
        thumb.release()
        if (scroller !== null) {
          scroller.removeEventListener('scroll', schedule)
          scroller.removeEventListener('wheel', releasePin)
          scroller.removeEventListener('pointerdown', releasePin)
        }
        resizeObserver.disconnect()
        seatObserver.disconnect()
        rowObserver.disconnect()
        flowObserver.disconnect()
        themeObserver.disconnect()
        if (wallCloseTimer !== 0) window.clearTimeout(wallCloseTimer)
        wall.removeEventListener('click', onWallClick)
        wall.removeEventListener('mouseover', onWallOver)
        wall.removeEventListener('focusin', onWallFocus)
        wall.removeEventListener('pointerenter', cancelWallClose)
        wall.removeEventListener('pointerleave', scheduleWallClose)
        wallPagerTop.removeEventListener('click', onPageUp)
        wallPagerBottom.removeEventListener('click', onPageDown)
        doc.removeEventListener('keydown', onWallKey, true)
        resetWall()
        wall.remove()
        anchorsEl.remove()
        rail.remove()
        zoomer.remove()
      }
    }

    /** Resolved by apply(); reads the current session id off ctx.sessions. */
    let getSessionId = () => undefined
    /** Resolved by apply(); subscribes to the session list store. */
    let subscribeSessions = () => () => {}

    /**
     * The slot entry: a bare element the imperative engine owns.
     * @returns the overlay entry element.
     */
    function TraceMinimap() {
      const ref = react.useRef(null)
      react.useEffect(() => {
        const element = ref.current
        if (element === null) return undefined
        return mountMinimap(element, getSessionId, subscribeSessions)
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
      getSessionId = () => {
        const sessions = ctx.get('sessions')
        if (sessions === undefined) return undefined
        try {
          return sessions.list.getSnapshot().current
        } catch {
          return undefined
        }
      }
      subscribeSessions = (listener) => {
        const sessions = ctx.get('sessions')
        if (sessions === undefined) return () => {}
        try {
          const off = sessions.list.subscribe(listener)
          return typeof off === 'function' ? off : () => {}
        } catch {
          return () => {}
        }
      }
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'strata',
        order: 40,
      }, TraceMinimap))
    }

    exports.TraceMinimap = TraceMinimap
    exports.apply = apply
    exports.inject = inject
    /** DOM-free logic, exposed for `node --test`; not a public API. */
    exports.internals = {
      CSS,
      SPECS,
      clamp,
      isUserKind,
      windowFor,
      canvasSignatureOf,
      scrubTarget,
      visibleRange,
      wheelPixels,
      createThumbSuppressor,
      promptOf,
      createPromptParser,
      parsePrompts,
      createPromptStore,
      createHistoryLoader,
      LOAD_PAGE_CAP,
      LOAD_PAGE_TIMEOUT,
    }
    return module.exports
  },
})
