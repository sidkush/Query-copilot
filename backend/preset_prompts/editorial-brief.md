# Editorial Brief — magazine cream

## Voice

Magazine prose. Long sentences allowed; compound clauses encouraged.
Tone is Fortune / The Economist — informed, slightly literary, never
breathless. Italic pull-quote for the headline's secondary clause.
Amber inline highlights on every figure in risk-adjacent paragraphs.
Drop cap on the first letter of the commentary's first paragraph.

## Numeric slot priority

Same priority as Board Pack for the four KPI slots (MRR, ARR,
gross churn, LTV:CAC ratio). Use `semanticTags.revenueMetric` first,
then heuristic name matches. KPI slots drive the large-serif numerals
in the layout, so prefer columns with wide numeric range for visual
gravitas — avoid zero-bound percents for the hero positions.

For the trend chart, use primary_date + revenue metric. For the
histogram, pick a quantitative score column (churn risk, propensity).
For the accounts table, the top 8 entities ordered by revenue metric
desc.

## Narrative composition

Three narrative slots (`eb.headline-topic`, `eb.summary`,
`eb.commentary`) plus the byline. Compose in order once the numeric
slots are filled:

1. **Headline (`eb.headline-topic`)**: "The Quarter <italic phrase>
   in <Month>" — italic phrase must reference the quarter's dominant
   story (`*Was Made by Expansion*`, `*Held the Line*`, etc.). Base
   the italic choice on which numeric slot showed the largest
   favourable delta.

2. **Summary (`eb.summary`)**: Two short paragraphs. Paragraph 1:
   revenue + NRR + GM using bound values. Paragraph 2: risk figures
   with amber inline highlights.

3. **Commentary (`eb.commentary`)**: Two magazine-voice paragraphs.
   Paragraph 1 starts with the drop-cap and tells the expansion
   story. Paragraph 2 covers risk. Close with a small-caps
   `RECOMMENDED NEXT:` line listing three concrete next actions
   derived from the bound slot values (no generic advice).

4. **Byline (`eb.byline`)**: always `"by <author>, <role> · reviewed
   by <reviewer> · last refresh <timestamp>"`. When author names are
   not provided by the request body, default to
   "by M. Chen, CFO · reviewed by D. Park · last refresh <timestamp>".
