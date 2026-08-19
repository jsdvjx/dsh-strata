# Changelog

## 0.5.3 — 2026-08-19

Climbing to the ends of the deck can no longer strand the pointer.

- Even distribution divided the shrinking headroom among the remaining
  strips, so approaching the top squeezed them into an unselectable pile.
  Spacing is now itself a gradient with a GUARANTEED zone: the three strips
  nearest the focus always expose 16px — the bubble travels with each
  climb, so the next card is always hittable — while farther strips
  compress geometrically (9 → 5 → 4px floor) and re-expand as the focus
  approaches them.
- The stack may overflow the rail by 44px at either end (it is an overlay),
  so the ceiling is no longer a hard wall; whatever still does not fit
  folds into the count chips, and the wheel remains the precise fallback.

## 0.5.2 — 2026-08-19

- The focus card hugs its anchor again: hovering a dot centres the card on
  that dot's y (clamped at the rail edges; verified Δ ≤ 1px mid-rail). An
  in-deck refocus instead keeps the hovered card's own centre, so it stays
  under the pointer, and the other cards spread EVENLY over the space above
  and below — a fresh distribution each time, nothing accumulates.
- Longer gradient range: width recedes 4%/step down to a 60% floor and
  height 1px/step down to the one-line floor, so the falloff spans ten
  cards instead of saturating after three.

## 0.5.1 — 2026-08-19

Deck gradient tuning.

- Card height never dips below one full line of content (22px floor; the
  12px minimum crushed the strips).
- WIDTH now carries the depth gradient: the focus spans the full deck, and
  neighbours recede 94% → 66% with distance, right edges staying with the
  rail — a much steeper, clearer falloff than height alone allowed.
- The ordinal is its own element: bold, accent-blue, instantly scannable.
- The spring transition covers width as well.

## 0.5.0 — 2026-08-19

The deck becomes a macOS-dock fisheye.

- The card stack now spans the full rail height on a fixed index grid — the
  deck area matches the scrollbar it annotates.
- The hovered card magnifies in place around its own slot; neighbours shrink
  and part with distance (size and shove both taper), far cards rest small at
  their grid positions. Movement settles on a springy overshoot curve
  (disabled under prefers-reduced-motion).
- The stable grid replaces the whole pinned/frozen-frame machinery: nothing
  can drift, cascade, or leave holes by construction, because the focus
  always expands centred on the slot the pointer is already inside.

## 0.4.7 — 2026-08-19

- Hovering a user dot always opens the deck again after history loads in.
  A fully loaded rail packs the anchors densely, and a neighbouring error
  dot's invisible hit halo — a later DOM sibling — could sit on top of a
  user dot's centre: the hover then read as the error dot and the deck
  closed instead of opening. Hit priority is now semantic (user dots above
  error dots above compaction marks) and the halos are tighter. Verified by
  sweeping every user dot on the fully loaded rail.

## 0.4.6 — 2026-08-19

- No more hole in the middle of a pinned stack. The pinned frame used to be a
  raw snapshot of the anchored layout, which reserved the entry focus's full
  expanded height — refocusing away collapsed the card and left a ~70px gap
  in its place, forever. Entering the deck now builds a COMPACT frame (every
  card a uniform strip slot; the expanded card is only an overlay), so a
  collapsing focus lands exactly in its slot.
- Fresh prompt lists merge into the OPEN deck dynamically: when the export
  fetch lands (or a reopen finds new messages), the focused card keeps its
  position to the pixel — matched by seq, else by tail distance — and a
  pinned session gets a new compact frame anchored at the old focus top,
  with the new cards joining above.

## 0.4.5 — 2026-08-19

Pinned-mode layout rebuilt around a frozen frame — climbing the deck no
longer pushes it away from under the pointer.

- Expand-in-place accounting was structurally biased: the focus card is ~70px
  taller than a strip, and pinning its top pushed that surplus downward on
  every upward refocus, drifting the stack until cards fell off both ends.
  Entering the deck now freezes EVERY strip position for the whole pinned
  session; the focus expands as an overlay on its own strip.
- The overlay opens toward where the pointer came from, covering only visited
  strips — and the direction is never flipped: when the room on that side
  runs out, the card shrinks to fit instead of burying the strips ahead
  (the old bounds-flip could hide the entire upper half behind one tall card).
- Verified by a strip-by-strip climb across the whole deck: pointer lands on
  every aimed card, zero drifted strips, all cards reachable.

## 0.4.4 — 2026-08-19

- The deck no longer vanishes while the pointer travels to it. Crossing the
  10px gap between the rail and the cards starts the grace-collapse timer,
  but the cancel listened on the rail alone — landing on a card lost the
  race and the deck closed under the pointer. Re-entering ANY part of the
  surface (rail, dots, deck) now cancels the pending collapse, and the grace
  window is 300ms.

## 0.4.3 — 2026-08-19

Deck stability and performance.

- Two layout modes, keyed to where the pointer is. Anchored (pointer on the
  rail): the stack follows the hovered anchor as before. Pinned (pointer on
  the deck): the base freezes — refocusing keeps the hovered card's top
  exactly where the pointer found it and expands it in place, so a card can
  never slide out from under the cursor and trigger the hover cascade that
  made the stack jump around.
- The deck DOM is now persistent: cards, connector paths and chips are built
  once per prompt list and reused — a refocus flips data-focus, moves tops,
  and rewrites path data in place instead of rebuilding everything, and top
  shifts glide on a 140ms transition instead of snapping.

## 0.4.2 — 2026-08-19

- Every deck card now draws its own bezier back to its anchor dot, fanning
  out across the gap: the focus line strong, the rest faint, and unloaded
  prompts dashed and converging on the top-right corner where their history
  extends past the map.

## 0.4.1 — 2026-08-19

Deck layout redesigned around the anchor:

- The focused card now sits beside its anchor dot (clamped to the rail), and
  shows the message in full when it fits (up to 14 lines).
- The other cards shingle away from the focus like a library card file —
  absolutely stacked, each showing only its top strip with index, time and an
  inline snippet; capacity overflow folds into ↑/↓ count chips.
- A bezier connector ties the focused card to its anchor dot; an unloaded
  focus points at the top of the rail where its history would extend.

## 0.4.0 — 2026-08-19

The prompt deck: hover a user band or its anchor dot and every user message
in the session stacks up as cards — including the ones above the loaded
window, read from the session's own export log (`/api/session.export`,
unzipped in the browser; the loaded window is a contiguous log suffix, so
the log tail aligns 1:1 with the loaded bands). The hovered card expands,
the rest compress to one-line slivers with timestamps; unloaded prompts are
marked with a hollow dot. Wheel steps focus, click jumps — an unloaded
prompt chain-loads the missing history first, then lands on the message.
Falls back to loaded-only cards when the export endpoint is unavailable.

## 0.3.8 — 2026-08-19

- Clicks made right after a session opens no longer die. The chat view pins
  itself to the floor and re-pins on every column resize while ownership is
  pinned; a smooth glide eases out of the floor so slowly that its first
  frames stay inside the 24px pinned zone — and a freshly opened session
  resizes constantly (markdown, images, highlighting settling), so the glide
  was routinely yanked back and killed. Upward jumps and keyboard moves now
  hop out of the pinned zone instantly first (which the view's scroll ledger
  attributes to the reader, releasing the pin), then glide. Verified against
  a forced 60ms resize storm: the glide survives start to finish.

## 0.3.7 — 2026-08-19

- Hover feedback is now purely photometric: the band's geometry never
  changes. Full alpha, the same-color glow, and a brightness lift painted
  onto the identical path — verified by pixel scan (span unchanged,
  brightness up) — replace the earlier widen, whose size flick read as
  jitter at band scale.

## 0.3.6 — 2026-08-19

- The hover stroke is gone: even inset and clamped it read as visual noise on
  the small bands. Hover keeps the widen plus the same-color glow.

## 0.3.5 — 2026-08-19

- The hover stroke is now a true inner stroke: the path is inset by half the
  line width and clamped to the canvas, and thin bands get a proportionally
  thinner line. A canvas stroke rides the path, so half of the previous one
  landed outside the band — swallowing thin bands and bleeding toward
  neighbours and past the canvas edge.

## 0.3.4 — 2026-08-19

- Hovering a band now highlights it visibly regardless of its resting
  opacity. The old treatment only raised alpha to 1 — a no-op on the user
  blue and error red, which already sit at 1. A hovered band now widens,
  glows in its own color, and carries a bright inner stroke; full-width
  bands (where the widening clips at the canvas edge) still read through
  the stroke and glow.

## 0.3.3 — 2026-08-19

- The lens gains an accent-blue edge glow — an outer halo spilling past the
  rail plus a faint inner wash — so the reading position registers even on
  the 12px resting rail.

## 0.3.2 — 2026-08-19

- A click-jump near the top no longer stutter-hops through the load chain:
  auto-load defers until the glide lands (hold scales with distance), and the
  clicked row is pinned at the reading line across every prepend — corrected
  only on real drift (>48px), released by any manual scroll (wheel, drag,
  scrub, keyboard).
- The viewport now stands out on the rail: everything outside the lens dims
  toward the page background and the lens carries an accent-blue edge — the
  classic minimap focus treatment.

## 0.3.1 — 2026-08-19

Auto-load tuning and a rescale animation.

- Loading a chunk of history now morphs the map instead of snapping it: the
  existing strata glide to their compressed positions while the new history
  slides in from the top, lens and anchor dots riding the same eased mapping
  (420ms, starts on the exact frame the growth lands, skipped under
  prefers-reduced-motion).
- Thresholds are live ratios of the current scroll range, re-read on every
  check so a grown scale never dilutes them: loading triggers inside the top
  10%, then chains until 30% of headroom stands above the reading position —
  one chunk barely moves the needle on a long session, and without the
  headroom a reader tops out again two wheel-ticks later.

## 0.3.0 — 2026-08-19

Discovering older history no longer requires aiming at a tiny button.

- Scrolling (or dragging the lens, or jumping, or pressing Home) to the top
  of the transcript now auto-loads older history; the map rescales as it
  arrives, and holding the lens at the very top chain-loads. One load in
  flight at a time, and DSH's own anchored prepend keeps the reading position.
- The `⌃` above the rail is now a pure indicator: visible whenever unloaded
  history remains (no hover needed), gone when everything is loaded, and no
  longer clickable — there is nothing left to click for.

## 0.2.2 — 2026-08-19

The ⌃ load-older cap was practically unclickable: it sat 13px above the rail
with a 1px dead gap in between, so the slow, aimed pointer travel it demands
sampled the gap, collapsed the rail, and hid the cap mid-approach.

- Collapse now runs on a 260ms grace timer instead of the boundary event;
  re-entering (the cap and the anchor dots included) cancels it.
- The cap's bottom edge is flush with the rail and it carries a generous
  invisible hit halo; slightly larger glyph.
- A press on the cap no longer falls through to the rail's scrub handler,
  which used to yank the view to the top before the load even started.

## 0.2.1 — 2026-08-19

Fixes two ways an anchor-dot click could die, both worst at the topmost dot:

- Anchor dots are now updated in place instead of being rebuilt wholesale.
  A streaming turn rescales the map on every delta; replacing the buttons
  between a press and its release made the browser retarget the click at the
  container, silently dropping it. The top dot invited exactly that — its
  position barely moves while everything below it reflows. A position-based
  fallback also recovers any click whose target dot vanished mid-press.
- The rail now collapses on leaving the whole root, not the rail: collapsing
  shifts the dot column 14px, so the old behavior slid the aimed-at dot out
  from under the pointer while crossing from the rail toward it.

## 0.2.0 — 2026-08-19

- The rail now sits in the transcript's own scrollbar gutter and suppresses the
  native thumb through the theme's `--dsh-scrollbar-thumb` seam while visible;
  the scrollbar is handed back the moment the map stands down.
- Anchor dot column beside the rail: blue for every user message, red for every
  failed tool call or command, click to jump, reading position stays enlarged.
- Hovering a dot lights the band it maps to; wheel over the dots scrolls.
- Scrollbar semantics (`role=scrollbar`, live `aria-valuenow`) and keyboard
  control on the rail: arrows nudge, PageUp/Down page, Home/End jump.
- Failed rows are detected through `data-state="error"` (the convention the
  tool and command renderers actually use); `data-error` kept as fallback.
- Load-older cap matches the pager by its label before falling back to position.

## 0.1.0 — 2026-08-18

- First release: to-scale minimap of the loaded conversation in the Web GUI,
  bands colored by Chat Node kind, user messages emphasised, hover preview
  card, click-to-jump with landing flash, proportional drag scrub, wheel
  scroll, double-click pin, load-older cap, theme-token palette, and
  stand-down on non-chat views.
