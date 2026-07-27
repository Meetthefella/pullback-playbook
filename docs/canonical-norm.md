# Canonical Norm v1

`CanonicalDecisionResult` is publishable only when its validation envelope has
`status: "valid"`. The resolver constructs the result from one immutable
NormalisedDecisionEvidence snapshot, then validates it before producing its
compatibility projection.

The normative dependency direction is:

`normalised evidence -> semantic states -> gates -> eligibility -> final verdict`

The executable invariants currently include:

- Entry verdict requires qualified Entry eligibility.
- Qualified Entry requires passed Entry, buyer-control, confirmation, and
  priceable-plan prerequisites.
- Near Entry verdict requires qualified Near Entry eligibility.
- Entry/Near Entry cannot override terminal structure or failed support.
- Result and evidence snapshot identifiers must match.

Validation failures use deterministic codes, including
`entry_verdict_without_entry_eligibility`,
`entry_eligibility_with_failed_buyer_control`,
`entry_eligibility_with_failed_confirmation`,
`actionable_entry_with_unpriceable_plan`,
`near_entry_verdict_without_near_entry_eligibility`,
`verdict_overrides_hard_blocker`, and `mixed_canonical_snapshot`.

Approved correction: an existing browser fixture supplied `Near Entry` only
through persisted presentation and an active projection snapshot while its
support/buyer-control prerequisites remained unqualified. It now publishes
`Watch`. The conflicting paths were the persisted presentation/projection and
the live resolver; the violated rule was that final verdict cannot override
failed lower-level prerequisites. The regression remains in
`track-state-presentation-contract.spec.js`.

In development and tests, callers pass `enforceCanonicalNorm:true` to receive
an exception containing the complete validation set. In production, the
resolver keeps the invalid candidate diagnostic-only, logs its structured
violations, and returns a non-actionable fallback. The fallback carries
`publicationStatus: "validation_failed"` and
`validationFailureReasonCode: "canonical_norm_validation_failed"`; it is not a
CanonicalDecisionResult.

Downstream deviation classification starts only after successful publication:
Category A is presentation-only; Category B is declared non-authoritative
information; Categories C (semantic) and D (decision) are defects.
