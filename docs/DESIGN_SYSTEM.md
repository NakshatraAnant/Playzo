# PLAYZO Design System

Source of truth: `client/src/styles/tokens.css` (tokens) and `client/src/styles/app.css` (components).

## Identity
- **Name:** PLAYZO, always in capitals.
- **Wordmark:** Unbounded 900; the final **O** is a glowing ring with a play triangle (`Logo` component, `favicon.svg`).
- **Tagline:** *Aaja PLAYZO pe khelte hain!*
- **Signature gradient ("Zo gradient"):** magenta `#ff3d8b` → ember `#ff7a3d` → saffron `#ffb02e`. Cool counterpoint: cyan `#3dd9ff` / violet `#8b5cff`.
- **Atmosphere:** deep midnight `#07040f` with radial colour fields.
- **Lounge:** shifts to brass and gold (`--grad-lounge`) on felt tables, so the adult environment looks visibly different.

## Tokens
| Group | Tokens |
|---|---|
| Surfaces | `--bg-0..3`, `--surface`, `--surface-2/3`, `--glass`, `--line`, `--line-2` |
| Text | `--text` (16.4:1 on bg-1), `--text-2` (9.1:1), `--text-3` (5.0:1): all WCAG AA |
| Semantic | `--ok`, `--warn`, `--bad`, `--info` |
| Type | Display: Unbounded; Body: Plus Jakarta Sans; fluid scale `--fs-xs..3xl` |
| Spacing | 4px grid `--s-1..16` |
| Radii | `--r-xs 8` … `--r-xl 32`, `--r-pill` |
| Elevation | `--sh-1`, `--sh-2`, `--sh-glow` |
| Motion | `--ease-out`, `--spring`, `--t-fast 140`, `--t-med 260`, `--t-slow 520`; all collapse under `prefers-reduced-motion` |
| Layout | top bar 60, tab bar 68, rail 232, content max 1280, gutter 16/24/32 |
| Breakpoints | phone 360-430 (primary), 768 tablet, 1024 rail appears, 1366/1440 desktop |

## Components
- **Controls:** `btn` (primary / cool / ghost / danger / gold, sm / lg, icon), `chip` (tones), `panel`, `tile` (game card with original cover art).
- **Feedback:** `modal` (bottom sheet on phones, dialog on desktop, focus-managed, Esc to close), `toast`, `skel`, `empty`.
- **Forms:** `field`, `input`, `seg`, `search`.
- **Game stage:** `hud`, `timebar`, `answer-grid`, `results`.
- **Lounge:** `felt`, `casino-chip`, `playing-card`.

## Per-game worlds
Every game has a named world, a two-stop background and an accent (`catalogue.theme`). These drive its cover art, HUD accents and detail page. Examples: *Firefly Labyrinth*, *Obsidian Court*, *Riviera Midnight*.

## Equippable themes
Midnight (default), Aurora, Sunset Bazaar, Deep Ocean, Royal Plus. Set via `data-theme` on `<html>`.

## Accessibility
- Visible focus rings; skip link; every game playable by keyboard where it applies.
- Colour-blind modes: Color Dash symbols, shapes on gems and stones.
- Reduced-motion paths throughout; `aria-live` for game feedback; labelled boards and cells.
