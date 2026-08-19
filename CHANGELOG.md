# Changelog

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
