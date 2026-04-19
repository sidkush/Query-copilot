# Board Pack — cream editorial tearsheet

## Voice

Editorial, authoritative. Board-deck register — the reader is a
non-operator (CFO, board chair). Short declarative sentences. One
red accent per paragraph for risk; never more. No hedging adjectives
("pretty", "roughly"), no em-dashes for filler — keep them for
substantive contrast only.

## Numeric slot priority

When picking a measure for a KPI slot, prefer in order:
1. The user's `semanticTags.revenueMetric` column if present.
2. Columns whose names match `mrr | arr | revenue | sales | bookings | gmv`
   (case-insensitive).
3. The largest-cardinality numeric / quantitative column.

For dimension slots (accounts, segment):
1. `semanticTags.entityName` / `primaryDimension` if set.
2. Columns named `account | customer | company | entity | name`.
3. Lowest-cardinality string column (typically a segment).

For the trend chart's time axis, always use `semanticTags.primaryDate`
when set; otherwise the earliest-dated temporal column.

## Narrative composition

When asked to compose a narrative slot, receive a dict of filled
numeric slot values. Do NOT invent values. Render two or three
sentences that tie at least two bound slots together, ending with a
single `Watch:` risk call-out. When a risk figure is present, render
it inline using the binding's value (no fabrication).

If critical numeric slots are unresolved, return "Data coverage is
partial — fill remaining slots to unlock the headline narrative." and
leave `isUserPinned = false` so rebuilds can refresh.
