# Control Strip Refactor Notes

## Purpose
Replace the bulky header with a compact, always-visible control strip.
This should reduce vertical space and improve scan workflow speed.

## Interaction Model
- Chips represent current scan settings
- Tap a chip opens an inline selector below
- Only one selector open at a time
- Selecting an option updates value and closes selector
- No apply/confirm step

Special:
- Account / Risk chip opens modal (not inline selector)

## Controls

Control strip must include:
- Market
- Account / Risk
- Scanner Mode (TradingView / Curated)
- Setup Type (20MA / 50MA / Unknown)

## Keep / Remove

Keep visible:
- OCR import
- Manual ticker input
- Run Scan

Remove:
- Header / Market Context section
- duplicated controls

Move to Advanced:
- Scanner universe
- list name
- advanced tools

## Constraints

- Do NOT change scan logic
- Do NOT change scoring logic
- Do NOT change watchlist logic
- Do NOT change review workspace
- Layout + interaction only

## Visual Style

- Compact chips
- subtle borders
- dark theme
- inline selector feels attached to chips
