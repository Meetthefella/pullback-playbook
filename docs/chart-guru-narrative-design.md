# Chart Guru Narrative Design

## Purpose
Chart Guru exists to remove the fear of reading charts.

That principle should guide every implementation choice. The goal is not to sound technical. The goal is to help a beginner understand the chart quickly, calmly, and clearly.

Chart Guru is not a second technical analysis engine. The scanner and resolver already decide what is true about the chart. Chart Guru exists to explain that truth in a way that helps a beginner stop feeling lost when they look at price action.

The core success test is simple:

> "I understand this chart better than I did a minute ago."

If the reader has to translate jargon, Google basic terms, or guess why the explanation matters, the explanation has failed.

## Current Authority Model
Chart Guru must keep the existing authority boundaries intact.

- The resolver/scanner is the single source of truth.
- Chart Guru is deterministic.
- The API layer must not discover chart meaning.
- The API may only improve the explanation of an already-selected deterministic story.
- `evidenceFactIds` must stay exact, conditional, and traceable to deterministic inputs.
- Negative framing is allowed only when deterministic structure is genuinely weak, damaged, or broken.
- Intact charts must not sound broken just because a trade is not actionable yet.

This follows the same one-way authority rule already described in [resolver-authority-contract.md](./resolver-authority-contract.md): deterministic live state may drive presentation, but presentation must never feed back into deterministic truth.

## Target Architecture
Chart Guru should move to a three-part flow:

`Deterministic Story Contract -> Chart Narrator -> Review UI`

### Layer 1: Deterministic Story Contract
This layer is responsible for deciding what is true.

It owns:

- trend condition
- pullback location and quality
- buyer or seller response
- confidence qualifiers such as volume or market backdrop
- what still needs confirmation
- exact `evidenceFactIds`
- confidence bounds
- whether the chart should sound constructive, neutral, weak, or broken

It must output a compact recent-story skeleton plus deterministic metadata.

Example shape:

```text
strong_uptrend
pullback_to_20ma
buyer_response
weak_volume
confirmation_needed
```

This layer must never use free-form prose as an input. It should only consume deterministic fields that already exist in resolver/scanner context.

### Layer 2: Chart Narrator
This layer is responsible for explaining the deterministic story naturally.

It may:

- vary sentence order
- vary wording
- combine related ideas
- shift emphasis slightly
- shorten or lengthen the explanation
- choose a calmer or more direct teaching tone

It must not:

- invent facts
- invent support or resistance
- invent volume behavior
- invent candle behavior
- change confidence
- change verdicts
- contradict technical context
- make an intact chart sound weak or broken

The data flow must stay one-way:

```text
deterministic story contract -> chart narrator -> review UI
```

Never:

```text
narrative phrasing -> deterministic meaning
```

## Narrative Time Model
Chart Guru should think in time, not labels.

The old mental model is:

- structure strong
- near 20MA
- bounce attempt
- volume weak

The new mental model is:

- what was the bigger trend doing?
- where did the pullback go?
- what did buyers or sellers just do?
- does that improve confidence or hold it back?
- what should the reader watch next?

The preferred narrative sequence is:

1. Trend backdrop
2. Recent pullback
3. Buyer / seller response
4. Confidence check
5. What happens next
6. Learning point

This is a recent chart story, not a snapshot.

## Deterministic Story Skeleton Contract
The deterministic layer should build a compact recent-story skeleton before any final wording is created.

Example families:

- `strong_uptrend -> pullback_to_20ma -> buyer_response -> weak_volume -> confirmation_needed`
- `strong_uptrend -> pullback_to_50ma -> no_buyer_response -> support_still_unproven`
- `intact_structure -> off_level -> wait_for_clearer_support`
- `weak_structure -> failed_bounce -> avoid_until_repaired`
- `broken_structure -> support_lost -> avoid`

The skeleton is an intermediate contract, not just a UI convenience. It should be preserved in the Chart Guru model for debugging, regressions, and future UI evolution.

### Skeleton Principles

#### `strong_uptrend -> pullback_to_20ma -> buyer_response -> weak_volume -> confirmation_needed`
- Use when the broader trend is healthy, price pulled back into meaningful support, and buyers have responded.
- The story should feel constructive.
- Weak volume belongs in the confidence layer, not as the headline.
- The explanation should not say the chart needs a clearer pullback if the pullback already happened.

#### `strong_uptrend -> pullback_to_50ma -> no_buyer_response -> support_still_unproven`
- Use when the broader trend is still alive but the support test has not produced a convincing response yet.
- The tone should stay neutral-to-constructive, not negative.
- The explanation should focus on support still needing proof rather than on damage that has not happened.

#### `intact_structure -> off_level -> wait_for_clearer_support`
- Use only when the chart is still intact but price is away from useful support.
- This is the neutral off-level story.
- It must not appear when a valid pullback-to-support story already exists.

#### `weak_structure -> failed_bounce -> avoid_until_repaired`
- Use when the structure is no longer healthy and a bounce failed inside that weaker context.
- The explanation may sound cautious or negative because the deterministic structure already justifies it.
- The story should explain that price tried to recover and failed, not just say "avoid."

#### `broken_structure -> support_lost -> avoid`
- Use when structure is genuinely broken.
- The explanation may talk about support failing and the chart needing time to rebuild.
- The story should stay clear and calm, not dramatic.

## Reader Test
Every Chart Guru explanation should leave the reader able to answer:

- What just happened?
- Is that good, bad, or neutral?
- What am I waiting to see next?

The reader should not be left asking:

- What does that technical term mean?
- Why does that matter?
- Why is the app saying this?

This is both a writing rule and a regression rule.

## Chart Narrator Principles
The Chart Narrator should make two similar charts feel naturally explained, not mechanically reworded.

### Allowed Variation
- Change sentence order if the meaning stays the same.
- Merge two adjacent ideas into one sentence.
- Use conversational phrasing instead of fixed labels.
- Emphasize the most important part of the deterministic story.
- Shorten an explanation when the story is simple.
- Expand an explanation when the story needs more teaching context.

### Forbidden Variation
- No invented facts.
- No invented confidence.
- No invented technical levels.
- No invented "buyers stepped in" unless deterministic inputs support it.
- No invented "volume was strong" unless deterministic inputs support it.
- No change to verdict, confidence, or `evidenceFactIds`.
- No unsupported optimism or pessimism.

### Show, Don't Label
When plain explanation is clearer, describe what the reader can see instead of leaning on technical labels.

Principle examples:

- Instead of naming "support held," explain that price pulled back to an area where buyers stepped in before and buyers responded again.
- Instead of naming "momentum is weakening," explain that the buying has started to slow after the recent rally.
- Instead of naming "the breakout failed," explain that the stock tried to move higher but could not hold those gains.

These are principle examples only, not fixed templates.

### Anti-Template Rule
The implementation should avoid obvious "small template pool" behavior.

That does not mean random prose. It means the narrative layer should be free to:

- switch between shorter and longer sentence patterns
- choose whether to start with trend, pullback, or response emphasis
- vary connective language like "after that," "now," "so," or "that matters because"
- combine qualifiers in different places

The result should still feel like one calm trader explaining a chart over the reader's shoulder.

## Story Construction Rules
Each explanation should naturally answer three questions:

1. What happened?
2. Why does it matter?
3. What should I watch next?

### Trend Backdrop
- Explain whether the bigger trend is healthy, weak, or broken.
- Keep it short.
- This is context, not the whole story.

### Recent Pullback
- Explain whether price pulled back into a useful area.
- Explain whether support held, was tested, or was lost.
- Avoid static wording if the pullback already happened.

### Buyer / Seller Response
- Explain what buyers or sellers have just done over the latest few candles.
- Latest-candle observations should support this part, not dominate it by default.
- A single candle only matters because of the surrounding sequence.

### Confidence Check
- Explain what helps the setup and what still holds it back.
- Volume usually belongs here.
- Market backdrop may also appear here when deterministic context says it matters.

### What Happens Next
- State what would confirm.
- State what would weaken or invalidate.
- Keep this concrete and beginner-friendly.

### Learning Point
- End with one useful takeaway about reading this kind of chart.
- This should teach the pattern, not repeat the exact headline.

## UI Direction
The current Chart Guru presentation can evolve toward a dedicated `Chart Story` section.

Recommended direction:

- `Chart Story` becomes the memorable takeaway.
- Supporting sections explain:
- why it matters
- what helps
- what still holds it back
- what to watch next
- one learning point

Why this helps:

- it reduces repetitive deterministic wording
- it gives the user one clear mental model before details
- it keeps deterministic truth while making the explanation feel more human

This should remain a design recommendation for the next implementation phase, not an immediate UI rewrite requirement.

## Guardrails
The Chart Narrator must never:

- contradict Technical Context
- contradict the deterministic story skeleton
- exaggerate confidence
- become more optimistic or pessimistic than the deterministic story
- introduce unsupported technical claims
- invent support/resistance/volume/candle behavior

Specific protection rules:

- intact off-level charts must stay neutral
- valid pullback-to-support bounce cases must not reuse off-level wording
- weak or damaged charts may sound cautious
- broken charts may sound negative
- `evidenceFactIds` must remain conditional and exact

## Phased Implementation Plan

### Phase 1: Narrative Contract
Goal:
Define the deterministic output contract that the narrative system is allowed to explain.

Key changes:

- formalize the recent-story skeleton
- define required deterministic fields
- define the output shape shared by deterministic and narrative layers
- define confidence and evidence invariants

Non-goals:

- no wording engine yet
- no UI changes yet

Acceptance:

- contract is stable enough for regression coverage
- intact vs weak vs broken framing boundaries are explicit

### Phase 2: Story Skeleton Builder
Goal:
Build the deterministic layer that selects the recent chart sequence.

Key changes:

- derive skeletons from existing resolver/scanner fields
- make off-level routing explicit
- ensure valid pullback-to-support stories outrank neutral off-level stories
- preserve exact `evidenceFactIds`

Non-goals:

- no natural-language variation yet

Acceptance:

- UNP-style constructive bounce selects pullback-to-support plus buyer response
- off-level neutral case stays separate
- broken and weak cases still route correctly

### Phase 3: Chart Narrator
Goal:
Explain deterministic skeletons naturally without changing truth.

Key changes:

- convert skeletons into time-based explanation blocks
- vary phrasing and sentence order inside deterministic boundaries
- keep latest-candle details subordinate to the recent sequence

Non-goals:

- no API-driven meaning discovery

Acceptance:

- explanations answer what happened, why it matters, and what to watch next
- output feels less repetitive while still deterministic

### Phase 4: Dedicated Chart Story UI
Goal:
Promote the recent-story takeaway to the main review surface.

Key changes:

- evaluate or add a dedicated `Chart Story` display block
- demote supporting detail into secondary sections
- keep the review UI mobile-safe and readable

Non-goals:

- no authority changes

Acceptance:

- user can identify the main story immediately
- supporting sections remain clearly secondary

### Phase 5: Regression Expansion
Goal:
Protect the new narrative contract and routing behavior.

Key changes:

- add deterministic regressions for skeleton selection
- add regressions for off-level gating
- add regressions for confidence qualifiers
- add regressions for `evidenceFactIds` truthfulness
- add regressions for non-authoritative API merge behavior

Non-goals:

- no broad UI snapshot testing yet

Acceptance:

- narrative contract failures are caught before UI review

### Phase 6: Playwright Coverage
Goal:
Protect rendered Chart Guru behavior in Review.

Key changes:

- add browser tests for constructive bounce stories
- add browser tests for off-level neutral stories
- add browser tests for broken-structure stories
- verify the title, section hierarchy, and wording guardrails

Non-goals:

- no exhaustive visual snapshot library unless needed later

Acceptance:

- rendered review output matches deterministic authority expectations

## Regression Priorities for Later Implementation
When the implementation starts, minimum coverage should include:

- UNP-style constructive pullback bounce
- intact off-level neutral case
- weak/repairing case
- broken/support-lost case
- conditional evidence correctness
- AI polish merge behavior without authority drift

## Acceptance Criteria
This design is successful when the later implementation produces explanations that:

- a beginner can understand without outside knowledge
- explain what happened
- explain why it matters
- explain what to watch next
- feel less repetitive over time
- stay completely faithful to deterministic truth
- keep off-level intact stories neutral
- keep weak or broken stories correctly cautious or negative
- preserve existing Chart Guru authority and title rules

## Implementation Defaults
- Keep the first implementation inside the current `app.js` orchestration seam.
- Treat the recent-story skeleton as a first-class deterministic artifact.
- Do not let free-form narrative state become a new source of truth.
- Keep API involvement limited to post-selection wording improvement only.
