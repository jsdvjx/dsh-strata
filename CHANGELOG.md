# Changelog

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
