# AGENTS.md

## Project
Pullback Playbook

## Purpose
This app is a simple, fast trading workflow tool for a UK-based retail trader using a Quality Pullback strategy. The app is not meant to be a general stock screener or a fully automated trading bot. Its purpose is to help the user quickly review a watchlist, record chart observations, upload chart screenshots, generate structured analysis prompts, and keep a clean trading workflow on desktop and mobile.

## User profile
- UK-based trader
- Typical account size: £4,000
- Standard max risk per trade: £40
- Prefers simple workflows over complex dashboards
- Uses ChatGPT as part of the analysis workflow
- Wants a mobile-friendly app that can be installed and used like a lightweight home-screen app

## Core trading strategy
This app supports a **Quality Pullback** workflow.

### Strategy rules
Prefer:
- Strong stocks in an uptrend
- Pullbacks near the 20 MA or 50 MA
- Evidence of stabilisation or bounce before entry
- Previous swing high as the first target

Avoid:
- Weak or broken trends
- Chasing extended price
- Taking trades without stabilisation or bounce
- Overcomplicated indicators or unnecessary noise

### Checklist fields per ticker
Each ticker panel should support these fields:
- Uptrend
- Near 20MA
- Near 50MA
- Stabilising
- Bounce
- Room to swing high

These should be visible, simple, and quick to update. If partial automation is added later, preserve manual override.

## Market context
All prompt generation and analysis workflows should include a market status field.

Examples:
- S&P above 50 MA
- S&P below 50 MA

Do not omit market status from generated prompts.

## Risk rules
Always respect these defaults unless the user changes them in settings:
- Account size: £4,000
- Max risk per trade: £40

Where relevant, include:
- Entry
- Stop
- Estimated risk per share
- Approximate position size based on £40 max risk

Do not present risky trade sizing that ignores the user’s stated max loss rule.

## Product goals
Prioritise the following:

1. Speed
- Fast load
- Minimal friction
- Low number of taps/clicks

2. Simplicity
- Clear layout
- No clutter
- Avoid feature bloat

3. Mobile usability
- Reliable tap targets
- Responsive layout
- PWA-friendly behaviour
- No broken menus or hidden actions

4. Workflow integration
- Help the user move from ticker review -> chart review -> prompt generation -> logging outcome
- Reduce copy/paste where possible
- Keep ChatGPT handoff clean and structured

5. Persistence
- Watchlists, notes, checklist states, market status, and chart references should persist locally unless the user clears them

## UI style
The app should feel:
- Clean
- Functional
- Lightweight
- Touch-friendly
- Plain-English, not jargon-heavy

Prefer:
- Cards/panels for each ticker
- Clear primary buttons
- Strong visual separation between watchlist, chart input, checklist, and generated prompt
- Straightforward labels

Avoid:
- Flashy animations unless subtle and useful
- Dense tables on mobile
- Overuse of modals
- Tiny icons without labels
- Hidden navigation that makes the app feel broken

## Feature priorities
When improving the app, prioritise these features first:

### High priority
- Robust ticker search
- Add/remove tickers easily
- Prevent duplicate tickers
- Persistent watchlist
- Per-ticker notes
- Per-ticker chart upload or drag/drop
- One-click prompt generation
- Market status included in all prompts
- Reliable mobile navigation
- Fix broken buttons / state bugs / routing issues
- Import/export of user data

### Medium priority
- Recent ticker history
- Prompt templates
- Trade diary/history
- Position size helper
- Better install/PWA prompts
- Cleaner error messages
- Basic validation for ticker input and uploaded files

### Lower priority
- Full technical automation from APIs
- Advanced analytics
- Multi-user functionality
- Heavy charting libraries unless clearly needed

## Chart workflow
The user wants chart sharing and less manual copy/paste.

Preferred workflow:
1. User adds ticker
2. User uploads or drags in a chart screenshot
3. User updates checklist fields
4. App stores notes and chart per ticker
5. App generates a clean ChatGPT-ready prompt or direct handoff payload

If a direct ChatGPT/API workflow is added, structure it so the user still sees:
- ticker
- checklist state
- notes
- market status
- risk rules
- prompt/result history if possible

## Prompt generation rules
Generated prompts should be clean, consistent, and in plain English.

Each analysis prompt should include:
- Ticker
- Market status
- Strategy rules
- User account size
- Max risk per trade
- Any uploaded chart context
- Request for verdict in simple categories

Preferred verdict labels:
- Watch
- Near Entry
- Entry
- Avoid

Where relevant, generated prompts may also ask for:
- Plain-English chart read
- Suggested entry
- Suggested stop
- First target near previous swing high

## Data/storage rules
Prefer simple, reliable persistence.

Store locally:
- Watchlist
- Checklist state
- Notes
- Market status
- Risk settings
- Prompt history if implemented
- Trade diary if implemented
- References to uploaded chart assets where practical

Be careful not to break existing local data structures without migration logic.

## Engineering rules
- First inspect the full codebase before making structural changes
- Preserve existing working features where possible
- Fix broken UX before adding flashy features
- Use modular components and utilities
- Keep naming clear and readable
- Avoid unnecessary dependencies
- Keep the app easy to run locally
- Avoid introducing backend requirements unless clearly necessary
- If adding API integration, keep it optional and well-isolated

## Refactor expectations
When refactoring:
- Identify framework, entry points, state management, storage, and routing
- Consolidate duplicated logic
- Improve reliability of buttons and interactions
- Improve mobile responsiveness
- Reduce brittle code and hard-coded paths
- Keep the app purpose focused

## Output expectations for code changes
When making changes, provide:
1. Summary of what changed
2. File-by-file explanation
3. Any setup steps needed
4. Any known limitations
5. Suggestions for next sensible improvements

## Things to avoid
Do not:
- Turn the app into a generic stock trading platform
- Add unnecessary complexity
- Add fake or placeholder features presented as complete
- Break the current workflow in pursuit of a redesign
- Ignore mobile usability
- Ignore the user’s fixed risk rules
- Remove the simple checklist workflow

## Nice-to-have future ideas
Only after core stability is improved:
- Saved trade journal with outcome review
- Tag setups by quality
- Simple screenshot gallery per ticker
- Optional OpenAI API integration for in-app analysis
- Optional market data integration for MA checks
- Export to CSV/JSON
- Reusable strategy templates

## Definition of success
A successful improvement should leave the app:
- Easier to use on phone and desktop
- More reliable
- Faster to move through the pullback workflow
- Less dependent on copy/paste
- Better at storing watchlist, chart, and prompt data
- Clearly aligned with the user’s Quality Pullback strategy