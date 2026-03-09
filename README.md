# Pullback Playbook

Pullback Playbook is a lightweight Quality Pullback workflow app for a UK-based retail trader. It stays focused on one job: move quickly from watchlist review to setup review, chart upload, AI analysis, and trade planning without turning into a generic trading dashboard.

## What It Does

- Validated ticker add/search with duplicate prevention
- Persistent local watchlist and per-ticker notes
- Per-ticker chart upload with drag/drop and thumbnail preview
- Per-ticker OpenAI setup analysis through a serverless endpoint
- Prompt preview and saved response panel in each ticker card
- Manual checklist review and Alpha Vantage auto-analysis
- Risk helper based on the default GBP 4,000 account and GBP 40 max risk
- PWA-friendly static frontend

## Architecture

- Frontend: static files in the repo root
  - `index.html`
  - `styles.css`
  - `app.js`
- Serverless backend:
  - `netlify/functions/analyse-setup.js`
- Netlify routing:
  - `netlify.toml`

The frontend stores watchlist data locally in browser storage. OpenAI requests are never made directly from browser code.

## Environment Variables

Set these on the serverless host:

- `OPENAI_API_KEY`
  - Required
- `OPENAI_MODEL`
  - Optional
  - Defaults to `gpt-5.4`

No OpenAI secret is exposed in the browser.

## Local Development

### Frontend only

Open `index.html` directly, or serve the folder statically:

```bash
python -m http.server
```

This is enough for general UI work, but the in-app analysis button will need a working serverless endpoint.

### Full app with Netlify Functions

1. Install or use the Netlify CLI with `npx`.
2. Set environment variables.

PowerShell:

```bash
set OPENAI_API_KEY=your_key_here
set OPENAI_MODEL=gpt-5.4
```

Bash:

```bash
export OPENAI_API_KEY=your_key_here
export OPENAI_MODEL=gpt-5.4
```

3. Run Netlify dev:

```bash
npx netlify dev
```

4. Open the local URL Netlify prints.

The frontend uses `/api/analyse-setup` by default, which is redirected to the Netlify function in local dev and on Netlify deploys.

## Deployment

### Single Netlify deployment

Recommended.

1. Deploy this repo to Netlify.
2. Set `OPENAI_API_KEY` in Netlify environment variables.
3. Optionally set `OPENAI_MODEL`.
4. Publish the site root and the `netlify/functions` directory together. This repo already includes the required [`netlify.toml`](./netlify.toml).
5. Netlify serves the static frontend and the serverless function together.

The app will work out of the box with the default AI endpoint field:

- `/api/analyse-setup`

### GitHub Pages + separate serverless endpoint

If you want the frontend on GitHub Pages:

1. Deploy the static files to GitHub Pages.
2. Deploy [`netlify/functions/analyse-setup.js`](./netlify/functions/analyse-setup.js) on a separate serverless platform.
3. Set `OPENAI_API_KEY` and optional `OPENAI_MODEL` on that serverless host.
4. Put the full serverless URL into the app's `AI Endpoint URL` setting.
5. Save settings in the app before using `Analyse Setup`.

This keeps the frontend static-host friendly while moving AI calls off the client.

## Data Storage

Stored locally per ticker:

- ticker
- checklist values
- notes
- chart reference
- last prompt
- last response

Global local storage also keeps:

- watchlist
- market status
- risk settings
- API endpoint setting
- Alpha Vantage settings

## Notes

- Chart screenshots are stored as local data URLs in browser storage. The frontend rejects images over 4 MB and the serverless endpoint also rejects oversized chart payloads.
- The OpenAI result is expected to be JSON from the serverless endpoint. If the upstream model returns malformed output, the endpoint reports that failure instead of silently saving broken data.
- The frontend stores the Alpha Vantage key locally because that integration still runs directly from the browser. The OpenAI key remains server-side only.
- The frontend remains static-host compatible.
