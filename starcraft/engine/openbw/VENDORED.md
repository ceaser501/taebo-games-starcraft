# OpenBW (vendored)

From https://github.com/OpenBW/openbw at commit `4b046d5f65302b10cb0a745f0fecd37ec85b20a8`
(headers only; the asio network servers and the SDL front end are left out).

Local changes, all marked with comments:

- `ui/ui.h`: tileset tiles come from Remastered `.vx4ex` (32-bit entries), not 1.16 `.vx4`.
- `ui/ui.h`: tileset graphics load on first use instead of all eight at start.
- `ui/ui.h`: `sprite_visible_to_viewer` hook so the page can hide sprites under fog of war.
- `bwgame.h`: maps in the Remastered CHK versions (64, 205, 206) and the `STRx` string chunk load.
