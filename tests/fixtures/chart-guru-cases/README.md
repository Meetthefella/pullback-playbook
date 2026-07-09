Canonical Chart Guru benchmark cases live here.

Each case uses one folder per ticker:

- `benchmark.json`: single source of truth for benchmark expectations and fixture metadata
- `chart.png`: optional live narration chart fixture used by the Playwright journey
- `notes.md`: optional benchmark notes

Journey rules:

- missing `benchmark.json`: fixture validation failure
- missing `chart.png`: journey skip with explanation
- both present: run full narration pipeline and compare against the benchmark
