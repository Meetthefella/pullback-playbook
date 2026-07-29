# Canonical setup projection

`CanonicalSetupProjection.project(publication, {baseScore})` is the sole presentation adapter for a setup bucket, tone, and displayed setup score. It consumes the validated `CanonicalDecisionResult` publication's resolved status; it does not use Scan prose, lifecycle state, or card-local technical-analysis calculations to classify a setup.

Precedence is: canonical resolved status, existing score calculation constrained to that status, then bucket/tone presentation.

Bucket rules are deterministic:

- `Avoid` → Avoid bucket and Avoid tone.
- `Watch` → Watch bucket (`monitor` visual grouping) and Watch tone.
- `Near Entry` → Near Entry bucket and Near Entry tone.
- `Entry` → Entry bucket and Entry tone.

The 0–10 score remains the existing calculation. The projection only constrains it to the canonical status band: Avoid 0–2, Watch 3–5, Near Entry 6–9, Entry 8–10. A 10 additionally requires qualified canonical Entry gates and a valid canonical plan. The score never selects a bucket.

The projection is published on simplified state as `resolvedStatus`, `setupProjection`, `setupScore`, `scoreAvailable`, `scoreBreakdown`, `bucketReason`, `canonicalStateSource`, and `classificationDiagnostics`. For a failed publication, `scoreAvailable` is false and the score is unavailable; no Watch floor or legacy score is applied.
