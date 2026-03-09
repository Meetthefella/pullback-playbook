# Pullback Playbook

A lightweight web app designed to support a **Quality Pullback trading workflow**.

The goal is not to automate trading or act as a full market screener. Instead, the app helps quickly organise watchlists, review charts, capture trade setups, and generate structured prompts for analysis.

The app is designed to run as a **fast mobile-friendly PWA** that can be installed to the home screen.

---

# Strategy

The workflow is based on a **Quality Pullback strategy**.

## Core principles

Prefer:

- Strong stocks in an uptrend
- Pullbacks near the **20 MA** or **50 MA**
- Price stabilising or bouncing
- Previous swing high used as the **first target**

Avoid:

- Weak or broken trends
- Extended stocks
- Entering before stabilisation
- Overcomplicated indicators

---

# Risk Rules

Default user configuration:

Account size: **£4,000**  
Maximum risk per trade: **£40**

Any position sizing helpers should respect these limits.

---

# Core Features

Current and planned capabilities include:

### Watchlist management
- Add/remove tickers
- Prevent duplicate tickers
- Persistent watchlist storage

### Setup checklist
Each ticker panel includes a quick checklist:

- Uptrend
- Near 20MA
- Near 50MA
- Stabilising
- Bounce
- Room to swing high

These are simple yes/no workflow fields.

### Chart workflow
Users can attach chart screenshots to a ticker.

Typical flow:

1. Add ticker
2. Upload chart screenshot
3. Update checklist
4. Add notes
5. Generate analysis prompt

### Prompt generation
The app can generate a clean structured prompt containing:

- ticker
- market status
- checklist state
- notes
- risk rules

This prompt can then be used for analysis.

### Market context
Each prompt includes a **market status field**, for example:

- S&P above 50 MA
- S&P below 50 MA

---

# Design Goals

The app prioritises:

**Speed**
- fast load
- minimal clicks

**Simplicity**
- clear panels
- minimal clutter

**Mobile usability**
- large tap targets
- responsive layout
- PWA support

**Workflow efficiency**
- reduce copy/paste
- keep chart → prompt → review simple

---

# Technology

The app is a lightweight web application designed to run:

- locally in browser
- via GitHub Pages
- as a PWA install on mobile

No backend is required.

Data is stored locally in browser storage.

---

# Local Development

To run locally:

Open `index.html` in a browser

or serve the folder using a simple server:
npx serve or python -m http.server

---

# Data Storage

Local storage stores:

- watchlist
- checklist values
- notes
- market status
- risk settings
- chart references (where possible)

Users can clear this data via browser storage reset.

---

# Future Improvements

Potential upgrades include:

- ticker search with suggestions
- drag/drop chart upload
- prompt history
- trade diary
- position size calculator
- CSV / JSON export
- optional OpenAI API integration

---

# Philosophy

This tool is designed to be:

- **simple**
- **fast**
- **reliable**
- **focused on one trading workflow**

It should never become a bloated trading dashboard.

