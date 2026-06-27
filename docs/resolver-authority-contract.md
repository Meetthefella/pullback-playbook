# Resolver Authority Contract

This document defines which inputs are allowed to influence canonical trading state in Pullback Playbook.

## Purpose

The app must resolve the same record deterministically from fresh live inputs.
Persisted presentation, prose, and debug snapshots may be stored and displayed, but they must not feed back into canonical resolver authority.

## Canonical Authority

These inputs may influence canonical verdicts, simplified state, readiness, and section placement:

- Fresh live record fields used by the resolver pipeline
- Fresh `resolveGlobalVerdict(...)` output
- Fresh `resolveSimplifiedStateForSurface(...)` output
- Fresh `resolveSimplifiedStateForWatchlistPresentation(...)` output
- Structured lifecycle state
- Structured blocker codes and enum-like invalidation fields already recognized by the resolver

## Non-Authoritative Inputs

These inputs are display, cache, audit, or debug only and must not override fresh canonical state:

- `watchlist.presentation.sharedPresentation`
- embedded `watchlist.presentation.simplifiedState`
- embedded `watchlist.presentation.globalVerdict`
- persisted `visualBucket`
- persisted `tone`
- persisted `badgeLabel`
- persisted `actionLabel`
- persisted `mainBlocker`
- watchlist/debug narrative fields
- free-text reason strings used as prose

## One-Way Rule

The data flow must stay one-way:

- canonical live state -> presentation projection
- never presentation snapshot -> canonical live state

If fresh canonical state says `watch/monitor`, stale persisted presentation must not reintroduce `avoid`, `diminishing`, `rebuild`, or similar stronger labels.

## Watchlist / Track Rules

The following paths must recompute from fresh state:

- watchlist section placement
- `trackVisibleModel`
- track diagnostic snapshots
- review/track projection snapshots

Persisted presentation may remain attached only as:

- cache/debug metadata
- non-authoritative snapshots
- fallback display copy when it does not conflict with fresh state

## Prose Rule

Free-text fields are never blocker authority by themselves.
Only structured codes/enums may drive canonical blocking decisions.

Examples of non-authoritative prose:

- `blockedReason`
- `reason`
- `downgrade_reason`
- `savedSummary`
- `main_blocker`
- watchlist debug reason text

## Review Checklist

Any future resolver or watchlist change should be checked against these questions:

1. Does this read a persisted presentation field?
2. If yes, is it only for debug, cache, or non-conflicting display copy?
3. Could this change canonical verdict, simplified state, tone, bucket, section placement, or action labels?
4. If yes, it violates this contract.

## Current Enforcement

Regression coverage exists for:

- presentation feedback suppression
- free-text authority suppression
- fresh watchlist section placement
- fresh `trackVisibleModel`
- fresh projection snapshots
- fresh track diagnostics

If one of those regressions fails, treat it as an authority-boundary break, not a cosmetic issue.
